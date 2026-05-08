# Deployment Status

**Last Updated:** 2026-05-08  
**Commit:** c927237 — fix shipment stats aggregation complaint watch sync and dashboard cleanup  
**Railway Project:** 144be6f4-a17c-47ec-8c23-3d5963c4d5fb  
**Status:** API + WEB DEPLOYED, ONLINE, AND LIVE-VERIFIED

## Services
- Api: Online · https://api.epost.pk · deployment 0178a613-2afe-4935-84e7-860b15fed8a5
- Web: Online · https://www.epost.pk · deployment 44531bc7-7b14-4114-9909-3829c77e877b
- Worker: Online · https://worker.epost.pk
- Python: Online · https://python.epost.pk
- Postgres-hUZn: Online

## DB Audit (Direct Table Verification)
Source: `temp-shipment-stats-audit.ts` with Railway `DATABASE_PUBLIC_URL`.

- Total: count 1218, amount 1076725
- Delivered: count 19, amount 14825
- Pending: count 1197, amount 1059300
- Returned: count 2, amount 2600
- Complaints: count 184, amount 185075
- Complaint Watch: count 89, amount 93375

## Post-Deploy API Stats Payload
Source: `temp-live-verify-matrix.json` after deploy.

- `total=1218`
- `delivered=19`
- `pending=1197`
- `returned=2`
- `complaints=184`
- `complaintWatch=89`
- `totalAmount=1076725`
- `deliveredAmount=14825`
- `pendingAmount=1059300`
- `returnedAmount=2600`
- `complaintAmount=185075`
- `complaintWatchAmount=93375`

## UI Proof Artifacts
- Dashboard screenshot: `temp-ui-shots/dashboard-postfix.png`
- Tracking screenshot: `temp-ui-shots/tracking-postfix.png`
- Shipment Status screenshot: `temp-ui-shots/shipment-status-postfix.png`

## Validation Outcome
- Dashboard cards and Tracking cards now match backend counts and amounts.
- Shipment Status section matches top cards exactly (Delivered 19, Pending 1197, Returned 2).
- Complaint Watch is separated from Complaints.
- Formula line removed from Remaining Units panel.
