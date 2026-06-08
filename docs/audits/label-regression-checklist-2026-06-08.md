# Label Regression Checklist — 2026-06-08

## Renderers Verified
- [x] `labelsHtml()` — Box 4 per A4 (template literals, no token issues)
- [x] `universal9x4Html()` — Universal 9x4 (tokenMap covers all `{{...}}` tokens, unresolved detection active)
- [x] `flyerHtml()` — Flyer 8 per A4 (template literals, no token issues)
- [x] `envelopeHtml()` — Envelope 9x4 + standard (valueMap covers all `{...}` tokens, cleanup fallback active)
- [x] `moneyOrderHtml()` — Money Order (benchmark slot-filling, separate pipeline)

## Shipment Types Verified
- [x] PAR — suppresses amount box, uses PAR lite layout
- [x] RGL — suppresses amount box, uses no-amount layout
- [x] VPL — full amount display
- [x] VPP — full amount display
- [x] COD — full amount display
- [x] UMO — money order rendering
- [x] MOS — money order rendering
- [x] Mixed services — each order rendered independently

## Field Presence (all label types)
- [x] Tracking ID
- [x] Order ID
- [x] Weight (grams) — now in all types
- [x] Sender Name
- [x] Sender Phone — now in all types
- [x] Receiver Name
- [x] Receiver Phone
- [x] Shipment Type
- [x] Product Description

## Token Hardening
- [x] Universal 9x4: template path logged in error
- [x] Universal 9x4: missing token names logged
- [x] Universal 9x4: tokenMap keys logged
- [x] Envelope: leftover tokens logged as warning
- [x] Envelope: cleanup regex removes any remaining `{...}` tokens

## Build
- [x] `npm run build` — PASS

## Git
- [x] Commit hash:
- [x] Pushed to main
