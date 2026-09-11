"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { VerificationGate } from "@/components/VerificationGate";
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

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="rounded-lg border border-stone-700 bg-stone-950 p-3 text-xs text-stone-400">
        These three fields are encrypted to the Chainlink CRE enclave. They are not stored
        by this app, not logged by the API route, and never written onchain. Only the score
        band and the approved amount leave the TEE.
      </div>
      <div>
        <label className="label">Land record reference</label>
        <input className="input" value={landRecordRef} onChange={(e) => setLandRecordRef(e.target.value)} />
      </div>
      <div>
        <label className="label">Past yields (kg/ha, comma separated)</label>
        <input className="input" value={yields} onChange={(e) => setYields(e.target.value)} />
      </div>
      <div>
        <label className="label">Repayment history (lender:amount:daysLate)</label>
        <input className="input" value={history} onChange={(e) => setHistory(e.target.value)} />
      </div>
      <button className="btn w-full" disabled={busy}>
        {busy ? "Scoring inside the enclave..." : "Submit for confidential underwriting"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {result && (
        <div className="space-y-1 rounded-lg border border-grain/40 bg-grain/5 p-4 text-sm">
          <p className="font-medium text-grain">
            {result.approved ? "Approved" : "Declined"} · score {result.riskScore}/1000 ·{" "}
            {result.mode}
          </p>
          <p className="text-stone-400">
            LTV {result.ltvBps / 100}% · APR {result.aprBps / 100}% ·{" "}
            {formatUsdc(BigInt(result.approvedPrincipal))} disbursed against{" "}
            {formatUsdc(collateralValue)} of grain
          </p>
        </div>
      )}
    </form>
  );
}

function LoanCard({ loanId }: { loanId: bigint }) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });

  const { data: loan } = useReadContract({
    address: addresses.godaamVault,
    abi: godaamVaultAbi,
    functionName: "getLoan",
    args: [loanId],
    query: { refetchInterval: 5000 },
  });
  const { data: due } = useReadContract({
    address: addresses.godaamVault,
    abi: godaamVaultAbi,
    functionName: "amountDue",
    args: [loanId],
    query: { refetchInterval: 5000 },
  });
  const { data: nextDue } = useReadContract({
    address: addresses.godaamVault,
    abi: godaamVaultAbi,
    functionName: "nextDueDate",
    args: [loanId],
    query: { refetchInterval: 5000 },
  });
  const { data: liquidatable } = useReadContract({
    address: addresses.godaamVault,
    abi: godaamVaultAbi,
    functionName: "isLiquidatable",
    args: [loanId],
    query: { refetchInterval: 5000 },
  });

  if (!loan) return null;
  const status = LOAN_STATUS[Number(loan.status)] ?? "Unknown";
  const active = status === "Active";

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Loan #{loanId.toString()}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
            status === "Liquidated"
              ? "bg-red-500/20 text-red-300"
              : status === "Repaid"
                ? "bg-sprout/20 text-sprout"
                : "bg-stone-800 text-stone-300"
          }`}
        >
          {status}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-stone-400">
        <dt>Collateral</dt>
        <dd className="text-right text-stone-200">{formatUsdc(loan.collateralValue)}</dd>
        <dt>Principal</dt>
        <dd className="text-right text-stone-200">{formatUsdc(loan.principal)}</dd>
        <dt>LTV / APR</dt>
        <dd className="text-right text-stone-200">
          {loan.ltvBps / 100}% / {loan.aprBps / 100}%
        </dd>
        <dt>Confidential score</dt>
        <dd className="text-right text-stone-200">{loan.riskScore}/1000</dd>
        <dt>Repaid</dt>
        <dd className="text-right text-stone-200">
          {formatUsdc(loan.repaid)} of {formatUsdc(loan.totalOwed)} ({loan.installmentsPaid}/
          {loan.installmentCount})
        </dd>
        {active && (
          <>
            <dt>Next due</dt>
            <dd className="text-right text-stone-200">
              {nextDue ? new Date(Number(nextDue) * 1000).toLocaleDateString() : "-"}
            </dd>
          </>
        )}
      </dl>

      {loan.privateInputCommitment !==
        "0x0000000000000000000000000000000000000000000000000000000000000000" && (
        <p className="break-all font-mono text-[10px] text-stone-600">
          TEE input commitment {loan.privateInputCommitment}
        </p>
      )}

      {active && (
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            disabled={isPending || confirming}
            onClick={() =>
              writeContract({
                address: addresses.mockUsdc,
                abi: erc20Abi,
                functionName: "approve",
                args: [addresses.godaamVault, loan.totalOwed],
              })
            }
          >
            Approve gUSDC
          </button>
          <button
            className="btn"
            disabled={isPending || confirming || !due}
            onClick={() =>
              writeContract({
                address: addresses.godaamVault,
                abi: godaamVaultAbi,
                functionName: "repayInstallment",
                args: [loanId],
              })
            }
          >
            Pay installment ({formatUsdc(due)})
          </button>
          <button
            className="btn-ghost"
            disabled={isPending || confirming}
            onClick={() =>
              writeContract({
                address: addresses.godaamVault,
                abi: godaamVaultAbi,
                functionName: "repayFull",
                args: [loanId],
              })
            }
          >
            Repay in full
          </button>
          {liquidatable && (
            <button
              className="rounded-lg bg-red-500 px-4 py-2 font-medium text-white"
              disabled={isPending || confirming}
              onClick={() =>
                writeContract({
                  address: addresses.godaamVault,
                  abi: godaamVaultAbi,
                  functionName: "liquidate",
                  args: [loanId],
                })
              }
            >
              Liquidate (defaulted)
            </button>
          )}
        </div>
      )}

      {hash && (
        <a className="text-xs text-grain underline" href={hashscanTx(hash)} target="_blank" rel="noreferrer">
          Latest tx on HashScan
        </a>
      )}
    </div>
  );
}

function LoanWorkspace() {
  const { address } = useAccount();
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

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h2 className="font-semibold">1. Pledge a receipt</h2>
        <div className="flex gap-2">
          <input
            className="input"
            value={receiptId}
            onChange={(e) => setReceiptId(e.target.value)}
            placeholder="Receipt token id"
          />
          <button
            className="btn-ghost whitespace-nowrap"
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
          <button
            className="btn whitespace-nowrap"
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
        </div>
        {collateralValue !== undefined && (
          <p className="text-sm text-stone-400">
            Appraised collateral: {formatUsdc(collateralValue)}
          </p>
        )}
      </div>

      {activeLoan !== undefined && activeLoan > 0n && collateralValue !== undefined && (
        <div className="space-y-2">
          <h2 className="font-semibold">2. Confidential underwriting</h2>
          <RiskForm loanId={activeLoan} collateralValue={collateralValue} />
        </div>
      )}

      <div className="space-y-2">
        <h2 className="font-semibold">3. Your loans</h2>
        {loanIds.length === 0 && <p className="text-sm text-stone-500">No loans yet.</p>}
        <div className="grid gap-4">
          {loanIds.map((id) => (
            <LoanCard key={id.toString()} loanId={id} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoanPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Borrow against your grain</h1>
        <p className="mt-2 text-sm text-stone-400">
          Pledging freezes the receipt inside the vault. The Chainlink CRE Confidential
          Workflow then decides how much you can borrow - often more than the grain is
          worth - based on data that stays inside the enclave.
        </p>
      </div>
      <VerificationGate>
        <LoanWorkspace />
      </VerificationGate>
    </div>
  );
}
