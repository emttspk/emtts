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
