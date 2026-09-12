# Screenshots — needed, not yet captured

This directory is **empty of images**. Everything in it must be captured by a human
with a browser; the rest of the evidence in this repo was produced from a terminal and
lives in [`../evidence/`](../evidence/) as text.

Why it matters: **Hedera testnet resets periodically and wipes contract state and
Sourcify verifications.** If a reset lands between submission and judging, every
HashScan link in [`../deployments.md`](../deployments.md) 404s and these images become
the only surviving proof the deployment existed and was verified.

Capture each at full window width, light mode, with the URL bar visible.

## Required

| Filename | What it must show |
| --- | --- |
| `01-hashscan-worldidregistry-verified.png` | HashScan page for `0xE3a02179CCa05b438bd157E2E00434d28ec26984` with the verified badge visible |
| `02-hashscan-mockusdc-verified.png` | `0x2CEBEA8360D0c71B78f320F7CdF4D06486ad9DCd`, verified badge |
| `03-hashscan-warehousereceipt-verified.png` | `0x0F2b3D243BB0e882dE0aB9Ed0b2754e8f473EaD7`, verified badge |
| `04-hashscan-godaamvault-verified.png` | `0x63Af372CEAa1d2C8dADF6Ea503c99edB1960d07d`, verified badge |
| `05-hashscan-mockcreforwarder-verified.png` | `0xaDFc7D556C20908151e8C3C56C65b6F45648C736`, verified badge |
| `06-verify-page-with-live-app-id.png` | `npm run dev` → `/verify`, wallet connected, widget rendered. Open devtools → Network and show the outgoing request carrying `app_01bad004474e95ad1933f6be72139945`, proving it is not a placeholder |
| `07-gate-refusals-terminal.png` | Terminal output of `GATE_TEST_ADDRESS=0x27a89B8262b6A51167488edC860E39fbC0111B9B npm run check:gate`, showing all four reverts and the control |
| `08-api-403-invalid-format.png` | The `invalid_format` 403 — World reaching proof verification and rejecting a fabricated proof |
| `09-api-403-insufficient-level.png` | The `insufficient_level` 403 — the allowlist refusing a `document` credential |

HashScan URLs follow `https://hashscan.io/testnet/contract/<address>`. HashScan is a
SPA and 404s to `curl`, so these cannot be automated from a terminal — that is why they
are here rather than in `../evidence/`.

## Already captured as text (no screenshot strictly required)

- [`../evidence/01-gate-refusals-hedera-testnet.txt`](../evidence/01-gate-refusals-hedera-testnet.txt)
- [`../evidence/02-sourcify-verification-status.txt`](../evidence/02-sourcify-verification-status.txt)
- [`../evidence/03-api-worldid-verify-responses.txt`](../evidence/03-api-worldid-verify-responses.txt)

Screenshots 07–09 duplicate those three as images, which is worth doing because a judge
skimming a submission looks at pictures before they open a `.txt`.
