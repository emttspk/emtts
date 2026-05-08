# Deployment Status

**Last Updated:** 2026-05-08  
**Commit:** 4fba6a0 — fix returned stats complaint aggregation shipment status expansion and navigation filters  
**Railway Project:** 144be6f4-a17c-47ec-8c23-3d5963c4d5fb  
**Status:** API + WEB DEPLOYED, ONLINE, AND LIVE-VERIFIED

## Services
- Api: Online · https://api.epost.pk · deployment f8adb806-ab46-4317-b4fa-620c5c93618a
- Web: Online · https://www.epost.pk · deployment 4c94f94a-ff68-47b7-8c3f-4ee322061c57
- Worker: Online · https://worker.epost.pk
- Python: Online · https://python.epost.pk
- Postgres-hUZn: Online

## DB Audit (Direct Table Verification)
Source: `temp-final-consistency-audit.mjs` with Railway `DATABASE_PUBLIC_URL`.

- Total: count 1218, amount 1076725
- Delivered: count 19, amount 14825
- Pending: count 1071, amount 941975
- Returned: count 128, amount 119925
- Complaints: count 203, amount 185075
- Complaint Watch: count 89, amount 93375
- Complaint Active: 110
- Complaint Resolved: 8
- Complaint Closed: 66
- Complaint Reopened: 16

## Post-Deploy API Stats Payload
Source: `temp-live-verify-matrix.json` and `temp-final-consistency-audit.json` after deploy.

- `total=1218`
- `delivered=19`
- `pending=1071`
- `returned=128`
- `complaints=203`
- `complaintWatch=89`
- `complaintActive=110`
- `complaintResolved=8`
- `complaintClosed=66`
- `complaintReopened=16`
- `totalAmount=1076725`
- `deliveredAmount=14825`
- `pendingAmount=941975`
- `returnedAmount=119925`
- `complaintAmount=185075`
- `complaintWatchAmount=93375`

DB vs API parity checks: PASS (`returned`, `complaints`, `complaintWatch`, `complaintActive`, `complaintResolved`, `complaintClosed`, `complaintReopened`).

## UI Proof Artifacts
- Dashboard screenshot: `temp-ui-shots/dashboard-postfix.png`
- Tracking screenshot: `temp-ui-shots/tracking-postfix.png`
- Shipment Status screenshot: `temp-ui-shots/shipment-status-postfix.png`
- Returned filter screenshot: `temp-ui-shots/filter-returned-proof.png`
- Complaint Watch filter screenshot: `temp-ui-shots/filter-complaint-watch-proof.png`
- Click filter JSON proof: `temp-click-filter-proof.json`

## Validation Outcome
- Dashboard cards and Tracking cards match one backend `/api/shipments/stats` source.
- Returned counts now include all return sources (Pakistan Post lifecycle + manual overrides).
- Complaint total counts all complaint history attempts.
- Complaint Watch remains active-only and pending-only.
- Complaint lifecycle breakdown available and validated in production (`active`, `resolved`, `closed`, `reopened`).
- Card click navigation filters are live and verified.
