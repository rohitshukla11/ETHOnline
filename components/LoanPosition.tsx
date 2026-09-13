"use client";

import { useEffect } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
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

const ZERO_COMMITMENT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** The unit is stated once in the label, not repeated on every figure. */
const bare = (v: bigint | undefined) => formatUsdc(v).replace(" gUSDC", "");

export function LoanPosition({
  loanId,
  onOwnership,
  readOnly = false,
}: {
  loanId: bigint;
  onOwnership?: (loanId: bigint, isMine: boolean) => void;
  /** Read-only renders the position with nothing actionable, for a visitor who is
   *  not the borrower. Provenance, colours and commitment logic are untouched -
   *  there is no separate code path for them. */
  readOnly?: boolean;
}) {
  const { address } = useAccount();
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
  // Crop, grade and quantity for the receipt line. Read-only and non-blocking: if it
  // is unavailable the line falls back to the receipt id alone.
  const { data: receipt } = useReadContract({
    address: addresses.warehouseReceipt,
    abi: warehouseReceiptAbi,
    functionName: "receiptOf",
    args: loan ? [loan.receiptId] : undefined,
    query: { enabled: Boolean(loan) },
  });

  // The vault numbers loans globally, so iterating 1..nextLoanId surfaces every borrower's
  // loan. Only render the connected farmer's own, and tell the parent either way so it can
  // show an accurate empty state.
  const isMine = Boolean(
    loan && address && loan.borrower.toLowerCase() === address.toLowerCase()
  );

  useEffect(() => {
    onOwnership?.(loanId, isMine);
  }, [loanId, isMine, onOwnership]);

  // In the wallet-filtered ledger a loan that is not yours renders nothing. A read-only
  // view renders it for anyone, because the data is already public onchain.
  if (!loan) return null;
  if (!readOnly && !isMine) return null;
  const status = LOAN_STATUS[Number(loan.status)] ?? "Unknown";
  const active = status === "Active";

  // A non-zero commitment means the terms came back through the confidential assessment
  // path. A zero one means they did not, and that is the difference between a TEE output
  // and a number somebody typed.
  const attested = loan.privateInputCommitment !== ZERO_COMMITMENT;
  const overdue = Boolean(nextDue) && Date.now() / 1000 > Number(nextDue);
  const outstanding = loan.totalOwed - loan.repaid;

  return (
    <article className="space-y-3">
      {/* The position, stated as a sentence. */}
      <div>
        <h2 className="focal">
          Borrowed {bare(loan.principal)} against {bare(loan.collateralValue)}
        </h2>
        <p className="mt-1.5 text-[14px] text-muted">
          Receipt #{loan.receiptId.toString()}
          {receipt
            ? ` · ${Number(receipt.quantityKg).toLocaleString()} kg ${receipt.cropType}, grade ${receipt.grade}`
            : ""}{" "}
          · gUSDC
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className={status === "Liquidated" ? "pill-bad" : "pill"}>{status}</span>
        {overdue && active && <span className="pill-bad">Overdue</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Risk score" value={`${loan.riskScore}`} tint />
        <Metric label="Interest rate" value={`${loan.aprBps / 100}%`} />
        <Metric label="Outstanding" value={bare(outstanding)} />
      </div>

      <div className="card space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-label text-muted">Loan to value</p>
          <p className="text-metric font-medium tabular-nums">{loan.ltvBps / 100}%</p>
        </div>
        {/* Scaled against the PROTOCOL ceiling, 25000 bps, which is what
            GodaamVault.onReport actually enforces (`a.ltvBps > 25_000` reverts).
            Scaling against the 22000 bps top band instead made a healthy loan read
            as maxed out and about to liquidate. 25 segments of 10 points, so the
            certified band lands exactly on 22 and is drawn as a marker inside the
            track rather than at its end. */}
        <Segments
          total={25}
          filled={Math.min(Math.round(Number(loan.ltvBps) / 100 / 10), 25)}
          markAt={22}
          label={`Loan to value ${Number(loan.ltvBps) / 100}% against a 250% protocol ceiling`}
        />
        <p className="text-label text-muted">
          Marker at the 220% certified band · 250% protocol ceiling
        </p>
        <Provenance
          label="LTV decided by:"
          source={
            attested
              ? "CRE simulation (captured), commitment recorded onchain"
              : "hand-encoded, no TEE commitment onchain"
          }
          degraded={!attested}
        />
      </div>

      <div className="card space-y-3">
        <div>
          <p className="text-label text-muted">
            {overdue ? "Payment overdue" : "Next installment"}
          </p>
          <p className={`mt-1 text-focal font-medium tabular-nums ${overdue ? "text-bad" : ""}`}>
            {bare(due)}
          </p>
        </div>
        <Segments total={Number(loan.installmentCount)} filled={Number(loan.installmentsPaid)} />
        <p className="text-label text-muted">
          {loan.installmentsPaid} of {loan.installmentCount} paid · {bare(loan.repaid)} of{" "}
          {bare(loan.totalOwed)}
        </p>

        {active && isMine && !readOnly && (
          <div className="space-y-2 pt-1">
            <button
              className="btn w-full"
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
              Pay installment
            </button>
            <div className="flex flex-wrap gap-2">
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
                Approve gUSDC
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-label text-muted">
          {nextDue
            ? `${overdue ? "Was due" : "Next due"} ${new Date(Number(nextDue) * 1000).toLocaleDateString()}`
            : "No schedule"}{" "}
          · Outstanding {bare(outstanding)}
        </p>
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

      {attested && (
        <p className="fig break-all text-[11px] text-muted">
          TEE input commitment {loan.privateInputCommitment}
        </p>
      )}
    </article>
  );
}
