# Chainlink CRE — submission mapping

Every qualification requirement, and where it is met. File references are
`path:line` against this commit.

---

## Requirements

| Requirement | Where it is met |
| --- | --- |
| **Uses CRE Confidential Workflows meaningfully** | [`workflows/risk-scoring/main.ts`](../workflows/risk-scoring/main.ts) is a Confidential Workflow end to end: the trigger payload is decrypted inside the enclave, the bureau lookup runs through `ConfidentialHTTPClient`, and only the ABI-encoded decision leaves. |
| **Registers and uses `handlerInTee`** | [`main.ts:210`](../workflows/risk-scoring/main.ts#L210) — `handlerInTee(http.trigger({}), assessInTee, [{ tee: 'nitro', regions: ['us-west-2'] }])`. The handler is `assessInTee`, which receives a `TeeRuntime`, not a `Runtime`. |
| **Processes a sensitive input inside the enclave** | Three private inputs never leave the TEE: the land-record reference, the past-yield series, and the repayment ledger. They arrive on the confidential trigger and are consumed at [`main.ts:139`](../workflows/risk-scoring/main.ts#L139). The land-record reference is used to query the tenure bureau through `ConfidentialHTTPClient` at [`main.ts:66-97`](../workflows/risk-scoring/main.ts#L66-L97) — the capability that keeps the URL, headers and response body invisible to the node operator. |
| **Meaningfully integrated into core functionality** | The confidential score *is* the product. [`scoring.ts:73-78`](../workflows/risk-scoring/scoring.ts#L73-L78) maps the score to an LTV band, and the top band is **220%** — undercollateralised lending. Without the enclave the protocol cannot lend above collateral value, because the data that justifies it cannot be published. This is not a placeholder handler; remove it and the product's central claim disappears. |
| **Successful execution demonstrated** | CRE CLI simulation, both fixtures, captured in [`docs/cre-simulation-run.txt`](cre-simulation-run.txt). Good farmer → **893 / approved / 220% LTV / 880 gUSDC against 400 of grain**. Risky farmer → **271 / declined / zero principal**. The model is asserted independently of the CRE host in [`verify-fixtures.ts`](../workflows/risk-scoring/verify-fixtures.ts) (`expectScore: 893`, `expectScore: 271`). |
| **Evidence provided** | [`cre-simulation-run.txt`](cre-simulation-run.txt) — both fixtures. [`cre-bureau-provenance.txt`](cre-bureau-provenance.txt) — the degraded-source run. Video: shot 6 at **2:20–3:10** (bureau provenance, A/B), shot 7 at **3:10–3:35** (risky farmer declines). |

### The bounty's own example use cases

Two of them describe this submission directly:

- *"Privacy-preserving risk assessment and policy enforcement"* — the enclave assesses
  the borrower and the band it returns enforces the lending policy.
- *"Confidential computation over financial, identity, healthcare, compliance, or other
  sensitive data"* — land tenure records, yield history and repayment history are all
  three of financial, identity and compliance data.

### Provenance is declared, not assumed

The workflow reports where its own inputs came from. `fetchBureauTier` returns
`{ tier, source: 'live' | 'unavailable' }` ([`main.ts:68`](../workflows/risk-scoring/main.ts#L68)),
and `bureauSource` travels in the assessment ([`main.ts:201`](../workflows/risk-scoring/main.ts#L201)).
When the bureau endpoint is unreachable the score drops from 893 to 873 and the run says
so. It still approves — 873 clears the 850 band — and the transcript states that plainly
rather than claiming a refusal. A degraded score that cannot be distinguished from a live
one is the failure this exists to prevent.

---

## Design notes

Three findings from reading the official CRE templates. They explain the architecture,
and each is checkable.

### 1. The two closest official templates also terminate off-chain

`automated-liquidation-protection` is the reference implementation for private risk
thresholds driving an action — the nearest template to this submission. It performs
**zero chain writes**. Its handler returns:

```ts
return JSON.stringify({
  status: "DEFENDED",
  actionCount: actions.length,
  riskScore,
  executionId: asString(defenseResponse.execution_id, "unknown"),
});
```

and it executes its defensive action over HTTP to an exchange API.
`automated-portfolio-rebalancing` is the same shape. Only `ai-audit-firewall` writes
onchain, via `runtime.usingTheDons()` → `donRuntime.report(...)` →
`evmClient.writeReport(...)`.

So a Confidential Workflow whose output is consumed off-chain is the **normal** shape in
the official templates, not a shortfall. Godaam's simulation-driven posture matches the
reference implementations.

### 2. A CRE workflow broadcast a real transaction to Hedera testnet

The integration reaches further than "Hedera isn't supported". It reaches the chain.

**Transaction [`0xbfa349a752c7a0f1c0c089ca7e7f0961a26e855b2b6f766971d59b083db51d7c`](https://hashscan.io/testnet/transaction/0xbfa349a752c7a0f1c0c089ca7e7f0961a26e855b2b6f766971d59b083db51d7c)**
was sent to Hedera testnet by `evmClient.writeReport` from inside the workflow, signed by
the DON, carrying the enclave's decision for loan 1. It is onchain and verifiable.

It **reverted**, and the reason is exact:

| | |
| --- | --- |
| DON called | `report(address,bytes,bytes,bytes[])` — `0x11289565` — the Keystone forwarder ABI |
| `MockCreForwarder` implements | `forward(address,bytes,bytes)` — `0xb13ba5de` |
| Receipt | `status 0x0`, `gasUsed 32366`, `logs 0` — `onReport` never ran |

So the workflow wrote to Hedera and our mock forwarder's interface did not match
Keystone's. That is a one-function gap, not a chain-support gap.

**Getting there took two things worth recording.** Hedera sits in one SDK list and not
the other — `getNetwork()` resolves 320 testnet EVM networks including `hedera-testnet`
(chainId 296, selector `222782988166878823`), while
`EVMClient.SUPPORTED_CHAIN_SELECTORS` has 63 entries and omits it. But that table is a
convenience lookup, **not** a type gate: the constructor is
`constructor(ChainSelector: bigint)`, so `new EVMClient(222782988166878823n)` compiles and
runs. Declaring Hedera through `experimental-chains` in [`project.yaml`](../project.yaml)
makes the simulator accept it — `Added experimental chain (chain-selector:
222782988166878823)` — and `--broadcast` puts the transaction on chain.

Full transcript, receipt and calldata analysis: [`cre-end-to-end.txt`](cre-end-to-end.txt).

#### Why it stops here — the cost, stated

Closing the last inch needs `MockCreForwarder` to implement
`report(address,bytes,bytes,bytes[])`, unpack `rawReport` and `reportContext`, and call
`receiver.onReport` with metadata in the layout the vault parses
(`[32B workflowId][10B workflowName][20B workflowOwner][2B reportId]`). That costs:

1. **A redeploy, which forfeits `MockCreForwarder`'s Sourcify `exact_match`.** Contract
   verification is a scored item.
2. **A possible second revert.** If the DON's `reportContext` does not carry an owner in
   that layout, the call reaches `GodaamVault.onReport` and fails the `workflowOwner`
   check instead. The redeploy might buy nothing.
3. **~40 minutes**, against a demo video that is a hard qualification requirement.

Deferred deliberately, not for lack of time — the attempt above took 8 minutes of a
45-minute budget. The risk sits entirely in item 2, which is why it is worth doing after
the video exists rather than before. This is the same shape of decision as
[`ats-adapter-plan.md`](ats-adapter-plan.md): costed, not omitted.

In the meantime the DON-signed report is returned to the caller and relayed to
`GodaamVault.onReport` through the forwarder by the application. The `onlyForwarder` and
`workflowOwner` checks on the vault are unmodified — no guard was relaxed to make
anything validate.

### 3. The unused Sepolia RPC entry is the documented shape

[`project.yaml`](../project.yaml) declares an `ethereum-testnet-sepolia` RPC that the
workflow never connects to. That is what the official template does too:
`automated-liquidation-protection/project.yaml` declares the same Sepolia RPC and that
workflow performs no chain writes at all. The CRE CLI requires at least one RPC per
target and rejects both `rpcs: []` and an absent key.

---

## What is not claimed

- **No live deployed trigger.** Execution is demonstrated by CRE CLI simulation. That is
  what the qualification criteria ask for — "a simulation using the CRE CLI **or** a live
  deployment" — so this is the bar met, not a shortfall against it.
- **No CRE secrets.** `TeeRuntime` exposes `getSecret`, but values live in a Vault DON
  provisioned against an owner address, and `cre workflow simulate` has no secrets flag.
  It was attempted and reverted rather than left half-wired; see
  [`chainlink-feedback.md`](chainlink-feedback.md) §9.
- **`writeOnchain` defaults to `false`.** The onchain write path exists in the workflow
  and is exercised in [`cre-end-to-end.txt`](cre-end-to-end.txt), but the default
  simulation path does not broadcast.
- **The LTV in the on-camera lifecycle run is hand-encoded and the output says so.** The
  TEE computes the band in simulation; the demo script does not call the workflow. That
  line is labelled on screen rather than presented as an enclave output.
