/**
 * World ID credential-allowlist and signal-hashing tests.
 *
 * Run with: npm run test:worldid   (node's built-in runner, no extra dependency)
 *
 * The .ts sources are transpiled to a gitignored scratch directory inside the
 * project rather than imported from a data: URL - a data: module has no base URL,
 * so bare specifiers like "ethers" cannot resolve from it.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = path.join(here, ".transpiled");

function load(tsRelPath) {
  const src = readFileSync(path.join(here, "..", tsRelPath), "utf8");
  const js = transpileModule(src, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText;
  const out = path.join(scratch, path.basename(tsRelPath).replace(/\.ts$/, ".mjs"));
  writeFileSync(out, js);
  return import(`file://${out}`);
}

let policy, sig;
before(async () => {
  mkdirSync(scratch, { recursive: true });
  policy = await load("lib/worldid-policy.ts");
  sig = await load("lib/worldid-signal.ts");
});
after(() => rmSync(scratch, { recursive: true, force: true }));

// --- credential allowlist -------------------------------------------------
// Regression: the original check rejected only "device", so every other
// credential - including ones World had not shipped yet - passed a gate that
// fronts undercollateralised lending.

test("accepts the credential the app actually requests", () => {
  const r = policy.checkVerificationLevel("orb");
  assert.equal(r.ok, true);
  assert.equal(r.level, "orb");
});

test("rejects device-level proofs", () => {
  const r = policy.checkVerificationLevel("device");
  assert.equal(r.ok, false);
  assert.equal(r.code, "insufficient_level");
});

test("accepts document - NFC passport / national ID, medium assurance", () => {
  const r = policy.checkVerificationLevel("document");
  assert.equal(r.ok, true);
  assert.equal(r.level, "document");
});

test("rejects secure_document - not in the accepted set", () => {
  // Deliberate: the frontend requests VerificationLevel.Document, which idkit
  // expands to exactly ["document", "orb"]. secure_document is not in that set,
  // so accepting it server-side would be wider than what the widget requests.
  assert.equal(policy.checkVerificationLevel("secure_document").ok, false);
});

test("rejects device - a phone is not a person", () => {
  // One human can hold many devices, which defeats the Sybil guarantee entirely.
  assert.equal(policy.checkVerificationLevel("device").ok, false);
});

test("fails closed on an unknown future credential", () => {
  const r = policy.checkVerificationLevel("some_credential_invented_next_year");
  assert.equal(r.ok, false);
  assert.equal(r.code, "insufficient_level");
});

test("rejection names the level that was received", () => {
  const r = policy.checkVerificationLevel("device");
  assert.match(r.detail, /"device"/);
  assert.match(r.detail, /orb/);
  assert.match(r.detail, /document/);
});

test("accepted set is exactly {orb, document}", () => {
  // Guards the policy line itself. If this set changes, it should be a deliberate
  // edit here and in app/verify/page.tsx together, not a drift.
  assert.deepEqual([...policy.ACCEPTED_VERIFICATION_LEVELS].sort(), ["document", "orb"]);
});

test("rejects missing, empty and non-string levels", () => {
  for (const bad of [undefined, null, "", "   ", 42, {}, []]) {
    assert.equal(policy.checkVerificationLevel(bad).ok, false, `${JSON.stringify(bad)} must be rejected`);
  }
});

test("trims surrounding whitespace before comparing", () => {
  assert.equal(policy.checkVerificationLevel("  orb  ").ok, true);
});

test("allowlist is explicit and non-empty", () => {
  assert.ok(policy.ACCEPTED_VERIFICATION_LEVELS.length > 0);
  assert.ok(policy.ACCEPTED_VERIFICATION_LEVELS.includes("orb"));
  assert.ok(policy.ACCEPTED_VERIFICATION_LEVELS.includes("document"));
});

test("honours an overridden allowlist", () => {
  assert.equal(policy.checkVerificationLevel("face", ["face"]).ok, true);
  assert.equal(policy.checkVerificationLevel("orb", ["face"]).ok, false);
});

// --- signal hashing -------------------------------------------------------

test("empty signal matches World's documented default", () => {
  assert.equal(sig.hashSignal(""), sig.EMPTY_SIGNAL_HASH);
  assert.equal(sig.hashSignal(undefined), sig.EMPTY_SIGNAL_HASH);
  assert.equal(
    sig.EMPTY_SIGNAL_HASH,
    "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4"
  );
});

test("an address hashes on the raw-bytes branch, not the string branch", () => {
  // IDKit: Hex.validate(input) -> hash raw bytes. Hashing the 42-char text form
  // yields a different field element and the proof silently fails to verify.
  const addr = "0x27a89B8262b6A51167488edC860E39fbC0111B9B";
  assert.equal(
    sig.hashSignal(addr),
    "0x008e8ce766ead3a3d31ad7b684b4af9f41fa7db7d9b3d0ef3bdc6330d672cd13"
  );
  assert.notEqual(
    sig.hashSignal(addr),
    "0x009333b6b36891940b9fdb38f8e86900d71250c8a41f149360b1376a7ab5246a"
  );
});

test("non-hex input takes the UTF-8 branch", () => {
  assert.equal(sig.isHexInput("plain-text"), false);
  assert.equal(sig.isHexInput("0x27a89B8262b6A51167488edC860E39fbC0111B9B"), true);
  // Odd-length hex is not valid bytes, so it must not take the bytes branch.
  assert.equal(sig.isHexInput("0xabc"), false);
});

test("hash is always a 32-byte lowercase hex string", () => {
  for (const s of ["", "0x27a89B8262b6A51167488edC860E39fbC0111B9B", "plain-text"]) {
    assert.match(sig.hashSignal(s), /^0x[0-9a-f]{64}$/);
  }
});

test("top byte is zeroed by the >> 8 shift so it fits the field", () => {
  for (const s of ["", "0x27a89B8262b6A51167488edC860E39fbC0111B9B", "abc"]) {
    assert.ok(BigInt(sig.hashSignal(s)) < 2n ** 248n, `${s} must fit the field`);
  }
});

test("different signals hash differently", () => {
  const a = sig.hashSignal("0x27a89B8262b6A51167488edC860E39fbC0111B9B");
  const b = sig.hashSignal("0x033588A8025F47128cf7B102412b81Ca43c2C7f0");
  assert.notEqual(a, b);
});
