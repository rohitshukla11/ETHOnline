# Godaam

**Confidential agricultural lending vault.** A farmer's grain sitting in a certified
warehouse becomes onchain collateral; a Chainlink CRE Confidential Workflow underwrites the
*farmer* inside a TEE so the protocol can lend more than the grain alone justifies; World ID
World ID Orb verification makes sure one human can only ever be one borrower.

ETHGlobal ETHOnline 2026 — Hedera / Chainlink / World tracks.

## Layout

```
contracts/          Solidity (Hardhat) — registry, compliance receipt, vault
workflows/          Chainlink CRE Confidential Workflow (handlerInTee)
app/                Next.js 14 App Router + API routes
lib/                SDK integrations (wagmi, World ID, CRE, contract ABIs)
scripts/            Deploy + ATS SDK issuance + on-camera demo scripts
test/               Full lifecycle tests incl. default & liquidation
```

## Setup

Requires **Node >= 20.17** (see `.nvmrc`) and, for the Chainlink workflow only,
**Bun >= 1.2.21** plus the **`cre` CLI**. If `node` is not on your `PATH`, check
`~/.local/node/bin` before reinstalling.

```bash
npm install
cp .env.example .env          # then fill it in — see the comments in that file
npm run compile
npm run test:contracts        # 17 passing
npm run deploy:hedera
npm run dev
```

The Chainlink Confidential Workflow lives in `workflows/risk-scoring/` and is built with
Bun, not npm — it compiles to WASM through Javy, which is not a Node runtime:

```bash
curl -fsSL https://bun.sh/install | bash              # Bun >= 1.2.21
# cre CLI: https://docs.chain.link/cre/getting-started/cli-installation
bun --cwd workflows/risk-scoring install

npm run cre:verify     # scores both fixtures, no CRE account needed
npm run cre:build      # compiles main.ts -> dist/workflow.wasm
npm run cre:simulate   # full simulation; needs CRE_API_KEY or `cre login`
```

## Assumptions baked in (change these if you disagree)

- **Stablecoin**: `MockUSDC.sol`, symbol `gUSDC`, **6 decimals**, open `faucet()` (5,000/day)
  plus owner `mint`. All loan amounts, appraisals and installments are 6dp.
- **RPC**: Hashio at `https://testnet.hashio.io/api`, chain id **296**. Swap for your own
  relay via `HEDERA_TESTNET_RPC` if you hit rate limits.
- **Verification**: HashScan / Sourcify (`npx hardhat verify --network hederaTestnet <addr>`).
- **World ID proof verification** happens server-side against the Developer Portal, because
  the World ID Router isn't deployed on Hedera. Only the nullifier lands onchain.
- **CRE forwarder**: `MockCreForwarder` is deployed for local/demo use; set
  `CRE_FORWARDER_ADDRESS` to the real forwarder once the workflow is deployed.

## Sponsor checklist

### Hedera — Tokenization of Anything
- Real ATS SDK issuance, control-list whitelisting and `controllerTransfer` in
  [scripts/ats-issue-receipt.ts](scripts/ats-issue-receipt.ts)
- EVM collateral adapter with local KYC / freeze / seizure / redemption controls in
  [contracts/WarehouseReceipt.sol](contracts/WarehouseReceipt.sol)
- Lifecycle ops beyond issuance: freeze on pledge, compliance-blocked transfer, forced
  transfer on default — all demoed by [scripts/demo-lifecycle.ts](scripts/demo-lifecycle.ts)
  and [scripts/demo-liquidation.ts](scripts/demo-liquidation.ts)

### ATS integration status

The Hedera asset is created through the published
`@hashgraph/asset-tokenization-sdk`. That SDK is a TypeScript client; it is not
importable from Solidity. ATS itself uses a diamond-based ERC-1400 implementation
with partial ERC-3643 support in `packages/ats/contracts`.

`WarehouseReceipt.sol` is therefore explicitly an EVM collateral adapter, not an
ATS compliance implementation. Its local KYC, freeze, forced-transfer, and redeem
functions preserve the vault's local test path, while the ATS token is linked through
`atsTokenAddress` and `atsTokenId`. Before claiming full ATS contract integration,
the adapter must be replaced or extended against the pinned ATS Solidity package and
its deployed diamond interfaces. That refactor requires dependency installation and
full Hardhat validation; it is intentionally not claimed as complete in this
Node-free pass.

### Chainlink — Best Confidential Workflow
- `handlerInTee` registered with `{ confidential: true }` in
  [workflows/risk-scoring/main.ts](workflows/risk-scoring/main.ts)
- Sensitive inputs inside the enclave: land record reference, yield history, repayment history
- Load-bearing: `GodaamVault.onReport` is the **only** path that can disburse a loan, and the
  LTV band it enforces comes from the TEE
- Evidence: `npm run cre:verify` scores both fixtures with the same module the enclave
  runs (good farmer 893 -> approved at 220% LTV; risky farmer 271 -> declined), and
  `npm run cre:simulate` runs the full WASM simulation once `CRE_API_KEY` is set —
  transcript in [docs/cre-simulation-run.txt](docs/cre-simulation-run.txt)
- The private bureau lookup goes through `ConfidentialHTTPClient`, so the land record
  reference never transits the public network. See
  [docs/cre-integration-notes.md](docs/cre-integration-notes.md) for the SDK gotchas and
  the one unresolved architectural constraint (CRE has no Hedera chain selector)

### World — Proof of personhood (Orb)
- Gate, not a checkmark: `WarehouseReceipt.grantKyc` reverts with
  `WorldIdVerificationRequired` unless the nullifier is onchain, so no verification means no
  collateral, which means no loan
- **The accepted credential is a policy decision, not an architectural one.** The contracts
  are credential-agnostic: they record and check a nullifier and never inspect which
  credential produced it. The accepted set is one line —
  `ACCEPTED_VERIFICATION_LEVELS` in [lib/worldid-policy.ts](lib/worldid-policy.ts) — and it
  holds `{orb, document}`. **Production lending against real collateral should require
  `orb` alone.** This demo also accepts `document` (NFC passport or national ID, medium
  assurance) because no orb was reachable inside the submission window. `device` is
  rejected: a phone is not a person, and one human can hold many
- Selfie Check was the original design; it was dropped once the SDK showed that every IDKit
  preset requires World ID 4.0 Relying Party registration regardless of the proof version it
  returns. The reasoning is written up in [docs/world-feedback.md](docs/world-feedback.md)
- The credential check is an allowlist, not a blocklist: `lib/worldid-policy.ts` asserts the
  level equals `orb` and rejects everything else, so a future credential cannot satisfy the
  gate by default
- **Status, plainly:** the gate is World ID Orb verification, enforced onchain — an
  unverified address is refused at all four downstream points on live Hedera testnet
  (`WorldIdVerificationRequired`, `NotVerified`, `KycRequired`; see
  [docs/evidence/](docs/evidence/)). The proof path is demonstrated up to World's own
  rejection of an invalid proof. **A full round-trip needs a real World ID credential**:
  the simulator is staging-only, and staging is unreachable from IDKit 1.x with an app id
  issued today — the reason is written up as Finding 2 in
  [docs/world-feedback.md](docs/world-feedback.md). If you open the app and cannot
  complete verification, that is this constraint, not a fault
- Nullifier reuse across addresses is rejected (`NullifierAlreadyUsed`)
- Integration feedback: [docs/world-feedback.md](docs/world-feedback.md)

## Demo recordings

| Clip | Command |
| --- | --- |
| World ID gating | `npm run dev` → /verify, then try /tokenize while unverified |
| Hedera lifecycle | `CRE_LIVE=true npm run demo:lifecycle` (falls back to a hand-encoded report, and says so, when `CRE_LIVE` is unset) |
| CRE confidential workflow | `npm run cre:verify`, then `npm run cre:simulate` |
| Default → liquidation | `npm run demo:liquidation` |
