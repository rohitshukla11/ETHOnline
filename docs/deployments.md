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

Sourcify reports `runtimeMatch: exact_match` for all five. `creationMatch` is null
because the creation transaction hash was not submitted alongside the sources; runtime
bytecode matching is what establishes that the published source compiles to the
deployed contract.

Verify independently:

```bash
curl -s https://sourcify.dev/server/v2/contract/296/<address> | jq '{match, runtimeMatch}'
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

- **ATS security token.** `HEDERA_OPERATOR_KEY` requires a DER-encoded ED25519 key; both
  accounts above are ECDSA. Separately, the ATS SDK's `SupportedWallets` offers no
  headless operator-key signer. See the ATS section in the README.
- **CRE workflow.** Parked at the `cre login` gate; the vault's forwarder is the local
  `MockCreForwarder` until a real CRE deployment exists.
