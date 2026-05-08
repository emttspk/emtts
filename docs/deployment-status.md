# Deployment Status

**Last Updated:** 2026-05-08  
**Commit:** a6e9e8b — fix reopen eligibility for terminal complaint state  
**Railway Project:** 144be6f4-a17c-47ec-8c23-3d5963c4d5fb  
**Status:** ALL SERVICES ONLINE AND LIVE-VERIFIED

## Services
- Api: Online · https://api.epost.pk · deployment c1e2b0da-d1c2-44fb-946e-bc66547a08bc
- Web: Online · https://www.epost.pk
- Worker: Online · https://worker.epost.pk
- Python: Online · https://python.epost.pk

## Latest Confirmed Runtime
- Api health endpoint: `GET /api/health -> 200 {"status":"ok"}`
- Stats endpoint live payload (`a6e9e8b`):
  - `total=1218`
  - `delivered=19`
  - `pending=34`
  - `returned=2`
  - `totalAmount=1076725`
  - `deliveredAmount=14825`
  - `pendingAmount=1059300`
  - `returnedAmount=2600`
  - `complaintAmount=99525`
  - `complaints=98`

## Final Production Fixes Confirmed
- Dashboard and Tracking pages use the same stats hook, endpoint, cache key, and response object.
- Stats cards no longer rely on separate local calculations.
- Cache-first hydration confirmed on refresh.
- Re-Complaint button is visible for terminal-state or expired complaints.
- Reopen API now honors stored `COMPLAINT_STATE` and does not falsely block terminal-state complaints.
- Reopen complaint text persists previous complaint IDs, previous due dates, previous remarks, and the required legal escalation warning.

## Live Reopen Proof
- Tracking: `VPL13688853`
- Previous complaint ID: `CMP-312118`
- Previous due date: `09-05-2026`
- New complaint ID after reopen: `CMP-349225`
- New due date after reopen: `15-05-2026`
- Persisted history count: `2`
- Last entry status: `ACTIVE`
- Previous complaint reference on new entry: `CMP-312118`

## Supporting Notes
- Real deletable plan verification previously passed in production.
- Protected delete blocker verification previously passed in production.
- Complaint history modal and shared stats UI were already verified live before the final reopen fix.
- Sample complaint document updated at `docs/samplecomplaint.md`.
