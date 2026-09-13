"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { GusdcBalance } from "@/components/GusdcBalance";
import { ReceiptCard, useMyReceipts } from "@/components/ReceiptPicker";
import { VerificationGate } from "@/components/VerificationGate";
import { Metric, Provenance } from "@/components/ui";
import {
  addresses,
  formatUsdc,
  godaamVaultAbi,
  warehouseReceiptAbi,
} from "@/lib/contracts";
import { submitRiskInputs, type AssessmentResult } from "@/lib/cre";

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
      // The route's messages name env vars and npm scripts. That is right for a
      // developer reading logs and wrong for a visitor reading a page, so the detail
      // goes to the console and the screen says what the user can act on.
      console.error("[cre] assessment failed:", err);
      setError("Confidential underwriting is unavailable right now.");
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

function Term({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-[14px] text-muted">{k}</dt>
      <dd className="fig text-[14px] text-text">{v}</dd>
    </div>
  );
}

function BorrowWorkspace() {
  const { address } = useAccount();
  const { receipts, isLoading } = useMyReceipts();
  const [selected, setSelected] = useState<bigint | null>(null);
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });

  const pledgeable = receipts.filter((r) => r.activeLoanId === 0n);
  // Default to the first pledgeable receipt so the panel is never empty-handed.
  useEffect(() => {
    if (selected === null && pledgeable.length > 0) setSelected(pledgeable[0].id);
  }, [selected, pledgeable]);

  const active = receipts.find((r) => r.id === selected) ?? null;

  const { data: approved } = useReadContract({
    address: addresses.warehouseReceipt,
    abi: warehouseReceiptAbi,
    functionName: "isApprovedForAll",
    args: address ? [address, addresses.godaamVault] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 5000 },
  });

  const { data: openedLoanId } = useReadContract({
    address: addresses.godaamVault,
    abi: godaamVaultAbi,
    functionName: "activeLoanOfReceipt",
    args: selected !== null ? [selected] : undefined,
    query: { enabled: selected !== null, refetchInterval: 5000 },
  });

  const collateral = active?.appraised ?? 0n;
  // 25000 bps is what GodaamVault.onReport enforces; this is the ceiling, not a promise.
  const maxPrincipal = (collateral * 25000n) / 10000n;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <div className="space-y-3">
          <p className="text-[14px] text-muted">Select a receipt to pledge</p>

          {isLoading && receipts.length === 0 && (
            <p className="text-[14px] text-muted">Looking for your receipts…</p>
          )}

          {receipts.map((r) => (
            <ReceiptCard
              key={r.id.toString()}
              receipt={r}
              selected={r.id === selected}
              onSelect={setSelected}
            />
          ))}

          <div className="rounded-card border border-dashed border-border-strong p-5 text-center text-[14px] text-muted">
            {receipts.length === 0 ? "No receipts yet. " : "No other receipts. "}
            <Link href="/tokenize" className="text-wheat underline-offset-4 hover:underline">
              Tokenize one
            </Link>
          </div>
        </div>

        <aside className="card space-y-4 self-start p-5 sm:p-6">
          <p className="text-[14px] text-muted">Indicative terms</p>
          <dl>
            <Term k="Collateral" v={active ? bare(collateral) : "—"} />
            <Term k="Max principal" v={active ? bare(maxPrincipal) : "—"} />
            <Term k="Installments" v="6" />
            <Term k="Ceiling" v="250%" />
          </dl>
          <p className="border-t border-border pt-3 text-[13px] leading-relaxed text-muted">
            Pledging freezes the receipt. The enclave sets the final principal and rate.
          </p>
          <button
            className="btn w-full py-3 text-[16px] font-bold"
            disabled={!active || isPending || confirming}
            onClick={() =>
              active &&
              writeContract({
                address: addresses.godaamVault,
                abi: godaamVaultAbi,
                functionName: "requestLoan",
                args: [active.id],
              })
            }
          >
            {isPending || confirming ? "Confirming…" : "Pledge and request"}
          </button>
          <button
            className="btn-ghost w-full"
            disabled={isPending || confirming || approved === true}
            onClick={() =>
              writeContract({
                address: addresses.warehouseReceipt,
                abi: warehouseReceiptAbi,
                functionName: "setApprovalForAll",
                args: [addresses.godaamVault, true],
              })
            }
          >
            {approved === true ? "Vault approved" : "Approve vault"}
          </button>
        </aside>
      </div>

      {openedLoanId !== undefined && openedLoanId > 0n && active && (
        <RiskForm loanId={openedLoanId} collateralValue={collateral} />
      )}

      <p className="text-[14px] text-muted">
        Once the enclave returns terms, the position appears in{" "}
        <Link href="/loans" className="text-text underline underline-offset-4">
          Loans
        </Link>
        , where installments are paid.
      </p>
    </div>
  );
}

export default function LoanPage() {
  return (
    <div className="mx-auto max-w-[1120px] space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[32px] leading-none tracking-[-0.02em]">Borrow</h1>
        <GusdcBalance compact />
      </header>
      <VerificationGate>
        <BorrowWorkspace />
      </VerificationGate>
    </div>
  );
}
