import "server-only";

import { checkVerificationLevel } from "./worldid-policy";

/**
 * World's verification API.
 *
 * `/api/v2/verify/{app_id}` is retired. It still answers, but returns
 * `{"code":"invalid_action","detail":"Action not found."}` for an action that
 * demonstrably exists - the v1 precheck endpoint resolves the same app/action pair
 * happily, and v4 accepts it. The error names the wrong cause, which cost real
 * debugging time, so this is pinned to v4 deliberately.
 *
 * The v4 path takes the **rp_id**, not the app_id. An app_id is accepted there for
 * backward compatibility with legacy proofs, but a World ID 4.0 proof - which is what
 * a Selfie Check preset produces - is scoped to the Relying Party, so the rp_id is
 * the correct identifier and the only one that works for 4.0.
 */
const WORLD_API_BASE = process.env.WORLD_API_BASE ?? "https://developer.worldcoin.org";

/** Per-credential result inside a v4 response. */
type V4ResultItem = {
  identifier?: string;
  success?: boolean;
  code?: string;
  detail?: string;
};

type V4Response = {
  success?: boolean;
  code?: string;
  detail?: string;
  results?: V4ResultItem[];
  nullifier?: string;
  nullifier_hash?: string;
};

export type WorldVerifyResult =
  | { success: true; nullifierHash: bigint; verificationLevel: string }
  | { success: false; code: string; detail: string };

/**
 * Verifies a World ID proof against the Developer Portal.
 *
 * `result` is the completion payload handed back by IDKit - passed through rather
 * than reshaped, because the v4 body schema is the SDK's concern and rebuilding it
 * by hand is how the mixed-mode bug in worldcoin/idkit#204 gets reintroduced.
 *
 * The signal is already bound into the proof by the widget; it is not re-sent here.
 */
export async function verifyWorldProof(
  result: unknown
): Promise<WorldVerifyResult> {
  const rpId = process.env.NEXT_PUBLIC_WORLD_RP_ID;
  if (!rpId) {
    return {
      success: false,
      code: "rp_not_configured",
      detail:
        "NEXT_PUBLIC_WORLD_RP_ID is not set. World ID 4.0 proofs are scoped to a " +
        "Relying Party and cannot be verified without it.",
    };
  }

  const res = await fetch(`${WORLD_API_BASE}/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => ({}))) as V4Response;

  if (!res.ok || body.success !== true) {
    // Prefer the per-credential failure: the envelope only ever says
    // "All proof verifications failed", which is not actionable on its own.
    const item = body.results?.find((r) => r.success === false) ?? body.results?.[0];
    return {
      success: false,
      code: String(item?.code ?? body.code ?? res.status),
      detail: String(item?.detail ?? body.detail ?? "World verification failed"),
    };
  }

  const confirmed = body.results?.find((r) => r.success === true)?.identifier;

  // Assert the credential against what the portal confirmed, never what the client
  // claimed. A client can put any string in its own payload.
  const check = checkVerificationLevel(confirmed);
  if (!check.ok) {
    // TODO(selfie-check): this log is how the real Selfie Check identifier gets
    // discovered - the first genuine proof prints it. Once ACCEPTED_VERIFICATION_LEVELS
    // holds that value, remove this line. It prints only the credential class, never
    // the proof or the nullifier.
    console.warn(
      `[worldid] proof verified by World but credential "${String(confirmed)}" is not ` +
        `in ACCEPTED_VERIFICATION_LEVELS. If this is Selfie Check, that string is the ` +
        `value to put in lib/worldid-policy.ts.`
    );
    return { success: false, code: check.code, detail: check.detail };
  }

  // v4 reports the nullifier on the envelope; legacy payloads carried nullifier_hash.
  const rawNullifier = body.nullifier ?? body.nullifier_hash;
  if (!rawNullifier) {
    return {
      success: false,
      code: "missing_nullifier",
      detail:
        "World returned success but no nullifier. Without it one human cannot be " +
        "bound to one claim, so the verification is refused.",
    };
  }

  return {
    success: true,
    nullifierHash: BigInt(rawNullifier),
    verificationLevel: check.level,
  };
}
