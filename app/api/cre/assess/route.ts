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

  const raw = await res.text();
  if (raw.trim() === "") {
    // The local simulator's --listen mode is fire-and-forget: it executes the
    // workflow, prints the result to its own stdout, and answers the HTTP request
    // with Content-Length: 0. Parsing that as JSON yields {}, and the mapping below
    // would turn it into approved:false / riskScore:0 / principal:"0" - a decline
    // that looks like a real decision. Refuse instead.
    return NextResponse.json(
      {
        error:
          "The CRE trigger returned an empty body. `cre workflow simulate --listen` " +
          "does not return the assessment over HTTP - it prints it to the simulator's " +
          "stdout. Point CRE_TRIGGER_URL at a deployed workflow's trigger instead.",
        code: "empty_trigger_response",
      },
      { status: 502 }
    );
  }

  let out: Record<string, unknown>;
  try {
    out = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: `CRE trigger returned non-JSON: ${raw.slice(0, 160)}`, code: "bad_trigger_response" },
      { status: 502 }
    );
  }

  // A response that carries no score is not a decline, it is a broken pipe.
  if (out.riskScore === undefined || out.approvedPrincipal === undefined) {
    return NextResponse.json(
      {
        error:
          "CRE trigger response is missing riskScore/approvedPrincipal. Refusing to " +
          "report a zero score as a decision.",
        code: "incomplete_assessment",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    loanId: String(inputs.loanId),
    approved: Boolean(out.approved),
    riskScore: Number(out.riskScore ?? 0),
    ltvBps: Number(out.ltvBps ?? 0),
    aprBps: Number(out.aprBps ?? 0),
    approvedPrincipal: String(out.approvedPrincipal ?? "0"),
    txHash: out.txHash,
    // Carried out of the enclave so a caller can tell whether the land-tenure tier
    // was actually fetched or silently defaulted.
    bureauSource: out.bureauSource ?? "unknown",
    mode: process.env.CRE_LIVE === "true" ? "cre-live" : "cre-simulation",
  });
}
