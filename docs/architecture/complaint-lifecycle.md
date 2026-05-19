# Complaint Lifecycle (Production-Verified)

## Scope
Complaint flow for tracking workspace and complaints page, including queue status, due-date persistence, and reopen behavior.

## Implemented Flow
1. User submits complaint via `POST /api/tracking/complaint`.
2. API queues request and returns job metadata (`jobId`, `status=QUEUED`).
3. Worker processes queue (`QUEUED -> PROCESSING -> SUBMITTED/COMPLETED`).
4. Shipment persists structured state in complaint text:
   - `COMPLAINT_ID`
   - `DUE_DATE`
   - `COMPLAINT_STATE`
   - `COMPLAINT_HISTORY_JSON` marker with attempt chain

## Production Evidence
- `temp-out-complaint-finalization.utf8.txt`:
  - `submitHttp=200`
  - `queueStates=["QUEUED","PROCESSING","SUBMITTED"]`
  - `finalJobStatus="COMPLETED"`
  - `finalShipment.complaintStatus="FILED"`
  - `finalShipment.complaintId="CMP-001400"`
  - `finalShipment.dueDate="14-05-2026"`

## Reopen Attempt (Current Result)
- `temp-out-reopen-test.txt`:
  - target tracking: `VPL26030723`
  - submit result: `409 duplicate`
  - message: `Complaint already active for tracking VPL26030723`

Status: reopen re-submission on overdue complaint is currently failing in production verification (expected new attempt, observed duplicate block).
