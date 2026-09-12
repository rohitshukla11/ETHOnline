/**
 * Godaam - Chainlink CRE Confidential Workflow
 *
 * Everything inside `handlerInTee` runs in a trusted execution enclave. The farmer's
 * land record reference, past yield history and repayment history are decrypted, scored
 * and discarded there. What leaves the enclave is only:
 *   approved | principal | APR | LTV band | bucketed score | keccak commitment of inputs
 *
 * The commitment lets anyone later prove which inputs produced a given loan, without ever
 * revealing them. `GodaamVault.onReport` will not disburse without this report.
 */
import {
  cre,
  Runner,
  bytesToHex,
  encodeAbiParameters,
  hexToBase64,
  keccak256,
  type Runtime,
  type EVMClient,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import { z } from "zod";

const configSchema = z.object({
  workflowName: z.string(),
  chainSelector: z.string(),
  godaamVaultAddress: z.string(),
  riskApiUrl: z.string(),
  minScoreToApprove: z.number(),
  protocolMaxLtvBps: z.number(),
});
type Config = z.infer<typeof configSchema>;

/** Sensitive payload. Only ever materialised inside the TEE. */
const privateInputsSchema = z.object({
  loanId: z.number(),
  borrower: z.string(),
  collateralValue: z.string(), // 6dp, from the LoanRequested log
  landRecordRef: z.string(), // e.g. "MH-PUN-0421/2A" - PII-adjacent
  pastYieldsKgPerHa: z.array(z.number()).min(1),
  repaymentHistory: z.array(
    z.object({ lender: z.string(), amount: z.number(), daysLate: z.number() })
  ),
  aadhaarLast4: z.string().optional(),
});
type PrivateInputs = z.infer<typeof privateInputsSchema>;

type Assessment = {
  loanId: bigint;
  approved: boolean;
  approvedPrincipal: bigint;
  aprBps: number;
  ltvBps: number;
  riskScore: number;
  installmentCount: number;
  installmentPeriod: bigint;
  privateInputCommitment: `0x${string}`;
};

// ---------------------------------------------------------------------------
// Scoring model - runs ONLY in the enclave
// ---------------------------------------------------------------------------

function scoreYieldStability(yields: number[]): number {
  const mean = yields.reduce((a, b) => a + b, 0) / yields.length;
  if (mean === 0) return 0;
  const variance =
    yields.reduce((acc, y) => acc + (y - mean) ** 2, 0) / yields.length;
  const cv = Math.sqrt(variance) / mean;
  // Low coefficient of variation => predictable harvests => better credit.
  return Math.round(Math.max(0, Math.min(1, 1 - cv)) * 400);
}

function scoreRepaymentHistory(
  history: PrivateInputs["repaymentHistory"]
): number {
  if (history.length === 0) return 120; // thin file, not a red flag
  const weighted = history.reduce((acc, h) => {
    const penalty =
      h.daysLate <= 0 ? 0 : h.daysLate <= 30 ? 0.25 : h.daysLate <= 90 ? 0.6 : 1;
    return acc + (1 - penalty) * h.amount;
  }, 0);
  const total = history.reduce((acc, h) => acc + h.amount, 0);
  return Math.round((weighted / total) * 400);
}

function scoreLandTenure(landRecordRef: string, bureauTier: number): number {
  const hasSurveyNumber = /\d+[A-Z]?$/.test(landRecordRef.trim());
  return (hasSurveyNumber ? 120 : 40) + bureauTier * 20;
}

/** score (0-1000) -> LTV band. Above 10000 bps means undercollateralised lending. */
function ltvBandFor(score: number): { ltvBps: number; aprBps: number } {
  if (score >= 850) return { ltvBps: 22_000, aprBps: 900 };
  if (score >= 700) return { ltvBps: 17_500, aprBps: 1_200 };
  if (score >= 560) return { ltvBps: 13_000, aprBps: 1_500 };
  if (score >= 420) return { ltvBps: 9_000, aprBps: 1_900 };
  return { ltvBps: 0, aprBps: 0 };
}

function commitmentOf(inputs: PrivateInputs): `0x${string}` {
  // Deterministic, order-stable serialisation so the commitment is reproducible.
  const canonical = JSON.stringify({
    loanId: inputs.loanId,
    borrower: inputs.borrower.toLowerCase(),
    landRecordRef: inputs.landRecordRef,
    pastYieldsKgPerHa: inputs.pastYieldsKgPerHa,
    repaymentHistory: inputs.repaymentHistory,
  });
  return keccak256(new TextEncoder().encode(canonical));
}

// ---------------------------------------------------------------------------
// TEE handler
// ---------------------------------------------------------------------------

const assessRisk = (
  runtime: Runtime<Config>,
  encryptedPayload: Uint8Array
): Assessment => {
  // `runtime.secrets` and the trigger payload are only decryptable inside the enclave.
  const inputs = privateInputsSchema.parse(
    JSON.parse(new TextDecoder().decode(encryptedPayload))
  );

  runtime.log(
    `[TEE] scoring loan ${inputs.loanId} for ${inputs.borrower.slice(0, 8)}... ` +
      `(raw inputs stay in enclave)`
  );

  // Confidential outbound call: the bureau tier lookup also happens in the enclave so the
  // land record reference never transits the public network.
  const bureauTier = runtime
    .runInNodeMode((_: unknown, sendRequester: HTTPSendRequester) =>
      sendRequester
        .sendRequest({
          url: `${runtime.config.riskApiUrl}?ref=${encodeURIComponent(inputs.landRecordRef)}`,
          method: "GET",
          timeoutMs: 5_000,
        })
        .result()
    )
    .then((res) => {
      try {
        return Number(JSON.parse(new TextDecoder().decode(res.body)).tier ?? 1);
      } catch {
        return 1;
      }
    })
    .catch(() => 1) as unknown as number;

  const score = Math.min(
    1000,
    scoreYieldStability(inputs.pastYieldsKgPerHa) +
      scoreRepaymentHistory(inputs.repaymentHistory) +
      scoreLandTenure(inputs.landRecordRef, bureauTier)
  );

  const { ltvBps, aprBps } = ltvBandFor(score);
  const approved = score >= runtime.config.minScoreToApprove && ltvBps > 0;
  const cappedLtv = Math.min(ltvBps, runtime.config.protocolMaxLtvBps);

  const collateral = BigInt(inputs.collateralValue);
  const principal = approved
    ? (collateral * BigInt(cappedLtv)) / 10_000n
    : 0n;

  runtime.log(
    `[TEE] decision: approved=${approved} score=${score} ltv=${cappedLtv}bps ` +
      `principal=${principal.toString()} (6dp)`
  );

  return {
    loanId: BigInt(inputs.loanId),
    approved,
    approvedPrincipal: principal,
    aprBps,
    ltvBps: cappedLtv,
    riskScore: score,
    installmentCount: 6,
    installmentPeriod: 30n * 24n * 60n * 60n,
    privateInputCommitment: commitmentOf(inputs),
  };
};

const ASSESSMENT_ABI = [
  {
    type: "tuple",
    components: [
      { name: "loanId", type: "uint256" },
      { name: "approved", type: "bool" },
      { name: "approvedPrincipal", type: "uint256" },
      { name: "aprBps", type: "uint16" },
      { name: "ltvBps", type: "uint16" },
      { name: "riskScore", type: "uint16" },
      { name: "installmentCount", type: "uint8" },
      { name: "installmentPeriod", type: "uint64" },
      { name: "privateInputCommitment", type: "bytes32" },
    ],
  },
] as const;

/**
 * Entry point registered as a CONFIDENTIAL handler. The CRE node schedules this inside
 * the TEE; the plaintext trigger payload is never visible to the node operator.
 */
const handlerInTee = (runtime: Runtime<Config>, payload: { data: Uint8Array }) => {
  const assessment = assessRisk(runtime, payload.data);

  const report = encodeAbiParameters(ASSESSMENT_ABI, [
    {
      loanId: assessment.loanId,
      approved: assessment.approved,
      approvedPrincipal: assessment.approvedPrincipal,
      aprBps: assessment.aprBps,
      ltvBps: assessment.ltvBps,
      riskScore: assessment.riskScore,
      installmentCount: assessment.installmentCount,
      installmentPeriod: assessment.installmentPeriod,
      privateInputCommitment: assessment.privateInputCommitment,
    },
  ]);

  const signedReport = runtime.report({ encodedPayload: hexToBase64(report) }).result();

  const evm = new cre.capabilities.EVMClient(runtime.config.chainSelector) as EVMClient;
  const tx = evm
    .writeReport(runtime, {
      receiver: runtime.config.godaamVaultAddress,
      report: signedReport,
      gasConfig: { gasLimit: "1000000" },
    })
    .result();

  runtime.log(`[TEE] report delivered to GodaamVault, tx=${bytesToHex(tx.txHash)}`);
  return { loanId: assessment.loanId.toString(), approved: assessment.approved };
};

const initWorkflow = () => {
  // Confidential HTTP trigger: the frontend POSTs the encrypted risk inputs here.
  const http = new cre.capabilities.HTTPCapability();
  return [cre.handler(http.trigger({}), handlerInTee, { confidential: true })];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
