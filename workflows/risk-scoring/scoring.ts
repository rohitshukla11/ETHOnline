/**
 * Godaam credit scoring model.
 *
 * Split out of `main.ts` so it can be executed and asserted on without a CRE host: the
 * workflow entry point ends in a top-level `await main()`, which needs the WASM runtime.
 * `main.ts` imports these functions, so `verify-fixtures.ts` exercises exactly the code
 * that runs inside the enclave — not a copy of it.
 *
 * Nothing here touches the network or the runtime. The one outbound call the model needs
 * (the land-tenure bureau tier) is passed in as a plain number by the caller, which is what
 * keeps this module runnable outside the TEE.
 */
import { keccak256, toBytes } from 'viem'
import type { Hex } from 'viem'
import { z } from 'zod'

/** Sensitive payload. Only ever materialised inside the TEE. */
export const privateInputsSchema = z.object({
	loanId: z.number(),
	borrower: z.string(),
	collateralValue: z.string(), // 6dp, from the LoanRequested log
	landRecordRef: z.string(), // e.g. "MH-PUN-0421/2A" — PII-adjacent
	pastYieldsKgPerHa: z.array(z.number()).min(1),
	repaymentHistory: z.array(
		z.object({ lender: z.string(), amount: z.number(), daysLate: z.number() }),
	),
	aadhaarLast4: z.string().optional(),
})
export type PrivateInputs = z.infer<typeof privateInputsSchema>

export type ScoringPolicy = {
	minScoreToApprove: number
	protocolMaxLtvBps: number
}

export type Assessment = {
	loanId: bigint
	approved: boolean
	approvedPrincipal: bigint
	aprBps: number
	ltvBps: number
	riskScore: number
	installmentCount: number
	installmentPeriod: bigint
	privateInputCommitment: Hex
}

export function scoreYieldStability(yields: number[]): number {
	const mean = yields.reduce((a, b) => a + b, 0) / yields.length
	if (mean === 0) return 0
	const variance = yields.reduce((acc, y) => acc + (y - mean) ** 2, 0) / yields.length
	const cv = Math.sqrt(variance) / mean
	// Low coefficient of variation => predictable harvests => better credit.
	return Math.round(Math.max(0, Math.min(1, 1 - cv)) * 400)
}

export function scoreRepaymentHistory(history: PrivateInputs['repaymentHistory']): number {
	if (history.length === 0) return 120 // thin file, not a red flag
	const weighted = history.reduce((acc, h) => {
		const penalty = h.daysLate <= 0 ? 0 : h.daysLate <= 30 ? 0.25 : h.daysLate <= 90 ? 0.6 : 1
		return acc + (1 - penalty) * h.amount
	}, 0)
	const total = history.reduce((acc, h) => acc + h.amount, 0)
	return Math.round((weighted / total) * 400)
}

export function scoreLandTenure(landRecordRef: string, bureauTier: number): number {
	const hasSurveyNumber = /\d+[A-Z]?$/.test(landRecordRef.trim())
	return (hasSurveyNumber ? 120 : 40) + bureauTier * 20
}

/** score (0-1000) -> LTV band. Above 10000 bps means undercollateralised lending. */
export function ltvBandFor(score: number): { ltvBps: number; aprBps: number } {
	if (score >= 850) return { ltvBps: 22_000, aprBps: 900 }
	if (score >= 700) return { ltvBps: 17_500, aprBps: 1_200 }
	if (score >= 560) return { ltvBps: 13_000, aprBps: 1_500 }
	if (score >= 420) return { ltvBps: 9_000, aprBps: 1_900 }
	return { ltvBps: 0, aprBps: 0 }
}

export function commitmentOf(inputs: PrivateInputs): Hex {
	// Deterministic, order-stable serialisation so the commitment is reproducible.
	const canonical = JSON.stringify({
		loanId: inputs.loanId,
		borrower: inputs.borrower.toLowerCase(),
		landRecordRef: inputs.landRecordRef,
		pastYieldsKgPerHa: inputs.pastYieldsKgPerHa,
		repaymentHistory: inputs.repaymentHistory,
	})
	return keccak256(toBytes(canonical))
}

/**
 * The whole decision, given already-fetched inputs.
 *
 * `bureauTier` is a plain number by the time it reaches here. That is the fix for the bug
 * that made every applicant score `NaN`: the old code assigned the *unresolved* result of
 * `runInNodeMode(...).then(...)` and force-cast it to `number`, so `bureauTier * 20`
 * evaluated to `NaN` and poisoned the total. Keeping the fetch at the caller and the
 * arithmetic here makes that class of mistake impossible to reintroduce silently.
 */
export function assess(
	inputs: PrivateInputs,
	bureauTier: number,
	policy: ScoringPolicy,
): Assessment {
	const score = Math.min(
		1000,
		scoreYieldStability(inputs.pastYieldsKgPerHa) +
			scoreRepaymentHistory(inputs.repaymentHistory) +
			scoreLandTenure(inputs.landRecordRef, bureauTier),
	)

	const { ltvBps, aprBps } = ltvBandFor(score)
	const approved = score >= policy.minScoreToApprove && ltvBps > 0
	const cappedLtv = Math.min(ltvBps, policy.protocolMaxLtvBps)

	const collateral = BigInt(inputs.collateralValue)
	const principal = approved ? (collateral * BigInt(cappedLtv)) / 10_000n : 0n

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
	}
}
