import "server-only";

const WORLD_API_BASE = process.env.WORLD_API_BASE ?? "https://developer.worldcoin.org";

export type WorldProof = {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: string;
};

export type WorldVerifyResult =
  | { success: true; nullifierHash: bigint; verificationLevel: string }
  | { success: false; code: string; detail: string };

/**
 * Verifies a World ID Selfie Check proof against the Developer Portal.
 * `signal` must be the farmer's wallet address so the proof cannot be replayed for
 * a different account.
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

  const res = await fetch(`${WORLD_API_BASE}/api/v2/verify/${appId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nullifier_hash: proof.nullifier_hash,
      merkle_root: proof.merkle_root,
      proof: proof.proof,
      verification_level: proof.verification_level,
      action,
      signal_hash: undefined,
      signal,
    }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    return {
      success: false,
      code: String(body.code ?? res.status),
      detail: String(body.detail ?? "World verification failed"),
    };
  }

  // Selfie Check must be an actual face-verified level, not a device-only proof.
  const level = String(body.verification_level ?? proof.verification_level);
  if (level === "device") {
    return {
      success: false,
      code: "insufficient_level",
      detail: "Godaam requires Selfie Check (orb/face), not a device-level proof",
    };
  }

  return {
    success: true,
    nullifierHash: BigInt(proof.nullifier_hash),
    verificationLevel: level,
  };
}
