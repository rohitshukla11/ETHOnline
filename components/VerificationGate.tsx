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
    return (
      <div className="card text-center text-stone-400">
        Connect your wallet to continue.
      </div>
    );
  }

  if (isLoading) {
    return <div className="card text-center text-stone-400">Checking verification...</div>;
  }

  if (!isVerified) {
    return (
      <div className="card space-y-3 text-center">
        <h3 className="text-lg font-semibold">World ID verification required</h3>
        <p className="text-sm text-stone-400">
          Godaam issues undercollateralised credit, so a claim has to be tied to a
          verified person rather than a wallet. The World ID nullifier stored onchain
          enforces one claim per identity per action.
        </p>
        <Link href="/verify" className="btn inline-block">
          Verify with World ID
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
