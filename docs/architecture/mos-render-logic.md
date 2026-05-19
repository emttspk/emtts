# MOS Render Logic

## Source Fields
- Primary MOS value source in API payload: `shipment.moIssued`
- Secondary persisted source in `rawJson`: `moIssuedNumber`
- Issued-state flag source in API/raw payload: `moneyOrderIssued`

## Issue Condition
- MOS is considered issued only when tracking processing detects a money-order issued signal.
- Detection path: `processTracking` in `apps/api/src/services/trackingStatus.ts`
- Effective rule:
  - `moneyOrderIssued = true` when MOS delivery is detected, or an issued event is present (`mos issued`, `mo issued`, `money order issued`).

## Render Condition
- UI must render MOS number only when both conditions are true:
  - `moneyOrderIssued === true`
  - MOS number exists (`moIssued` or `moIssuedNumber`)
- Otherwise UI renders `-`.

## API Normalization Notes
- Shipments endpoint now gates MOS display with issued-state check before exposing `moIssued`.
- Merged `rawJson` includes `moneyOrderIssued` for consistency across table view, export, and detail modal.

## Maintenance Notes
- If tracking event text changes upstream, update issued-signal matching in `processTracking`.
- Do not bypass `moneyOrderIssued` in frontend fallback extraction; this can reintroduce stale MOS values.
- If new APIs are added, keep the same contract:
  - `moIssued` is display-ready (already gated)
  - `moneyOrderIssued` carries boolean truth for UI fallback paths.
