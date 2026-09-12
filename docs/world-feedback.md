# World ID integration feedback

Submitted for the World track, ETHOnline 2026.

## What we built

Godaam gates collateral issuance on **World ID Orb verification**. A warehouse receipt
cannot be held without it, and a nullifier can bind to exactly one address.

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

## Finding 2 — blocklist vs allowlist on credential checks

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

"No verification means no collateral means no loan", asserted against the deployed
contracts rather than a local chain. Run it with
`hardhat run scripts/check-gate-downstream.ts --network hederaTestnet`:

```
unverified address  0x94215adB606bE2e84324a0c671726a9799B55250
isVerified()        false
kycGranted()        false

  1. grantKyc         REVERTED  WorldIdVerificationRequired(0x94215adB...B55250)
  2. issue receipt    REVERTED  WorldIdVerificationRequired(0x94215adB...B55250)
  3. requestLoan      REVERTED  NotVerified(0xff67F768bbFb28793920383cEDbb237cd8136eb6)

control - already-verified address 0x033588A8025F47128cf7B102412b81Ca43c2C7f0
  isVerified()  true
  grantKyc      OK - gate opens for a verified address
```

The control matters: three reverts on their own could be caused by anything. The same
call succeeding for a verified address is what shows the World ID check is the thing
refusing.

Two measurement notes, because both produced false results first:

- `contract.fn.staticCall({ from })` does **not** test the contract. Hardhat rejects an
  unknown `from` with `transaction from mismatch` client-side, before the call reaches
  the node. It looks exactly like the gate holding. Use raw `provider.call({ to, data,
  from })`.
- A freshly generated address has no Hedera account, so Hashio answers
  `Sender account not found` and the contract is never reached. Testing a
  *sender*-side gate needs an address that exists on chain but was never verified.

### Attestor path, exercised on chain

The calls the server route makes, signed by the attestor key
([deployments.md](deployments.md) has the full table):

| Call | Tx |
| --- | --- |
| `attestVerification` | `0xad31b3a7c1e868a1b6328e9f6d781c2494963006283980d116bef88562c44ad0` |
| `grantKyc` | `0x300f14f371eedd5b9abe27411711e24daae53f6e30167b94599adf9cac6925e0` |
| `issue` (receipt #1) | `0x706484b4a48b6180d2d74b5ed1c635cfe85973a54e3a9127e2ec27ccd44dc6b1` |

### Still outstanding: the end-to-end HTTP path

The app id `app_39a2a32523be6184e8d1e77b709e6250` is live — the Developer Portal
resolves it — but the configured action is not yet created, so a proof cannot be
completed:

```
real app id + configured action     403 {"code":"invalid_action","detail":"Action not found."}
real app id + an invented action    400 {"code":"invalid_action","detail":"Action not found."}
bogus app id (control)              404 {"code":"not_found","detail":"App not found."}
```

Until the action exists, the widget-to-chain run and the live Sybil rejection are not
captured. The contract-level Sybil guarantee is covered by
`rejects a reused nullifier from a second address`, which asserts
`NullifierAlreadyUsed`; the API-layer rejection is the stronger artifact and is still
pending.

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
