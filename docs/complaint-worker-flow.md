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
8. Retry cron re-enqueues queued/retrying rows.

## Retry Logic
- queue retryCount increments on failure.
- nextRetryAt computed by fixed schedule.
- after 6 attempts, queue row moves to manual_review.

## Failure Handling
- Circuit open: queue remains queued/retrying and external submit is skipped.
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
