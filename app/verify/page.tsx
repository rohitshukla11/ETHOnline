"use client";

import { selfieCheckLegacy, useIDKitRequest, type RpContext } from "@worldcoin/idkit";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { useVerification } from "@/components/useVerification";
import { WorldIdQr } from "@/components/WorldIdQr";
import { hashscanAddress, hashscanTx } from "@/lib/chains";
import { addresses } from "@/lib/contracts";
import { ACCEPTED_VERIFICATION_LEVELS } from "@/lib/worldid-policy";

/**
 * World ID verification.
 *
 * IDKit 4.x replaced `IDKitWidget` with `useIDKitRequest` / `IDKitRequestWidget`, and
 * every request now carries an `rp_context` signed by the Relying Party key. That key
 * is server-only, so the context is fetched from /api/rp-signature per attempt.
 *
 * The credential is requested through a PRESET. There is deliberately no top-level
 * `verification_level` alongside it: that combination is the mixed-mode shape behind
 * worldcoin/idkit#204, where World App completes with a legacy `protocol_version:
 * "3.0"` result or a pure-v4 payload comes back `verification_rejected`.
 */

const short = (a?: string | null) => (a ? `${a.slice(0, 8)}…${a.slice(-4)}` : null);

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] text-muted">{k}</p>
      <p className="mt-0.5 text-[15px] text-text">{v}</p>
    </div>
  );
}

function Unlock({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className={`text-[15px] ${done ? "text-text" : "text-muted"}`}>{label}</span>
      <span className={`text-[15px] ${done ? "text-good" : "text-muted"}`}>
        {done ? "✓" : "—"}
      </span>
    </div>
  );
}

export default function VerifyPage() {
  const { address, isConnected } = useAccount();
  const { isVerified, refetch } = useVerification();

  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [rpError, setRpError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A signed context is short-lived, so it is fetched when the page is ready to use
  // one rather than held from mount.
  useEffect(() => {
    if (!isConnected || isVerified) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/rp-signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setRpError(body.error ?? "Could not obtain a signed proof request.");
          return;
        }
        setRpContext(body as RpContext);
        setRpError(null);
      } catch (e) {
        if (!cancelled) setRpError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, isVerified]);

  const onComplete = useCallback(
    async (result: unknown) => {
      setError(null);
      setStatus("Verifying with World and writing the nullifier onchain…");
      try {
        const res = await fetch("/api/worldid/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The completion payload goes through verbatim; the server does not
          // rebuild the v4 body.
          body: JSON.stringify({ address, worldIdResult: result }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Verification failed");
        setTxHash(body.txHash);
        setStatus("Verified. Your identity is now bound to this address.");
        await refetch();
      } catch (e) {
        setStatus(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [address, refetch]
  );

  const stage = isVerified
    ? "Verified"
    : rpError
      ? "Not configured"
      : !isConnected
        ? "Wallet needed"
        : rpContext
          ? "Awaiting proof"
          : "Preparing";

  return (
    <div className="mx-auto max-w-[1120px] space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[32px] leading-none tracking-[-0.02em]">Identity</h1>
        <span className={isVerified ? "pill" : "chip"}>
          {isVerified ? "Verified" : "Not verified"}
        </span>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* ── Scan panel ─────────────────────────────────────────────── */}
        {/* The panel offers exactly what the user can do next. Not connected means
            the only possible action is connecting, so that is all it shows - no QR
            frame standing in for one that cannot exist yet. */}
        <section className="card flex flex-col items-center self-start p-6 text-center sm:p-8">
          {isVerified ? (
            <>
              <span className="pill">Verified</span>
              <h2 className="mt-4 text-[19px]">Identity confirmed</h2>
              <p className="fig mt-2 break-all text-[13px] text-muted">{address}</p>
              {txHash && (
                <a
                  className="mt-4 text-[14px] text-wheat underline-offset-4 hover:underline"
                  href={hashscanTx(txHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View attestation on HashScan ↗
                </a>
              )}
            </>
          ) : !isConnected ? (
            <>
              <h2 className="text-[19px]">Verify with World ID</h2>
              <p className="mt-2 max-w-[36ch] text-[14px] leading-relaxed text-muted">
                Your proof is tied to your wallet address, so connect one to begin.
              </p>
              <div className="mt-6">
                <ConnectButton />
              </div>
            </>
          ) : rpError ? (
            <>
              <h2 className="text-[19px]">Verify with World ID</h2>
              <p className="mt-2 max-w-[36ch] text-[14px] leading-relaxed text-muted">
                Verification is unavailable right now. Selfie Check access is pending.
              </p>
            </>
          ) : !rpContext ? (
            <>
              <h2 className="text-[19px]">Verify with World ID</h2>
              <p className="mt-2 text-[14px] text-muted">Preparing your request…</p>
            </>
          ) : (
            <VerifyAction
              rpContext={rpContext}
              signal={address as string}
              onComplete={onComplete}
              status={status}
              error={error}
            />
          )}

          {/* Moved here so the two columns balance once the frame is gone. It is also
              the one piece of prose that belongs beside the action it describes. */}
          <div className="card-tint mt-6 w-full space-y-2 p-5 text-left">
            <p className="text-[15px] font-medium text-wheat">What is recorded</p>
            <p className="text-[14px] leading-relaxed text-muted">
              Only a nullifier — a one-way identifier unique to you and this action. No
              biometric, no document, no personal data. A second address presenting the
              same nullifier is refused onchain.
            </p>
          </div>
        </section>

        {/* ── Status column ──────────────────────────────────────────── */}
        <div className="space-y-5">
          <section className="card space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[19px]">Status</h2>
              <span className={stage === "Not configured" ? "pill-bad" : "chip"}>{stage}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                k="Wallet"
                v={
                  address ? (
                    <span className="fig text-[14px]">{short(address)}</span>
                  ) : (
                    <span className="text-muted">Not connected</span>
                  )
                }
              />
              <Field
                k="Nullifier"
                v={<span className="text-muted">Hidden</span>}
              />
            </div>

            <div>
              <p className="text-[13px] text-muted">Accepted credentials</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {/* Rendered from lib/worldid-policy.ts, so the screen cannot drift from
                    the allowlist the server actually enforces. */}
                {ACCEPTED_VERIFICATION_LEVELS.map((l) => (
                  <span
                    key={l}
                    className="rounded-pill border border-wheat-edge px-3 py-1 text-[13px] capitalize text-wheat"
                  >
                    {l}
                  </span>
                ))}
                <span className="rounded-pill border border-border px-3 py-1 text-[13px] text-muted">
                  Device — refused
                </span>
              </div>
              <p className="mt-2 text-[12px] text-muted">Selfie Check access is pending.</p>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-[13px] text-muted">Registry</p>
              <a
                className="fig mt-0.5 inline-block text-[14px] text-wheat underline-offset-4 hover:underline"
                href={hashscanAddress(addresses.worldIdRegistry)}
                target="_blank"
                rel="noreferrer"
              >
                {short(addresses.worldIdRegistry)} ↗
              </a>
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <p className="text-[13px] text-muted">Unlocks when verified</p>
            <div className="mt-2 divide-y divide-border">
              <Unlock label="KYC on receipt token" done={isVerified} />
              <Unlock label="Receipt tokenization" done={isVerified} />
              <Unlock label="Borrowing" done={isVerified} />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

/**
 * Split out because `useIDKitRequest` needs a non-null `rp_context`, and hooks cannot
 * be called conditionally.
 */
function VerifyAction({
  rpContext,
  signal,
  onComplete,
  status,
  error,
}: {
  rpContext: RpContext;
  signal: string;
  onComplete: (result: unknown) => void;
  status: string | null;
  error: string | null;
}) {
  const flow = useIDKitRequest({
    app_id: (process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "") as `app_${string}`,
    action: process.env.NEXT_PUBLIC_WORLD_ACTION ?? "",
    rp_context: rpContext,
    // No pre-existing verified users to avoid locking out, and accepting 3.0-era
    // proofs would mean handling two proof shapes for no benefit.
    allow_legacy_proofs: false,
    environment: "production",
    // Preset only. See the note at the top of this file on idkit#204.
    //
    // `signal` binds the proof to this wallet address, so a proof captured for one
    // account is useless for another. IDKit hashes it with hashToField, which
    // branches on input type - an address is valid hex and therefore hashes as 20 raw
    // bytes, not as its 42-character text form. That is handled inside the SDK here;
    // lib/worldid-signal.ts documents it for the server side.
    preset: selfieCheckLegacy({ signal }),
  });

  useEffect(() => {
    if (flow.isSuccess && flow.result) onComplete(flow.result);
  }, [flow.isSuccess, flow.result, onComplete]);

  return (
    <>
      <div className="mt-6 flex justify-center">
        <WorldIdQr uri={flow.connectorURI} />
      </div>

      <button
        className="btn mt-5 w-full py-3 text-[16px] font-bold"
        onClick={() => flow.open()}
        disabled={flow.isAwaitingUserConfirmation}
      >
        {flow.isAwaitingUserConfirmation ? "Waiting for World App…" : "Open World App"}
      </button>
      <p className="mt-3 text-[13px] text-muted">
        Keep this page open until the status updates
      </p>

      {flow.isError && flow.errorCode && (
        <p className="mt-3 text-[13px] leading-relaxed text-bad">
          {flow.errorCode === "feature_unavailable" ||
          flow.errorCode === "credential_unavailable"
            ? "Selfie Check is not enabled for this app yet. Access is granted per app by World; the request is pending."
            : `World App returned: ${flow.errorCode}`}
        </p>
      )}
      {status && <p className="mt-3 text-[13px] text-muted">{status}</p>}
      {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
    </>
  );
}
