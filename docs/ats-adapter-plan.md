# Making the vault operate on the ATS token

`GodaamVault` escrows, freezes, force-transfers and redeems **`WarehouseReceipt`**, our
own ERC-721 collateral record. It does not operate on the ATS security token
[`GWR-WHE` / `0.0.10508257`](deployments.md).

This is a deferral with a price attached, not an omission. The mapping below is complete;
what is missing is the redeployment, and the cost of that is stated at the end.

## The six call sites

Every interaction the vault has with its collateral, and the ATS equivalent:

| # | `GodaamVault` | Line | ATS / ERC-1400 equivalent | Fit |
| --- | --- | --- | --- | --- |
| 1 | `receipts.ownerOf(receiptId)` | 156 | `Security.getBalanceOf(securityId, holder)` → `> 0` | **Shape change.** ERC-1400 is fungible; ownership becomes a balance check |
| 2 | `receipts.appraisedValueOf(receiptId)` | 159 | **none** | **The exception.** See below |
| 3 | `receipts.safeTransferFrom(farmer, vault, id)` | 182 | `Security.transfer` (holder-signed) or `controllerTransfer` (issuer-forced) | Direct |
| 4 | `receipts.setTokenFrozen(id, true/false)` | 183, 312, 343 | `Security.freeze` / partial freeze on the holder's balance | **Shape change.** Freezing is per-holder-balance, not per-token-id |
| 5 | `receipts.forcedTransfer(id, treasury, reason)` | 342 | `Security.controllerTransfer` | Direct. ERC-1400 controller semantics are what this was modelled on |
| 6 | `receipts.controllerRedeem(id, reason)` | 350 | `Security.redeem` | Direct |

Four map cleanly. Two need thought, and one has no counterpart at all.

### `appraisedValueOf` — the documented exception

ATS has no appraisal field, and should not. A security token records ownership and
compliance state; it is not a valuation oracle. The appraisal is a mutable off-chain
judgement about a physical commodity whose price moves daily, while the token's quantity
is fixed at issuance.

So this stays in local metadata. [`CollateralNavOracle`](../contracts/CollateralNavOracle.sol)
already holds it, keyed by receipt id, with the provenance of each component reported
alongside the value.

### The fungibility gap

`WarehouseReceipt` is one NFT per receipt. `GWR-WHE` is 42,000 fungible units where one
unit is one kilogram. That is the right modelling for grain — it is a commodity, not a
unique object — but it means "the vault holds receipt #1" becomes "the vault holds 42,000
units of the security issued against lot #1".

Consequences:

- **Partial collateral becomes expressible.** A farmer could pledge 20,000 kg and keep
  the rest. The current vault cannot represent that.
- **One token per lot is required**, otherwise two farmers' grain is indistinguishable in
  a shared balance. That matches the current design: one ATS equity per receipt.
- **`activeLoanOfReceipt` needs rethinking.** Keyed on a token id today; it would key on
  `(securityAddress, holder)` and track a pledged amount rather than a boolean.

## The design: `IGodaamCollateral`

An adapter, not a vault rewrite. The vault's constructor takes an interface instead of a
concrete `WarehouseReceipt`, and the rest of the vault is untouched.

```solidity
interface IGodaamCollateral {
    function isHeldBy(uint256 lotId, address holder) external view returns (bool);
    function appraisedValueOf(uint256 lotId) external view returns (uint256);
    function escrow(uint256 lotId, address from, address to) external;
    function setFrozen(uint256 lotId, address holder, bool frozen) external;
    function forceTransfer(uint256 lotId, address from, address to, string calldata reason) external;
    function redeem(uint256 lotId, address from, string calldata reason) external;
}
```

Two implementations:

- **`WarehouseReceiptCollateral`** — wraps the existing ERC-721. Behaviour identical to
  today, so the deployed lifecycle and all its evidence stay valid.
- **`AtsEquityCollateral`** — wraps an ATS diamond. Holds `securityAddress` per lot,
  translates `lotId` → balance operations, and calls `controllerTransfer` / `redeem`
  through the diamond's ERC-1400 facets.

The vault needs the constructor type changed and `activeLoanOfReceipt` generalised.
Nothing else.

**The collateral type becomes pluggable**, which is a better architecture than hardcoding
either one. A warehouse receipt, an ATS equity and a bond could all back a loan through
the same vault.

## Why it is deferred

Not "we ran out of time". The specific cost:

1. **Redeploying `GodaamVault` and `WarehouseReceipt` forfeits five `exact_match`
   Sourcify verifications.** Verification is a scored item on the Hedera bounty. The
   current deployment is verified, wired, and backed by four live revert proofs plus a
   full lifecycle run. That evidence is not transferable to a new address.
2. **The adapter needs the ATS controller role wired to the vault contract**, not to an
   EOA. Granting `_CONTROLLER_ROLE` to a contract address and having it call through the
   diamond is untested here and is where the remaining risk sits.
3. **2–4 hours**, against a demo video that is itself a hard qualification requirement
   and cannot be partially credited.

The bounty asks to "issue **or** manage" a tokenized asset. Issuance is done, with a real
ERC-1400 security token, an allowlist that fails closed, and controller powers enabled.
The adapter would upgrade that to "issue **and** manage". Trading a hard requirement for
a strengthened one is a bad trade.

## What would be done first, given another session

1. `IGodaamCollateral` + `WarehouseReceiptCollateral`, with the existing test suite
   passing against the adapter. **No redeployment yet** — this proves the abstraction
   holds before anything is risked.
2. `AtsEquityCollateral` against the live diamond, exercising `controllerTransfer`
   read-only first.
3. Grant `_CONTROLLER_ROLE` to the adapter and run one forced transfer on testnet.
4. Only then redeploy the vault and re-verify.

Steps 1–3 are safe and reversible. Step 4 is the one that spends the verifications.
