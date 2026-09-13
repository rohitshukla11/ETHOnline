# Deploying Godaam to Vercel

The repo is ready: `master` builds cold (`rm -rf .next node_modules && npm ci &&
npm run build`) with exit 0, Node is pinned to `20.x`, and nothing in the app imports
`hardhat.config.ts`, `artifacts/` or `typechain-types/`.

What is left needs a Vercel account, which this environment does not have.

---

## 1. Environment variables

Set these for **Production and Preview**. Names only below — paste values from your local
`.env`, which is gitignored and must stay that way.

### Public — compiled into the browser bundle (9)

```
NEXT_PUBLIC_WORLD_APP_ID
NEXT_PUBLIC_WORLD_ACTION
NEXT_PUBLIC_WORLD_RP_ID
NEXT_PUBLIC_WORLD_ID_REGISTRY
NEXT_PUBLIC_WAREHOUSE_RECEIPT
NEXT_PUBLIC_GODAAM_VAULT
NEXT_PUBLIC_MOCK_USDC
NEXT_PUBLIC_HEDERA_RPC
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
```

If any of the four address variables is missing, `lib/contracts.ts` falls back to
`0x0000…0000` and the app silently reads an empty contract. It will not error; it will
just render nothing. This is the most likely cause of a "deployed but blank" page.

### Server-only (2, plus 1 optional)

```
WORLD_SIGNING_KEY               # mints the signed rp_context
WORLD_ATTESTOR_PRIVATE_KEY      # hot wallet - see the README limitation
WORLD_API_BASE                  # optional; defaults to https://developer.worldcoin.org
```

**Neither may ever carry a `NEXT_PUBLIC_` prefix.** That prefix compiles the value into
the browser bundle.

### Do NOT set

| Variable | Why not |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | Local deploy scripts only. It has no reader in `app/`. |
| `HEDERA_OPERATOR_KEY` | A second private key, and see below. |
| `ATS_FACTORY_ADDRESS` | Gates the same branch as the key above. |
| `CRE_LIVE` | See below. Setting it to `true` would mislabel a simulated score. |
| `CRE_TRIGGER_URL`, `CRE_TRIGGER_API_KEY` | Deploy access still pending. |
| `HEDERA_*`, `ATS_TOKEN_*`, `ATS_RESOLVER_ADDRESS`, `WORLD_ATTESTOR_ADDRESS`, `CRE_*` | Read only by `scripts/` and `hardhat.config.ts`. |

#### Why `HEDERA_OPERATOR_KEY` and `ATS_FACTORY_ADDRESS` stay off

`app/api/receipts/issue/route.ts` guards its ATS branch on both being present:

```ts
if (process.env.ATS_FACTORY_ADDRESS && process.env.HEDERA_OPERATOR_KEY) {
  const ats = await import("@/scripts/ats-issue-receipt");
```

That branch calls the Asset Tokenization Studio SDK, which needs `SupportedWallets` - a
browser wallet - and cannot sign headlessly inside a serverless function. Setting these
two would put a second hot private key in the environment to enable a path that fails at
runtime. With both unset the guard is false, the branch is skipped, and the route still
issues the EVM `WarehouseReceipt` record, which is what the vault actually lends against.

#### Why `CRE_LIVE` stays off

`app/api/cre/assess/route.ts` sets

```ts
mode: process.env.CRE_LIVE === "true" ? "cre-live" : "cre-simulation"
```

and `mode` drives the red `LTV decided by:` provenance line in the UI. Setting it to
`true` without a working `CRE_TRIGGER_URL` would label a simulated score as a live TEE
output - the exact false-provenance failure the design exists to prevent.

---

## 2. Project settings

- Framework preset: **Next.js**
- Production branch: **master**
- Node version: leave it to `engines.node` (`20.x`) in `package.json`
- Build command, output directory, install command: **defaults**

Do not add a `vercel.json`. The Next.js preset handles this project as-is.

---

## 3. After the first deploy

Run these in order. Each has a failure mode that passes locally.

1. **All four pages load** - `/`, `/verify`, `/tokenize`, `/loan`.

2. **Contract reads return real data.** Open `/loan` and confirm the footer contract
   links point at the real addresses rather than `0x0000…0000`. If they are zeroed, a
   `NEXT_PUBLIC_*` address variable is missing.

3. **Wallet connect works on the deployed domain.** WalletConnect project ids are
   domain-scoped; this passes locally and fails live. If it fails, add the Vercel domain
   in the WalletConnect (Reown) dashboard.

4. **World ID against the deployed origin.** POST an invalid proof:

   ```bash
   curl -s -X POST https://<your-app>.vercel.app/api/worldid/verify \
     -H 'Content-Type: application/json' \
     -d '{"address":"0x0000000000000000000000000000000000000001","worldIdResult":{}}'
   ```

   A World-side rejection means the origin is accepted. A domain or origin error means
   the app is restricted in the Developer Portal - add the Vercel URL there.

   Note: `/api/rp-signature` currently returns **503** naming
   `NEXT_PUBLIC_WORLD_RP_ID` and `WORLD_SIGNING_KEY` until Selfie Check access lands.
   That is the designed behaviour, not a deployment fault - the route refuses rather
   than minting an unsigned request.

5. **RPC under serverless.** Hashio rate-limits hard and every page does polled contract
   reads on a 5s interval. If reads start failing under load, switch
   `NEXT_PUBLIC_HEDERA_RPC` to a managed provider endpoint.

---

## 4. Verifying the build before spending a deploy

`rm -rf .next node_modules && npm ci && npm run build` is **not sufficient**. It keeps
`artifacts/` and `typechain-types/`, which are gitignored and therefore absent on a CI
checkout. That gap is what broke the first Vercel deploy: `next build` typechecks
everything in `tsconfig.json`'s `include`, which covered `scripts/`, and
`scripts/demo-lifecycle.ts` only typechecks when `typechain-types/` exists.

```
./scripts/demo-lifecycle.ts:197:8
Type error: Parameter 'l' implicitly has an 'any' type.
```

Green locally, red on Vercel, every time.

The check that actually reproduces CI is a tracked-files-only checkout:

```bash
rm -rf /tmp/godaam-clean && mkdir -p /tmp/godaam-clean
git ls-files -z | tar --null -T - -cf - | (cd /tmp/godaam-clean && tar xf -)
cd /tmp/godaam-clean && npm ci && npm run build
```

No `node_modules`, no `.next`, no `artifacts/`, no `typechain-types/`, no `.env` — the
same inputs Vercel gets. Run this before any deploy that matters.

**The fix in place:** `tsconfig.json` excludes `scripts` and `test`, so the Next build
typechecks the Next app. Hardhat still typechecks them through
`tsconfig.hardhat.json`, which includes `scripts/**/*.ts`, `test/**/*.ts` and
`typechain-types/**/*.ts` under `strict`. TypeScript still follows imports out of
included files, so `scripts/ats-issue-receipt.ts` stays covered because
`app/api/receipts/issue/route.ts` imports it.

## 5. Node version

The build log warns:

```
Error: Node.js version 20.x is deprecated. Deployments created on or after 2026-10-01
will fail to build. Please set "engines": { "node": "24.x" }
```

This is a **warning, not the failure** — the build proceeded past it. `engines.node` is
pinned to `20.x` to match `.nvmrc` and the version everything here was built and tested
against. Bumping to `24.x` before the submission would ship a runtime nobody has run the
suite on. Revisit after the deadline, before any deploy dated 2026-10-01 or later.

## 6. Risk to watch on the first build

`app/api/receipts/issue/route.ts` dynamically imports `scripts/ats-issue-receipt.ts`,
which pulls in `@hashgraph/asset-tokenization-sdk` and the Hedera SDK. The cold local
build bundles this fine, but Vercel caps a serverless function at 50 MB compressed. If
the deploy fails on function size, that import is the cause.

---

## 7. Wiring the URL back in

Once the deploy is live, replace the **Live app** line at the top of `README.md`. The
footer chain line in `components/SiteFooter.tsx` already reads its contract links from
the `NEXT_PUBLIC_*` addresses, so it points at the deployed contracts automatically - no
change needed there.
