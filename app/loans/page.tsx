"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useReadContract } from "wagmi";
import { GusdcBalance } from "@/components/GusdcBalance";
import { LoanPosition } from "@/components/LoanPosition";
import { VerificationGate } from "@/components/VerificationGate";
import { addresses, godaamVaultAbi } from "@/lib/contracts";

function Ledger() {
  const { data: nextLoanId } = useReadContract({
    address: addresses.godaamVault,
    abi: godaamVaultAbi,
    functionName: "nextLoanId",
    query: { refetchInterval: 5000 },
  });

  const loanIds = nextLoanId
    ? Array.from({ length: Number(nextLoanId) - 1 }, (_, i) => BigInt(i + 1))
    : [];

  // The vault numbers loans globally, so every id is rendered and LoanPosition hides the
  // ones that are not the connected wallet's. It reports ownership back so the empty
  // state is accurate rather than a guess.
  const [myLoanIds, setMyLoanIds] = useState<Set<string>>(new Set());
  const onOwnership = useCallback((id: bigint, isMine: boolean) => {
    setMyLoanIds((prev) => {
      const key = id.toString();
      if (prev.has(key) === isMine) return prev;
      const next = new Set(prev);
      if (isMine) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return (
    <div className="space-y-8">
      {myLoanIds.size === 0 && (
        <div className="card space-y-3">
          <p className="text-[14px] text-muted">
            No loans yet for this wallet.{" "}
            <Link href="/loan" className="text-text underline underline-offset-4">
              Pledge a receipt
            </Link>{" "}
            to open one.
          </p>
          <p className="text-[14px] text-muted">
            There is a seeded demonstration loan on this deployment - 880 gUSDC borrowed
            against 400 of grain at a 220% LTV, underwritten in the enclave. It is held by
            another address, so it does not appear in your ledger.
          </p>
          <Link href="/loan/1" className="btn-ghost w-full sm:w-auto">
            View the demo loan
          </Link>
        </div>
      )}

      {loanIds.map((id) => (
        <LoanPosition key={id.toString()} loanId={id} onOwnership={onOwnership} />
      ))}
    </div>
  );
}

export default function MyLoansPage() {
  return (
    <div className="mx-auto max-w-[1120px] space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[32px] leading-none tracking-[-0.02em]">Loans</h1>
        <GusdcBalance compact />
      </header>
      <VerificationGate>
        <Ledger />
      </VerificationGate>
    </div>
  );
}
