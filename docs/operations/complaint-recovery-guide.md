# Complaint Recovery Guide

## Purpose
Operational recovery playbook for complaint queue incidents and degraded complaint submission behavior.

## File Paths
- apps/api/src/services/complaint-queue.service.ts
- apps/api/src/services/complaint-circuit.service.ts
- apps/api/src/processors/complaint.processor.ts
- apps/api/src/jobs/complaint-retry.job.ts
- apps/api/src/routes/admin.ts

## Data Flow
Incident triage starts from admin complaint queue endpoint. Queue state, retry counts, and circuit state determine recovery path.

## Retry Logic
- Auto retry attempts follow 5m, 15m, 30m, 60m, 180m schedule.
- Max retries 6, then manual_review.
- Admin can trigger global retry or queue-id retry.

## Failure Handling
- If circuit state is open, do not force direct submission.
- Investigate Python service and upstream form availability first.
- Use manual override endpoint only with verified complaint ID and due date.

## Deployment Steps
1. Confirm API/worker are healthy.
2. Trigger admin retry endpoint for due queue rows.
3. Monitor complaint queue transitions and worker result files.
4. Run sync job to align status post-recovery.

## Rollback Steps
1. Disable retry/sync/watch/sla starters in admin route.
2. Revert complaint route enqueue if necessary.
3. Preserve queue and audit tables for forensic review.

## Recovery Checklist
1. Check circuit state.
2. Check queue backlog volume and oldest nextRetryAt.
3. Retry one known-safe queue row.
4. Verify shipment complaintText and complaintStatus update.
5. Run status sync.
6. Confirm SLA notifications and audit logs continue.
