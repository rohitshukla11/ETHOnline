"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { VerificationGate } from "@/components/VerificationGate";
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

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Crop type</label>
          <input className="input" value={form.cropType} onChange={set("cropType")} required />
        </div>
        <div>
          <label className="label">Grade</label>
          <input className="input" value={form.grade} onChange={set("grade")} required />
        </div>
        <div>
          <label className="label">Quantity (kg)</label>
          <input className="input" type="number" value={form.quantityKg} onChange={set("quantityKg")} required />
        </div>
        <div>
          <label className="label">Appraised value (gUSDC)</label>
          <input
            className="input"
            type="number"
            value={form.appraisedValue}
            onChange={set("appraisedValue")}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Storage location</label>
          <input className="input" value={form.storageLocation} onChange={set("storageLocation")} required />
        </div>
        <div>
          <label className="label">Expiry</label>
          <input className="input" type="date" value={form.expiry} onChange={set("expiry")} required />
        </div>
        <div>
          <label className="label">Hedera account id (for ATS)</label>
          <input className="input" placeholder="0.0.123456" value={form.hederaAccountId} onChange={set("hederaAccountId")} />
        </div>
      </div>

      <button className="btn w-full" disabled={busy}>
        {busy ? "Issuing on Hedera..." : "Tokenize receipt"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="space-y-1 rounded-lg border border-sprout/40 bg-sprout/5 p-4 text-sm">
          <p className="font-medium text-sprout">Receipt #{result.tokenId} issued</p>
          <p className="text-stone-400">ATS security token: {result.atsTokenId}</p>
          <a className="text-grain underline" href={hashscanTx(result.txHash)} target="_blank" rel="noreferrer">
            View on HashScan
          </a>
        </div>
      )}
    </form>
  );
}

export default function TokenizePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tokenize your warehouse receipt</h1>
        <p className="mt-2 text-sm text-stone-400">
          This mints an Asset Tokenization Studio security token on Hedera testnet with the
          whitelist, freeze and controller modules enabled. Your address was added to the
          control list when Selfie Check passed - that whitelist is the only reason this
          mint can succeed.
        </p>
      </div>
      <VerificationGate>
        <Form />
      </VerificationGate>
    </div>
  );
}
