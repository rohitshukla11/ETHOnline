/**
 * World ID preflight.
 *
 *   npm run check:worldid            # config only
 *   npm run check:worldid -- --live  # also exercises the running dev server
 *
 * The point of the --live checks is to separate "our plumbing is wrong" from "the
 * Selfie Check feature flag has not arrived". A 403 that is NOT a feature-gate error
 * means the request path is correct and only the flag is missing - the same signal
 * `invalid_format` gave us on the v2->v4 migration.
 *
 * Reports every missing input by name. Never prints a secret.
 */
import * as dotenv from "dotenv";

dotenv.config();

const APP_URL = process.env.PREFLIGHT_APP_URL ?? "http://localhost:3000";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

type Check = { label: string; ok: boolean; note: string };
const checks: Check[] = [];
const add = (label: string, ok: boolean, note: string) => checks.push({ label, ok, note });

/** Secrets are reported as present/absent only. */
const VARS: { name: string; secret: boolean; breaks: string }[] = [
  { name: "NEXT_PUBLIC_WORLD_APP_ID", secret: false, breaks: "IDKit cannot identify the app" },
  { name: "NEXT_PUBLIC_WORLD_ACTION", secret: false, breaks: "no action to scope the nullifier to" },
  { name: "NEXT_PUBLIC_WORLD_RP_ID", secret: false, breaks: "rp_context cannot be built; /api/v4/verify has no path segment" },
  { name: "WORLD_SIGNING_KEY", secret: true, breaks: "rp_context cannot be signed, so no proof can be requested" },
  { name: "WORLD_API_BASE", secret: false, breaks: "falls back to the default host" },
  { name: "WORLD_ATTESTOR_PRIVATE_KEY", secret: true, breaks: "nullifier cannot be attested onchain" },
];

async function main() {
  const live = process.argv.includes("--live");

  console.log("\nWorld ID configuration\n" + "-".repeat(72));
  for (const v of VARS) {
    const raw = process.env[v.name];
    const set = Boolean(raw && raw.trim() !== "");
    const shown = !set ? red("MISSING") : v.secret ? green("set (hidden)") : green(raw as string);
    console.log(`  ${set ? green("✓") : red("✗")} ${v.name.padEnd(30)} ${shown}`);
    if (!set) console.log(`      ${yellow("without it:")} ${v.breaks}`);
    add(v.name, set, v.breaks);
  }

  // A NEXT_PUBLIC_ prefix on the signing key would compile it into the browser bundle.
  const leaked = Object.keys(process.env).filter(
    (k) => k.startsWith("NEXT_PUBLIC_") && /SIGNING|SECRET|PRIVATE/i.test(k)
  );
  console.log("");
  if (leaked.length > 0) {
    console.log(`  ${red("✗")} SECRET LEAK: ${leaked.join(", ")} is public-prefixed`);
    add("no public-prefixed secrets", false, "a NEXT_PUBLIC_ secret ships to every visitor");
  } else {
    console.log(`  ${green("✓")} no secret is behind a NEXT_PUBLIC_ prefix`);
    add("no public-prefixed secrets", true, "");
  }

  if (!live) {
    console.log(`\n  ${yellow("Run with --live to exercise the running app.")}`);
    return summarise();
  }

  console.log("\nLive checks against " + APP_URL + "\n" + "-".repeat(72));

  // 1. Is the app even up?
  try {
    const r = await fetch(`${APP_URL}/verify`);
    console.log(`  ${r.ok ? green("✓") : red("✗")} /verify reachable (HTTP ${r.status})`);
    add("/verify reachable", r.ok, "dev server is not running");
  } catch {
    console.log(`  ${red("✗")} ${APP_URL} is not reachable - start it with \`npm run dev\``);
    add("/verify reachable", false, "dev server is not running");
    return summarise();
  }

  // 2. Does the signing route mint a well-formed context?
  try {
    const r = await fetch(`${APP_URL}/api/rp-signature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const b = (await r.json()) as Record<string, unknown>;
    if (!r.ok) {
      console.log(`  ${red("✗")} /api/rp-signature -> HTTP ${r.status} ${b.code ?? ""}`);
      console.log(`      ${String(b.error ?? "").slice(0, 140)}`);
      add("rp-signature", false, String(b.error ?? ""));
    } else {
      const fields = ["rp_id", "nonce", "created_at", "expires_at", "signature"];
      const missing = fields.filter((f) => !b[f]);
      const ttl = Number(b.expires_at) - Number(b.created_at);
      const ok = missing.length === 0 && ttl > 0;
      console.log(`  ${ok ? green("✓") : red("✗")} /api/rp-signature returns a signed context`);
      console.log(`      rp_id=${b.rp_id} ttl=${ttl}s sig=${String(b.signature).slice(0, 14)}...`);
      if (missing.length) console.log(`      ${red("missing fields:")} ${missing.join(", ")}`);
      add("rp-signature", ok, missing.join(", "));
    }
  } catch (e) {
    console.log(`  ${red("✗")} /api/rp-signature threw: ${(e as Error).message.slice(0, 120)}`);
    add("rp-signature", false, (e as Error).message);
  }

  // 3. Is the verify endpoint reachable, and what does it say to a bad proof?
  const rpId = process.env.NEXT_PUBLIC_WORLD_RP_ID;
  if (!rpId) {
    console.log(`  ${yellow("-")} /api/v4/verify skipped: NEXT_PUBLIC_WORLD_RP_ID is not set`);
    add("v4 verify reachable", false, "NEXT_PUBLIC_WORLD_RP_ID not set");
  } else {
    const base = process.env.WORLD_API_BASE ?? "https://developer.worldcoin.org";
    try {
      const r = await fetch(`${base}/api/v4/verify/${rpId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Deliberately invalid. We want to see WHICH way it is rejected.
        body: JSON.stringify({ protocol_version: "4.0", nonce: "preflight", responses: [] }),
      });
      const b = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      const code = String(b.code ?? r.status);
      const gated = /not_enabled|feature|unauthorized|forbidden|access/i.test(
        `${code} ${String(b.detail ?? "")}`
      );
      const unknownRp = /unknown_rp|not_found|inactive/i.test(code);

      if (unknownRp) {
        console.log(`  ${red("✗")} /api/v4/verify/${rpId} -> ${code}: the rp_id is not recognised`);
        add("v4 verify reachable", false, "rp_id not recognised");
      } else if (gated) {
        console.log(`  ${yellow("!")} /api/v4/verify -> ${code}: looks like a FEATURE GATE`);
        console.log(`      ${String(b.detail ?? "").slice(0, 140)}`);
        console.log(`      ${yellow("Plumbing is fine; Selfie Check access has not landed.")}`);
        add("v4 verify reachable", true, "reachable, feature gated");
      } else {
        console.log(`  ${green("✓")} /api/v4/verify reachable - rejected the bad proof with "${code}"`);
        console.log(`      ${String(b.detail ?? "").slice(0, 140)}`);
        console.log(`      ${green("Not a feature-gate error, so the request path is correct.")}`);
        add("v4 verify reachable", true, "reachable, rejects invalid proofs");
      }
    } catch (e) {
      console.log(`  ${red("✗")} verify endpoint unreachable: ${(e as Error).message.slice(0, 120)}`);
      add("v4 verify reachable", false, (e as Error).message);
    }
  }

  summarise();
}

function summarise() {
  const failed = checks.filter((c) => !c.ok);
  console.log("\n" + "-".repeat(72));
  if (failed.length === 0) {
    console.log(green(`  All ${checks.length} checks passed.`));
  } else {
    console.log(red(`  ${failed.length} of ${checks.length} checks failed:`));
    for (const f of failed) console.log(`    - ${f.label}${f.note ? `  (${f.note})` : ""}`);
  }
  console.log("");
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
