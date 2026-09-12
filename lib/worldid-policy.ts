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
 * `orb` is what `app/verify/page.tsx` requests today. Selfie Check, when it lands,
 * reports its own level - add it here at the same time as the frontend switches, so
 * the request and the assertion can never drift apart silently.
 */
export const ACCEPTED_VERIFICATION_LEVELS = ["orb"] as const;

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
