# Godaam — Hedera Testnet Deployment

> ## Deployed 12 September 2026, 11:06 UTC
>
> **Hedera testnet resets periodically and wipes both contract state and Sourcify
> verifications.** If a HashScan link below 404s, that is a network reset, not an
> unverified or never-deployed contract. Screenshots taken at deploy time are in
> [`screenshots/`](screenshots/) and are the surviving evidence if a reset lands
> between submission and judging.

- **Network:** Hedera Testnet (`hederaTestnet`, chain ID **296**)
- **RPC:** `https://testnet.hashio.io/api` (Hashio)
- **Deployer:** [`0x033588A8025F47128cf7B102412b81Ca43c2C7f0`](https://hashscan.io/testnet/account/0x033588A8025F47128cf7B102412b81Ca43c2C7f0) — Hedera `0.0.10498991`
- **World ID attestor:** [`0xff67f768bbfb28793920383cEDbb237cd8136eb6`](https://hashscan.io/testnet/account/0xff67f768bbfb28793920383cedbb237cd8136eb6) — Hedera `0.0.10498999`
- **Compiler:** solc `0.8.24+commit.e11b9ed9`, optimizer on (200 runs), `viaIR`, EVM `cancun`
- **ATS factory/resolver age:** the pre-deployed factory `0.0.9213391` and resolver
  `0.0.9212226` were created 12 June 2026. Hedera resets testnet quarterly, so the same
  caveat as our own contracts applies — a dead link means a reset, not a fabricated
  deployment.
- **Verification:** Sourcify (chain 296 natively supported). HashScan's in-app form is
  disabled and the legacy `server-verify.hashscan.io` endpoint is a deprecated forwarder,
  so it is not configured in `hardhat.config.ts`.

## Contracts

| Contract | EVM address | Hedera ID | Verification | Deploy tx |
| --- | --- | --- | --- | --- |
| **WorldIdRegistry** | [`0xE3a02179CCa05b438bd157E2E00434d28ec26984`](https://hashscan.io/testnet/contract/0xE3a02179CCa05b438bd157E2E00434d28ec26984) | `0.0.10499418` | ✅ Full Match (`exact_match`) | [`0xa3a13a91…600fa9`](https://hashscan.io/testnet/transaction/0xa3a13a91fbcd9525f99dd57fcfd45b904f45dff760b5b92af1ed2170a5600fa9) |
| **MockUSDC** (gUSDC) | [`0x2CEBEA8360D0c71B78f320F7CdF4D06486ad9DCd`](https://hashscan.io/testnet/contract/0x2CEBEA8360D0c71B78f320F7CdF4D06486ad9DCd) | `0.0.10499422` | ✅ Full Match (`exact_match`) | [`0x0a87fc46…4ca265`](https://hashscan.io/testnet/transaction/0x0a87fc461bb2ffae893eb1d69b579b0a7afdc8c7a4e67502c0c9f705a34ca265) |
| **WarehouseReceipt** | [`0x0F2b3D243BB0e882dE0aB9Ed0b2754e8f473EaD7`](https://hashscan.io/testnet/contract/0x0F2b3D243BB0e882dE0aB9Ed0b2754e8f473EaD7) | `0.0.10499428` | ✅ Full Match (`exact_match`) | [`0x22344450…71226c`](https://hashscan.io/testnet/transaction/0x2234445086f3161ec446ce850a495a45e9c7396a216c2a2c489531dc9771226c) |
| **GodaamVault** | [`0x63Af372CEAa1d2C8dADF6Ea503c99edB1960d07d`](https://hashscan.io/testnet/contract/0x63Af372CEAa1d2C8dADF6Ea503c99edB1960d07d) | `0.0.10499433` | ✅ Full Match (`exact_match`) | [`0xaca3f92b…7b5828`](https://hashscan.io/testnet/transaction/0xaca3f92bb2408eea21a9019d4a1490dfbc432e23d709eaac96e39d50c97b5828) |
| **MockCreForwarder** | [`0xaDFc7D556C20908151e8C3C56C65b6F45648C736`](https://hashscan.io/testnet/contract/0xaDFc7D556C20908151e8C3C56C65b6F45648C736) | `0.0.10499440` | ✅ Full Match (`exact_match`) | [`0x69a4acb1…5d23a5`](https://hashscan.io/testnet/transaction/0x69a4acb16e51fb80efda93390530d1b7a364f14e46a2e9848eed5fbc205d23a5) |
| **CollateralNavOracle** | [`0x3f0669a7CAD6243AaC7cc5547B2C72557375B82D`](https://hashscan.io/testnet/contract/0x3f0669a7CAD6243AaC7cc5547B2C72557375B82D) | — | ✅ Full Match (`exact_match`) | [`0x94b85a89…2b2ea8`](https://hashscan.io/testnet/transaction/0x94b85a89a98e84809e753492a3b6e3923b86351a844c912687366c61562b2ea8) |

Sourcify reports `runtimeMatch: exact_match` for all five. `creationMatch` is null
because the creation transaction hash was not submitted alongside the sources; runtime
bytecode matching is what establishes that the published source compiles to the
deployed contract.

Verify independently:

```bash
curl -s https://sourcify.dev/server/v2/contract/296/<address> | jq '{match, runtimeMatch}'
```

## The ATS security token (Hedera bounty requirement 1)

Issued **12 September 2026, 19:53 UTC** through Hedera's **Asset Tokenization Studio web
application**, signed with a browser wallet. This is a real ERC-1400 security token
created via the pre-deployed testnet factory — not our own contract imitating one.

| | |
| --- | --- |
| **Name / Symbol** | Godaam Receipt Wheat / `GWR-WHE` |
| **Hedera ID** | [`0.0.10508257`](https://hashscan.io/testnet/contract/0.0.10508257) |
| **EVM address** | [`0x4b7523a4697378155bdb11fe855ecb8f2571b6a5`](https://hashscan.io/testnet/contract/0x4b7523a4697378155bdb11fe855ecb8f2571b6a5) |
| **ISIN** | `INGODAAMWHE3` |
| **Decimals** | `0` — whole kilograms |
| **Max supply** | `42000 GWR-WHE` |
| **Total supply** | `42000 GWR-WHE` (minted) |
| **Issuance tx** | [`0xc1f77f11…b70814`](https://hashscan.io/testnet/transaction/0xc1f77f1162bb11608c6ab73e3825592752235e5ffcb9b2bc25aedcebf5b70814) |
| **Holder** | `0.0.10498991` — `balanceOf` = 42000 |
| **Factory / Resolver** | `0.0.9213391` / `0.0.9212226` (canonical testnet, pre-deployed) |

**One token is one kilogram.** `numberOfShares` carries the actual quantity of grain, so
the share count is not decorative — it *is* the receipt.

Verify independently:

```bash
cast call 0x4b7523a4697378155bdb11fe855ecb8f2571b6a5 "totalSupply()(uint256)" \
  --rpc-url https://testnet.hashio.io/api
```

### Compliance configuration

| Setting | Value | Why |
| --- | --- | --- |
| **Approval list** | **Allowed** (`isWhiteList: true`) | An **allowlist**, so it fails closed. Administered by the token issuer through ATS — **not** driven by World ID; that gates `WarehouseReceipt` instead |
| **Blocklist** | Not allowed | The ATS web app defaults to a blocklist, which **fails open** — any address nobody remembered to ban could hold the receipt. Deliberately inverted |
| **Controllable** | Allowed | `controllerTransfer` / `controllerRedeem` — the forced transfer on liquidation |
| **Internal KYC** | Deactivated | See below |
| **Compliance / Identity Registry** | `0.0.0` | No external ERC-3643 modules. The compliance decision stays in the layer the protocol controls |
| Rights | Liquidation, Redemption | A claim on the grain, and the right to redeem it. No voting, dividend `NONE` |

**On internal KYC, stated plainly.** It was enabled at issuance and then deactivated,
because satisfying it is not an administrative action. `GrantKycCommandHandler` runs the
supplied file through `Terminal3Vc.vcFromBase64` and `verifyVc`, and throws `InvalidVc`
unless it is a cryptographically signed W3C Verifiable Credential bound to the target
address and this security. That requires a credential issuer — a KYC-provider
integration, not a toggle. A production deployment would wire one; this demo enforces
compliance through the ATS allowlist instead.

**These are two separate gates on two separate assets**, and the distinction matters:

| | ATS equity `GWR-WHE` | `WarehouseReceipt` (EVM) |
| --- | --- | --- |
| Gate | approval list (`isWhiteList: true`) | `grantKyc`, World-ID-gated |
| Administered by | the token issuer, via ATS | this protocol, on a verified nullifier |
| Internal KYC | deactivated (needs a signed VC) | n/a |
| Enforcement evidence | allowlist checked on every mint and transfer inside the diamond | four live reverts on testnet, see below |

Adding an address to the ATS approval list is an issuer action. It is not performed by
`/api/worldid/verify`, and a World ID verification does not place anyone on it.

The link between this asset and the EVM collateral record is not retrofitted:
`WarehouseReceipt.ReceiptData` has carried `atsTokenId` and `atsTokenAddress` since the
first commit, and `.env` now holds the real values.

## The NAV oracle and its Chainlink feed

[`CollateralNavOracle`](../contracts/CollateralNavOracle.sol) —
[`0x3f0669a7CAD6243AaC7cc5547B2C72557375B82D`](https://hashscan.io/testnet/contract/0x3f0669a7CAD6243AaC7cc5547B2C72557375B82D),
Sourcify **Full Match**, deployed 12 September 2026.

| | |
| --- | --- |
| **Feed** | Chainlink **HBAR/USD**, [`0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`](https://hashscan.io/testnet/contract/0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a) |
| **Staleness threshold** | `maxAnswerAge = 10800s` (3 hours), owner-adjustable |
| **Constructor args** | `0x033588A8025F47128cf7B102412b81Ca43c2C7f0`, the feed address |
| **Standalone** | not wired into `GodaamVault`, which is deployed and verified — a future vault consumes it through `navOf(receiptId)` |

### Chainlink has no agricultural feed on Hedera

The seven feeds on Hedera testnet are **HBAR, USDC, ETH, BTC, LINK, DAI and USDT against
USD** — all crypto and stablecoin pairs. **None is agricultural.**

So the crop valuation is **not** oracle-derived, and the contract enforces that
structurally rather than by comment: `navOf` returns `cropSource` and `referenceSource`
as separate fields, `cropSource` is hardcoded to `Appraisal` and can never be
`ChainlinkFeed`, and a test asserts exactly that. The feed supplies the **settlement
currency** reference only — a real dependency, since loans are denominated in a
stablecoin, but not a grain price.

### Both paths, called against the live contract

**Fresh feed**, `maxAnswerAge = 10800s`:

```
navUsd6              11466000000  (= $11466)
appraisalUsdPerTonne 273000000  (= $273/tonne)
quantityKg           42000
referenceAnswer      7437857  (= 0.07437857)
referenceDecimals    8
referenceUpdatedAt   1789241620  (35 min ago)
cropSource           Appraisal
referenceSource      ChainlinkFeed
```

**Same feed, `maxAnswerAge` lowered to 60s** so the live answer reads stale:

```
navUsd6              11466000000  (= $11466)
referenceAnswer      0
referenceDecimals    0
referenceUpdatedAt   0
cropSource           Appraisal
referenceSource      None
```

The second is the one that matters. It **zeroes** the answer, decimals and timestamp
rather than relabelling an old price — a caller cannot read a stale figure at all. The
NAV itself is unchanged, because the appraisal does not depend on the feed.

Reproduce with `npm run deploy:nav`, or call the deployed contract directly:

```bash
cast call 0x3f0669a7CAD6243AaC7cc5547B2C72557375B82D \
  "referencePrice()(int256,uint8,uint256)" --rpc-url https://testnet.hashio.io/api
```

## A note on the contract comments

`WorldIdRegistry.sol` and `WarehouseReceipt.sol` still say "Selfie Check" in three NatSpec
comments. The gate is actually World ID **Orb** (see
[world-feedback.md](world-feedback.md) for why Selfie Check was dropped).

Those comments are deliberately left alone: the deployed contracts are Sourcify-verified at
`exact_match`, and editing any source byte — comments included — changes the metadata hash,
so the repository source would no longer correspond to the verified bytecode. Correcting the
wording would cost the Full Match unless the contracts are redeployed.

The contracts are credential-agnostic in any case: they record and check a nullifier and
never inspect which credential produced it. The credential is asserted off-chain in
`lib/worldid-policy.ts`.

## Onchain wiring, read back from the deployed contracts

`npm run check:roles` reads every value below from chain, not from
`deployments/hederaTestnet.json`:

```
hasRole(ISSUER_ROLE, attestor)      0xff67f768bbfb28793920383cedbb237cd8136eb6 true
hasRole(CONTROLLER_ROLE, vault)     0x63Af372CEAa1d2C8dADF6Ea503c99edB1960d07d true
registry.attestor()                 0xff67F768bbFb28793920383cEDbb237cd8136eb6 true
vault.creForwarder()                0xaDFc7D556C20908151e8C3C56C65b6F45648C736 true
vault.workflowOwner()               0x0000000000000000000000000000000000000000 (zero = owner check disabled)
vault gUSDC balance                 1000000.0                                  true

all expected: true
```

The `ISSUER_ROLE` grant is the fix for the audit finding where the attestor could write
a World ID nullifier onchain and then fail to grant KYC, leaving a farmer who appeared
verified but could never hold collateral.

## Attestor exercised against the real chain

The two calls that reverted with `AccessControlUnauthorizedAccount` in the audit, signed
by the attestor key on testnet:

| Call | Tx |
| --- | --- |
| `registry.attestVerification` | [`0xad31b3a7…c44ad0`](https://hashscan.io/testnet/transaction/0xad31b3a7c1e868a1b6328e9f6d781c2494963006283980d116bef88562c44ad0) |
| `receipts.grantKyc` | [`0x300f14f3…6925e0`](https://hashscan.io/testnet/transaction/0x300f14f371eedd5b9abe27411711e24daae53f6e30167b94599adf9cac6925e0) |
| `receipts.issue` → receipt #1 | [`0x706484b4…4dc6b1`](https://hashscan.io/testnet/transaction/0x706484b4a48b6180d2d74b5ed1c635cfe85973a54e3a9127e2ec27ccd44dc6b1) |

Reproduce with `npm run check:roles` and
`hardhat run scripts/check-attestor-onchain.ts --network hederaTestnet`.

## Not yet deployed

- **ATS issuance from a server route.** The asset above was issued through the ATS **web
  application** with a browser wallet, which is what the bounty accepts and what works.
  The scripted path in `scripts/ats-issue-receipt.ts` still cannot run headlessly: the
  SDK's `SupportedWallets` offers only METAMASK / HWALLETCONNECT / DFNS / FIREBLOCKS /
  AWSKMS, so a server route would need a custodial signer. The script's configuration is
  correct and typechecks against the SDK; only the signing path is unavailable.
- **CRE workflow.** Parked at the `cre login` gate; the vault's forwarder is the local
  `MockCreForwarder` until a real CRE deployment exists.
