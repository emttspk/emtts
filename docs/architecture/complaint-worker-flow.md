# Complaint Worker Flow

## Purpose
Explain worker-side complaint execution lifecycle with queue reliability controls.

## File Paths
- apps/api/src/worker.ts
- apps/api/src/processors/complaint.processor.ts
- apps/api/src/services/complaint-queue.service.ts
- apps/api/src/services/complaint-circuit.service.ts
- apps/api/src/services/trackingService.ts

## Data Flow
1. API enqueues COMPLAINT job and queue row.
2. Worker receives COMPLAINT job.
3. Worker calls complaint processor with queue ID.
4. Processor marks queue processing.
5. Processor checks circuit breaker state.
6. If closed/half_open, processor calls pythonSubmitComplaint.
7. Processor parses complaint id/due date and updates shipment + queue.
8. Retry cron re-enqueues queued/retry_pending rows.
9. Admin monitor (/api/admin/complaints/monitor) reports queue + circuit + complaint summary.

## Sync Lifecycle State Resolution
The sync job (`complaint-sync.service.ts`) runs every 6 hours. Its `deriveComplaintState` function resolves COMPLAINT_STATE using this priority:

1. Manual pending override (admin action) — blocks resolution
2. **Live tracking DELIVERED/RETURNED** — transitions to RESOLVED/CLOSED
3. Stale `shipment.status` field — only checked if live tracking is non-terminal
4. Tracking unavailable — stays ACTIVE or transitions to OVERDUE
5. Due date passed — transitions to OVERDUE

This ordering was corrected in June 2026. Previously, the stale `shipment.status === "PENDING"` check (step 3) ran before the live tracking check (step 2), preventing 165 complaints with confirmed DELIVERED/RETURNED tracking from reaching RESOLVED.

## Retry Logic
- queue retryCount increments on failure.
- nextRetryAt computed by fixed schedule.
- retry status uses retry_pending (legacy retrying is normalized for reads).
- after 6 attempts, queue row moves to manual_review.

## Failure Handling
- Circuit open: queue remains queued/retry_pending and external submit is skipped.
- Python/network errors: persist lastError and schedule retry.
- Non-retryable repeated failures: manual_review.

## Deployment Steps
1. Deploy worker with complaint.processor import.
2. Confirm COMPLAINT jobs complete or fail with persisted error.
3. Validate complaint result JSON in outputs directory.

## Rollback Steps
1. Revert worker complaint branch to legacy behavior.
2. Leave queue tables intact for audit.
3. Disable retry cron if rollback requires frozen state.
