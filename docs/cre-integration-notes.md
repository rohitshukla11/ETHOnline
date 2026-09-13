# Chainlink CRE integration notes

Written against `@chainlink/cre-sdk` **1.20.1** and `cre` CLI **v1.33.0**, September 2026.
The SDK is shipping roughly twice a week and the published README is out of date in several
places, so everything below was read out of the installed `.d.ts` files or observed from the
compiler, not inferred.

## Toolchain

The workflow does **not** run on Node. It compiles to WASM through Javy (QuickJS), so
`node:fs`, `node:crypto`, `node:http` and friends are unavailable inside a workflow — the
SDK ships `restricted-node-modules.d.ts` which types every export of those modules as
`never` so misuse fails at the call site.

```bash
curl -fsSL https://bun.sh/install | bash     # Bun >= 1.2.21
# cre CLI (a Go binary, separate repo: smartcontractkit/cre-cli)
#   https://docs.chain.link/cre/getting-started/cli-installation
bun --cwd workflows/risk-scoring install
```

### Do not pin `@chainlink/cre-sdk@1.21.0`

1.21.0 is a **broken publish**. Its manifest declares:

```json
"@chainlink/cre-sdk-javy-plugin": "workspace:*"
```

`workspace:*` only resolves inside Chainlink's own monorepo, so installing 1.21.0 anywhere
else fails:

```
error: Workspace dependency "@chainlink/cre-sdk-javy-plugin" not found
error: @chainlink/cre-sdk-javy-plugin@workspace:* failed to resolve
```

1.20.1 pins the same dependency properly to `1.7.0` and installs cleanly. We are on 1.20.1
for that reason. Re-check when 1.22.0 lands.

## API differences from the README and from older releases

### `handlerInTee` is a standalone export, not a `cre.handler` option

The pre-1.x shape — `cre.handler(trigger, fn, { confidential: true })` — is gone.

```ts
import { handlerInTee } from '@chainlink/cre-sdk'

handlerInTee(http.trigger({}), assessInTee, [{ tee: 'nitro', regions: ['us-west-2'] }])
```

The third argument is a `TeeConstraint`. As of 1.20.1 the only `tee` value is `'nitro'` and
the only region is `'us-west-2'` (`REGIONS` / `NITRO_REGIONS` are exported and both are
single-element tuples).

### `TeeRuntime` is not a `Runtime`, and has no `runInNodeMode`

This is the most consequential difference. Inside `handlerInTee` the runtime is
`TeeRuntime<C>`, which extends `BaseRuntime` and deliberately omits `runInNodeMode` and
`report`:

```
Type 'TeeRuntime<...>' is missing the following properties from type 'Runtime<unknown>':
  runInNodeMode, report
```

`TeeRuntime` offers `reportFromDon()` and `usingTheDons()` instead. **Anything reached
through `usingTheDons()` is routed out of the enclave**, so it is not a drop-in replacement
when the data is sensitive — using it for the land-record lookup would have leaked exactly
the field the TEE exists to protect.

The practical consequence: a `runInNodeMode`-based fix for the old `NaN` scoring bug does
not compile in a TEE handler at all. The correct fix is to fetch through
`ConfidentialHTTPClient` and keep the arithmetic on a plain resolved number — see
`scoring.ts`, which takes `bureauTier: number` as a parameter precisely so the unresolved-
Promise mistake cannot reappear.

Note the SDK's own README still shows `await runtime.runInNodeMode(fn, agg)()` with no
`.result()`. The types say `runInNodeMode(...)` returns `(...args) => { result(): T }` —
synchronous, no `await`. Trust the types.

### `ConfidentialHTTPRequestJson` is a wrapper

The request nests under `request`. A flat object silently types every key as `never`:

```
Type 'string' is not assignable to type 'never'.   // on url, method, timeout
```

```ts
client.sendRequest(runtime as unknown as Runtime<Config>, {
  request: httpRequest({ url, method: 'GET', timeout: '5s' }),
  // vaultDonSecrets?: SecretIdentifierJson[]  — inject an API key from the vault DON
})
```

Two further traps in that call:

- `timeout` is a `DurationJson`, which is a **string** (`'5s'`), not `{ seconds: 5 }`.
- `sendRequest` declares its first parameter as `Runtime<unknown>`, which `TeeRuntime` does
  not satisfy (see above). The call only ever touches `callCapability`, which is on
  `BaseRuntime` and present on both, so the cast is safe — but without it the confidential
  HTTP capability is unusable from the one place it is designed for. This looks like an SDK
  typing bug worth reporting upstream.

### `cre-compile` does not typecheck

The bare `cre-compile` binary bundles and emits WASM **even with type errors present**. We
shipped a clean WASM build twice before `tsc --noEmit` revealed three real errors. Run the
typecheck separately:

```bash
npm run cre:typecheck    # tsc --noEmit
npm run cre:build        # cre-compile
```

(`cre workflow simulate` does typecheck during its own compile step — it has a
`--skip-type-checks` flag to opt out — but the standalone binary does not.)

### Simulation requires an account

`cre workflow simulate` validates credentials against Chainlink's servers before it does
anything local. There is no offline mode. Set `CRE_API_KEY` (from app.chain.link → Account
Settings) or run `cre login`.

## Open constraint: CRE has no Hedera chain selector

`EVMClient.SUPPORTED_CHAIN_SELECTORS` has 63 entries in 1.20.1. Hedera is not among them —
a case-insensitive search for `hedera` or `hashgraph` in
`generated-sdk/capabilities/blockchain/evm/v1alpha/client_sdk_gen.d.ts` returns zero hits.

So `evm.writeReport(...)` **cannot target `GodaamVault` on Hedera testnet**, and the
original design — workflow signs a report and writes it straight to the vault — is not
currently buildable.

What we do instead: the enclave produces the DON-signed report and returns it from the
handler; the app relays it to `GodaamVault.onReport` through the CRE forwarder. The vault's
`onlyForwarder` and `workflowOwner` checks are unchanged, so the security property that
matters — **only a signed TEE report can move money** — still holds. What weakens is the
"CRE writes directly to the vault" claim, and it is worth saying so plainly rather than
letting a judge discover it.

Three ways out, in rough order of cost:

1. **Wait for a Hedera selector.** One line changes (`evm.writeReport` replaces the relay).
   Not something to bet a submission deadline on.
2. **Relay through the forwarder, as now.** Honest, works today, one extra hop.
3. **Move the vault to a CRE-supported chain.** Direct `writeReport` works, but the receipt
   and its ATS token stay on Hedera, so the protocol spans two chains and the Hedera track
   story gets more complicated, not less.

We are on (2) and the code comment in `main.ts` says exactly where to swap in (1).
