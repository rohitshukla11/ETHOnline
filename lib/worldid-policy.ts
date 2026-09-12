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
 * `orb`      - World's strongest proof of personhood.
 * `document` - NFC passport or national ID, medium assurance.
 *
 * Why both: the contracts are credential-agnostic. They record and check a nullifier
 * and never inspect which credential produced it, so the accepted level is policy,
 * not architecture. Production lending against real collateral should require `orb`
 * alone; this demo also accepts `document` because no orb was reachable inside the
 * submission window.
 *
 * This set is kept in step with what the frontend requests. `app/verify/page.tsx`
 * asks for `VerificationLevel.Document`, which idkit-core expands to exactly
 * ["document", "orb"] - the same two values. Changing one without the other lets a
 * credential through the widget that the server then refuses, or vice versa.
 *
 * Not `device`: device-level is a phone attestation, not a person, and one human can
 * hold many devices. That defeats the entire Sybil guarantee.
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
