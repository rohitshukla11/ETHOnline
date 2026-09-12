# Godaam

**Confidential agricultural lending vault.** A farmer's grain sitting in a certified
warehouse becomes onchain collateral; a Chainlink CRE Confidential Workflow underwrites the
*farmer* inside a TEE so the protocol can lend more than the grain alone justifies; World ID
World ID Selfie Check ties each claim to a liveness-verified person, and the
nullifier makes sure one identity gets one claim.

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
- **A real ATS security token, issued on Hedera testnet:** `GWR-WHE`,
  [`0.0.10508257`](https://hashscan.io/testnet/contract/0.0.10508257), 42,000 units where
  **one token is one kilogram of wheat**, created through the Asset Tokenization Studio
  web app via the pre-deployed testnet factory. Configuration, compliance settings and
  the issuance transaction are in [docs/deployments.md](docs/deployments.md)
- Compliance is an **allowlist** (`isWhiteList: true`), not the blocklist the ATS UI
  defaults to — a blocklist fails open. `scripts/ats-issue-receipt.ts` holds the same
  configuration in scripted form
- EVM collateral adapter with local KYC / freeze / seizure / redemption controls in
  [contracts/WarehouseReceipt.sol](contracts/WarehouseReceipt.sol)
- Lifecycle ops beyond issuance: freeze on pledge, compliance-blocked transfer, forced
  transfer on default — all demoed by [scripts/demo-lifecycle.ts](scripts/demo-lifecycle.ts)
  and [scripts/demo-liquidation.ts](scripts/demo-liquidation.ts)

### Two applications, two signers

Issuance and lending are separate acts by separate parties, and the architecture reflects
that rather than collapsing them.

| | Who | Tool | Signs with | Produces |
| --- | --- | --- | --- | --- |
| **Issue the receipt** | warehouse operator | Hedera's Asset Tokenization Studio web app | browser wallet (MetaMask) | ATS equity `GWR-WHE`, `0.0.10508257` |
| **Lend against it** | farmer | this app | browser wallet | a loan from `GodaamVault` |

**The link predates the token.** `WarehouseReceipt.ReceiptData` has carried `atsTokenId`
and `atsTokenAddress` since the first commit; `.env` now holds the real values. The EVM
collateral record was designed to reference an ATS asset from the outset.

**Why not issue from a server route.** The ATS SDK's `SupportedWallets` offers only
METAMASK, HWALLETCONNECT, DFNS, FIREBLOCKS and AWSKMS — there is no headless operator-key
signer, so a server route cannot sign an issuance however it is written. A production
deployment would use a custodial signer (DFNS / Fireblocks / AWS KMS).
`scripts/ats-issue-receipt.ts` holds the same configuration in scripted form and
typechecks against the SDK; only the signing path is unavailable.

That constraint turns out to match the domain. Issuing a warehouse receipt is a one-time
act by a licensed operator against physical grain in a certified warehouse — it is
*supposed* to involve a deliberate human signature, not a server loop. A farmer opening a
loan never issues anything; they pledge a receipt that already exists.

### Two compliance gates, on two assets

Easy to conflate, so stated explicitly:

| | ATS equity `GWR-WHE` | `WarehouseReceipt` (EVM) |
| --- | --- | --- |
| Gate | approval list, `isWhiteList: true` | `grantKyc`, World-ID-gated |
| Administered by | the token issuer, through ATS | this protocol, on a verified nullifier |
| Internal KYC | **deactivated** | n/a |
| Evidence | allowlist enforced inside the diamond on every mint and transfer | four live reverts on Hedera testnet |

**A World ID verification does not place anyone on the ATS approval list.** It unlocks
`WarehouseReceipt.grantKyc`, which is what the vault lends against.

ATS internal KYC is deactivated because satisfying it is not an administrative action:
`GrantKycCommandHandler` runs the supplied file through `Terminal3Vc.vcFromBase64` and
`verifyVc`, and throws `InvalidVc` unless it is a cryptographically signed W3C Verifiable
Credential bound to the target address and that security. That requires a credential
issuer — a KYC-provider integration, not a UI toggle, and nothing in the interface
indicates it. Compliance is enforced by the allowlist instead, which fails closed.

### Adapter status

The vault operates on `WarehouseReceipt`, not on the ATS token. The six call sites are
mapped and the adapter designed in
[docs/ats-adapter-plan.md](docs/ats-adapter-plan.md); it is deferred because redeploying
forfeits five `exact_match` verifications.

### Chainlink — Best Confidential Workflow
- `handlerInTee` registered with `{ confidential: true }` in
  [workflows/risk-scoring/main.ts](workflows/risk-scoring/main.ts)
- Sensitive inputs inside the enclave: land record reference, yield history, repayment history
- Load-bearing: `GodaamVault.onReport` is the **only** path that can disburse a loan, and the
  LTV band it enforces comes from the TEE
- Evidence: **both fixtures simulated end to end** in a TEE-requested execution (AWS
  Nitro, us-west-2) — good farmer **893, approved, 22000bps, 880 gUSDC**; risky farmer
  **271, declined**. Transcript in
  [docs/cre-simulation-run.txt](docs/cre-simulation-run.txt)
- **The confidential fetch declares its own provenance.** The land-tenure tier is
  fetched from inside the enclave; when that endpoint is unreachable the score drops to
  873, `bureauSource` reports `unavailable`, and the enclave logs a warning. The same
  fixture run both ways is in
  [docs/cre-bureau-provenance.txt](docs/cre-bureau-provenance.txt). Note it still
  approves — what changes is that the degradation is declared, not hidden
- **Not yet live onchain.** `CRE_TRIGGER_URL` is deliberately unset: the simulator's
  `--listen` mode returns `Content-Length: 0`, so wiring it would turn a broken pipe
  into a fake decline. A real trigger needs a deployed workflow and **deploy access is
  requested and pending**. Until then `demo-lifecycle.ts` uses a hand-encoded report and
  prints `LTV decided by: hand-encoded fallback` on screen, so the 130% LTV is never
  passed off as a TEE output
- Integration feedback: [docs/chainlink-feedback.md](docs/chainlink-feedback.md)
- The private bureau lookup goes through `ConfidentialHTTPClient`, so the land record
  reference never transits the public network. See
  [docs/cre-integration-notes.md](docs/cre-integration-notes.md) for the SDK gotchas and
  the one unresolved architectural constraint (CRE has no Hedera chain selector)

### Extra credit

- **Oracle integration for NAV** — [`contracts/CollateralNavOracle.sol`](contracts/CollateralNavOracle.sol)
  reads a Chainlink price feed on Hedera testnet with a staleness threshold, and reports
  the provenance of every component. **Chainlink publishes no agricultural feed on
  Hedera** — the seven available are HBAR, USDC, ETH, BTC, LINK, DAI and USDT against USD
  — so the crop appraisal is operator-administered and the feed supplies the settlement
  currency reference only. `navOf` returns `cropSource` and `referenceSource` separately
  so the two can never be confused, and a stale answer degrades to `None` rather than
  being reported as current. Eight tests cover the degradation paths
- **Upstream contribution** — two reproducible first-install bugs in
  `hashgraph/asset-tokenization-studio`, written up in
  [docs/upstream-ats-issue.md](docs/upstream-ats-issue.md): an `HH19` error that masks an
  `ERR_REQUIRE_ESM` from `did-jwt → @scure/base@2`, and a `prepare` hook invoking
  `hardhat` before `node_modules` exists

### World — Selfie Check
- Gate, not a checkmark: `WarehouseReceipt.grantKyc` reverts with
  `WorldIdVerificationRequired` unless the nullifier is onchain, so no verification means no
  collateral, which means no loan
- **What Selfie Check does and does not give you.** It is a medium-assurance biometric
  credential — device-camera liveness and facial similarity. It binds a collateral claim
  to a liveness-verified person and makes repeated claims materially harder. It is **not**
  a strict one-person-one-account guarantee; that requires Orb, which is unavailable to
  Indian users (Orb services paused in India since 2023, and the Document credential does
  not support Indian documents). What *is* strictly enforced, onchain, is one claim per
  identity per action: the nullifier is recorded in `WorldIdRegistry` and a second address
  presenting the same one is refused
- **The accepted credential is a policy decision, not an architectural one.** The contracts
  are credential-agnostic: they record and check a nullifier and never inspect which
  credential produced it. The accepted set is one line —
  `ACCEPTED_VERIFICATION_LEVELS` in [lib/worldid-policy.ts](lib/worldid-policy.ts).
  `device` is rejected: a phone is not a person, and one human can hold many
- Reaching Selfie Check required enabling World ID 4.0: every IDKit preset goes through
  `IDKit.request`, whose `rp_context` is required and must be signed by the Relying Party
  key server-side. That signing route is [app/api/rp-signature](app/api/rp-signature/route.ts);
  the key never carries a `NEXT_PUBLIC_` prefix. Written up as Finding 1 in
  [docs/world-feedback.md](docs/world-feedback.md)
- The credential check is an allowlist, not a blocklist: `lib/worldid-policy.ts` asserts the
  level against an explicit set and rejects everything else, so a future credential cannot
  satisfy the gate by default
- **Status, plainly:** the gate is enforced onchain and proven — an unverified address is
  refused at all four downstream points on live Hedera testnet
  (`WorldIdVerificationRequired`, `NotVerified`, `KycRequired`; see
  [docs/evidence/](docs/evidence/)). The full World ID request path is built against
  IDKit 4.2.x with a server-signed `rp_context`. **Selfie Check itself is access-gated**:
  it is a Beta credential that World enables per app on request, and that request is
  pending. Until it lands, a proof cannot be completed. See
  [docs/worldid-selfiecheck-runbook.md](docs/worldid-selfiecheck-runbook.md) for the exact
  steps once it does, and Finding 7 in [docs/world-feedback.md](docs/world-feedback.md)
- Nullifier reuse across addresses is rejected (`NullifierAlreadyUsed`)
- Integration feedback: [docs/world-feedback.md](docs/world-feedback.md)

## Demo recordings

| Clip | Command |
| --- | --- |
| World ID gating | `npm run dev` → /verify, then try /tokenize while unverified |
| Hedera lifecycle | `CRE_LIVE=true npm run demo:lifecycle` (falls back to a hand-encoded report, and says so, when `CRE_LIVE` is unset) |
| CRE confidential workflow | `npm run cre:verify`, then `npm run cre:simulate` |
| Default → liquidation | `npm run demo:liquidation` |
