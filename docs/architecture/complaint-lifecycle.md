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

## Classification Rules

### Active Complaints
- Within due date, tracking not yet terminal.
- Keep in active process. Continue sync/watch/reopen logic normally.
- Display: green badge "FILED"

### Overdue Complaints
- Due date has passed, tracking not yet confirmed delivered/returned.
- Keep in follow-up process. Show overdue clearly.
- **Reopen allowed only if**:
  - shipment is still PENDING
  - no queue is in flight (QUEUED, PROCESSING, RETRY_PENDING)
  - plan limits allow (sufficient complaint units)
- Display: amber badge "OVERDUE"

### Legacy Due Date Review
- Multi-attempt complaints submitted between 2026-05-02 and 2026-06-10
  where attempt 2+ may have inherited a stale due date from the previous
  attempt (bug fixed in commit `c3b62f0`).
- Automatically detected by `detectLegacyDueDateReview()` via
  `isLegacyDueDateInheritedEntry()` — checks each entry's `createdAt`
  against the bug window (`LEGACY_DUE_DATE_BUG_START` to `LEGACY_DUE_DATE_BUG_END`).
- **Do NOT modify** closed/settled records.
- For active/overdue affected records, `legacyDueDateReview: true` is set
  for admin visibility. No due dates are guessed.
- Display: flagged for admin review

### Closed / Settled Complaints
- RESOLVED or CLOSED state.
- Leave as final. Do not modify history. Do not reopen automatically.
- Display: grey badge

## Sync Lifecycle State Transitions
The sync job (`complaint-sync.service.ts:deriveComplaintState`) transitions COMPLAINT_STATE as follows:

- **ACTIVE** → starts here on successful filing
- **ACTIVE → OVERDUE**: due date passed, tracking not yet terminal
- **ACTIVE → RESOLVED**: live tracking confirms DELIVERED or RETURNED (priority over stale `shipment.status`)
- **RESOLVED → CLOSED**: confirmed on second sync cycle
- **OVERDUE → RESOLVED**: live tracking confirms DELIVERED or RETURNED

State changes are written to `complaintText` metadata. The `shipment.status` column is read only as a fallback — live tracking data takes precedence when available. This ordering was corrected in June 2026; previously, stale `shipment.status=PENDING` blocked RESOLVED for delivered shipments.

## Production Evidence
- `temp-out-complaint-finalization.utf8.txt`:
  - `submitHttp=200`
  - `queueStates=["QUEUED","PROCESSING","SUBMITTED"]`
  - `finalJobStatus="COMPLETED"`
  - `finalShipment.complaintStatus="FILED"`
  - `finalShipment.complaintId="CMP-001400"`
  - `finalShipment.dueDate="14-05-2026"`
