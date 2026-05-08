# Deployment Status

**Last Updated:** 2026-05-08  
**Commit:** 2f65f76 — runtime fix cards cache complaint reopen and history sync  
**Railway Project:** 144be6f4-a17c-47ec-8c23-3d5963c4d5fb  
**Status:** ALL SERVICES ONLINE AND LIVE-VERIFIED

## Services
- Api: Online · https://api.epost.pk · deployment 2622b258-a8d9-4508-aead-c0bb68896269
- Web: Online · https://www.epost.pk
- Worker: Online · https://worker.epost.pk
- Python: Online · https://python.epost.pk

## Latest Confirmed Runtime
- Api health endpoint: `GET /api/health -> 200 {"status":"ok"}`
- Stats endpoint live payload (`2f65f76`):
  - `total=1218`
  - `delivered=19`
  - `pending=34`
  - `returned=2`
  - `totalAmount=1076725`
  - `deliveredAmount=14825`
  - `pendingAmount=1059300`
  - `returnedAmount=2600`
  - `complaintAmount=101625`
  - `complaints=100`

## Final Production Fixes Confirmed
- Dashboard and Tracking pages use the same stats hook, endpoint, cache key, and response object.
- Stats cards no longer rely on separate local calculations.
- Cache-first hydration confirmed on refresh.
- Re-Complaint button is visible for terminal-state or expired complaints.
- Reopen API now honors stored `COMPLAINT_STATE` and does not falsely block terminal-state complaints.
- Reopen complaint text persists previous complaint IDs, previous due dates, previous remarks, and the required legal escalation warning.
- Warning text is now exactly:
  - `This complaint remains unresolved despite previous closure.`
  - `Closing unresolved complaint without written lawful response may result in escalation before Consumer Court, PMG office, or Federal Ombudsman.`

## Live Reopen Proof
- Tracking: `VPL25110554`
- Previous complaint ID: `CMP-663087`
- Previous due date: `09-05-2026`
- New complaint ID after reopen: `CMP-474826`
- New due date after reopen: `15-05-2026`
- Persisted history count: `2`
- Last entry status: `ACTIVE`
- Previous complaint reference on new entry: `CMP-663087`

## Supporting Notes
- Real deletable plan verification previously passed in production.
- Protected delete blocker verification previously passed in production.
- Complaint history modal and shared stats UI were already verified live before the final reopen fix.
- Sample complaint document updated at `docs/samplecomplaint.md`.
