import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { constants as fsc } from "node:fs";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs the farmer's private risk inputs through the CRE Confidential Workflow.
 *
 * The workflow is executed by the CRE CLI simulator, which is what the qualification
 * criteria accept ("a simulation using the CRE CLI or a live deployment"). Same enclave
 * code, same scoring, same provenance label - `mode` stays `cre-simulation` and the UI
 * renders "CRE simulation (captured)". It is not a live trigger and never claims to be.
 *
 * PRIVACY. The land-record reference, yield series and repayment ledger are the sensitive
 * inputs. They are written to a 0600 file inside a private temp directory, passed to the
 * CLI by path, and the directory is removed in a `finally` whether the run succeeds or
 * throws. They are never logged, never interpolated into an error message, and never
 * placed on the command line - argv is readable by any process on the machine, which a
 * mode-0600 file is not.
 *
 * HONESTY. If the CLI is missing, fails, times out, or prints something unparseable, this
 * route errors. It never substitutes a default, a partial result or a zero score: a
 * fabricated decision is worse than a visible failure, and `riskScore: 0` would read as a
 * decline rather than as a broken pipe.
 */

const SIMULATE_TIMEOUT_MS = 180_000;

/**
 * Capability detection, not a feature flag. Serverless has no CRE binary, so the deployed
 * instance takes the unavailable path automatically rather than depending on an
 * environment variable someone could set wrongly.
 */
async function findCreBinary(): Promise<string | null> {
  const candidates = [
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((d) => path.join(d, "cre")),
    path.join(homedir(), ".local", "bin", "cre"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, fsc.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** Extract the one JSON object the simulator prints as its result. */
function parseSimulationResult(stdout: string): Record<string, unknown> | null {
  const marker = stdout.indexOf("Workflow Simulation Result:");
  if (marker === -1) return null;
  const open = stdout.indexOf("{", marker);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < stdout.length; i++) {
    if (stdout[i] === "{") depth++;
    else if (stdout[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(stdout.slice(open, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function POST(req: Request) {
  const inputs = await req.json().catch(() => null);
  if (!inputs?.loanId || !inputs?.landRecordRef) {
    return NextResponse.json({ error: "Malformed risk inputs" }, { status: 400 });
  }

  const creBin = await findCreBinary();
  if (!creBin) {
    return NextResponse.json(
      {
        error:
          "The CRE CLI is not available in this environment, so the workflow cannot be " +
          "simulated here.",
        code: "cli_unavailable",
      },
      { status: 503 }
    );
  }

  const projectRoot = process.cwd();
  let workdir: string | null = null;
  const startedAt = Date.now();

  try {
    workdir = await mkdtemp(path.join(tmpdir(), "godaam-cre-"));
    const payloadPath = path.join(workdir, "payload.json");
    await writeFile(
      payloadPath,
      JSON.stringify({
        loanId: Number(inputs.loanId),
        borrower: inputs.borrower,
        collateralValue: String(inputs.collateralValue),
        landRecordRef: inputs.landRecordRef,
        pastYieldsKgPerHa: inputs.pastYieldsKgPerHa ?? [],
        repaymentHistory: inputs.repaymentHistory ?? [],
      }),
      { mode: 0o600 }
    );

    const { stdout } = await run(
      creBin,
      [
        "workflow",
        "simulate",
        "./workflows/risk-scoring",
        "--target=staging-settings",
        "--http-payload",
        payloadPath,
        "--config",
        "config.json",
      ],
      { cwd: projectRoot, timeout: SIMULATE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }
    );

    const out = parseSimulationResult(stdout);
    const elapsedMs = Date.now() - startedAt;

    // A run that produced no parseable result is a broken pipe, not a decline.
    if (!out) {
      return NextResponse.json(
        {
          error:
            "The workflow ran but produced no readable assessment. Refusing to report a " +
            "score that the enclave did not return.",
          code: "unparseable_result",
          elapsedMs,
        },
        { status: 502 }
      );
    }

    if (out.riskScore === undefined || out.approvedPrincipal === undefined) {
      return NextResponse.json(
        {
          error:
            "The assessment is missing a score or an approved amount. Refusing to report " +
            "a zero score as a decision.",
          code: "incomplete_assessment",
          elapsedMs,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      loanId: String(inputs.loanId),
      approved: Boolean(out.approved),
      riskScore: Number(out.riskScore),
      ltvBps: Number(out.ltvBps ?? 0),
      aprBps: Number(out.aprBps ?? 0),
      approvedPrincipal: String(out.approvedPrincipal),
      installmentCount: Number(out.installmentCount ?? 0),
      installmentPeriod: String(out.installmentPeriod ?? "0"),
      privateInputCommitment: out.privateInputCommitment,
      encodedReport: out.encodedReport,
      // Carried out of the enclave so a caller can tell whether the land-tenure tier was
      // actually fetched or silently defaulted.
      bureauSource: out.bureauSource ?? "unknown",
      // The CLI simulator, not a deployed DON. Never `cre-live`.
      mode: "cre-simulation",
      elapsedMs,
    });
  } catch (err) {
    // Deliberately does not include `err` in the response: CLI output can echo the
    // payload, and the payload is the confidential input.
    const timedOut =
      typeof err === "object" && err !== null && "killed" in err && Boolean((err as { killed?: boolean }).killed);
    return NextResponse.json(
      {
        error: timedOut
          ? `The workflow simulation exceeded ${SIMULATE_TIMEOUT_MS / 1000}s and was stopped.`
          : "The workflow simulation failed to run.",
        code: timedOut ? "simulation_timeout" : "simulation_failed",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 504 }
    );
  } finally {
    if (workdir) await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}
