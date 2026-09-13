# Godaam

**Confidential agricultural lending vault.** A farmer's grain sitting in a certified
warehouse becomes onchain collateral; a Chainlink CRE Confidential Workflow underwrites the
*farmer* inside a TEE so the protocol can lend more than the grain alone justifies; World ID
ties each claim to a liveness-checked person, and the nullifier makes sure one identity
gets one claim.

ETHGlobal ETHOnline 2026 — Hedera / Chainlink / World tracks.

**Live app: [https://godaam-ten.vercel.app](https://godaam-ten.vercel.app)**

**Demo video:** _to be added — recording pending._

The deployment carries a **seeded demo loan on Hedera testnet**, so the position is real
and inspectable rather than described. Loan #1: **880 gUSDC borrowed against 400 gUSDC of
grain — 220% LTV, risk score 893, 3 of 6 installments paid, 459.53 outstanding.**

Those terms came out of the enclave, not a keyboard. The Confidential Workflow was run
through the CRE CLI and its output submitted verbatim
([`docs/cre-captured-report.json`](docs/cre-captured-report.json)), so the
`privateInputCommitment` recorded onchain,
`0x0ed3c984…71ceb`, is the enclave's own. The app labels it
`CRE simulation (captured)` — not a live trigger, because no DON is deployed.

| Step | Transaction |
| --- | --- |
| Issue receipt #2 | [`0x1cb138a7…125637b`](https://hashscan.io/testnet/transaction/0x1cb138a78f05eef113abe2835df64aed115ce42961c64c6e25111af58125637b) |
| Approve vault | [`0x35c890bc…f3bfa09e`](https://hashscan.io/testnet/transaction/0x35c890bc408f1a2945c16198eb711aec24201223cdc072110d1d302af3bfa09e) |
| Request loan (escrow + freeze) | [`0x49eab2b4…283fed346`](https://hashscan.io/testnet/transaction/0x49eab2b42cb68f121bda8e80665b30cde6e04687870d74b33c086b1283fed346) |
| **CRE report through the forwarder → 880 disbursed** | [`0x7f94390c…5769bbd6`](https://hashscan.io/testnet/transaction/0x7f94390cb21dd9825e29798f5592c95ef1ca9c015a6f9152659c49175769bbd6) |
| Installment 1 | [`0xbb15b680…074682c0a`](https://hashscan.io/testnet/transaction/0xbb15b680b4bb318cfa9a341bd689d74365bb9ecc69260108c8213a2074682c0a) |
| Installment 2 | [`0xf1d6e7c1…523f2657`](https://hashscan.io/testnet/transaction/0xf1d6e7c1758c57ed6ae58e56ee8f45f26946c54cba0ec4ad814c63a4523f2657) |
| Installment 3 | [`0x3d8a8b06…2f496aeb`](https://hashscan.io/testnet/transaction/0x3d8a8b06ba36dfbd2fea38e9a4670f3de6a064d0390b37247e7396ab2f496aeb) |

**The loan belongs to `0x033588A8…3c2C7f0`.** `/loan` filters to the connected wallet, so
another address sees an empty ledger — the position is inspectable on HashScan by anyone,
but only that wallet renders it in the app.

## Contracts

All six Sourcify-verified at `exact_match`. Full configuration, transaction hashes and
verification status in [`docs/deployments.md`](docs/deployments.md).

| Contract | Address (Hedera testnet, chain 296) |
| --- | --- |
| `WorldIdRegistry` | [`0xE3a02179CCa05b438bd157E2E00434d28ec26984`](https://hashscan.io/testnet/contract/0xE3a02179CCa05b438bd157E2E00434d28ec26984) |
| `MockUSDC` | [`0x2CEBEA8360D0c71B78f320F7CdF4D06486ad9DCd`](https://hashscan.io/testnet/contract/0x2CEBEA8360D0c71B78f320F7CdF4D06486ad9DCd) |
| `WarehouseReceipt` | [`0x0F2b3D243BB0e882dE0aB9Ed0b2754e8f473EaD7`](https://hashscan.io/testnet/contract/0x0F2b3D243BB0e882dE0aB9Ed0b2754e8f473EaD7) |
| `GodaamVault` | [`0x63Af372CEAa1d2C8dADF6Ea503c99edB1960d07d`](https://hashscan.io/testnet/contract/0x63Af372CEAa1d2C8dADF6Ea503c99edB1960d07d) |
| `MockCreForwarder` | [`0xaDFc7D556C20908151e8C3C56C65b6F45648C736`](https://hashscan.io/testnet/contract/0xaDFc7D556C20908151e8C3C56C65b6F45648C736) |
| `CollateralNavOracle` | [`0x3f0669a7CAD6243AaC7cc5547B2C72557375B82D`](https://hashscan.io/testnet/contract/0x3f0669a7CAD6243AaC7cc5547B2C72557375B82D) |
| **ATS security token** `GWR-WHE` | [`0.0.10508257`](https://hashscan.io/testnet/contract/0.0.10508257) |

## Bounty submissions

- **Chainlink CRE** — [`docs/chainlink-submission.md`](docs/chainlink-submission.md)
  maps each qualification requirement to its evidence, with file and line references.
  **Underwriting runs for real locally**: `/api/cre/assess` invokes the CRE CLI, scores
  the submitted confidential inputs in the simulator and returns the enclave's actual
  terms. Serverless has no CRE binary, so the deployed instance detects that and links to
  [`/loan/1`](https://godaam-ten.vercel.app/loan/1) — a position already underwritten by
  the enclave — rather than pretending to run one.
  The workflow is [`workflows/risk-scoring/main.ts`](workflows/risk-scoring/main.ts);
  runs are captured in [`docs/cre-simulation-run.txt`](docs/cre-simulation-run.txt) and
  [`docs/cre-bureau-provenance.txt`](docs/cre-bureau-provenance.txt).
- **Hedera** — a real ERC-1400 security token issued through Asset Tokenization Studio,
  `GWR-WHE` / [`0.0.10508257`](https://hashscan.io/testnet/contract/0.0.10508257), plus
  six Sourcify-verified contracts. Addresses, configuration and verification status in
  [`docs/deployments.md`](docs/deployments.md); the costed reason the vault operates on
  `WarehouseReceipt` rather than the ATS token is in
  [`docs/ats-adapter-plan.md`](docs/ats-adapter-plan.md).
- **World** — World ID gates every state change. The registry is
  [`contracts/WorldIdRegistry.sol`](contracts/WorldIdRegistry.sol) (one identity, one
  claim, enforced by nullifier); the v4 request path is
  [`lib/worldid.ts`](lib/worldid.ts). Integration findings in
  [`docs/world-feedback.md`](docs/world-feedback.md).

## Deployment


Everything below runs against **Hedera testnet (chain 296)**. Contract addresses and
Sourcify verification status are in [`docs/deployments.md`](docs/deployments.md).

### Known limitation: the attestor is a hot wallet

The deployed app signs World ID attestations and warehouse-receipt issuance with
`WORLD_ATTESTOR_PRIVATE_KEY`, which lives as a server-side environment variable on the
hosting platform. That is a hot wallet: anyone with access to the deployment environment
can sign as the attestor.

This is bounded rather than safe. The key holds testnet HBAR only, it is refillable from
the public faucet, and it controls no mainnet value — but it is a real key in a
third-party environment, and a production deployment would move attestation behind a KMS
or a threshold signer rather than an environment variable.

`DEPLOYER_PRIVATE_KEY` is **not** set in the hosting environment. It is used only by the
local deploy scripts.

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
- **A CRE workflow broadcast a real transaction to Hedera testnet.**
  [`0xbfa349a7…db51d7c`](https://hashscan.io/testnet/transaction/0xbfa349a752c7a0f1c0c089ca7e7f0961a26e855b2b6f766971d59b083db51d7c)
  was sent by `evmClient.writeReport` from inside the workflow. It reverted: the DON
  calls the Keystone forwarder ABI `report(address,bytes,bytes,bytes[])` (`0x11289565`)
  and `MockCreForwarder` implements `forward(address,bytes,bytes)` (`0xb13ba5de`). A
  one-function gap, costed in
  [docs/chainlink-submission.md](docs/chainlink-submission.md). Execution is demonstrated
  by CRE CLI simulation, which is what the qualification criteria ask for — "a simulation
  using the CRE CLI **or** a live deployment"
- **`CRE_TRIGGER_URL` is deliberately unset.** The simulator's `--listen` mode returns
  `Content-Length: 0`, so wiring it would turn a broken pipe into a fake decline.
  `demo-lifecycle.ts` therefore uses a hand-encoded report and prints
  `LTV decided by: hand-encoded fallback` on screen, so the 130% LTV is never passed off
  as a TEE output
- Integration feedback: [docs/chainlink-feedback.md](docs/chainlink-feedback.md)
- The private bureau lookup goes through `ConfidentialHTTPClient`, so the land record
  reference never transits the public network. See
  [docs/cre-integration-notes.md](docs/cre-integration-notes.md) for the SDK gotchas and
  the chain-selector finding: Hedera **is** in the SDK's selector registry (320 testnet
  EVM networks) and absent only from `EVMClient.SUPPORTED_CHAIN_SELECTORS` (63), which is
  a lookup table rather than a type gate — so the write reached the chain

### Extra credit

- **Oracle integration for NAV** — [`CollateralNavOracle`](contracts/CollateralNavOracle.sol),
  live at [`0x3f0669a7…75B82D`](https://hashscan.io/testnet/contract/0x3f0669a7CAD6243AaC7cc5547B2C72557375B82D)
  on Hedera testnet, Sourcify **Full Match**, reading Chainlink HBAR/USD with a 3-hour
  staleness threshold. Call it yourself — details and both live call outputs in
  [docs/deployments.md](docs/deployments.md)

  **A design decision worth stating outright: the crop price is never oracle-sourced, and
  the contract makes that structural.** Chainlink publishes seven feeds on Hedera testnet
  — HBAR, USDC, ETH, BTC, LINK, DAI, USDT against USD — and none is agricultural. Rather
  than present HBAR/USD as a proxy for wheat, `navOf` returns `cropSource` and
  `referenceSource` as **separate fields**; `cropSource` is hardcoded to `Appraisal` and
  cannot be `ChainlinkFeed`, and a test asserts that so the honesty survives a future
  edit rather than living in a comment someone could delete. A stale feed zeroes the
  answer and reports `None` instead of relabelling an old price — proven on the deployed
  contract, not just against a mock.
- **Upstream contribution** — two reproducible first-install bugs in
  `hashgraph/asset-tokenization-studio`, **filed as
  [hashgraph/asset-tokenization-studio#1406](https://github.com/hashgraph/asset-tokenization-studio/issues/1406)**: an `HH19` error that masks an
  `ERR_REQUIRE_ESM` from `did-jwt → @scure/base@2`, and a `prepare` hook invoking
  `hardhat` before `node_modules` exists. Reproduction and the working install sequence
  are kept in [docs/upstream-ats-issue.md](docs/upstream-ats-issue.md)

### World — Selfie Check
- **Why the accepted-credential set is an allowlist, and why Selfie Check is not in it
  yet.** [`lib/worldid-policy.ts`](lib/worldid-policy.ts) holds one constant,
  `ACCEPTED_VERIFICATION_LEVELS`, and the Verify screen renders its chips from that
  constant rather than from hardcoded labels — so the interface cannot advertise a
  credential the server would reject. The set is `orb` and `document`. Selfie Check is
  absent because the v4 verify response reports the credential in
  `results[].identifier` and the exact string Selfie Check returns is undocumented.
  Guessing it has two failure modes and both are bad: guess wrong and every genuine
  proof is rejected, or widen the set until something passes and the gate stops
  enforcing what it claims. The previous implementation rejected only `device`, which
  fails open on every credential World ships in future; a test asserts the set is
  exactly these two for that reason.
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
  the key never carries a `NEXT_PUBLIC_` prefix. Written up under area 1 in
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
  steps once it does, and the allowlist finding in area 4 of
  [docs/world-feedback.md](docs/world-feedback.md)
- Nullifier reuse across addresses is rejected (`NullifierAlreadyUsed`)
- Integration feedback: [docs/world-feedback.md](docs/world-feedback.md) — structured to
  the four areas the bounty names: Selfie Check docs and integration flow; Developer
  Portal navigation, search, discovery and debugging; Sandbox states, proof flows,
  test users, errors and edge cases; and what was confusing, missing, broken or hard
  to test

## Demo recordings

| Clip | Command |
| --- | --- |
| World ID gating | `npm run dev` → /verify, then try /tokenize while unverified |
| Hedera lifecycle | `CRE_LIVE=true npm run demo:lifecycle` (falls back to a hand-encoded report, and says so, when `CRE_LIVE` is unset) |
| CRE confidential workflow | `npm run cre:verify`, then `npm run cre:simulate` |
| Default → liquidation | `npm run demo:liquidation` |
