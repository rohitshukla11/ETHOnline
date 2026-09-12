/**
 * Which World ID credentials Godaam accepts.
 *
 * Deliberately an ALLOWLIST. The previous implementation rejected only `"device"`,
 * which has two problems:
 *
 *   1. Every credential World adds in future passes silently. A blocklist on a
 *      credential check fails open, and this one gates undercollateralised lending.
 *   2. It already let a `document` proof through a gate the README described as
 *      stronger, so the check did not enforce what it claimed.
 *
 * No `server-only` import here: this is pure policy with no I/O, so it is directly
 * testable (see test/worldid-policy.test.mjs). `lib/worldid.ts` is the only caller.
 */

/**
 * Credentials that satisfy Godaam's proof-of-personhood gate.
 *
 * THIS IS THE POLICY LINE. One place, deliberately, because it is a decision rather
 * than an implementation detail.
 *
 * ---------------------------------------------------------------------------
 * TODO(selfie-check): replace this set with the real Selfie Check identifier.
 *
 * The v4 verify response returns the credential in `results[].identifier`. The exact
 * string Selfie Check reports is NOT documented and is NOT guessed here - guessing it
 * would either silently reject every real proof, or, worse, be widened until it
 * accepted one.
 *
 * How to obtain it: complete one real Selfie Check (see
 * docs/worldid-selfiecheck-runbook.md). `verifyWorldProof` logs the received
 * identifier on rejection, so the first genuine proof prints the answer. Put that
 * value here, update the "accepted set is exactly" test alongside it, and delete
 * this block.
 *
 * Until then this set holds the credentials the previous IDKit 1.x integration
 * accepted, so the gate stays closed rather than open.
 * ---------------------------------------------------------------------------
 *
 * `orb`      - World's highest-assurance credential. Unavailable to Indian users:
 *              Orb services have been paused in India since 2023.
 * `document` - NFC passport or national ID, medium assurance. Not supported for
 *              Indian documents.
 *
 * Not `device`: device-level is a phone attestation, not a person, and one human can
 * hold many devices. That defeats the Sybil property entirely.
 *
 * Whatever ends up here, keep it an ALLOWLIST. The original implementation rejected
 * only "device" and accepted everything else, which fails open on every credential
 * World ships in future. This set is asserted by a test for exactly that reason.
 */
export const ACCEPTED_VERIFICATION_LEVELS = ["orb", "document"] as const;

export type VerificationLevelCheck =
  | { ok: true; level: string }
  | { ok: false; code: "insufficient_level"; detail: string };

/**
 * Assert the credential is one we accept.
 *
 * @param level    the `verification_level` reported by the Developer Portal
 * @param accepted override the allowlist (tests, or a staged rollout)
 */
export function checkVerificationLevel(
  level: unknown,
  accepted: readonly string[] = ACCEPTED_VERIFICATION_LEVELS,
): VerificationLevelCheck {
  const received =
    typeof level === "string" && level.trim() !== "" ? level.trim() : null;

  if (received === null) {
    return {
      ok: false,
      code: "insufficient_level",
      detail:
        `World ID proof carried no verification level. Godaam accepts only: ` +
        `${accepted.join(", ")}.`,
    };
  }

  if (!accepted.includes(received)) {
    return {
      ok: false,
      code: "insufficient_level",
      // Name what arrived: an opaque rejection here is expensive to debug, because
      // the proof itself is valid and only the credential class is wrong.
      detail:
        `World ID proof has verification level "${received}", which Godaam does ` +
        `not accept. Accepted: ${accepted.join(", ")}.`,
    };
  }

  return { ok: true, level: received };
}
