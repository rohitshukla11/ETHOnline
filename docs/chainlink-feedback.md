# Chainlink CRE integration feedback

From building a TEE-only Confidential Workflow for ETHOnline 2026. Written as
finding → evidence → suggested fix. Environment: `cre` CLI v1.33.0,
`@chainlink/cre-sdk` 1.20.1, org `org_tEeUdpZM8kGDCj78`.

---

## Finding 1 — a workflow that touches no chain still cannot simulate without one

**The behaviour.** `cre workflow simulate` refuses to start unless `project.yaml`
declares at least one RPC, even when the workflow makes no chain calls at all.

Godaam's workflow uses exactly two capabilities: an HTTP trigger and
`ConfidentialHTTPClient`. There is no `EVMClient`, no `writeReport`, no chain access of
any kind. The DON-signed report is returned to the caller, which relays it onchain
separately.

**Evidence.** With `rpcs: []`:

```
✗ no RPC URLs found for target "staging-settings"

To fix:
  • Check that your project.yaml has an 'rpcs' section under the target "staging-settings"
  • Ensure chain names are valid (run 'cre workflow supported-chains' to see all supported names)
  • Verify the correct target is selected via --target or CRE_TARGET
```

Omitting the `rpcs` key entirely produces the identical error, so an empty list and an
absent key are not distinguished.

**The workaround** we shipped, in `project.yaml`:

```yaml
staging-settings:
  rpcs:
    - chain-name: ethereum-testnet-sepolia
      url: https://ethereum-sepolia-rpc.publicnode.com
```

Sepolia is never contacted. It exists solely to get past the check. The file carries a
comment saying so, because a reviewer finding an Ethereum RPC in a Hedera project would
otherwise reasonably assume confusion rather than a deliberate workaround.

**Why it matters.** Confidential workflows are presumably a supported use case, and a
meaningful subset of them are compute-only: take a private payload, score it, return a
signed result. Those have no chain to configure. Requiring a fabricated one means the
config misrepresents what the workflow does, and anyone reading it has to be told it is
noise.

**Suggested fix:** treat `rpcs: []` as a valid declaration of "this workflow makes no
chain calls" and skip the connectivity check, rather than rejecting it identically to a
missing key. The distinction between "empty" and "absent" is already expressible in
YAML; only the CLI collapses them.

---

## Finding 2 — `reportFromDon` requires `encoderName`, and the error does not say what values are valid

**The behaviour.** Calling `runtime.reportFromDon({ encodedPayload })` without an
`encoderName` fails at DON signing:

```
✗ workflow execution failed: [3]InvalidArgument: unsupported encoder name:
```

Note the trailing colon with nothing after it — the field is empty, which is the actual
problem, but the message reads as though a name was supplied and rejected.

**What it should be.** `evm` or `solana`. Neither appears in the error, and
`ReportRequestJson` types the field as an optional `string`:

```ts
export type ReportRequestJson = {
    encodedPayload?: string;
    encoderName?: string;
    signingAlgo?: string;
    hashingAlgo?: string;
};
```

Optional in the type, required at runtime. We found the valid values by grepping the
shipped SDK for `encoderName:` literals.

**Suggested fix:** list the accepted values in the error (`unsupported encoder name "":
expected one of evm, solana`), and either make the field non-optional in the generated
type or default it.

---

## Finding 3 — `TeeRuntime` cannot use `ConfidentialHTTPClient` without a cast

**The behaviour.** `ClientCapability.sendRequest` declares its runtime parameter as
`Runtime<unknown>`:

```ts
sendRequest<TInput>(runtime: Runtime<unknown>, input: ...): { result: () => HTTPResponse }
```

But inside `handlerInTee` the runtime is `TeeRuntime`, which is deliberately **not** a
`Runtime` — it omits `runInNodeMode` and `report`:

```
Type 'TeeRuntime<...>' is missing the following properties from type 'Runtime<unknown>':
  runInNodeMode, report
```

So the confidential-HTTP capability does not typecheck from inside a TEE handler, which
is the one place it is designed for. We cast:

```ts
client.sendRequest(runtime as unknown as Runtime<Config>, { ... })
```

The call only ever reaches `callCapability`, which lives on `BaseRuntime` and is present
on both, so the cast is safe — but it should not be necessary.

**Suggested fix:** widen the parameter to `BaseRuntime<unknown>`, which is what the
implementation actually needs.

---

## Finding 4 — `ConfidentialHTTPRequestJson` nests the request, and a flat object types as `never`

Passing `{ url, method, timeout }` directly produces:

```
Type 'string' is not assignable to type 'never'.   (on url, method and timeout)
```

The real shape wraps it:

```ts
client.sendRequest(runtime, {
  request: httpRequest({ url, method: 'GET', timeout: '5s' }),
  // vaultDonSecrets?: SecretIdentifierJson[]
})
```

`never` is a hard error to read backwards — it says the key is not allowed, not that it
belongs one level deeper. Two smaller traps in the same call: `timeout` is a
`DurationJson`, which is a **string** (`'5s'`), not `{ seconds: 5 }`; and the exported
alias `ConfidentialHTTPRequestJson` refers to the wrapper, while the inner type is
`HTTPRequestJson`.

**Suggested fix:** one usage example on the confidential-http page showing the nesting
would remove the whole class of confusion.

---

## Finding 5 — `cre-compile` emits WASM without typechecking

`bun x cre-compile main.ts dist/workflow.wasm` exits 0 and produces a valid `.wasm` with
real type errors present. We shipped a "successful" build twice before running
`tsc --noEmit` separately and finding three genuine errors.

`cre workflow simulate` does typecheck during its own compile step and has
`--skip-type-checks` to opt out, so the capability exists — it just is not wired into the
standalone binary.

**Suggested fix:** typecheck by default in `cre-compile` too, with the same
`--skip-type-checks` escape hatch.

---

## Finding 6 — `@chainlink/cre-sdk@1.21.0` is an uninstallable publish

1.21.0 declares a workspace protocol dependency that only resolves inside Chainlink's
monorepo:

```json
"@chainlink/cre-sdk-javy-plugin": "workspace:*"
```

Installing it anywhere else fails outright:

```
error: Workspace dependency "@chainlink/cre-sdk-javy-plugin" not found
error: @chainlink/cre-sdk-javy-plugin@workspace:* failed to resolve
```

1.20.1 pins the same dependency to `1.7.0` and installs cleanly, which is why this
project is on 1.20.1. Worth a publish-time check that no `workspace:` specifier survives
into a published manifest.

---

## An open design question, not a complaint

Our workflow fetches a land-tenure tier over confidential HTTP. When that endpoint is
unreachable the tier defaults, and the score drops by 20 points — but the applicant is
still approved, at the same LTV band.

We made the degradation explicit rather than silent: a `bureauSource: 'live' |
'unavailable'` field travels with the score, and the enclave logs a warning. Evidence in
[cre-bureau-provenance.txt](cre-bureau-provenance.txt).

What we could not find guidance on is whether a confidential workflow **should** be able
to return a decision at all when one of its private inputs failed to load. Declaring the
degradation is the minimum; refusing to score might be the correct default. A documented
pattern for partial-input handling in confidential workflows would be genuinely useful,
because the failure is invisible by default and the number that comes out looks
completely normal.
