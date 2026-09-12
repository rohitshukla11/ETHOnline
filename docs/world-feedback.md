# World ID / Selfie Check integration feedback

_Submitted as part of the World Selfie Check track requirement. Fill in the bracketed notes
as you hit them during the build — reviewers value specifics over praise._

## What we built

Godaam gates every collateral operation on Selfie Check. The nullifier hash is written to
`WorldIdRegistry` on Hedera testnet and is a hard precondition for `WarehouseReceipt.grantKyc`,
which is itself a precondition for minting or receiving a tokenized warehouse receipt. An
unverified address cannot hold collateral, therefore cannot borrow.

Undercollateralised lending is the reason this matters: the protocol lends up to 220% of the
grain's value, so Sybil resistance is load-bearing, not cosmetic.

## What worked well

- [ ] IDKit drop-in widget — time from `npm install` to first proof: _[fill in]_
- [ ] `signal` binding to the wallet address prevented proof replay with no extra work
- [ ] Staging app ids in the Developer Portal made sandbox iteration fast

## Friction we hit

- [ ] **No World ID Router on Hedera.** We had to verify proofs server-side via
      `/api/v2/verify` and attest the nullifier with a trusted backend signer. This adds a
      trust assumption we'd rather not have. An official router deployment (or a canonical
      cross-chain attestation pattern) on non-EVM-mainnet chains would remove it.
- [ ] **Verification level semantics.** Distinguishing a genuine Selfie Check result from a
      device-level proof in the response required reading the docs carefully; a single
      explicit field like `face_verified: true` would be clearer.
- [ ] _[note any simulator/sandbox issues, error codes that were hard to interpret, etc.]_
- [ ] _[note docs pages that were out of date or hard to find]_

## Suggestions

- [ ] Publish a reference "nullifier attested onchain by a backend signer" contract, since
      every non-supported-chain integration reinvents it.
- [ ] Document a recommended revocation story — we added `revokeVerification` ourselves for
      fraud handling, but there's no guidance on what good practice looks like.

## Contact

Repo: https://github.com/rohitshukla11/ETHOnline
