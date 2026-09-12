"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { VerificationGate } from "@/components/VerificationGate";
import { Metric } from "@/components/ui";
import { hashscanTx } from "@/lib/chains";

const initial = {
  cropType: "Wheat (HD-2967)",
  grade: "FAQ-A",
  quantityKg: "42000",
  storageLocation: "WDRA Warehouse, Baramati, MH",
  expiry: new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10),
  appraisedValue: "400",
  hederaAccountId: "",
};

const fields = [
  { k: "cropType", label: "Crop and variety", type: "text", wide: true },
  { k: "grade", label: "Grade", type: "text" },
  { k: "quantityKg", label: "Quantity in kg", type: "number" },
  { k: "storageLocation", label: "Storage location", type: "text", wide: true },
  { k: "appraisedValue", label: "Appraised value in gUSDC", type: "number" },
  { k: "expiry", label: "Valid until", type: "date" },
  { k: "hederaAccountId", label: "Hedera account id, for ATS", type: "text", wide: true },
] as const;

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const kg = Number(form.quantityKg) || 0;

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* The quantity is the headline figure: the ATS security is issued with decimals
          zero, so one share is one kilogram and the share count is the quantity. */}
      <Metric
        label="Quantity in kg, issued as that many shares at decimals 0"
        value={kg.toLocaleString()}
        tint
      />

      <div className="card grid gap-3 sm:grid-cols-2">
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

      <button className="btn w-full" disabled={busy}>
        {busy ? "Issuing on Hedera..." : "Tokenize receipt"}
      </button>

      {error && <p className="text-[13px] text-bad">{error}</p>}

      {result && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="pill">Issued</span>
            <span className="text-metric font-medium tabular-nums">
              #{result.tokenId}
            </span>
          </div>
          <div>
            <p className="text-label text-muted">ATS security token</p>
            <p className="fig mt-1 text-[14px]">{result.atsTokenId}</p>
          </div>
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
    </form>
  );
}

export default function TokenizePage() {
  return (
    <div className="mx-auto max-w-[600px] space-y-8">
      <header>
        <h1 className="text-[26px] tracking-[-0.02em]">Tokenize your warehouse receipt</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          The warehouse receipt exists as an Asset Tokenization Studio security token on
          Hedera - a real ERC-1400 instrument with an allowlist and controller powers,
          issued by the warehouse operator. This mints the EVM collateral record the vault
          lends against, and it is that record which your World ID verification unlocked:
          without a verified nullifier onchain, KYC is never granted and nothing can be
          minted to you.
        </p>
      </header>
      <VerificationGate>
        <Form />
      </VerificationGate>
    </div>
  );
}
