"use client";

import { IDKitWidget, VerificationLevel, type ISuccessResult } from "@worldcoin/idkit";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useVerification } from "@/components/useVerification";
import { hashscanTx } from "@/lib/chains";

export default function VerifyPage() {
  const { address, isConnected } = useAccount();
  const { isVerified, refetch } = useVerification();
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSuccess(result: ISuccessResult) {
    setError(null);
    setStatus("Verifying proof with World and writing the nullifier onchain...");
    try {
      const res = await fetch("/api/worldid/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, address }),
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
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">World ID Selfie Check</h1>
        <p className="mt-2 text-sm text-stone-400">
          Undercollateralised credit only works if one person cannot become five borrowers.
          Selfie Check produces a nullifier unique to you and this action; Godaam stores it
          onchain and refuses a second address that presents the same one. Without it, KYC
          is never granted and no warehouse receipt can be minted to you.
        </p>
      </div>

      {isVerified ? (
        <div className="card border-sprout/50">
          <p className="font-medium text-sprout">Verified</p>
          <p className="mt-1 text-sm text-stone-400">
            {address} is cleared for receipt tokenization and borrowing.
          </p>
        </div>
      ) : (
        <div className="card space-y-4">
          {!isConnected ? (
            <p className="text-sm text-stone-400">Connect your wallet first.</p>
          ) : (
            <IDKitWidget
              app_id={(process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "app_staging_") as `app_${string}`}
              action={process.env.NEXT_PUBLIC_WORLD_ACTION ?? "godaam-farmer-verify"}
              signal={address}
              verification_level={VerificationLevel.Orb}
              handleVerify={onSuccess}
              onSuccess={() => {}}
            >
              {({ open }: { open: () => void }) => (
                <button className="btn w-full" onClick={open}>
                  Run Selfie Check
                </button>
              )}
            </IDKitWidget>
          )}
          {status && <p className="text-sm text-stone-400">{status}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
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
