# Admin Command Center Cleanup Runbook Note (2026-05-29)

## Objective
Complete admin dashboard cleanup and finalize tab controls in a single safe cycle under Protected Scope Protocol.

## Safety Decisions
- Classified all pending files before edits.
- Did not delete unrelated user assets.
- Added `.gitignore` entry for `jazz cash/` to prevent pendency noise while preserving data.

## Route and Access
- `/admin` remains guarded by admin auth.
- `/admin/legacy` remains available for protected fallback operations.

## UI Controls Baseline
Applicable admin tabs now include:
- search
- from/to date range
- quick date filters (today, last 7 days, this month, all)
- refresh
- pagination
- clear filters
- status filter input
- safe action buttons (entity-specific)

## API Compatibility Additions
- `PATCH /api/admin/plans/:planId`
- `PATCH /api/admin/payments/:paymentId/status`
- `PATCH /api/admin/jobs/:jobId/status`
- `POST /api/admin/jobs/:jobId/retry`
- `POST /api/admin/complaints/:trackingId/sync`

List query compatibility in admin list endpoints:
- `search`, `from`, `to`, `status`, `page`, `pageSize`, `sortBy`, `sortOrder`

## Protected Scope
No edits were made to protected finalized rendering and core business logic modules (labels, barcode engine, MOS/UMO amount logic, finalized upload and complaint engines).

## Follow-up Restore Audit
- Legacy restore audit and function inventory: `docs/operations/admin-legacy-restore-audit-2026-05-29.md`

## Follow-up Scoped Restore (2026-05-29)

### Objective
- Close remaining command-center UI gaps from latest operator screenshots without broad redesign.

### Executed Fixes
- Settings tab payment options restored to actionable controls (`Add Payment Option`, `Edit`, `Delete`, `Save`, `Cancel`).
- Users tab:
	- compact row density,
	- visible pagination metadata (page/total/totalPages/pageSize),
	- bulk actions preserved.
- Date quick filters:
	- labeled as `Date Filter`,
	- active state highlighted,
	- helper text added,
	- hidden for non-date-filter tabs.
- Usage tab pagination metadata and server totals integrated.
- Jobs tab:
	- visible pagination metadata,
	- delete restricted to terminal states,
	- create-job action intentionally disabled with guidance to label generation page.
- Complaints tab `View` action added with details modal using available complaint/queue/shipment context.
- Payments/invoices manual delete actions added with confirmation and backend safety checks.
- Sortable header controls with direction indicators wired to sort query params on supported tabs.
- Active sidebar tab highlight strengthened.
- Existing `Billing.tsx` typecheck blocker fixed (missing `apiUrl` import).

### API Changes in Same Scope
- `GET /api/admin/users`: status/date filters + `totalPages`.
- `GET /api/admin/usage`: total/totalPages + sorting support.
- `GET /api/admin/jobs`: `totalPages`.
- `GET /api/admin/invoices`: total/totalPages.
- `GET /api/admin/manual-payments`: query-aware listing (search/date/status/pagination/sort).
- `DELETE /api/admin/manual-payments/:id`: safe delete for pending/rejected/manual-test records.
