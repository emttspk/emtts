# Complaint Architecture

## Purpose
Define complaint reliability architecture across API, worker, queue storage, and scheduled jobs.

## File Paths
- apps/api/src/routes/tracking.ts
- apps/api/src/services/complaint-queue.service.ts
- apps/api/src/services/complaint-circuit.service.ts
- apps/api/src/processors/complaint.processor.ts
- apps/api/src/worker.ts
- apps/api/src/jobs/complaint-retry.job.ts
- apps/api/src/jobs/complaint-sync.job.ts
- apps/api/src/jobs/complaint-backup.job.ts
- apps/api/src/jobs/complaint-watch.job.ts
- apps/api/src/jobs/complaint-sla.job.ts
- apps/web/src/components/ComplaintModal.tsx
- apps/web/src/pages/BulkTracking.tsx

## Data Flow
1. Complaint request enters API tracking route.
2. API validates required complaint fields and duplicate state.
3. API writes ComplaintQueue row and creates COMPLAINT tracking job.
4. BullMQ worker executes complaint processor by queue ID.
5. Processor calls existing python complaint submit logic.
6. Processor writes shipment complaint status/text and queue status.
7. Retry cron re-enqueues failed rows when nextRetryAt is due.
8. Sync/SLA/watch/backup jobs run independently on schedule.

## Retry Logic
- Retry schedule: 5, 15, 30, 60, 180 minutes.
- Maximum retries: 6.
- Terminal failure state: manual_review.
- Every failure stores lastError and retryCount.

## Failure Handling
- Circuit breaker opens after 5 failures in 10 minutes.
- Open circuit keeps new requests queued (no external submit attempt).
- Half-open allows recovery probe; success closes breaker.
- Worker-level failures are persisted, not lost.

## Deployment Steps
1. Apply Prisma migration for ComplaintQueue.
2. Deploy API route/service/job changes.
3. Deploy worker processor changes.
4. Run build and typecheck.
5. Validate admin complaint queue endpoint and retry action.

## Rollback Steps
1. Revert complaint route enqueue/worker changes.
2. Disable complaint cron starters.
3. Continue using shipment complaint metadata for read-only continuity.
4. Keep queued rows for postmortem and manual replay.
