# Complaint Implementation Verification Audit

Date: 2026-06-03
Mode: Verification-only (no feature implementation)
Scope lock: ePost.pk / Label Generator only

## 2026-06-03 Duplicate History + Timer + Migration Update

### Verified Production Bugs
1. Duplicate worker callback appended duplicate complaint history row for same CMP ID.
2. Complaint count/attempt labels could diverge (`Complaint Count` inflation, repeated `Attempt #1`).
3. PROCESSING timer could continue despite complaint ID/due date being available.
4. `ComplaintNotification` Prisma model existed in schema but migration SQL artifact was missing.

### Implemented Corrections
- Added complaint history normalization + idempotent append in complaint service.
- Updated processor to append only new unique complaint IDs and derive state reason from effective attempt.
- Updated BulkTracking lifecycle/history parsing and history modal rendering to dedupe repeated CMP IDs.
- Updated complaint card state resolution to force `ACTIVE` when complaint ID+due date or submitted/duplicate queue status exists.
- Added migration SQL:
  - `apps/api/prisma/migrations/20260603223000_add_complaint_notifications/migration.sql`

### Regression Coverage
- `processor success stores complaint id due date status and response text` (existing)
- `duplicate worker callback does not create second history entry` (new)
- `reopen creates exactly one new attempt` (new)
- `deduplicates repeated complaint IDs from stored history` (new)
- `migration SQL exists for ComplaintNotification table` (new)
- `bulk tracking complaint state: complaint ID and due date force ACTIVE while queue says processing` (new)

### Validation Snapshot
- `npm run build` -> PASS
- `npm run test:complaint-units --workspace=@labelgen/api` -> PASS
- `npm run test:complaints --workspace=@labelgen/api` -> PASS
- `npx tsx apps/web/src/pages/BulkTrackingComplaintState.test.ts` -> PASS
- `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` -> FAIL locally (`localhost:5432` unreachable)

### Prisma Command Note
- Requested command with workspace flag:
  - `npx prisma migrate dev --name add_complaint_notifications --workspace=@labelgen/api`
- Prisma CLI does not support `--workspace` and exits with unknown option.
- Equivalent package-scoped command was attempted from `apps/api`, but local DB (`localhost:5432`) was unreachable in this environment.

## 2026-06-03 Reopen Stuck PROCESSING Fix

### Issue
Reopened complaint (example CMP-173173, VPL26040379) displayed `PROCESSING` indefinitely with growing elapsed timer (00:06:09+). Complaint Count stayed at 1.

### Root Causes Identified
1. `isComplaintCircuitOpen()` and `prisma.shipment.findUnique()` executed outside the `try/catch` in `processComplaintQueueById` — any transient DB or network error left the `complaintQueue` row stuck in `processing` permanently.
2. `getQueuedComplaintsForRetry` only picks `queued | retry_pending` — stuck `processing` rows were silently ignored forever.
3. `findActiveComplaintDuplicate` treated stale `processing` rows (no due date, old `updatedAt`) as active blocking duplicates, preventing new reopen queue rows from being created in some scenarios.

### Corrections Implemented
- `processComplaintQueueById`: All I/O after `markComplaintQueueProcessing()` is now inside the try/catch. DB errors will now correctly call `markComplaintQueueFailure` and transition to `retry_pending`.
- `rescueStuckProcessingComplaints()`: New function. Called every 1 minute from the complaint retry cron. Rescues rows with `processing` status and `updatedAt < now - 10 min`.
- `COMPLAINT_PROCESSING_STALE_AFTER_MS = 600_000`: Exported constant (10 minutes).
- `findActiveComplaintDuplicate`: Stale `processing` rows (older than stale threshold) are skipped and do not block new submissions.
- UI (BulkTracking.tsx): Cards stuck in PROCESSING > 10 min show "Stale — Pending Retry" label with elapsed time. Fast 5-second refresh activates for stale PROCESSING cards.

### Tests Added
- `reopen: enqueues a new complaint queue row independent of resolved history`
- `stuck processing: rescue transitions stale processing row to retry_pending`
- `stuck processing: rescue transitions to manual_review when retries exhausted`
- `stuck processing: fresh processing row is not rescued`
- `duplicate check: stale processing row does not block new complaint submission`

### Validation
- `npm run build` → PASS
- `npm run test:complaint-units --workspace=@labelgen/api` → PASS
- `npm run test:complaints --workspace=@labelgen/api` → PASS

---

## 2026-06-03 Status Logic Fix Update
- Implemented pending-safe complaint resolution logic in sync path.
- Complaint now remains `ACTIVE`/`PROCESSING` when shipment is pending (system or manual override).
- Complaint now resolves only on latest verified tracking `DELIVERED`/`RETURNED` state.
- Unavailable tracking now marks sync uncertainty and keeps complaint non-terminal.
- Added audit metadata fields in complaint header:
  - `shipmentStatusAtComplaintSubmit`
  - `trackingStateAtSync`
  - `complaintStateReason`
- Updated complaint UI card-state resolution to prevent `RESOLVED` display while shipment is pending.
- Updated complaint route assertions for implemented queue-linked unit consumption behavior.
- Added targeted sync-state tests covering pending/manual-pending/delivered/returned/unavailable scenarios.

## Preflight Verification
- Git remote: `https://github.com/emttspk/emtts.git`
- Branch: `main`
- Railway context: Project `Epost`, Environment `production`, Service `Api`
- Note: repository had pre-existing local changes before this audit.

## Build and Runtime Verification
- `npm run prisma:generate --workspace=@labelgen/api` -> PASS
- `npm run build` (web + api) -> PASS
- `npm run test:complaint-units --workspace=@labelgen/api` -> PASS (16/16)
- `npm run test:complaints --workspace=@labelgen/api` -> FAIL (route suite)
  - Failing assertions at `apps/api/src/routes/complaintRoute.test.ts:604` and `apps/api/src/routes/complaintRoute.test.ts:615`

## Verified

### A) Complaint Unit Accounting + Idempotency
- Complaint unit gate and cost check are present in route flow:
  - `apps/api/src/routes/tracking.ts:2168`
- Complaint request key is deterministic per queue row:
  - `apps/api/src/routes/tracking.ts:2235`
- Unit consumption is executed after queue row creation:
  - `apps/api/src/routes/tracking.ts:2236`
- Dedupe strategy by `action_type::request_key` exists:
  - `apps/api/src/usage/unitConsumption.ts:270`
  - `apps/api/src/usage/unitConsumption.ts:366`
- Usage log insert uses conflict-safe idempotency:
  - `apps/api/src/usage/unitConsumption.ts:319`
  - `apps/api/src/usage/unitConsumption.ts:411`
- Refund updates `usage_logs` to `REFUNDED` and decrements queued counters:
  - `apps/api/src/usage/unitConsumption.ts:447`
  - `apps/api/src/usage/unitConsumption.ts:466`

### B) Required Complaint Fields + Location Validation
- Backend required-fields check includes district/tehsil/location and rejects `-` as delivery office placeholder:
  - `apps/api/src/routes/tracking.ts:1958`
  - `apps/api/src/routes/tracking.ts:1960`
- Frontend validates district/tehsil/location before preview/submit:
  - `apps/web/src/pages/BulkTracking.tsx:2103`
  - `apps/web/src/pages/BulkTracking.tsx:2119`
- Frontend submit remains disabled until required fields are complete:
  - `apps/web/src/pages/BulkTracking.tsx:3334`
  - `apps/web/src/pages/BulkTracking.tsx:5189`

### C) Queue Lifecycle + Duplicate/Reopen Guardrails
- Active queue statuses and normalization logic present:
  - `apps/api/src/services/complaint-queue.service.ts:8`
  - `apps/api/src/services/complaint-queue.service.ts:11`
- Duplicate detection against active queue records present:
  - `apps/api/src/services/complaint-queue.service.ts:52`
  - `apps/api/src/services/complaint-queue.service.ts:58`
- Failure path transitions to `retry_pending` / `manual_review`:
  - `apps/api/src/services/complaint-queue.service.ts:151`

### D) Admin Monitoring/Operations Endpoints
- Complaint monitor/export/sync/queue/admin operations are implemented:
  - `apps/api/src/routes/admin.ts:1085`
  - `apps/api/src/routes/admin.ts:1098`
  - `apps/api/src/routes/admin.ts:1105`
  - `apps/api/src/routes/admin.ts:1118`
- Backup/sync/retry jobs are wired in admin route startup:
  - `apps/api/src/routes/admin.ts:65`
  - `apps/api/src/routes/admin.ts:66`
  - `apps/api/src/routes/admin.ts:69`

### E) Complaint Status Normalization in UI
- Frontend normalization covers ACTIVE/OPEN/FILED, PROCESSING/PENDING/DUPLICATE, RESOLVED/CLOSED:
  - `apps/web/src/pages/BulkTracking.tsx:350`
  - `apps/web/src/pages/BulkTracking.tsx:351`
  - `apps/web/src/pages/BulkTracking.tsx:352`
  - `apps/web/src/pages/BulkTracking.tsx:353`

## Failed

### F1) Complaint route test suite no longer matches implemented unit behavior
- Route tests expect no consumed/refunded complaint usage log entries in scenarios where code now consumes/refunds using queue-linked request keys.
- Failing expectations:
  - `apps/api/src/routes/complaintRoute.test.ts:604`
  - `apps/api/src/routes/complaintRoute.test.ts:615`
- Current route behavior (consume + rollback delete when consume fails) is visible at:
  - `apps/api/src/routes/tracking.ts:2236`
  - `apps/api/src/routes/tracking.ts:2244`

## Incomplete

### I1) Prisma migration coverage for `ComplaintNotification` model is missing
- Model exists in Prisma schema:
  - `apps/api/prisma/schema.prisma:595`
- No migration SQL entries for complaint notification tables/entities were found under:
  - `apps/api/prisma/migrations/`
- Audit command evidence:
  - `grep -RInE "ComplaintNotification|complaint_notification|complaintNotifications|complaint_notification_logs" apps/api/prisma/migrations` returned no matches.

### I2) Complaint notification sync integration is partial
- `createComplaintNotification` is imported in sync service, but no invocation appears in sync loop paths:
  - Import: `apps/api/src/services/complaint-sync.service.ts:7`
- Processor emits notifications on success/failure, but sync-triggered state transitions do not currently emit complaint notifications from this service.

### I3) User-facing complaint notification bell/API integration is incomplete
- Top bar mounts support bell only:
  - `apps/web/src/components/Topbar.tsx:8`
  - `apps/web/src/components/Topbar.tsx:61`
- Existing bell implementation is support-ticket scoped:
  - `apps/web/src/components/SupportNotificationsBell.tsx:29`
  - `apps/web/src/components/SupportNotificationsBell.tsx:73`
- No complaint notifications bell wiring found in top-level UI during this audit.

## Needs Manual Test

### M1) End-to-end DB-backed complaint notification persistence and read-state UX
- Local processor test run logs show notification creation attempts can fail when DB is unavailable (expected in disconnected local context), so full persistence/read-state requires integrated environment verification.

### M2) Reopen lifecycle with real tracking state transitions
- Reopen logic is implemented in route/frontend state calculations, but final correctness across live status changes and due-date windows should be validated with a full staging runbook scenario.

### M3) Office mapping quality against full production-scale dataset
- Spot check from `apps/api/temp-cycle-audit-100.json` against `city/post office list.csv` produced 11 unmatched office names in the sampled 100 records:
  - `BADA BAIR PO`, `CHOR RS`, `DIK GPO`, `G M ABAD`, `Harbans Pura`, `J & K Rathian PO`, `Khwajgaan`, `KULOWAL PO`, `Niaz Baig Thokhar PO`, `NSR IN`, `Valencia PO LHR`
- Requested top-20 unmatched could not be produced from this sample because only 11 unmatched were present in sampled data.

## Final Audit Decision
- Overall status: PARTIAL PASS (verification complete, unresolved issues remain)
- Unresolved items blocking "zero unresolved issues":
  - Failed route complaint tests (out-of-date assertions)
  - Missing migration evidence for complaint notifications
  - Partial complaint notification end-to-end integration
- Push-to-main criterion from task instruction is NOT met in this audit state.
