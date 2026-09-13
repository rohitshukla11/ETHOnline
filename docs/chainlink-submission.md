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

### 2. Hedera is in the chain-selector registry but not in the EVM capability's write list

This is why the workflow does not call `writeReport` itself. SDK 1.20.1 ships **two
different lists**:

| List | Entries | Hedera testnet |
| --- | --- | --- |
| `dist/generated/chain-selectors/testnet/evm/` — what `getNetwork()` resolves | 320 | **present** — chainId 296, selector `222782988166878823` |
| `EVMClient.SUPPORTED_CHAIN_SELECTORS` — what the EVM capability can write to | 63 | **absent** |

So this succeeds:

```ts
getNetwork({ chainFamily: 'evm', chainSelectorName: 'hedera-testnet' })
```

and this cannot be constructed for Hedera, because `SUPPORTED_CHAIN_SELECTORS` is a typed
union that does not contain it:

```ts
new EVMClient(network.chainSelector.selector)
```

The DON-signed report is therefore returned to the caller and relayed to
`GodaamVault.onReport` through the CRE forwarder. The forwarder and `workflowOwner` checks
on the vault are unmodified.

### 3. The unused Sepolia RPC entry is the documented shape

[`project.yaml`](../project.yaml) declares an `ethereum-testnet-sepolia` RPC that the
workflow never connects to. That is what the official template does too:
`automated-liquidation-protection/project.yaml` declares the same Sepolia RPC and that
workflow performs no chain writes at all. The CRE CLI requires at least one RPC per
target and rejects both `rpcs: []` and an absent key.

---

## What is not claimed

- **No live deployed trigger.** Execution is demonstrated by CRE CLI simulation, which
  the qualification criteria accept ("a simulation using the CRE CLI **or** a live
  deployment"). Deploy access is pending.
- **The LTV in the on-camera lifecycle run is hand-encoded and the output says so.** The
  TEE computes the band in simulation; the demo script does not call the workflow. That
  line is labelled on screen rather than presented as an enclave output.
