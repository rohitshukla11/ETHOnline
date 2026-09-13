"use client";

import Link from "next/link";
import { LoanPosition } from "@/components/LoanPosition";

/** The address that holds the seeded demonstration loan. */
const DEMO_BORROWER = "0x033588A8025F47128cf7B102412b81Ca43c2C7f0";
const DEMO_LOAN_ID = 1n;

export default function LoanByIdPage({ params }: { params: { id: string } }) {
  let loanId: bigint | null = null;
  try {
    loanId = BigInt(params.id);
  } catch {
    loanId = null;
  }

  if (loanId === null || loanId <= 0n) {
    return (
      <div className="mx-auto max-w-[600px] space-y-4">
        <h1 className="text-[26px] tracking-[-0.02em]">Loan not found</h1>
        <p className="text-[15px] text-muted">
          `{params.id}` is not a loan id.
        </p>
        <Link href="/loan" className="btn-ghost">
          Back to the ledger
        </Link>
      </div>
    );
  }

  const isDemo = loanId === DEMO_LOAN_ID;

  return (
    <div className="mx-auto max-w-[600px] space-y-6">
      <header>
        <h1 className="text-[26px] tracking-[-0.02em]">Loan #{loanId.toString()}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Read-only. Every figure below is an <span className="fig">eth_call</span> against
          the Sourcify-verified vault on Hedera testnet, so it needs no wallet and nothing
          here is actionable.
        </p>
      </header>

      {isDemo && (
        <div className="card space-y-2">
          <span className="pill">Seeded demonstration loan</span>
          <p className="text-[14px] leading-relaxed text-muted">
            This position is held by the deployer address, not by you. It exists so the
            deployment shows a real loan rather than an empty ledger. The terms were
            produced by the Chainlink CRE Confidential Workflow and submitted verbatim —
            the commitment below is the enclave&apos;s own, and can be diffed against{" "}
            <span className="fig">docs/cre-captured-report.json</span> in the repo.
          </p>
          <p className="fig break-all text-[12px] text-muted">{DEMO_BORROWER}</p>
          <a
            className="text-label text-muted underline-offset-4 hover:text-text hover:underline"
            href={`https://hashscan.io/testnet/account/${DEMO_BORROWER}`}
            target="_blank"
            rel="noreferrer"
          >
            View the borrower on HashScan
          </a>
        </div>
      )}

      <LoanPosition loanId={loanId} readOnly />

      <Link href="/loan" className="btn-ghost">
        Go to my ledger
      </Link>
    </div>
  );
}
