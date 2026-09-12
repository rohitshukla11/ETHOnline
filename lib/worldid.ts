import "server-only";

import { checkVerificationLevel } from "./worldid-policy";
import { hashSignal } from "./worldid-signal";

/**
 * World's verification API.
 *
 * `/api/v2/verify/{app_id}` is retired. It still answers, but returns
 * `{"code":"invalid_action","detail":"Action not found."}` for an action that
 * demonstrably exists — the v1 precheck endpoint resolves the same app/action pair
 * happily, and v4 accepts it. The error names the wrong cause, which cost real
 * debugging time, so this is pinned to v4 deliberately.
 *
 * v4 is a single unified endpoint: it serves World ID 4.0 proofs and legacy 3.0
 * proofs, selected by `protocol_version` in the body. `rp_id` is preferred in the
 * path, but `app_id` is accepted for backward compatibility — which is what lets us
 * stay on legacy proofs without registering as a 4.0 Relying Party.
 */
const WORLD_API_BASE = process.env.WORLD_API_BASE ?? "https://developer.world.org";

export type WorldProof = {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: string;
};

export type WorldVerifyResult =
  | { success: true; nullifierHash: bigint; verificationLevel: string }
  | { success: false; code: string; detail: string };

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
};

/**
 * Verifies a World ID Orb proof against the Developer Portal.
 *
 * `signal` must be the farmer's wallet address so the proof cannot be replayed for
 * a different account. It is hashed to a field element before sending; see
 * lib/worldid-signal.ts for why the encoding matters.
 */
export async function verifyWorldProof(
  proof: WorldProof,
  signal: string
): Promise<WorldVerifyResult> {
  const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID;
  const action = process.env.NEXT_PUBLIC_WORLD_ACTION;
  if (!appId || !action) {
    return { success: false, code: "config", detail: "World app id/action not configured" };
  }

  // Reject an unacceptable credential before spending a network round trip. The
  // response is re-checked below; this is the client-declared value.
  const declared = checkVerificationLevel(proof.verification_level);
  if (!declared.ok) {
    return { success: false, code: declared.code, detail: declared.detail };
  }

  const res = await fetch(`${WORLD_API_BASE}/api/v4/verify/${appId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      protocol_version: "3.0",
      action,
      // Required at the top level for legacy proofs. Not a replay defence on its
      // own - the signal binding below is what ties a proof to one address.
      nonce: crypto.randomUUID(),
      responses: [
        {
          // v4 carries the credential as `identifier`; there is no
          // `verification_level` field on a response item.
          identifier: declared.level,
          nullifier: proof.nullifier_hash,
          merkle_root: proof.merkle_root,
          proof: proof.proof,
          signal_hash: hashSignal(signal),
        },
      ],
    }),
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

  // Re-assert the credential against what the portal confirmed, not what the client
  // claimed. A client can send any verification_level it likes.
  const confirmed = body.results?.find((r) => r.success === true)?.identifier;
  const check = checkVerificationLevel(confirmed ?? declared.level);
  if (!check.ok) {
    return { success: false, code: check.code, detail: check.detail };
  }

  return {
    success: true,
    nullifierHash: BigInt(proof.nullifier_hash),
    verificationLevel: check.level,
  };
}
