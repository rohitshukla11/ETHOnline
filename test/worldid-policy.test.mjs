/**
 * Credential allowlist tests.
 *
 * Run with: npm run test:worldid   (node's built-in runner, no extra dependency)
 *
 * The regression these guard: the original check rejected only "device", so every
 * other credential - including ones World had not shipped yet - passed a gate that
 * fronts undercollateralised lending.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

// Transpile the .ts policy in-memory rather than adding a build step for one file.
const src = readFileSync(new URL("../lib/worldid-policy.ts", import.meta.url), "utf8");
const js = transpileModule(src, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);
const { checkVerificationLevel, ACCEPTED_VERIFICATION_LEVELS } = mod;

test("accepts the credential the app actually requests", () => {
  const r = checkVerificationLevel("orb");
  assert.equal(r.ok, true);
  assert.equal(r.level, "orb");
});

test("rejects device-level proofs", () => {
  const r = checkVerificationLevel("device");
  assert.equal(r.ok, false);
  assert.equal(r.code, "insufficient_level");
});

test("rejects document proofs - the blocklist let these through", () => {
  for (const level of ["document", "secure_document"]) {
    const r = checkVerificationLevel(level);
    assert.equal(r.ok, false, `${level} must not satisfy the gate`);
  }
});

test("fails closed on an unknown future credential", () => {
  // The whole point of the allowlist: a credential World ships tomorrow must not
  // pass just because nobody remembered to add it to a blocklist.
  const r = checkVerificationLevel("some_credential_invented_next_year");
  assert.equal(r.ok, false);
  assert.equal(r.code, "insufficient_level");
});

test("rejection names the level that was received", () => {
  const r = checkVerificationLevel("document");
  assert.match(r.detail, /"document"/);
  assert.match(r.detail, /orb/); // and states what is accepted
});

test("rejects missing, empty and non-string levels", () => {
  for (const bad of [undefined, null, "", "   ", 42, {}, []]) {
    const r = checkVerificationLevel(bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} must be rejected`);
  }
});

test("trims surrounding whitespace before comparing", () => {
  assert.equal(checkVerificationLevel("  orb  ").ok, true);
});

test("allowlist is explicit and non-empty", () => {
  assert.ok(ACCEPTED_VERIFICATION_LEVELS.length > 0);
  assert.ok(ACCEPTED_VERIFICATION_LEVELS.includes("orb"));
});

test("honours an overridden allowlist", () => {
  assert.equal(checkVerificationLevel("face", ["face"]).ok, true);
  assert.equal(checkVerificationLevel("orb", ["face"]).ok, false);
});
