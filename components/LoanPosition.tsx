"use client";

import { useEffect } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { hashscanTx } from "@/lib/chains";
import {
  addresses,
  erc20Abi,
  formatUsdc,
  godaamVaultAbi,
  warehouseReceiptAbi,
  LOAN_STATUS,
} from "@/lib/contracts";

const ZERO_COMMITMENT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** The ceiling GodaamVault.onReport actually enforces: `a.ltvBps > 25_000` reverts. */
const PROTOCOL_CEILING_BPS = 25_000;
/** The top band the scoring model can certify. A marker on the track, not its end. */
const CERTIFIED_BAND_BPS = 22_000;

const bare = (v: bigint | undefined) => formatUsdc(v).replace(" gUSDC", "");

function Cell({ k, v, tint = false }: { k: string; v: React.ReactNode; tint?: boolean }) {
  return (
    <div className={`flex-1 px-5 py-4 ${tint ? "bg-wheat-tint" : ""}`}>
      <p className={`text-[13px] ${tint ? "text-wheat" : "text-muted"}`}>{k}</p>
      <p
        className={`fig mt-1 text-[26px] leading-none ${tint ? "text-wheat-text" : "text-text"}`}
      >
        {v}
      </p>
    </div>
  );
}

/** Continuous track scaled to the protocol ceiling, with the certified band marked. */
function LtvTrack({ ltvBps }: { ltvBps: number }) {
  const pct = Math.min((ltvBps / PROTOCOL_CEILING_BPS) * 100, 100);
  const markPct = (CERTIFIED_BAND_BPS / PROTOCOL_CEILING_BPS) * 100;
  return (
    <div
      className="relative h-[7px] w-full rounded-pill bg-border"
      role="img"
      aria-label={`Loan to value ${ltvBps / 100}% against a ${PROTOCOL_CEILING_BPS / 100}% protocol ceiling`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-pill bg-wheat"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute -top-[3px] h-[13px] w-[2px] rounded-pill bg-wheat-edge"
        style={{ left: `${markPct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

function Schedule({ total, filled }: { total: number; filled: number }) {
  if (total <= 0) return null;
  return (
    <div className="flex gap-1.5" role="img" aria-label={`${filled} of ${total} paid`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-[5px] flex-1 rounded-pill ${i < filled ? "bg-wheat" : "bg-border"}`}
        />
      ))}
    </div>
  );
}

export function LoanPosition({
  loanId,
  onOwnership,
  readOnly = false,
}: {
  loanId: bigint;
  onOwnership?: (loanId: bigint, isMine: boolean) => void;
  /** Read-only renders the position with nothing actionable, for a visitor who is not
   *  the borrower. Provenance, colours and commitment logic are untouched. */
  readOnly?: boolean;
}) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });

  const vault = {
    address: addresses.godaamVault,
    abi: godaamVaultAbi,
    query: { refetchInterval: 5000 },
  } as const;

  const { data: loan } = useReadContract({ ...vault, functionName: "getLoan", args: [loanId] });
  const { data: due } = useReadContract({ ...vault, functionName: "amountDue", args: [loanId] });
  const { data: nextDue } = useReadContract({ ...vault, functionName: "nextDueDate", args: [loanId] });
  const { data: liquidatable } = useReadContract({
    ...vault,
    functionName: "isLiquidatable",
    args: [loanId],
  });

  const { data: receipt } = useReadContract({
    address: addresses.warehouseReceipt,
    abi: warehouseReceiptAbi,
    functionName: "receiptOf",
    args: loan ? [loan.receiptId] : undefined,
    query: { enabled: Boolean(loan) },
  });

  const isMine = Boolean(
    loan && address && loan.borrower.toLowerCase() === address.toLowerCase()
  );

  useEffect(() => {
    onOwnership?.(loanId, isMine);
  }, [loanId, isMine, onOwnership]);

  if (!loan) return null;
  if (!readOnly && !isMine) return null;

  const status = LOAN_STATUS[Number(loan.status)] ?? "Unknown";
  const active = status === "Active";
  // A non-zero commitment means the terms came back through the confidential assessment
  // path. Zero means they did not, and that is the difference between a TEE output and a
  // number somebody typed.
  const attested = loan.privateInputCommitment !== ZERO_COMMITMENT;
  const overdue = Boolean(nextDue) && Date.now() / 1000 > Number(nextDue);
  const outstanding = loan.totalOwed - loan.repaid;
  const actionable = active && isMine && !readOnly;
  const commitment = loan.privateInputCommitment;

  return (
    <article className="space-y-5">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-[32px] leading-none tracking-[-0.02em]">
          Loan #{loanId.toString()}
        </h2>
        <span className={status === "Liquidated" ? "pill-bad" : "pill"}>{status}</span>
        {overdue && active && <span className="pill-bad">Overdue</span>}
      </header>

      <p className="text-[14px] text-muted">
        Receipt #{loan.receiptId.toString()}
        {receipt
          ? ` · ${Number(receipt.quantityKg).toLocaleString()} kg ${receipt.cropType}, grade ${receipt.grade}`
          : ""}
      </p>

      {/* One container, four cells, so the figures read as one strip rather than as
          four competing cards. */}
      <div className="flex flex-wrap overflow-hidden rounded-card border border-border bg-surface
        divide-x divide-border">
        <Cell k="Collateral" v={bare(loan.collateralValue)} />
        <Cell k="Borrowed" v={bare(loan.principal)} />
        <Cell k="Outstanding" v={bare(outstanding)} />
        <Cell k="Risk score" v={loan.riskScore} tint />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-3 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[15px] text-muted">Loan to value</p>
            <p className="fig text-[26px] leading-none">{loan.ltvBps / 100}%</p>
          </div>
          <LtvTrack ltvBps={Number(loan.ltvBps)} />
          <p className="text-[13px] text-muted">
            Certified band {CERTIFIED_BAND_BPS / 100}% · protocol ceiling{" "}
            {PROTOCOL_CEILING_BPS / 100}%
          </p>
          <div className="border-t border-border pt-3">
            <p className="text-[13px] text-muted">LTV decided by</p>
            <p
              className={`mt-1 text-[16px] ${attested ? "text-text" : "font-semibold text-bad"}`}
            >
              {attested ? "CRE simulation (captured)" : "hand-encoded"}
            </p>
            <p className="fig mt-1.5 break-all text-[12px] text-muted">
              {attested
                ? `${commitment.slice(0, 26)}…${commitment.slice(-9)}`
                : "no TEE commitment onchain"}
            </p>
          </div>
        </div>

        <div className="card space-y-3 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[15px] text-muted">
              {overdue ? "Payment overdue" : "Next installment"}
            </p>
            <p className="text-[13px] text-muted">
              {loan.installmentsPaid} of {loan.installmentCount} paid
            </p>
          </div>
          <p className={`fig text-[38px] leading-none ${overdue ? "text-bad" : ""}`}>
            {bare(due)}
          </p>
          <Schedule
            total={Number(loan.installmentCount)}
            filled={Number(loan.installmentsPaid)}
          />
          <p className="text-[13px] text-muted">
            {nextDue
              ? `${overdue ? "Was due" : "Due"} ${new Date(Number(nextDue) * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
              : "No schedule"}{" "}
            · {bare(outstanding)} of {bare(loan.totalOwed)} remaining
          </p>

          {actionable && (
            <div className="space-y-2 pt-1">
              <button
                className="btn w-full py-3 text-[16px] font-bold"
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
                Pay {bare(due)} gUSDC
              </button>
              <div className="flex gap-2">
                <button
                  className="btn-ghost flex-1"
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
                  Approve
                </button>
                <button
                  className="btn-ghost flex-1"
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
              </div>
              {liquidatable && (
                <button
                  className="w-full rounded-pill border border-bad/40 bg-bad/10 px-5 py-2.5
                    text-[15px] font-medium text-bad transition-colors hover:bg-bad/20"
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
            <a
              className="text-label text-muted underline-offset-4 hover:text-text hover:underline"
              href={hashscanTx(hash)}
              target="_blank"
              rel="noreferrer"
            >
              Latest transaction
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
