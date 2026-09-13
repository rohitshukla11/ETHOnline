"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { LoanPosition } from "@/components/LoanPosition";
import { VerificationGate } from "@/components/VerificationGate";
import { Metric, Provenance, Segments } from "@/components/ui";
import { hashscanTx } from "@/lib/chains";
import {
  addresses,
  erc20Abi,
  formatUsdc,
  godaamVaultAbi,
  warehouseReceiptAbi,
  LOAN_STATUS,
} from "@/lib/contracts";
import { submitRiskInputs, type AssessmentResult } from "@/lib/cre";

const ZERO_COMMITMENT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** The unit is stated once in the label, not repeated on every figure. */
const bare = (v: bigint | undefined) => formatUsdc(v).replace(" gUSDC", "");

function RiskForm({ loanId, collateralValue }: { loanId: bigint; collateralValue: bigint }) {
  const { address } = useAccount();
  const [landRecordRef, setLandRecordRef] = useState("MH-PUN-0421/2A");
  const [yields, setYields] = useState("3120, 2980, 3240, 3050, 3190");
  const [history, setHistory] = useState("PACS-Baramati:120000:0, SBI-KCC:240000:12");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await submitRiskInputs({
        loanId: loanId.toString(),
        borrower: address!,
        collateralValue: collateralValue.toString(),
        landRecordRef,
        pastYieldsKgPerHa: yields.split(",").map((s) => Number(s.trim())).filter(Boolean),
        repaymentHistory: history
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((entry) => {
            const [lender, amount, daysLate] = entry.split(":");
            return { lender, amount: Number(amount), daysLate: Number(daysLate) };
          }),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const simulated = result?.mode === "cre-simulation";

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div>
        <h2 className="text-[15px]">Confidential underwriting</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          These three fields are encrypted to the Chainlink CRE enclave. They are not
          stored by this app, not logged by the API route, and never written onchain.
          Only the score band and the approved amount leave the TEE.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="land-record">
            Land record reference
          </label>
          <input
            id="land-record"
            className="input"
            value={landRecordRef}
            onChange={(e) => setLandRecordRef(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="past-yields">
            Past yields, kg per hectare
          </label>
          <input
            id="past-yields"
            className="input"
            value={yields}
            onChange={(e) => setYields(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="repayment-history">
            Repayment history, lender:amount:daysLate
          </label>
          <input
            id="repayment-history"
            className="input"
            value={history}
            onChange={(e) => setHistory(e.target.value)}
          />
        </div>
      </div>

      <button className="btn w-full" disabled={busy}>
        {busy ? "Scoring inside the enclave..." : "Submit for confidential underwriting"}
      </button>

      {error && <p className="text-[13px] text-bad">{error}</p>}

      {result && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className={result.approved ? "pill" : "pill-bad"}>
              {result.approved ? "Approved" : "Declined"}
            </span>
            <span className="metric">{result.riskScore}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric
              label="Loan to value"
              value={`${result.ltvBps / 100}%`}
            />
            <Metric label="Disbursed" value={bare(BigInt(result.approvedPrincipal))} />
          </div>
          {/* Three states, not two. A captured simulation is a real workflow output
              routed through the simulator's HTTP trigger - /api/cre/assess refuses
              with 503 rather than fabricating - so it is honest provenance and must
              not render as a warning. It must also not claim to be a live trigger.
              Only a number with no enclave behind it takes red ink. */}
          <Provenance
            label="LTV decided by:"
            source={
              simulated
                ? "CRE simulation (captured)"
                : "CRE live trigger"
            }
            degraded={false}
          />
        </div>
      )}
    </form>
  );
}

/** The ledger renders the shared position component; `/loan/[id]` renders the same one
 *  read-only. One component means the provenance rules cannot drift between them. */
function LoanCard(props: {
  loanId: bigint;
  onOwnership: (loanId: bigint, isMine: boolean) => void;
}) {
  return <LoanPosition {...props} />;
}


/**
 * Installments total more than the principal, so a farmer who only ever received the
 * disbursement cannot finish repaying. MockUSDC.faucet() mints 5,000 gUSDC once a day on
 * testnet; without a button for it the demo dead-ends on the first installment.
 */
function GusdcBalance() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });

  const { data: balance, refetch } = useReadContract({
    address: addresses.mockUsdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 5000 },
  });

  useEffect(() => {
    if (!confirming && hash) void refetch();
  }, [confirming, hash, refetch]);

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-label text-muted">Your balance</p>
        <p className="mt-1 text-metric font-medium tabular-nums">{bare(balance)} gUSDC</p>
      </div>
      <button
        className="btn-ghost whitespace-nowrap"
        disabled={isPending || confirming}
        onClick={() =>
          writeContract({
            address: addresses.mockUsdc,
            abi: erc20Abi,
            functionName: "faucet",
          })
        }
      >
        {isPending || confirming ? "Claiming..." : "Get 5,000 test gUSDC"}
      </button>
    </div>
  );
}

function LoanWorkspace() {
  const [receiptId, setReceiptId] = useState("1");
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });

  const { data: nextLoanId } = useReadContract({
    address: addresses.godaamVault,
    abi: godaamVaultAbi,
    functionName: "nextLoanId",
    query: { refetchInterval: 5000 },
  });

  const { data: activeLoan } = useReadContract({
    address: addresses.godaamVault,
    abi: godaamVaultAbi,
    functionName: "activeLoanOfReceipt",
    args: [BigInt(receiptId || "0")],
    query: { enabled: Boolean(receiptId) },
  });

  const { data: collateralValue } = useReadContract({
    address: addresses.warehouseReceipt,
    abi: warehouseReceiptAbi,
    functionName: "appraisedValueOf",
    args: [BigInt(receiptId || "0")],
    query: { enabled: Boolean(receiptId) },
  });

  const loanIds = nextLoanId
    ? Array.from({ length: Number(nextLoanId) - 1 }, (_, i) => BigInt(i + 1))
    : [];

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
      <GusdcBalance />

      <section className="card space-y-3">
        <div>
          <h2 className="text-[15px]">Pledge a receipt</h2>
          <p className="mt-1.5 text-[13px] text-muted">
            Pledging freezes the receipt inside the vault.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="receipt-id">
            Receipt token id
          </label>
          <input
            id="receipt-id"
            className="input"
            value={receiptId}
            onChange={(e) => setReceiptId(e.target.value)}
            placeholder="1"
          />
        </div>
        {collateralValue !== undefined && (
          <p className="text-label text-muted">
            Appraised collateral {bare(collateralValue)} gUSDC, set by the warehouse
            operator
          </p>
        )}
        <button
          className="btn w-full"
          disabled={isPending || confirming || !receiptId}
          onClick={() =>
            writeContract({
              address: addresses.godaamVault,
              abi: godaamVaultAbi,
              functionName: "requestLoan",
              args: [BigInt(receiptId)],
            })
          }
        >
          Request loan
        </button>
        <button
          className="btn-ghost w-full"
          disabled={isPending || confirming}
          onClick={() =>
            writeContract({
              address: addresses.warehouseReceipt,
              abi: warehouseReceiptAbi,
              functionName: "setApprovalForAll",
              args: [addresses.godaamVault, true],
            })
          }
        >
          Approve vault
        </button>
      </section>

      {activeLoan !== undefined && activeLoan > 0n && collateralValue !== undefined && (
        <RiskForm loanId={activeLoan} collateralValue={collateralValue} />
      )}

      <section className="space-y-4">
        <h2 className="text-[19px]">Your loans</h2>
        {myLoanIds.size === 0 && (
          <div className="card space-y-3">
            <p className="text-[14px] text-muted">
              No loans yet for this wallet. Pledge a receipt above to open one.
            </p>
            <p className="text-[14px] text-muted">
              There is a seeded demonstration loan on this deployment — 880 gUSDC borrowed
              against 400 of grain at a 220% LTV, underwritten in the enclave. It is held
              by another address, so it does not appear in your ledger.
            </p>
            <Link href="/loan/1" className="btn-ghost w-full sm:w-auto">
              View the demo loan
            </Link>
          </div>
        )}
        {loanIds.map((id) => (
          <LoanCard key={id.toString()} loanId={id} onOwnership={onOwnership} />
        ))}
      </section>
    </div>
  );
}

export default function LoanPage() {
  return (
    <div className="mx-auto max-w-[600px] space-y-8">
      <header>
        <h1 className="text-[26px] tracking-[-0.02em]">Borrow against your grain</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Pledging freezes the receipt inside the vault. The Chainlink CRE Confidential
          Workflow then decides how much you can borrow - often more than the grain is
          worth - based on data that stays inside the enclave.
        </p>
      </header>
      <VerificationGate>
        <LoanWorkspace />
      </VerificationGate>
    </div>
  );
}
