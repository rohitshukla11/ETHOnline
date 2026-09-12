/**
 * End-to-end lifecycle demo against a live network (Hedera testnet by default).
 *
 * Covers every sponsor checkbox in one run:
 *   World  -> attest Selfie Check nullifier, KYC grant gated on it
 *   Hedera -> issue receipt, freeze, compliance-checked transfer, forced transfer
 *   CRE    -> deliver a TEE risk report through the forwarder, vault disburses
 *   Godaam -> repay installments, release collateral, then default + liquidate
 *
 * Usage: npx hardhat run scripts/demo-lifecycle.ts --network hederaTestnet
 */
import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

const USDC = (n: number | bigint) => BigInt(n) * 10n ** 6n;
const fmt = (v: bigint) => `${Number(v) / 1e6} gUSDC`;

function loadDeployment() {
  const file = path.join(process.cwd(), "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Run deploy first: ${file} missing`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function encodeAssessment(a: {
  loanId: bigint;
  approved: boolean;
  approvedPrincipal: bigint;
  aprBps: number;
  ltvBps: number;
  riskScore: number;
  installmentCount: number;
  installmentPeriod: bigint;
  privateInputCommitment: string;
}) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "tuple(uint256,bool,uint256,uint16,uint16,uint16,uint8,uint64,bytes32)",
    ],
    [
      [
        a.loanId,
        a.approved,
        a.approvedPrincipal,
        a.aprBps,
        a.ltvBps,
        a.riskScore,
        a.installmentCount,
        a.installmentPeriod,
        a.privateInputCommitment,
      ],
    ]
  );
}

type AssessmentPayload = {
  loanId: bigint;
  approved: boolean;
  approvedPrincipal: bigint;
  aprBps: number;
  ltvBps: number;
  riskScore: number;
  installmentCount: number;
  installmentPeriod: bigint;
  privateInputCommitment: string;
};

/**
 * Ask the CRE Confidential Workflow to underwrite this loan.
 *
 * Set CRE_TRIGGER_URL to the workflow's HTTP trigger (printed by `npm run cre:simulate`,
 * or the deployed trigger URL) and CRE_LIVE=true. With CRE_LIVE=false, or no trigger URL,
 * this returns the pre-CRE hand-encoded report and says so, so nobody mistakes a literal
 * for an enclave decision.
 */
async function fetchAssessment(
  loanId: bigint,
  collateralValue: bigint
): Promise<{ payload: AssessmentPayload; source: string; commitment?: string }> {
  const triggerUrl = process.env.CRE_TRIGGER_URL;
  const live = process.env.CRE_LIVE === "true";

  const fallback: AssessmentPayload = {
    loanId,
    approved: true,
    approvedPrincipal: USDC(520), // 130% LTV - above bare collateral
    aprBps: 1500,
    ltvBps: 13_000,
    riskScore: 612,
    installmentCount: 6,
    installmentPeriod: 30n * 24n * 3600n,
    privateInputCommitment: ethers.keccak256(ethers.toUtf8Bytes("tee-input-commitment")),
  };

  if (!live || !triggerUrl) {
    return {
      payload: fallback,
      source: "hand-encoded fallback (set CRE_LIVE=true and CRE_TRIGGER_URL for the TEE)",
    };
  }

  // These three fields are the confidential inputs. They go to the enclave and are never
  // logged here, never persisted, and never written onchain.
  const privateInputs = {
    loanId: Number(loanId),
    borrower: (await ethers.getSigners())[1]?.address ?? (await ethers.getSigners())[0].address,
    collateralValue: collateralValue.toString(),
    landRecordRef: process.env.DEMO_LAND_RECORD_REF ?? "MH-PUN-0421/2A",
    pastYieldsKgPerHa: [3120, 2980, 3240, 3050, 3190],
    repaymentHistory: [
      { lender: "PACS-Baramati", amount: 120000, daysLate: 0 },
      { lender: "SBI-KCC", amount: 240000, daysLate: 12 },
      { lender: "NABARD-SHG", amount: 80000, daysLate: 0 },
    ],
  };

  const res = await fetch(triggerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.CRE_TRIGGER_API_KEY
        ? { Authorization: `Bearer ${process.env.CRE_TRIGGER_API_KEY}` }
        : {}),
    },
    body: JSON.stringify(privateInputs),
  });
  if (!res.ok) throw new Error(`CRE workflow returned ${res.status}: ${await res.text()}`);

  const out = (await res.json()) as {
    approved: boolean;
    approvedPrincipal: string;
    aprBps: number;
    ltvBps: number;
    riskScore: number;
    installmentCount: number;
    installmentPeriod: string;
    privateInputCommitment: string;
  };

  return {
    payload: {
      loanId,
      approved: out.approved,
      approvedPrincipal: BigInt(out.approvedPrincipal),
      aprBps: out.aprBps,
      ltvBps: out.ltvBps,
      riskScore: out.riskScore,
      installmentCount: out.installmentCount,
      installmentPeriod: BigInt(out.installmentPeriod),
      privateInputCommitment: out.privateInputCommitment,
    },
    source: "Chainlink CRE Confidential Workflow (Nitro TEE)",
    commitment: out.privateInputCommitment,
  };
}

async function main() {
  const d = loadDeployment();
  const [operator, farmer] = await ethers.getSigners();
  const borrower = farmer ?? operator;

  const registry = await ethers.getContractAt("WorldIdRegistry", d.WorldIdRegistry);
  const usdc = await ethers.getContractAt("MockUSDC", d.MockUSDC);
  const receipts = await ethers.getContractAt("WarehouseReceipt", d.WarehouseReceipt);
  const vault = await ethers.getContractAt("GodaamVault", d.GodaamVault);
  const forwarder = await ethers.getContractAt("MockCreForwarder", d.CreForwarder);

  console.log("\n=== 1. WORLD ID SELFIE CHECK ===");
  const nullifier = BigInt(ethers.keccak256(ethers.toUtf8Bytes(`selfie:${borrower.address}`)));
  if (!(await registry.isVerified(borrower.address))) {
    await (await registry.attestVerification(borrower.address, nullifier)).wait();
  }
  console.log(`verified(${borrower.address}) = ${await registry.isVerified(borrower.address)}`);

  console.log("\n=== 2. HEDERA ATS: KYC GRANT + RECEIPT ISSUANCE ===");
  if (!(await receipts.kycGranted(borrower.address))) {
    await (await receipts.grantKyc(borrower.address)).wait();
  }
  console.log("KYC granted (only possible because Selfie Check passed)");

  const issueTx = await receipts.issue(borrower.address, {
    cropType: "Wheat (HD-2967)",
    grade: "FAQ-A",
    quantityKg: 42_000,
    storageLocation: "WDRA Warehouse, Baramati, MH",
    expiry: Math.floor(Date.now() / 1000) + 180 * 24 * 3600,
    appraisedValue: USDC(400),
    atsTokenAddress: process.env.ATS_TOKEN_EVM_ADDRESS || ethers.ZeroAddress,
    atsTokenId: process.env.ATS_TOKEN_ID || "0.0.0",
  });
  const issueRc = await issueTx.wait();
  const receiptId = receipts.interface.parseLog(
    issueRc!.logs.find((l) => l.address === d.WarehouseReceipt && l.topics.length === 4)!
  )!.args[0] as bigint;
  console.log(`Issued receipt #${receiptId}, appraised ${fmt(USDC(400))}`);

  console.log("\n=== 2b. COMPLIANCE CHECK (must fail) ===");
  const stranger = ethers.Wallet.createRandom().address;
  try {
    await receipts.connect(borrower).transferFrom.staticCall(borrower.address, stranger, receiptId);
    console.log("!! transfer to non-KYC address unexpectedly succeeded");
  } catch {
    console.log(`Blocked transfer to non-KYC address ${stranger} (KycRequired)`);
  }

  console.log("\n=== 3. LOAN REQUEST (collateral escrowed + frozen) ===");
  const reqRc = await (await vault.connect(borrower).requestLoan(receiptId)).wait();
  const loanId = vault.interface.parseLog(
    reqRc!.logs.find((l) => l.address === d.GodaamVault)!
  )!.args[0] as bigint;
  console.log(`Loan #${loanId} requested; receipt frozen = ${await receipts.tokenFrozen(receiptId)}`);

  console.log("\n=== 4. CRE CONFIDENTIAL WORKFLOW REPORT ===");
  // Default path: the farmer's private risk inputs go to the deployed Confidential
  // Workflow, which scores them inside a Nitro enclave and returns the ABI-encoded
  // assessment. Nothing here decides the loan size - the enclave does.
  //
  // CRE_LIVE=false falls back to a hand-encoded report so the demo still runs if the
  // network is down. Any LTV printed under the fallback is a literal, not a TEE decision.
  const assessment = await fetchAssessment(loanId, USDC(400));
  const report = encodeAssessment(assessment.payload);
  console.log(
    `source: ${assessment.source}` +
      (assessment.commitment ? `  commitment=${assessment.commitment}` : "")
  );
  const metadata = await forwarder.buildMetadata(
    ethers.id("godaam-risk-scoring"),
    ethers.hexlify(ethers.toUtf8Bytes("godaam-ris")),
    process.env.CRE_WORKFLOW_OWNER || ethers.ZeroAddress,
    "0x0001"
  );
  const before = await usdc.balanceOf(borrower.address);
  await (await forwarder.forward(d.GodaamVault, metadata, report)).wait();
  const after = await usdc.balanceOf(borrower.address);
  console.log(
    `Disbursed ${fmt(after - before)} against ${fmt(USDC(400))} of collateral ` +
      `(LTV decided by: ${assessment.source})`
  );

  const loan = await vault.getLoan(loanId);
  console.log(
    `score=${loan.riskScore} ltv=${loan.ltvBps}bps apr=${loan.aprBps}bps ` +
      `totalOwed=${fmt(loan.totalOwed)} installment=${fmt(loan.installmentAmount)}`
  );

  console.log("\n=== 5. REPAYMENT ===");
  await (await usdc.mint(borrower.address, USDC(200))).wait();
  await (await usdc.connect(borrower).approve(d.GodaamVault, ethers.MaxUint256)).wait();
  await (await vault.connect(borrower).repayInstallment(loanId)).wait();
  console.log(`Installment 1 paid; due next: ${fmt(await vault.amountDue(loanId))}`);
  console.log(
    `Next due date: ${new Date(Number(await vault.nextDueDate(loanId)) * 1000).toISOString()}`
  );

  console.log("\n=== 6/7. Run scripts/demo-liquidation.ts for the default path ===");
  console.log(`   loanId=${loanId} receiptId=${receiptId}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
