# Runbook — completing a Selfie Check verification

For whoever is holding the phone. Written so it can be followed by someone who was not
in the conversation that built it.

Everything except step 2 is already built and tested. Two inputs gate it:

| Missing | Blocks | Where it comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_WORLD_RP_ID` + `WORLD_SIGNING_KEY` | signing `rp_context`, so the entire request path | Developer Portal, app page, after clicking **Enable World ID 4.0** |
| Selfie Check feature flag | an actual completed proof | `developers@toolsforhumanity.com` and/or the World rep in ETHGlobal Discord |

---

## You do NOT need a LAN IP or a tunnel

Worth correcting up front, because it looks like you would.

IDKit uses a **bridge**: the laptop browser renders a QR code, World App scans it,
generates the proof against World's servers, and the result returns to the browser
through the bridge. **The phone never connects to `localhost:3000`.**

So the whole flow runs against `http://localhost:3000` on the laptop with the phone
simply pointed at the screen. Only set `PREFLIGHT_APP_URL` if you deliberately want to
open the app itself on the phone, which is not required here.

---

## 1. Configure and preflight

Put both values in `.env` (never commit it; it is gitignored and `chmod 600`):

```bash
NEXT_PUBLIC_WORLD_RP_ID=rp_...
WORLD_SIGNING_KEY=...        # SECRET. No NEXT_PUBLIC_ prefix, ever.
```

Then:

```bash
npm run dev                       # leave running in its own terminal
npm run check:worldid -- --live   # in a second terminal
```

Read the output before going further:

- **All checks pass** → the request path is correct end to end. Go to step 2.
- **`/api/v4/verify -> ... looks like a FEATURE GATE`** → plumbing is right, the Selfie
  Check flag has not landed. Chase the access request; nothing in the code needs
  changing.
- **`unknown_rp` / `inactive`** → the `rp_id` is wrong or 4.0 is not actually enabled on
  that app.
- **`/api/rp-signature -> 503`** → it names the missing variable. Fix that first.

Never run `npm run build` while `npm run dev` is running. The production build
overwrites `.next` and the dev server then 404s every asset, which looks exactly like
the UI being broken.

---

## 2. Complete the verification

1. Open `http://localhost:3000/verify` on the **laptop**.
2. Connect the wallet. Use a **fresh address** — not
   `0x033588A8025F47128cf7B102412b81Ca43c2C7f0`, which is already verified and KYC'd
   from the deploy and would pass whether or not the World ID leg works.
3. Accept the prompt to switch to Hedera Testnet.
4. Click **Verify with World ID**. A QR code appears.
5. Scan it with **World App** on the phone and complete the Selfie Check camera flow.

If World App reports `feature_unavailable` or `credential_unavailable`, the flag is not
on yet. The page says so in plain words rather than showing a raw error code.

---

## 3. Capture the credential identifier — do this before anything else

The value Selfie Check reports in `results[].identifier` is **not documented** and is
deliberately **not guessed** anywhere in this repo.

On the first real proof, the server logs it. In the `npm run dev` terminal look for:

```
[worldid] proof verified by World but credential "<VALUE>" is not in
ACCEPTED_VERIFICATION_LEVELS. If this is Selfie Check, that string is the value to put
in lib/worldid-policy.ts.
```

Then:

1. Put `<VALUE>` into `ACCEPTED_VERIFICATION_LEVELS` in `lib/worldid-policy.ts`.
2. Update the `accepted set is exactly` test in `test/worldid-policy.test.mjs` to match.
3. Delete the `TODO(selfie-check)` block and the `console.warn` that printed it.
4. `npm run test:worldid` — the set-assertion test is what stops the allowlist drifting.

Keep it an **allowlist**. The original code rejected only `"device"` and accepted
everything else, which fails open on every credential World ships in future. That bug
has been caught twice by the set-assertion test.

Then repeat step 2. It should now succeed.

---

## 4. Confirm the onchain leg

On success the route calls, in order:

1. `WorldIdRegistry.attestVerification(address, nullifier)`
2. `WarehouseReceipt.grantKyc(address)`

The page prints a HashScan link for the first. Record **both** transaction hashes into
`docs/deployments.md`.

Verify independently:

```bash
npm run check:roles
```

---

## 5. Prove the Sybil gate

Disconnect, connect a **second** fresh address, and verify with the **same** World ID
identity.

It must be refused. Record the full HTTP response **and which layer refused it**:

- **API layer** — `/api/worldid/verify` checks `nullifierOwner` before spending gas and
  returns `409` with *"This identity is already registered to another address"*.
- **Contract layer** — `WorldIdRegistry.attestVerification` reverts with
  `NullifierAlreadyUsed`.

These are separate guarantees and either could regress without the other. Both should
hold. **If only one fires, that is a finding worth more than the demo** — write it up.

---

## 6. Screenshots

Into `docs/screenshots/` — see the README there for the full list and naming. At
minimum for this flow:

- the QR / widget open
- the success state with the address verified
- the rejected second attempt, showing the error body

Set the save location first so they land in the repo rather than on the Desktop:

```bash
defaults write com.apple.screencapture location ~/ETHOnline/docs/screenshots && killall SystemUIServer
```

Use `Cmd+Shift+4` then `Space` then click the window. **Not** `Cmd+Ctrl+Shift+4` —
that copies to the clipboard and never writes a file, which is how a previous batch was
lost.

---

## If the flag never arrives

Record the video with the plumbing demonstrated up to World's own rejection, and say
plainly that Selfie Check access was requested and is pending. `npm run check:worldid
-- --live` produces exactly that evidence: every check green except a feature gate.

That is a better story than a silent gap, and it is the same honest-disclosure shape
used elsewhere in this project — see the allowlist finding in area 4 of
[world-feedback.md](world-feedback.md).
