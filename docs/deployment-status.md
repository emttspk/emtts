# Deployment Status

**Last Updated:** 2026-05-08  
**Commit:** pending local commit — fix post-cleanup money order background and user workspace route regressions  
**Railway Project:** 144be6f4-a17c-47ec-8c23-3d5963c4d5fb  
**Status:** API + WEB DEPLOYED, ONLINE, AND LIVE-VERIFIED

## Mandatory Recovery Loop — Post Cleanup Regression Fix

### What cleanup broke
- User generate workflows became inaccessible for normal authenticated users because user routes were chained into admin-only routes.
- Money order background rendering became fragile when template background paths were saved with leading slashes.

### What was restored
- User routes now directly serve:
	- `/generate-labels`
	- `/generate-money-orders`
- Admin aliases now redirect to the user-safe equivalents while preserving admin guard boundaries.
- Money-order background loader now resolves leading-slash assets from known deploy-safe paths:
	- `apps/web/public/...`
	- `apps/api/templates/...`

### Why route access failed
- `/generate-labels` and `/generate-money-orders` previously redirected to `/admin/...` endpoints protected by `RequireAdmin`.
- Result: non-admin authenticated users (including production workspace users) hit admin guard and could not continue.

### Why background rendering failed
- Active template backgrounds can be stored as URL-like strings (for example `/templates/mo-front-default.png`).
- API background resolver previously lacked robust filesystem fallback mapping for that form across deployment directories.

### Recovery validation
- `npm install`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm run dev`: PASS
- `npm run test`: PASS (`@labelgen/api smoke:railway` success)

### Deployment proof (this loop)
- Api deploy command: `railway up --service Api --detach`
- Web deploy command: `railway up --service Web --detach`
- Api build logs id: `024430ab-1117-4e4e-b1c3-0f1a45caf0b4`
- Web build logs id: `bb325e11-9abb-4733-b751-4db3d6850190`
- Api live logs include: `GET /api/me`, `GET /api/shipments/stats`, tracking bulk completion traces.
- Web live logs include: `200` responses for app routes/assets including generate-workflow bundles.

### Current protection model
- Authenticated users: Generate Labels, Generate Money Order, Tracking, Dashboard.
- Admin-only: `/admin` and all explicit admin pages remain under `RequireAdmin`.

---

## Latest Session Changes
- Sender profile regression fixed: `SenderProfileCard` restored to `BulkTracking.tsx` (below stats cards) and `Upload.tsx` (above dropzone)
- Profile source of truth: `GET /api/me` — single, no duplicates
- 104 `temp-*` files + 5 test/audit files + `smokeTest.ts` removed
- All services: zero build errors, zero TypeScript errors, zero lint errors
- Deployed: `railway up --service Api --detach` + `railway up --service Web --detach`

## Services
- Api: Online · https://api.epost.pk · deployment b9fd913f-8d6e-4411-a15b-c0b61612082c
- Web: Online · https://www.epost.pk · deployment 7e8ef0bb-c002-4c50-8b8f-bae74e334a2d
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
- Complaint Active: count 69, amount 74000
- Complaint In Process: count 41, amount 41800
- Complaint Resolved: count 8, amount 7300
- Complaint Closed: count 66, amount 61975
- Complaint Reopened: count 16, amount 13600

## Post-Deploy API Stats Payload
Source: `temp-live-verify-matrix.json` and `temp-final-consistency-audit.json` after deploy.

- `total=1218`
- `delivered=19`
- `pending=1071`
- `returned=128`
- `complaints=203`
- `complaintWatch=89`
- `complaintActive=69`
- `complaintInProcess=41`
- `complaintResolved=8`
- `complaintClosed=66`
- `complaintReopened=16`
- `totalAmount=1076725`
- `deliveredAmount=14825`
- `pendingAmount=941975`
- `returnedAmount=119925`
- `complaintAmount=185075`
- `complaintWatchAmount=93375`
- `complaintActiveAmount=74000`
- `complaintInProcessAmount=41800`
- `complaintResolvedAmount=7300`
- `complaintClosedAmount=61975`
- `complaintReopenedAmount=13600`

DB vs API parity checks: PASS (`returned`, `complaints`, `complaintWatch`, `complaintWatchAmount`, `complaintActive`, `complaintInProcess`, `complaintResolved`, `complaintClosed`, `complaintReopened`, `complaintActiveAmount`, `complaintInProcessAmount`, `complaintResolvedAmount`, `complaintClosedAmount`, `complaintReopenedAmount`).

## UI Proof Artifacts
- Dashboard screenshot: `temp-ui-shots/dashboard-postfix.png`
- Tracking screenshot: `temp-ui-shots/tracking-postfix.png`
- Shipment Status screenshot: `temp-ui-shots/shipment-status-postfix.png`
- Complaint lifecycle cards screenshot: `temp-ui-shots/complaint-lifecycle-cards-postfix.png`
- Returned filter screenshot: `temp-ui-shots/filter-returned-proof.png`
- Complaint Watch filter screenshot: `temp-ui-shots/filter-complaint-watch-proof.png`
- Click filter JSON proof: `temp-click-filter-proof.json`

## Validation Outcome
- Dashboard cards and Tracking cards match one backend `/api/shipments/stats` source.
- Shipment Status section shows all required 9 cards with counts and amounts from API payload.
- Tracking supports all required filters (`DELIVERED`, `PENDING`, `RETURNED`, `COMPLAINT_WATCH`, `COMPLAINT_TOTAL`, `COMPLAINT_ACTIVE`, `COMPLAINT_CLOSED`, `COMPLAINT_REOPENED`, `COMPLAINT_IN_PROCESS`).
- Card click navigation filters are live and verified for all required routes.
- Complaint action button labels are lifecycle-synced (`Complaint`, `In Process`, `Reopen Complaint`).
- Final production validation loop completed with clean command outcomes (`install`, `lint`, `typecheck`, `build`, `test`, `dev`).
