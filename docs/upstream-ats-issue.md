# Upstream issue for `hashgraph/asset-tokenization-studio`

**Status: written, not yet filed.** Filing needs a GitHub account — paste the body below
at https://github.com/hashgraph/asset-tokenization-studio/issues/new, then replace this
note and the README link with the issue URL.

Both bugs reproduce from a clean clone on Node 20.17.0 / npm 10.8.2 / macOS arm64, and
together they stop `npm install` before a single file compiles.

---

## Title

`npm install` fails on a clean clone: `prepare` hook runs `hardhat compile` before deps exist, and HH19 masks an `ERR_REQUIRE_ESM` from `did-jwt → @scure/base@2`

## Body

### Reproduction

```bash
git clone --depth 1 https://github.com/hashgraph/asset-tokenization-studio
cd asset-tokenization-studio
npm install
```

Result:

```
npm error code 1
npm error path .../packages/ats/contracts
npm error command sh -c npx hardhat compile
npm error Error HH19: Your project is an ESM project (you have "type": "module" set in
npm error your package.json) but your Hardhat config file uses the .js extension.
npm error
npm error Rename the file to use the .cjs to fix this problem.
```

`node_modules` is left empty. Environment: Node 20.17.0, npm 10.8.2, macOS 15.5 arm64.

### Problem 1 — the HH19 message is wrong, and it sends you the wrong way

Two things it asserts are both false for this repo:

- `packages/ats/contracts/package.json` has `"type": "commonjs"`, not `"module"`
- the config is `hardhat.config.ts`, not `.js` — there is no `.js` config anywhere

Following the instruction (rename the config to `.cjs`) cannot help, because neither
stated condition holds. The real cause only appears with `--show-stack-traces`:

```
Caused by: Error [ERR_REQUIRE_ESM]: require() of ES Module
  node_modules/did-jwt/node_modules/@scure/base/index.js
  from node_modules/did-jwt/lib/index.cjs not supported.
```

`did-jwt@8.0.18` depends on `@scure/base@^2.0.0`, which is ESM-only, and requires it
from a CommonJS entry point. Hardhat catches the failure while loading the config and
re-reports it as HH19.

Dependency path:

```
@hashgraph/asset-tokenization-contracts
  └─ @terminal3/ecdsa_vc@0.1.30
      └─ @terminal3/vc_core@0.0.33
          └─ did-jwt@8.0.18
              └─ @scure/base@^2.0.0   ← ESM-only, required from CJS
```

**Workaround:** pin `@scure/base` to `1.2.6` via a root `overrides` entry. Note that
`overrides` alone was not enough in our case — npm still left a nested
`did-jwt/node_modules/@scure/base@2.0.0`, which had to be deleted so the hoisted 1.2.6
resolved.

**Suggested fix:** constrain `@scure/base` to `^1.2` through `overrides` in the root
manifest, or raise it with `did-jwt`. Separately, HH19 might be worth reporting upstream
to Hardhat — a wrapper error that asserts two specific, checkable conditions should
verify them before blaming them.

### Problem 2 — `prepare` runs before dependencies exist, and `--ignore-scripts` doesn't stop it

`packages/ats/contracts/package.json`:

```json
"scripts": { "prepare": "npx hardhat compile" }
```

npm runs `prepare` for a workspace during install, which is before that workspace's
dependencies are linked. So the very first thing a clean clone does is invoke `hardhat`
without `node_modules`.

`npm install --ignore-scripts` did **not** suppress it for us — same failure, same empty
`node_modules`. The only thing that worked was editing the `prepare` script out, then
installing, then compiling explicitly.

**Suggested fix:** drop `prepare` and rely on `ats:build` / `ats:setup`, which already
run `ats:contracts:build`. Compiling contracts is a build step, not a package-preparation
step, and putting it in `prepare` makes a clean clone depend on a tool it has not
installed yet.

### What a working sequence looks like

For anyone hitting this before it is fixed:

```bash
# 1. remove the prepare hook from packages/ats/contracts/package.json
# 2. add to the root package.json:
#      "overrides": { "@scure/base": "1.2.6" }
npm install
rm -rf node_modules/did-jwt/node_modules/@scure/base   # force the hoisted copy
npm run ats:contracts:build
npm run ats:sdk:build
npm run ats:web:dev
```

After that the web app starts and works correctly. We issued an ERC-1400 equity through
it on Hedera testnet without further trouble, so this is purely a first-install problem.

---

## Optional third item

Worth a separate issue or a docs note rather than bundling here.

**Enabling "Internal Kyc Activated" at issuance produces a token that cannot be minted
to, and the UI gives no indication of why.**

`GrantKycCommandHandler` runs the uploaded file through `Terminal3Vc.vcFromBase64` and
`verifyVc`, throwing `InvalidVc` unless it is a cryptographically signed W3C Verifiable
Credential bound to the target address and that security. The "Add KYC" modal presents an
Account ID field and an "Upload VC File" button with no hint that the file must be
issuer-signed, and `IssueCommandHandler` checks `KycStatus.GRANTED`, so minting is blocked
until a valid credential exists.

A hackathon or evaluation user has no credential issuer, so the toggle is effectively a
trap: it is easy to enable, looks like a compliance feature, and silently makes the asset
unusable. Recovery requires `Internal KYC Manager role` plus the Danger Zone toggle, which
is not discoverable from the error.

**Suggested fix:** a line in the create-equity tooltip stating that internal KYC requires
a signed VC from a registered issuer, and a clearer error on the mint path than
`AccountNotKycd`.
