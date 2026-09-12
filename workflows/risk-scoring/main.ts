/**
 * Godaam — Chainlink CRE Confidential Workflow
 *
 * Everything inside `assessInTee` runs in an AWS Nitro enclave. The farmer's land record
 * reference, past yield history and repayment history are decrypted, scored and discarded
 * there. What leaves the enclave is only:
 *   approved | principal | APR | LTV band | score | keccak commitment of the raw inputs
 *
 * The commitment lets anyone later prove which inputs produced a given loan, without ever
 * revealing them. `GodaamVault.onReport` will not disburse without the signed report.
 *
 * Written against @chainlink/cre-sdk 1.20.1. Notes on the API, because it moved a lot and
 * the README is out of date in at least two places:
 *
 *   - `handlerInTee(trigger, fn, tees)` is a standalone export, not
 *     `cre.handler(..., { confidential: true })`. The third argument is a TeeConstraint.
 *   - Inside a TEE the runtime is `TeeRuntime`, which deliberately has NO `runInNodeMode`
 *     and NO `report`. It has `reportFromDon()` and `usingTheDons()` instead. Anything
 *     reached through `usingTheDons()` is routed OUT of the enclave, so the bureau lookup
 *     goes through `ConfidentialHTTPClient` — the capability whose whole job is keeping
 *     the request and its response inside the TEE.
 *   - `ConfidentialHTTPRequestJson` is a wrapper: the real request nests under `request`.
 *
 * The scoring model lives in `scoring.ts` so it can be executed and asserted on without a
 * CRE host — see `verify-fixtures.ts`. This file is only transport: decrypt, call the
 * model, encode, sign.
 */
import {
	cre,
	handlerInTee,
	hexToBase64,
	httpRequest,
	Runner,
	type ConfidentialHTTPClient,
	type Runtime,
	type TeeRuntime,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters } from 'viem'
import { z } from 'zod'
import { assess, privateInputsSchema } from './scoring'

const configSchema = z.object({
	workflowName: z.string(),
	chainSelector: z.string(),
	godaamVaultAddress: z.string(),
	riskApiUrl: z.string(),
	minScoreToApprove: z.number(),
	protocolMaxLtvBps: z.number(),
})
type Config = z.infer<typeof configSchema>

/**
 * Land-tenure bureau lookup.
 *
 * This is the one outbound call that carries the land record reference, the most
 * identifying field in the payload. It goes through `confidential-http`, so the request
 * and response stay inside the enclave — a DON node operator sees neither. A plain
 * `HTTPClient` here, or anything reached via `runtime.usingTheDons()`, would leak the
 * reference to the network and make the privacy claim decorative.
 *
 * Returns tier 1 (the neutral default) on any failure, so a flaky bureau downgrades the
 * applicant's land score rather than failing the whole underwriting run.
 */
function fetchBureauTier(
	runtime: TeeRuntime<Config>,
	client: ConfidentialHTTPClient,
	landRecordRef: string,
): { tier: number; source: 'live' | 'unavailable' } {
	try {
		// SDK typing gap: `sendRequest` declares its first parameter as `Runtime<unknown>`,
		// but `TeeRuntime` is not structurally a `Runtime` — it deliberately omits
		// `runInNodeMode` and `report`. The call only ever touches `callCapability`, which
		// lives on `BaseRuntime` and is present on both, so the cast is safe. Without it the
		// confidential-http capability is unusable from the one place it is meant for.
		const response = client
			.sendRequest(runtime as unknown as Runtime<Config>, {
				// ConfidentialHTTPRequestJson is a wrapper — the actual request nests under
				// `request`, alongside an optional `vaultDonSecrets` for injecting an API key
				// from the vault DON. A flat { url, method } here silently types as `never`.
				request: httpRequest({
					url: `${runtime.config.riskApiUrl}?ref=${encodeURIComponent(landRecordRef)}`,
					method: 'GET',
					timeout: '5s', // DurationJson is a string, not { seconds }
				}),
			})
			.result()

		const decoded = JSON.parse(new TextDecoder().decode(response.body)) as { tier?: unknown }
		const tier = Number(decoded.tier)
		if (!Number.isFinite(tier)) {
			runtime.log('[TEE] bureau responded without a usable tier — treating as unavailable')
			return { tier: 1, source: 'unavailable' }
		}
		return { tier, source: 'live' }
	} catch (_err) {
		runtime.log('[TEE] bureau lookup FAILED — falling back to tier 1')
		return { tier: 1, source: 'unavailable' }
	}
}

const ASSESSMENT_ABI = [
	{
		type: 'tuple',
		components: [
			{ name: 'loanId', type: 'uint256' },
			{ name: 'approved', type: 'bool' },
			{ name: 'approvedPrincipal', type: 'uint256' },
			{ name: 'aprBps', type: 'uint16' },
			{ name: 'ltvBps', type: 'uint16' },
			{ name: 'riskScore', type: 'uint16' },
			{ name: 'installmentCount', type: 'uint8' },
			{ name: 'installmentPeriod', type: 'uint64' },
			{ name: 'privateInputCommitment', type: 'bytes32' },
		],
	},
] as const

/**
 * Entry point. Registered with `handlerInTee`, so the CRE node schedules it inside a Nitro
 * enclave and the plaintext trigger payload is never visible to the node operator.
 *
 * The signed report is produced here and returned to the caller. It is NOT written onchain
 * from inside the workflow: `cre.capabilities.EVMClient` ships 59 chain selectors and
 * Hedera is not among them, so `evm.writeReport` cannot target GodaamVault on Hedera
 * testnet. The relay to `GodaamVault.onReport` therefore runs through the CRE forwarder
 * driven by the app. The vault's `onlyForwarder` check is unchanged, so the security
 * property — only a signed TEE report can disburse — still holds. Swap in a direct
 * `evm.writeReport` the day a Hedera selector lands.
 */
const assessInTee = (runtime: TeeRuntime<Config>, payload: { input: Uint8Array }) => {
	const inputs = privateInputsSchema.parse(JSON.parse(new TextDecoder().decode(payload.input)))

	runtime.log(
		`[TEE] scoring loan ${inputs.loanId} for ${inputs.borrower.slice(0, 8)}... ` +
			`(raw inputs stay in enclave)`,
	)

	const confidentialHttp = new cre.capabilities.ConfidentialHTTPClient()
	const bureau = fetchBureauTier(runtime, confidentialHttp, inputs.landRecordRef)

	const assessment = assess(inputs, bureau.tier, {
		minScoreToApprove: runtime.config.minScoreToApprove,
		protocolMaxLtvBps: runtime.config.protocolMaxLtvBps,
	})

	// A 404 on the bureau used to degrade silently: the tier fell back to 1 and the
	// workflow still emitted a confident score that cleared the approval bar. Same defect
	// class as a hand-encoded LTV — a plausible number with the wrong provenance. The
	// source travels with the score so a caller, and a viewer, can tell.
	runtime.log(
		`[TEE] decision: approved=${assessment.approved} score=${assessment.riskScore} ` +
			`ltv=${assessment.ltvBps}bps principal=${assessment.approvedPrincipal.toString()} (6dp) ` +
			`bureau=${bureau.source}`,
	)
	if (bureau.source === 'unavailable') {
		runtime.log(
			'[TEE] WARNING: score computed WITHOUT a live bureau tier. ' +
				'Land-tenure contribution defaulted. Do not treat this as a full assessment.',
		)
	}

	const encodedReport = encodeAbiParameters(ASSESSMENT_ABI, [
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
	])

	// Routed out of the enclave for DON signing. Only the ABI-encoded decision travels —
	// never the yield history, the repayment ledger or the land record reference.
	const signedReport = runtime
		.reportFromDon({
			encodedPayload: hexToBase64(encodedReport),
			// Required. Omitting it fails at DON signing with
			// "[3]InvalidArgument: unsupported encoder name:" - which names the field
			// but not the accepted values. The SDK recognises 'evm' and 'solana';
			// GodaamVault.onReport abi-decodes the payload, so 'evm' is correct.
			encoderName: 'evm',
		})
		.result()

	runtime.log(`[TEE] report signed by the DON for loan ${assessment.loanId}`)

	return {
		loanId: assessment.loanId.toString(),
		approved: assessment.approved,
		riskScore: assessment.riskScore,
		ltvBps: assessment.ltvBps,
		aprBps: assessment.aprBps,
		approvedPrincipal: assessment.approvedPrincipal.toString(),
		installmentCount: assessment.installmentCount,
		installmentPeriod: assessment.installmentPeriod.toString(),
		privateInputCommitment: assessment.privateInputCommitment,
		bureauSource: bureau.source,
		encodedReport,
		reportSeqNr: signedReport.seqNr().toString(),
	}
}

const initWorkflow = () => {
	// HTTP trigger: the app POSTs the risk inputs here.
	const http = new cre.capabilities.HTTPCapability()
	return [handlerInTee(http.trigger({}), assessInTee, [{ tee: 'nitro', regions: ['us-west-2'] }])]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema })
	await runner.run(initWorkflow)
}

await main()
