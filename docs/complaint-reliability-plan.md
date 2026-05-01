# Complaint Reliability Master Implementation Plan

## Phase 1: Queue Table
### Purpose
Create durable queue persistence for complaint submissions to survive restarts and transient failures.

### File Paths
- apps/api/prisma/schema.prisma
- apps/api/src/services/complaint-queue.service.ts

### Data Flow
Browser complaint submit -> API validation -> ComplaintQueue insert -> worker queue enqueue -> worker processes queue row -> shipment complaint state update.

### Retry Logic
Queue row stores retry count and next retry time. Schedule is 5, 15, 30, 60, 180 minutes with max 6 attempts.

### Failure Handling
Each failure stores last error, increments retry count, and moves to manual_review after max attempts.

### Deployment Steps
1. Run Prisma migrate for ComplaintQueue.
2. Generate Prisma client.
3. Build and typecheck API.
4. Deploy API and worker.

### Rollback Steps
1. Disable complaint enqueue path via route toggle/rollback commit.
2. Revert schema migration if required by platform process.
3. Keep existing shipment complaint records unchanged.

## Phase 2: Worker Processor
### Purpose
Move complaint submission execution from request thread to worker for reliability and isolation.

### File Paths
- apps/api/src/processors/complaint.processor.ts
- apps/api/src/worker.ts
- apps/api/src/routes/tracking.ts

### Data Flow
API stores queue row -> creates tracking job kind COMPLAINT -> worker picks job -> processor submits via existing pythonSubmitComplaint -> writes result to shipment and queue row.

### Retry Logic
Worker processor records retryable failures into queue row and leaves retry scheduling to queue service and retry cron.

### Failure Handling
Worker does not crash request path; failures become queue retry or manual_review and are auditable.

### Deployment Steps
1. Deploy API route changes and worker processor changes together.
2. Confirm worker has complaint processor import and job branch.
3. Validate job result paths and tracking job statuses.

### Rollback Steps
1. Revert worker complaint branch to legacy inline python path.
2. Keep queue rows for audit only.
3. Re-enable direct complaint execution path if needed.

## Phase 3: Retry Engine
### Purpose
Provide deterministic retries for temporary external failures.

### File Paths
- apps/api/src/services/complaint-queue.service.ts
- apps/api/src/jobs/complaint-retry.job.ts

### Data Flow
Failed queue row -> retryCount increment -> nextRetryAt assigned -> retry cron enqueues eligible rows.

### Retry Logic
Schedule: 5m, 15m, 30m, 60m, 180m. Max retries: 6. After max retries -> manual_review.

### Failure Handling
All failures persist with lastError. Manual review backlog is queryable by admins.

### Deployment Steps
1. Start retry cron in admin bootstrap path.
2. Verify queue rows transition from retrying to processing.
3. Confirm no duplicate BullMQ job IDs for same row.

### Rollback Steps
1. Stop retry cron startup.
2. Process manual retry via admin endpoint only.
3. Keep queue state for postmortem.

## Phase 4: Duplicate Protection
### Purpose
Prevent duplicate complaint submissions for same tracking ID while complaint is active.

### File Paths
- apps/api/src/services/complaint-queue.service.ts
- apps/api/src/routes/tracking.ts

### Data Flow
Before enqueue: check active complaint in queue + shipment lifecycle. If duplicate exists, return complaint id and due date.

### Retry Logic
Duplicates are not retried and do not create queue rows.

### Failure Handling
Duplicate response includes duplicate=true and prior complaint metadata.

### Deployment Steps
1. Enable duplicate check before queue insert.
2. Validate HTTP 409 payload format for UI.

### Rollback Steps
1. Revert queue duplicate gate.
2. Keep shipment duplicate parser as fallback.

## Phase 5: Status Sync
### Purpose
Keep complaint lifecycle aligned with latest tracking events.

### File Paths
- apps/api/src/services/complaint-sync.service.ts
- apps/api/src/jobs/complaint-sync.job.ts

### Data Flow
Scheduled sync -> read complaint records -> track live status -> derive state open/in-process/resolved/closed -> update metadata and audit log.

### Retry Logic
Sync is periodic every 6 hours. Failures are logged and retried on next schedule.

### Failure Handling
Per-tracking sync errors are isolated and do not stop batch.

### Deployment Steps
1. Start complaint sync job scheduler.
2. Validate state transitions and audit entries.

### Rollback Steps
1. Stop sync scheduler startup.
2. Keep manual sync endpoint enabled.

## Phase 6: Backup Cron
### Purpose
Capture complaint data, generated files, and audit logs for recovery.

### File Paths
- apps/api/src/jobs/complaint-backup.job.ts

### Data Flow
Every 12 hours create timestamp snapshot folders for complaints, labels, money-orders, and audit logs.

### Retry Logic
Backup cron retries on next 12-hour cycle.

### Failure Handling
Backup errors are logged; cleanup failures do not crash API.

### Deployment Steps
1. Start backup job startup hook.
2. Verify snapshot files and retention cleanup.

### Rollback Steps
1. Stop backup scheduler startup.
2. Keep existing snapshots unchanged.

## Phase 7: Circuit Breaker
### Purpose
Stop hammering complaint provider during failure spikes.

### File Paths
- apps/api/src/services/complaint-circuit.service.ts
- apps/api/src/processors/complaint.processor.ts

### Data Flow
Worker failure events -> circuit event table -> state transition closed/open/half_open -> open state keeps requests queued only.

### Retry Logic
Open state cools down then half_open; success closes circuit.

### Failure Handling
Rule: 5 failures in 10 minutes opens circuit.

### Deployment Steps
1. Ensure circuit tables auto-create.
2. Validate state transitions through logs/API.

### Rollback Steps
1. Bypass circuit checks in processor.
2. Keep historical circuit events.

## Phase 8: Structure Watcher
### Purpose
Detect complaint form structure drift before mass failures.

### File Paths
- apps/api/src/jobs/complaint-watch.job.ts

### Data Flow
Every 6 hours save snapshot of expected field IDs, hidden fields, form action, and dropdown IDs.

### Retry Logic
Watcher reruns on next schedule.

### Failure Handling
Snapshot with alert_required=true indicates admin action required.

### Deployment Steps
1. Start watcher scheduler.
2. Verify snapshots persist in complaint_watch_snapshots.

### Rollback Steps
1. Stop watcher scheduler.
2. Keep existing snapshots for diagnostics.

## Phase 9: Browser Bootstrap
### Purpose
Capture browser token state and pass it to queue for worker use.

### File Paths
- apps/web/src/components/ComplaintModal.tsx
- apps/web/src/pages/BulkTracking.tsx
- apps/api/src/routes/tracking.ts

### Data Flow
Web captures cookies/viewstate/eventvalidation -> API stores browserSessionJson in ComplaintQueue -> worker can consume payload context.

### Retry Logic
Bootstrap payload stays attached to queue row for retries.

### Failure Handling
Missing tokens do not block queueing; submission relies on existing python fallback behavior.

### Deployment Steps
1. Deploy web payload changes and API schema/parser together.
2. Validate browser_session appears in queue rows.

### Rollback Steps
1. Remove browser_session from payload.
2. Keep queue rows and worker processing intact.

## Phase 10: SLA Alerts
### Purpose
Create due-date warning notifications for complaint SLA deadlines.

### File Paths
- apps/api/src/jobs/complaint-sla.job.ts

### Data Flow
Daily run evaluates due dates and inserts unique notifications for 2 days before, 1 day before, and due day.

### Retry Logic
Daily schedule and idempotent insert logic prevent duplicate spam.

### Failure Handling
Errors are logged and retried next day.

### Deployment Steps
1. Start SLA scheduler startup.
2. Validate complaint_notification_logs entries.

### Rollback Steps
1. Stop SLA scheduler startup.
2. Preserve existing alert history.
