# Godaam — demo video shot list

**Target: 4:45. Hard ceiling 5:00.** Hedera's bounty requires issuance, configuration
and at least one lifecycle operation visibly on screen — not described, shown.

Capture status per shot: **`captured`** (exists now) · **`to film`** (needs recording) ·
**`stills only`** (screenshots exist, no motion).

---

## The shot list

| # | Dur | On screen | Said | Capture |
|---|---|---|---|---|
| 1 | 0:00–0:20 | `/` landing page, then a photo of a warehouse receipt | "A farmer's grain sits in a certified warehouse. That receipt is an asset, but no lender will touch it. Godaam turns it into collateral — and lends **more than the grain is worth**, because a confidential score underwrites the farmer, not just the crop." | **to film** |
| 2 | 0:20–0:35 | `lib/worldid-policy.ts` scrolled to `ACCEPTED_VERIFICATION_LEVELS` | "One claim per human is enforced by a World ID nullifier onchain. Orb is unavailable in India and Selfie Check access is still pending — so that gate is built and proven, not live. I'll show you exactly what *is* proven." | **to film** |
| 3 | 0:35–1:25 | **ATS web app** — equity creation form, filled. Hold on the configuration screen long enough to read it. | "This is Hedera's Asset Tokenization Studio. A real ERC-1400 security token, issued through the pre-deployed testnet factory. Decimals zero. **Number of shares: forty-two thousand — that's the actual kilograms of wheat.** The share count *is* the quantity." | **to film** (Phase 3) |
| 4 | 1:25–1:45 | Compliance toggles: whitelist, controllable, internal KYC — then the issuance tx on HashScan | "Whitelist on. Controllable on. Internal KYC on. This is a regulated instrument, not a token with a name on it." | **to film** (Phase 3) |
| 5 | 1:45–2:20 | Terminal: `npm run check:gate` | "The lifecycle operation. An unverified address, against the live contracts: KYC refused, issuance refused, loan refused, and a transfer to a non-whitelisted holder refused. Then the same call from a verified address — it opens. Four refusals and a control, on a real chain." | **captured** |
| 6 | 2:20–3:10 | Split/sequential terminal: `docs/cre-bureau-provenance.txt` runs A and B | "Same farmer, twice. First run, the land-tenure bureau is reachable inside the enclave: **893, approved, 220% LTV, 880 gUSDC against 400 of grain.** Second run, I break that endpoint. Score drops to 873, and the workflow **declares** it — `bureauSource: unavailable`, with a warning. It still approves, but nothing downstream can mistake a degraded score for a live one." | **captured** |
| 7 | 3:10–3:35 | `docs/cre-simulation-run.txt`, risky-farmer run | "The model discriminates. Risky farmer: 271, declined, zero principal. That's the confidential part — land records, yield history and repayment history are scored inside an AWS Nitro enclave and never leave it. Only the band and the commitment come out." | **captured** |
| 8 | 3:35–4:05 | Terminal: `npm run demo:lifecycle`, held on the `LTV decided by:` line | "Escrow, disbursement, installments. And I want to be precise about this number: **the 130% LTV here is hand-encoded, and the output says so on screen.** The TEE computes the band in simulation — you just saw it. The live trigger needs a deployed workflow and deploy access is still pending." | **captured** |
| 9 | 4:05–4:25 | HashScan: five contracts, verified badges; `docs/deployments.md` | "Five contracts on Hedera testnet, Sourcify-verified, exact match. Addresses, tx hashes and verification status all in the repo." | **stills only** |
| 10 | 4:25–4:45 | `docs/ats-adapter-plan.md` | "The vault operates on our own collateral contract, not the ATS token. That's a costed decision, not an omission — the adapter is designed and mapped, six call sites, and redeploying would forfeit five verifications. The plan is in the repo." | **to film** |

**Estimated total: 4:45.**

---

## Shot 6 is the one to get right

It is the strongest confidential-compute claim available, and stronger than the happy
path. Most submissions show the good case. This shows that when a private data source
fails, the output **changes and says so**.

Two things to keep honest on camera:

- **It still approves.** 873 clears the 850 band threshold, so this applicant gets the
  same 880 gUSDC. Say "it declares the degradation", not "it refuses to lend".
- The 20-point drop *would* flip a marginal applicant near a band boundary. That is the
  point of the flag — it tells you which side of the line the number came from.

Claiming refusal here would be the exact failure this feature exists to prevent, made on
camera. Don't.

---

## Handle carefully

**World.** Lead with it in shot 2, don't bury it. Orb is unavailable to Indian users
(paused since 2023), Document doesn't support Indian documents, Selfie Check is Beta and
access-gated with no stated turnaround. The full 4.0 request path is built — server-signed
`rp_context`, v4 endpoint — and the gate is proven onchain. What's missing is one proof
round-trip, for an external reason.

**ATS adapter.** One sentence, shot 10. Reference the doc, move on. Do not apologise.

**Hedera testnet resets quarterly.** If a link is dead on the day, say so and cut to the
screenshots. Don't debug on camera.

---

## Cut list — decided now, not at 2am

Drop in this order if the edit runs over 5:00:

1. **Shot 10** (adapter deferral, 0:20) — it's in the README; a judge reading the repo
   finds it. Costs the least.
2. **Shot 9** (HashScan verification, 0:20) — trim to a 5-second flash of one contract
   rather than cutting entirely. Verification is a bounty scoring item.
3. **Shot 7** (risky farmer, 0:25) — fold the "271, declined" into shot 6 as a single
   line over the same terminal. Keeps the discrimination claim at half the runtime.
4. **Shot 2** (World, 0:15) — compress to one sentence over shot 1's footage.
5. **Shot 1** (0:20 → 0:10) — cut the warehouse photo, open straight on the product.

**Never cut:** shots 3, 4 (ATS issuance + configuration — bounty requirement), 5
(lifecycle operation — bounty requirement), 6 (the differentiator), 8 (the honest
provenance line).

Cutting 1–3 recovers 0:65 and lands at 3:40.

---

## Pre-flight before recording

- `npm run dev` and the ATS web app on `:5174` both running, **never** `npm run build`
  while either is up — it overwrites `.next` and every asset 404s
- Terminal font at presentation size; the revert reasons and `bureauSource` must be
  legible at 1080p
- `docs/cre-bureau-provenance.txt` and `docs/cre-simulation-run.txt` open in advance
- Hedera testnet reachable: `npm run check:balances`
- Screenshots captured first (`npm run check:screenshots`) — if a testnet reset lands
  mid-recording they become the fallback for shot 9
