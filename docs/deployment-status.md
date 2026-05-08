# Deployment Status

**Last Updated:** 2026-05-08  
**Commit:** 25731e5 — fix: remove duplicate complaints card, wire complaintAmount, fix reopen button + history  
**Railway Project:** 144be6f4-a17c-47ec-8c23-3d5963c4d5fb  
**Status:** ALL SERVICES ONLINE (deploying 25731e5)

## Services
- Api: Online · https://api.epost.pk · deployment 305c5001
- Web: Online · https://www.epost.pk · deployment 7a799e37
- Worker: Online
- Python: Online

## Latest Confirmed Runtime
- Api health endpoint: `GET /api/health -> 200 {"status":"ok"}`
- Stats endpoint live payload (`25731e5`):
  - `total=1218`
  - `totalAmount=1076725`
  - `deliveredAmount=14825`
  - `pendingAmount=1059300`
  - `returnedAmount=2600`
  - `complaintAmount=98175`
  - `complaints=96`

## Loop 3 Fixes Applied
- Duplicate COMPLAINTS card removed from Dashboard `summaryCards` array.
- BulkTracking complaints card now shows `shipmentStats?.complaintAmount` from API (was hardcoded `0`).
- Complaint reopen button visible when lifecycle state is RESOLVED/CLOSED/REJECTED (dueDate no longer required to be past).
- `complaintInProcess` correctly skips resolved complaints so Re-Complaint button shows.
- Reopen complaint text now prepends PREVIOUS COMPLAINT HISTORY (IDs, due dates) and appends escalation warning.

## Prior Production Checks (Loops 1-2)
- Real deletable plan test passed: create -> delete `200` -> gone from admin API -> gone from public API.
- Protected delete test passed: `409` with exact blocker counts.
- Complaint history modal functional.
- Cache hydration wiring present for Dashboard and BulkTracking.
- Admin idle auto-logout (15 min) active.
- Sample complaint document: `docs/samplecomplaint.md`.
