"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { VerificationGate } from "@/components/VerificationGate";
import { hashscanTx } from "@/lib/chains";

const initial = {
  cropType: "Wheat (HD-2967)",
  grade: "FAQ-A",
  quantityKg: "42000",
  storageLocation: "WDRA Baramati, Maharashtra",
  expiry: new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10),
  appraisedValue: "400",
  hederaAccountId: "",
};

/** Field order follows the receipt itself: what it is, how much, where, how long. */
const fields = [
  { k: "cropType", label: "Crop and variety", type: "text", wide: true },
  { k: "grade", label: "Grade", type: "text" },
  { k: "quantityKg", label: "Quantity, kg", type: "number" },
  { k: "storageLocation", label: "Warehouse", type: "text", wide: true },
  { k: "appraisedValue", label: "Appraisal, gUSDC", type: "number" },
  { k: "expiry", label: "Valid until", type: "date" },
  { k: "hederaAccountId", label: "Hedera account id, for ATS", type: "text", wide: true },
] as const;

function Row({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-[14px] text-muted">{k}</dt>
      <dd className={`text-[14px] text-wheat-text ${mono ? "fig" : ""}`}>{v}</dd>
    </div>
  );
}

function Form() {
  const { address } = useAccount();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ txHash: string; tokenId: string; atsTokenId: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/receipts/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, address }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Issuance failed");
      setResult(body);
    } catch (err) {
      // Same rule: a route may name an env var, a page may not.
      console.error("[receipts] issuance failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /NEXT_PUBLIC_|npm run|not configured|key/i.test(msg)
          ? "Receipt issuance is unavailable right now."
          : msg
      );
    } finally {
      setBusy(false);
    }
  }

  const kg = Number(form.quantityKg) || 0;
  const appraisal = Number(form.appraisedValue) || 0;
  // The vault reverts above 25000 bps, so this is the ceiling, not a marketing number.
  const borrowable = appraisal * 2.5;
  const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_400px]">
      <div className="card space-y-4 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.k} className={"wide" in f && f.wide ? "sm:col-span-2" : undefined}>
              <label className="label" htmlFor={f.k}>
                {f.label}
              </label>
              <input
                id={f.k}
                className="input"
                type={f.type}
                value={form[f.k as keyof typeof initial]}
                onChange={set(f.k as keyof typeof initial)}
                placeholder={f.k === "hederaAccountId" ? "0.0.123456" : undefined}
                required={f.k !== "hederaAccountId"}
              />
            </div>
          ))}
        </div>
        {error && <p className="text-[13px] text-bad">{error}</p>}
      </div>

      {/* What the receipt becomes, updating as the form is filled. */}
      <aside className="card-tint space-y-4 self-start p-5 sm:p-6">
        <div>
          <p className="text-label text-wheat">Will mint</p>
          <p className="fig mt-1 text-[38px] leading-none text-wheat-text">
            {kg.toLocaleString()}
          </p>
          <p className="mt-2 text-[13px] leading-snug text-muted">
            shares at decimals 0 — one per kilogram
          </p>
        </div>

        <dl className="border-t border-wheat-edge/60 pt-2">
          <Row k="Symbol" v="GWR-WHE" />
          <Row k="Holder" v={short(address)} />
          <Row k="Transferable to" v="allowlist only" mono={false} />
        </dl>

        <dl className="border-t border-wheat-edge/60 pt-2">
          <Row k="Borrowable" v={`up to ${borrowable.toLocaleString()}`} />
        </dl>

        <button className="btn w-full py-3 text-[16px] font-bold" disabled={busy}>
          {busy ? "Issuing on Hedera…" : "Tokenize receipt"}
        </button>

        {result && (
          <div className="space-y-2 border-t border-wheat-edge/60 pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="pill">Issued</span>
              <span className="fig text-[15px] text-wheat-text">#{result.tokenId}</span>
            </div>
            <Row k="ATS token" v={result.atsTokenId} />
            <a
              className="text-label text-muted underline-offset-4 hover:text-text hover:underline"
              href={hashscanTx(result.txHash)}
              target="_blank"
              rel="noreferrer"
            >
              View on HashScan
            </a>
          </div>
        )}
      </aside>
    </form>
  );
}

export default function TokenizePage() {
  return (
    <div className="mx-auto max-w-[1120px] space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[32px] leading-none tracking-[-0.02em]">New receipt</h1>
        <p className="text-[14px] text-muted">
          ERC-1400 · allowlist · controller powers
        </p>
      </header>
      <VerificationGate>
        <Form />
      </VerificationGate>
    </div>
  );
}
