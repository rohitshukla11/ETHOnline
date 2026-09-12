"use client";

import { selfieCheckLegacy, useIDKitRequest, type RpContext } from "@worldcoin/idkit";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useVerification } from "@/components/useVerification";
import { hashscanTx } from "@/lib/chains";

/**
 * World ID verification.
 *
 * IDKit 4.x replaced `IDKitWidget` with `useIDKitRequest` / `IDKitRequestWidget`, and
 * every request now carries an `rp_context` signed by the Relying Party key. That key
 * is server-only, so the context is fetched from /api/rp-signature per attempt.
 *
 * The credential is requested through a PRESET. There is deliberately no top-level
 * `verification_level` alongside it: that combination is the mixed-mode shape behind
 * worldcoin/idkit#204, where World App completes with a legacy `protocol_version:
 * "3.0"` result or a pure-v4 payload comes back `verification_rejected`.
 */
export default function VerifyPage() {
  const { address, isConnected } = useAccount();
  const { isVerified, refetch } = useVerification();

  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [rpError, setRpError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A signed context is short-lived, so it is fetched when the page is ready to use
  // one rather than held from mount.
  useEffect(() => {
    if (!isConnected || isVerified) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/rp-signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setRpError(body.error ?? "Could not obtain a signed proof request.");
          return;
        }
        setRpContext(body as RpContext);
        setRpError(null);
      } catch (e) {
        if (!cancelled) setRpError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, isVerified]);

  const onComplete = useCallback(
    async (result: unknown) => {
      setError(null);
      setStatus("Verifying with World and writing the nullifier onchain...");
      try {
        const res = await fetch("/api/worldid/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The completion payload goes through verbatim; the server does not
          // rebuild the v4 body.
          body: JSON.stringify({ address, worldIdResult: result }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Verification failed");
        setTxHash(body.txHash);
        setStatus("Verified. Your identity is now bound to this address.");
        await refetch();
      } catch (e) {
        setStatus(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [address, refetch]
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">World ID verification</h1>
        <p className="mt-2 text-sm text-stone-400">
          Selfie Check binds this collateral claim to a liveness-verified person and
          makes repeated claims materially harder. The nullifier it produces is unique
          to you and this action; Godaam records it onchain and refuses a second
          address presenting the same one, so one identity gets one claim. Without a
          verification, KYC is never granted and no warehouse receipt can be minted to
          you.
        </p>
      </div>

      {isVerified ? (
        <div className="card border-sprout/50">
          <p className="font-medium text-sprout">Verified</p>
          <p className="mt-1 text-sm text-stone-400">
            {address} is cleared for receipt tokenization and borrowing.
          </p>
        </div>
      ) : !isConnected ? (
        <div className="card text-sm text-stone-400">Connect your wallet first.</div>
      ) : rpError ? (
        <div className="card space-y-2 border-red-500/40">
          <p className="font-medium text-red-400">World ID is not configured</p>
          <p className="text-sm text-stone-400">{rpError}</p>
        </div>
      ) : !rpContext ? (
        <div className="card text-sm text-stone-400">
          Preparing a signed proof request...
        </div>
      ) : (
        <VerifyAction
          rpContext={rpContext}
          signal={address as string}
          onComplete={onComplete}
          status={status}
          error={error}
        />
      )}

      {txHash && (
        <a
          className="block text-sm text-grain underline"
          href={hashscanTx(txHash)}
          target="_blank"
          rel="noreferrer"
        >
          View attestation on HashScan
        </a>
      )}
    </div>
  );
}

/**
 * Split out because `useIDKitRequest` needs a non-null `rp_context`, and hooks cannot
 * be called conditionally.
 */
function VerifyAction({
  rpContext,
  signal,
  onComplete,
  status,
  error,
}: {
  rpContext: RpContext;
  signal: string;
  onComplete: (result: unknown) => void;
  status: string | null;
  error: string | null;
}) {
  const flow = useIDKitRequest({
    app_id: (process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "") as `app_${string}`,
    action: process.env.NEXT_PUBLIC_WORLD_ACTION ?? "",
    rp_context: rpContext,
    // No pre-existing verified users to avoid locking out, and accepting 3.0-era
    // proofs would mean handling two proof shapes for no benefit.
    allow_legacy_proofs: false,
    environment: "production",
    // Preset only. See the note at the top of this file on idkit#204.
    //
    // `signal` binds the proof to this wallet address, so a proof captured for one
    // account is useless for another. IDKit hashes it with hashToField, which
    // branches on input type - an address is valid hex and therefore hashes as 20 raw
    // bytes, not as its 42-character text form. That is handled inside the SDK here;
    // lib/worldid-signal.ts documents it for the server side.
    preset: selfieCheckLegacy({ signal }),
  });

  useEffect(() => {
    if (flow.isSuccess && flow.result) onComplete(flow.result);
  }, [flow.isSuccess, flow.result, onComplete]);

  return (
    <div className="card space-y-4">
      <button
        className="btn w-full"
        onClick={() => flow.open()}
        disabled={flow.isAwaitingUserConfirmation}
      >
        {flow.isAwaitingUserConfirmation
          ? "Waiting for World App..."
          : "Verify with World ID"}
      </button>

      {flow.isError && flow.errorCode && (
        <p className="text-sm text-red-400">
          {flow.errorCode === "feature_unavailable" ||
          flow.errorCode === "credential_unavailable"
            ? "Selfie Check is not enabled for this app yet. Access is granted per app by World; the request is pending."
            : `World App returned: ${flow.errorCode}`}
        </p>
      )}
      {status && <p className="text-sm text-stone-400">{status}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
