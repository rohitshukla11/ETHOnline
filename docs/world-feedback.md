# World ID integration feedback

Submitted for the World track, ETHOnline 2026.

## What we built

Godaam gates collateral issuance on **World ID proof of personhood**. A warehouse receipt
cannot be held without it, and a nullifier can bind to exactly one address.

The accepted credential set is `{orb, document}`, declared on one line as
`ACCEPTED_VERIFICATION_LEVELS` in `lib/worldid-policy.ts`. **That is a policy decision,
not an architectural one**, and worth stating plainly: the contracts are
credential-agnostic — `WorldIdRegistry` records a nullifier and `WarehouseReceipt` checks
it, and neither ever inspects which credential produced it. Production lending against
real collateral should require `orb` alone. This demo also accepts `document` (NFC
passport or national ID, medium assurance) because no orb was reachable inside the
submission window. `device` is rejected outright: a phone is not a person, and one human
can hold many, which would defeat the Sybil guarantee the whole design rests on.

The nullifier hash is written to `WorldIdRegistry` on Hedera testnet and is a hard
precondition for `WarehouseReceipt.grantKyc`, which is itself a precondition for minting or
receiving a tokenized warehouse receipt. An unverified address cannot hold collateral,
therefore cannot borrow.

Undercollateralised lending is why this matters: the protocol lends up to 220% of the
grain's appraised value, so Sybil resistance is load-bearing rather than cosmetic. A farmer
who could mint five identities could take five loans against one harvest.

Three contract tests assert the negative path:

- `blocks KYC grant without World ID verification` — `grantKyc` reverts with
  `WorldIdVerificationRequired` for an address with no nullifier on record.
- `rejects a reused nullifier from a second address` — `attestVerification` reverts with
  `NullifierAlreadyUsed`.
- `blocks loan requests from unverified addresses` — `requestLoan` reverts with
  `NotVerified` even if the caller somehow holds a receipt.

Selfie Check was the original design. Finding 1 below is why it isn't what shipped.

---

## Finding 1 — "the preset uses World ID 3.0" reads as "you don't need 4.0". It isn't.

This cost us a timeboxed migration attempt, and we think the wording is the cause.

**The sentence.** [`docs.world.org/world-id/idkit/credentials`](https://docs.world.org/world-id/idkit/credentials)
says of `selfieCheckLegacy`:

> "The preset currently uses World ID 3.0; World ID 4.0 support is not yet available."

**The inference a reader draws.** That Selfie Check is reachable *without* opting into World
ID 4.0 — no `rp_id`, no `signing_key`, no RP registration. We made exactly that call,
deliberately, and wrote down the reasoning: the preset is 3.0-only, so the 4.0 opt-in adds
secret handling for no capability gain.

**What the types say.** From `@worldcoin/idkit-core@4.2.4`, which is where
`selfieCheckLegacy` actually lives:

```ts
type IDKitRequestConfig = {
    app_id: `app_${string}`;
    action: AbiEncodedValue | string;
    /** RP context for protocol-level proof requests (required) */
    rp_context: RpContext;          // not optional
    allow_legacy_proofs: boolean;
    ...
};

type RpContext = {
    rp_id: string;                  // the 4.0 Relying Party ID
    nonce: string;
    created_at: number;
    expires_at: number;
    signature: string;              // ECDSA, needs the signing_key
};
```

`RpContext`'s own doc comment: *"This should be generated and signed by your backend."*
Every preset — `selfieCheckLegacy`, `orbLegacy`, all of them — is passed to
`IDKit.request(config)`, which takes this config. The React path is identical:
`IDKitRequestHookConfig = IDKitRequestConfig & …`, and the shipped `index.js` reads
`config.rp_context` at four call sites.

**The conclusion.** A legacy 3.0 Selfie Check proof out of 4.2.x still requires being a
registered World ID 4.0 Relying Party. `allow_legacy_proofs` selects the *proof* version;
`rp_context` gates the *request envelope*. Two different layers, and the documentation
sentence only describes the first.

**Suggested fix, one line:** state on the credentials page that all IDKit presets require
World ID 4.0 RP registration regardless of the proof version they return.

Worth adding: `IDKitWidget` no longer exists in `@worldcoin/idkit@4.2.3` — it is replaced by
`IDKitRequestWidget` / `IDKitSessionWidget` / `useIDKitRequest`. A 1.x → 4.x migration is a
component rewrite plus a new backend signing endpoint, not a prop change. A migration note
naming the removed export would help people scope the work before starting it.

---

## Finding 2 — environment moved from app-level to request-level, with no migration note

A 1.x integration using an app id issued today has **no reachable staging path**, and
nothing in the portal or the docs says so.

**Evidence.** In `idkit-core@1.5.0` the only staging logic in the entire package is:

```js
validate_bridge_url(bridge_url, app_id.includes("staging"))
```

Staging is inferred by string-matching `"staging"` inside the app id — the old
`app_staging_…` convention. There is no `environment` parameter anywhere in 1.5.0.

In 4.x it moved into the request config:

```ts
environment?: "production" | "staging" | "sandbox";   // IDKitRequestConfig
```

So environment stopped being a property of the app and became a per-request parameter,
and the portal stopped exposing the choice. We created two apps looking for a staging
toggle before reading the package source and finding there was nothing to toggle.

**The consequence.** The simulator is staging-only — the docs are explicit that
*"staging apps must use the Worldcoin Simulator, whereas production apps will use the
World App."* Reaching staging now requires either an app id that is no longer issued, or
4.x, which requires `rp_context` and therefore 4.0 RP registration (Finding 1). For a
1.x integration those are both closed, so there is no way to test a proof round-trip
without a real World ID credential on a phone.

**Suggested fix:** a note on the testing page stating that pre-4.x integrations cannot
reach staging with app ids issued after the change, and what the upgrade path is.

---

## Finding 3 — `hashToField` branches on input type, silently

**The behaviour.** From `idkit-core`'s `src/lib/hashing.ts`:

```js
function hashToField(input) {
  if (Bytes.validate(input) || Hex.validate(input)) return hashEncodedBytes(input);
  return hashString(input);
}
```

Hex and bytes hash as **raw bytes**; everything else as a **UTF-8 string**. An Ethereum
address is valid hex, so a 42-character address hashes as 20 raw bytes rather than as
its text form. The two produce different field elements:

```
0x27a89B8262b6A51167488edC860E39fbC0111B9B
  raw-bytes branch   0x008e8ce766ead3a3d31ad7b684b4af9f41fa7db7d9b3d0ef3bdc6330d672cd13   <- correct
  string branch      0x009333b6b36891940b9fdb38f8e86900d71250c8a41f149360b1376a7ab5246a
```

**Why it is dangerous.** Compute the wrong branch and the request is structurally valid,
the proof is rejected, and no error mentions the signal or its encoding. Nothing points
at the cause.

**How we caught it.** Not from the docs — by checking our implementation against the
documented default for an empty signal and confirming it matched:

```
hashToField("") == keccak256("") >> 8
                == 0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4
```

That default is published in the verify endpoint's schema, which made it a usable test
vector. Only after matching it did we read the implementation and find the branch.

Compounding it: `idkit-core@1.5.0` does not re-export `hashToField` from its package
root, so an integrator computing `signal_hash` server-side has to reimplement it.

**Suggested fix:** document the branching wherever `signal_hash` is described, and
export `hashToField` from the package root so it does not have to be reimplemented.

---

## Finding 4 — the verification-level to credential mapping is not monotonic

Requesting a *lower* assurance level does not accept a *higher* one, which is the
opposite of what "minimum level" implies.

**Evidence.** `verification_level_to_credential_types` in `idkit-core@1.5.0`:

```js
case "device":          return ["orb", "device"]
case "document":        return ["document", "orb"]
case "secure_document": return ["secure_document", "orb"]
case "orb":             return ["orb"]
```

`document` expands to `{document, orb}` — it does **not** include `secure_document`,
even though secure_document is strictly higher assurance than document. So a user
holding only World's stronger document credential is refused by a request for the
weaker one.

**Why it bites.** The parameter is named `verification_level` and reads as a floor, so
the natural assumption is that requesting `document` admits anything at least as strong.
It doesn't. And because the widget takes a single level, there is no way to request
"document or secure_document or orb" in one call: you must pick one expansion and accept
the set it happens to produce.

We hit this deciding what to request. We wanted "orb, or a document credential of either
tier". That is not expressible. We chose `Document`, giving `{document, orb}`, and
matched `ACCEPTED_VERIFICATION_LEVELS` to exactly those two values so the widget and the
server allowlist cannot disagree — a test asserts the set.

**Suggested fix:** either make the expansions monotonic, so `document` admits
`secure_document`, or accept an explicit list of credential types and rename the
parameter, since it is a set selector rather than a level.

---

## Finding 5 — blocklist vs allowlist on credential checks

Our own bug, but the shape is general.

`lib/worldid.ts` verified the proof against the Developer Portal and then checked the
credential like this:

```ts
if (level === "device") { return { success: false, ... } }   // reject device
// everything else falls through as acceptable
```

Two problems. It fails **open** — any credential World ships in future satisfies the gate
until someone remembers to extend the blocklist. And it already failed to enforce what the
README claimed: a `document` or `secure_document` proof passed a gate documented as
requiring a stronger level.

Fixed in commit `58ca5f3`: the policy is now an allowlist in `lib/worldid-policy.ts` that
asserts the level equals `orb` and rejects everything else, naming the received level in the
rejection. Nine tests cover device, document, secure_document, an invented future
credential, and missing/empty/non-string input.

**The generalisable point:** the verify response hands you `verification_level` as a bare
string, and the natural thing to write is a check against the level you don't want. If the
docs' examples and the SDK's types made allowlisting the obvious shape — for instance by
having the verify helper take the expected level as a required argument, so there is no
default-open path — this class of bug would be harder to write. It is a security check, and
the ergonomic default should fail closed.

---

## What worked well

- **IDKit 1.x was genuinely a drop-in.** One import and one component; the bulk of our time
  went into the onchain attestation path, not into IDKit.
- **`signal` binding to the wallet address prevented proof replay with no extra work.**
  Passing the connected address as `signal` and re-checking it server-side means a proof
  captured for one wallet is useless for another. We did not have to design this.
- **Staging app ids made sandbox iteration fast**, and the simulator means a demo does not
  depend on having an orb-verified identity on hand.

## Other friction

- **The app-id error is not actionable.** Hitting `/api/v2/verify` with a placeholder app id
  returns `{"code":"not_found","detail":"App not found. App may be no longer active."}`. The
  same payload covers "you typo'd the app id", "the app was deleted" and "the app is
  disabled" — three different fixes. Distinct codes would have saved a debugging pass.
- **No documented revocation story.** We added `revokeVerification` to our registry for
  fraud handling, but we were guessing. There is no guidance on whether a nullifier should
  ever be re-attestable to a new address after a lost key. Too strict and a farmer is locked
  out of their collateral forever; too loose and the Sybil gate leaks.

## Live run against Hedera testnet

### The gate is load-bearing (verified 12 Sep 2026)

"No verification means no collateral means no loan", asserted against the deployed,
Sourcify-verified contracts. Raw `eth_call` from an unverified address — no gas, no
funded account, no transactions:

```
unverified address  0x7B5e01253D86Dd64e275db2D4F5861FE7b33C75D
isVerified()        false
kycGranted()        false

  1. grantKyc              REVERTED  WorldIdVerificationRequired(0x7B5e0125...7b33C75D)
  2. issue receipt         REVERTED  WorldIdVerificationRequired(0x7B5e0125...7b33C75D)
  3. requestLoan           REVERTED  NotVerified(0xff67F768bbFb28793920383cEDbb237cd8136eb6)
  4. transfer receipt #1   REVERTED  KycRequired(0x7B5e0125...7b33C75D)

control - already-verified address 0x033588A8025F47128cf7B102412b81Ca43c2C7f0
  isVerified()  true
  grantKyc      OK - gate opens for a verified address
```

Note (2): `issue` checks `isVerified(to)` before KYC, so `WorldIdVerificationRequired`
short-circuits and `KycRequired` is never reached on that path. `KycRequired` guards a
different leg — transferring a receipt to an address outside the compliance whitelist —
which is what (4) exercises. Both errors are therefore demonstrated live rather than
inferred.

The control matters: four reverts alone could have any cause. The same `grantKyc`
succeeding for a verified address is what shows the World ID check is the thing
refusing.

Two measurement traps, both of which produced a false pass first:

- `contract.fn.staticCall({ from })` does **not** test the contract. Hardhat rejects an
  unknown `from` with `transaction from mismatch` client-side, before the call reaches
  the node, and it reads exactly like the gate holding. Raw
  `provider.call({ to, data, from })` is what actually exercises it.
- A freshly generated address has no Hedera account, so Hashio answers
  `Sender account not found` and the contract is never reached. A *sender*-side gate has
  to be tested with an address that exists on chain but was never verified.

Reproduce: `GATE_TEST_ADDRESS=0x27a89B8262b6A51167488edC860E39fbC0111B9B npm run check:gate`.
Raw capture in [evidence/01-gate-refusals-hedera-testnet.txt](evidence/01-gate-refusals-hedera-testnet.txt).

### The proof path, as far as it can be driven

```
A. structurally valid request, fabricated proof
   403 {"code":"invalid_format","error":"Expected either an ABI-encoded uint256[8]
        string or a JSON-encoded array string in the correct format."}

B. disallowed credential, refused before any network call
   403 {"code":"insufficient_level","error":"World ID proof has verification level
        \"document\", which Godaam does not accept. Accepted: orb."}
```

(A) is the useful one: the app id, action, endpoint and body shape all resolve, and
World is rejecting the *proof itself*. Everything up to the cryptography is proven.

### The gap, stated plainly

**One proof round-trip is unproven.** We have not completed a genuine Orb verification
end-to-end, for the external reason in Finding 2: the simulator is staging-only, 1.x
infers staging from an `app_staging_…` id that is no longer issued, and the 4.x path
that exposes `environment` requires 4.0 RP registration. Both routes are closed to a
1.x integration without a real World ID credential on a phone.

What that leaves unverified is exactly one thing: that a valid proof returns
`success: true` and the route proceeds to `attestVerification` + `grantKyc`. The
attestor's ability to make those two calls is separately proven on chain below, so the
untested span is the single hop between World returning success and code that already
works.

### Attestor path, exercised on chain

The calls the server route makes, signed by the attestor key
([deployments.md](deployments.md) has the full table):

| Call | Tx |
| --- | --- |
| `attestVerification` | `0xad31b3a7c1e868a1b6328e9f6d781c2494963006283980d116bef88562c44ad0` |
| `grantKyc` | `0x300f14f371eedd5b9abe27411711e24daae53f6e30167b94599adf9cac6925e0` |
| `issue` (receipt #1) | `0x706484b4a48b6180d2d74b5ed1c635cfe85973a54e3a9127e2ec27ccd44dc6b1` |

## Disclosed trust assumption

**World ID verification happens server-side against the Developer Portal, because Hedera has
no onchain World ID Router.** Our backend verifies the proof and then, as a trusted attestor,
writes only the nullifier hash to `WorldIdRegistry`.

This reintroduces exactly the trust a ZK proof is meant to remove: a user must trust that our
server does not attest nullifiers it never verified. We mitigate it by separating the
attestor key from the deployer key and granting the attestor nothing beyond `ISSUER_ROLE`,
but it is a real assumption and we would rather state it than have it discovered.

An official router deployment, or a canonical signed cross-chain attestation format
verifiable onchain, would remove it. Every integration on a chain without a router is
currently reinventing this, and most will get the replay and rebinding cases subtly wrong.

## Contact

Repo: https://github.com/rohitshukla11/ETHOnline
