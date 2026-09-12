import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the farmer's private risk inputs to the CRE Confidential Workflow.
 *
 * IMPORTANT: nothing here is logged or persisted. The body is forwarded to the workflow's
 * confidential HTTP trigger, which decrypts and scores it inside the TEE. The enclave -
 * not this server, and not the contract - decides the loan size, then writes the result
 * onchain through the CRE forwarder.
 */
export async function POST(req: Request) {
  const inputs = await req.json().catch(() => null);
  if (!inputs?.loanId || !inputs?.landRecordRef) {
    return NextResponse.json({ error: "Malformed risk inputs" }, { status: 400 });
  }

  const triggerUrl = process.env.CRE_TRIGGER_URL;
  const triggerKey = process.env.CRE_TRIGGER_API_KEY;

  if (!triggerUrl) {
    return NextResponse.json(
      {
        error:
          "CRE_TRIGGER_URL is not set. Run `npm run cre:simulate` and set the simulator trigger URL.",
      },
      { status: 503 }
    );
  }

  const res = await fetch(triggerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(triggerKey ? { Authorization: `Bearer ${triggerKey}` } : {}),
    },
    body: JSON.stringify(inputs),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `CRE workflow rejected the request (${res.status})` },
      { status: 502 }
    );
  }

  const out = await res.json();
  return NextResponse.json({
    loanId: String(inputs.loanId),
    approved: Boolean(out.approved),
    riskScore: Number(out.riskScore ?? 0),
    ltvBps: Number(out.ltvBps ?? 0),
    aprBps: Number(out.aprBps ?? 0),
    approvedPrincipal: String(out.approvedPrincipal ?? "0"),
    txHash: out.txHash,
    mode: process.env.CRE_LIVE === "true" ? "cre-live" : "cre-simulation",
  });
}
