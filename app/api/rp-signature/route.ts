import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints and signs an `rp_context` for a World ID 4.0 proof request.
 *
 * Every IDKit preset - selfieCheckLegacy included - goes through
 * `IDKit.request(config)`, whose `rp_context` field is required. That context has to
 * be signed by the Relying Party's key, and that key must never reach the browser,
 * so this runs server-side and the client fetches a fresh context per request.
 *
 * Real signature, read from @worldcoin/idkit-server's .d.ts rather than the README:
 *
 *   signRequest({ signingKeyHex, action?, ttl? }) -> { sig, nonce, createdAt, expiresAt }
 *
 * `action` is REQUIRED for non-session (uniqueness) proofs - the SDK hashes it to a
 * field element and appends it to the signed message. Session proofs omit it. Godaam
 * uses a uniqueness proof, so the action is always signed over; a context signed
 * without it would be rejected.
 *
 * The signature is EIP-191 over:
 *   version(1) || nonce(32) || createdAt_u64_be(8) || expiresAt_u64_be(8) || action(32)
 */

/** Signed authorisation to request a proof - keep the window short. */
const TTL_SECONDS = 120;

export type RpContextResponse = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

export async function POST(req: Request) {
  const rpId = process.env.NEXT_PUBLIC_WORLD_RP_ID;
  const signingKey = process.env.WORLD_SIGNING_KEY;
  const configuredAction = process.env.NEXT_PUBLIC_WORLD_ACTION;

  // Fail loudly and name the variable. A silent empty context is how the earlier
  // World integration stayed broken until it hit the live portal.
  const missing = [
    !rpId && "NEXT_PUBLIC_WORLD_RP_ID",
    !signingKey && "WORLD_SIGNING_KEY",
    !configuredAction && "NEXT_PUBLIC_WORLD_ACTION",
  ].filter(Boolean);

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `World ID 4.0 is not configured. Missing: ${missing.join(", ")}.`,
        code: "rp_not_configured",
        missing,
      },
      { status: 503 }
    );
  }

  // Never sign an action the client supplies. A client that could choose the action
  // could obtain a context valid for a different gate than the one it is passing.
  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== undefined && body.action !== configuredAction) {
    return NextResponse.json(
      {
        error: `Refusing to sign for action "${String(body.action)}". This deployment signs only for "${configuredAction}".`,
        code: "action_mismatch",
      },
      { status: 400 }
    );
  }

  let signed;
  try {
    signed = signRequest({
      signingKeyHex: signingKey as string,
      action: configuredAction as string,
      ttl: TTL_SECONDS,
    });
  } catch (e) {
    // Most likely a malformed signing key. Say so without echoing the key.
    return NextResponse.json(
      {
        error:
          "Could not sign the proof request. Check WORLD_SIGNING_KEY is the hex " +
          "signing key downloaded from the Developer Portal.",
        code: "signing_failed",
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
      },
      { status: 500 }
    );
  }

  const context: RpContextResponse = {
    rp_id: rpId as string,
    nonce: signed.nonce,
    created_at: signed.createdAt,
    expires_at: signed.expiresAt,
    signature: signed.sig,
  };

  return NextResponse.json(context, {
    headers: { "Cache-Control": "no-store" },
  });
}
