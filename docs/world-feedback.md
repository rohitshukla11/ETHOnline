# World ID / Selfie Check integration feedback

Submitted for the World Selfie Check track, ETHOnline 2026.

## What we built

Godaam gates every collateral operation on Selfie Check. The nullifier hash is written to
`WorldIdRegistry` on Hedera testnet and is a hard precondition for
`WarehouseReceipt.grantKyc`, which is itself a precondition for minting or receiving a
tokenized warehouse receipt. An unverified address cannot hold collateral, therefore cannot
borrow.

Undercollateralised lending is the reason this matters: the protocol lends up to 220% of the
grain's appraised value, so Sybil resistance is load-bearing rather than cosmetic. A farmer
who could mint five identities could take five loans against one harvest.

The gate is covered by three contract tests that assert the negative path:

- `blocks KYC grant without a Selfie Check` — `grantKyc` reverts with
  `WorldIdVerificationRequired` for an address with no nullifier on record.
- `rejects a reused nullifier from a second address` — `attestVerification` reverts with
  `NullifierAlreadyUsed`, so one human cannot become two borrowers.
- `blocks loan requests from unverified addresses` — `requestLoan` reverts with
  `NotVerified` even if the caller somehow holds a receipt.

## What worked well

- **IDKit was genuinely a drop-in.** `@worldcoin/idkit` to a rendering widget was one import
  and one component; the bulk of our integration time went into the onchain attestation
  path, not into IDKit.
- **`signal` binding to the wallet address prevented proof replay with no extra work.**
  Passing the connected address as `signal` and re-checking it server-side meant a proof
  captured for one wallet is useless for another. We did not have to design anything for
  this; it fell out of the API.
- **Staging app ids made sandbox iteration fast.** Being able to develop against
  `app_staging_*` without touching a production app id is the right default.

## Friction we hit

- **No World ID Router on Hedera.** This was our largest integration cost. We had to verify
  proofs server-side via `/api/v2/verify` and attest the nullifier with a trusted backend
  signer, which reintroduces exactly the trust assumption a ZK proof is supposed to remove:
  our users must trust that our server does not attest nullifiers it never verified. An
  official router deployment, or a canonical signed cross-chain attestation format we could
  verify onchain, would remove it.
- **The error for an unconfigured app id is not actionable from the client.** Hitting
  `/api/v2/verify` with a placeholder app id returns
  `{"code":"not_found","detail":"App not found. App may be no longer active."}`. That same
  payload covers "you typo'd the app id", "the app was deleted" and "the app is disabled",
  which are three different fixes. Distinct codes would have saved us a debugging pass.
- **Verification level semantics take a careful read.** Distinguishing a genuine Selfie
  Check result from a device-level proof meant reading the docs closely and then defensively
  rejecting `device` server-side ourselves (`lib/worldid.ts`). A single explicit boolean
  like `face_verified: true` in the verify response would make the check unambiguous, and
  would stop integrators from accidentally accepting a weaker proof than they intended.
- **No documented revocation story.** We added `revokeVerification` to our own registry for
  fraud handling, but we were guessing. There is no guidance on whether a nullifier should
  ever be re-attestable to a new address (stolen wallet? lost key?), and getting that wrong
  in either direction is a real problem: too strict and a farmer who loses a key is locked
  out of their collateral forever; too loose and the Sybil gate leaks.

## Suggestions

- Publish a reference "nullifier attested onchain by a backend signer" contract. Every
  integration on a chain without a router is currently reinventing it, and most of them will
  get the replay and rebinding cases subtly wrong.
- Document a recommended revocation and key-rotation story, even if the recommendation is
  "never rebind a nullifier".
- Consider distinct error codes for the app-id failure modes described above.

## Contact

Repo: https://github.com/rohitshukla11/ETHOnline
