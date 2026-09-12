"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useVerification } from "./useVerification";

/**
 * Hard gate. Nothing in Godaam - not tokenization, not borrowing - renders until the
 * World ID nullifier is recorded onchain for the connected address.
 */
export function VerificationGate({ children }: { children: ReactNode }) {
  const { isConnected, isVerified, isLoading } = useVerification();

  if (!isConnected) {
    return <p className="text-[14px] text-muted">Connect your wallet to continue.</p>;
  }

  if (isLoading) {
    return <p className="text-[14px] text-muted">Checking verification...</p>;
  }

  if (!isVerified) {
    return (
      <div className="card space-y-3">
        <span className="pill-bad">Refused</span>
        <h3 className="text-[15px]">World ID verification required</h3>
        <p className="text-[14px] leading-relaxed text-muted">
          Godaam issues undercollateralised credit, so a claim has to be tied to a
          verified person rather than a wallet. The World ID nullifier stored onchain
          enforces one claim per identity per action.
        </p>
        <Link href="/verify" className="btn">
          Verify with World ID
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
