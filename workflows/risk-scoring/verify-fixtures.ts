/**
 * Runs the enclave scoring model over the checked-in fixtures and asserts the expected
 * decisions. This imports `scoring.ts` — the same module `main.ts` calls inside the TEE —
 * so a pass here means the real model produced these numbers, not a reimplementation.
 *
 * This is not a substitute for `cre workflow simulate`, which additionally exercises the
 * WASM host, the confidential-http capability and DON report signing. It is the part of
 * the Chainlink evidence that can be reproduced without a CRE account.
 *
 *   bun run verify
 */
import { assess, privateInputsSchema, type ScoringPolicy } from './scoring'
import config from './config.json'

const policy: ScoringPolicy = {
	minScoreToApprove: config.minScoreToApprove,
	protocolMaxLtvBps: config.protocolMaxLtvBps,
}

// Tier 2 is what the reference bureau returns for a registered survey number. The risky
// fixture's `landRecordRef` is unregistered, but the tier lookup is keyed on the reference
// rather than its validity, so both cases are scored against the same tier here.
const BUREAU_TIER = 2

type Expectation = {
	fixture: string
	expectScore: number
	expectApproved: boolean
	expectLtvBps: number
	expectPrincipal6dp: string
}

const EXPECTATIONS: Expectation[] = [
	{
		fixture: 'good-farmer',
		expectScore: 893,
		expectApproved: true,
		expectLtvBps: 22_000,
		expectPrincipal6dp: '880000000', // 880 gUSDC against 400 of grain — 220% LTV
	},
	{
		fixture: 'risky-farmer',
		expectScore: 271,
		expectApproved: false,
		expectLtvBps: 0,
		expectPrincipal6dp: '0',
	},
]

const fmt = (v: bigint) => `${Number(v) / 1e6} gUSDC`

let failures = 0

for (const e of EXPECTATIONS) {
	const raw = await Bun.file(`${import.meta.dir}/fixtures/${e.fixture}.json`).json()
	const inputs = privateInputsSchema.parse(raw)
	const a = assess(inputs, BUREAU_TIER, policy)

	const checks: [string, unknown, unknown][] = [
		['score', a.riskScore, e.expectScore],
		['approved', a.approved, e.expectApproved],
		['ltvBps', a.ltvBps, e.expectLtvBps],
		['principal', a.approvedPrincipal.toString(), e.expectPrincipal6dp],
	]

	const bad = checks.filter(([, got, want]) => got !== want)
	failures += bad.length

	console.log(`\n${bad.length === 0 ? 'PASS' : 'FAIL'}  ${e.fixture}`)
	console.log(`      collateral ${fmt(BigInt(inputs.collateralValue))}`)
	console.log(
		`      score=${a.riskScore}/1000  approved=${a.approved}  ` +
			`ltv=${a.ltvBps}bps  apr=${a.aprBps}bps  principal=${fmt(a.approvedPrincipal)}`,
	)
	console.log(`      commitment ${a.privateInputCommitment}`)
	for (const [name, got, want] of bad) {
		console.log(`      ✗ ${name}: got ${String(got)}, expected ${String(want)}`)
	}
}

// A score of NaN was the bug this file exists to catch: NaN >= minScore is false, so every
// applicant was silently declined and the failure looked like a conservative model.
console.log(
	`\n${failures === 0 ? 'All fixture expectations met.' : `${failures} expectation(s) failed.`}`,
)
process.exit(failures === 0 ? 0 : 1)
