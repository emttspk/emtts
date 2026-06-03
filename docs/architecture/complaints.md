# Complaint System — Full Lifecycle

## Overview
The complaint system automates Pakistan Post complaint registration via the ep.gov.pk ASP.NET portal. It handles district/tehsil/location hierarchy, retry on network failures, duplicate detection, and persistent status tracking.

## Flow

```
User (BulkTracking.tsx)
  ↓ POST /api/tracking/complaint
Node API (apps/api/src/routes/tracking.ts)
  ↓ Validates fields, checks for existing active complaint (409)
  ↓ Builds complaintContext from shipment rawJson + user profile
  ↓ Calls pythonSubmitComplaint()
Python Service (python-service/app.py)
  ↓ Resolves complaint form URL
  ↓ Article No postback → DDDistrict postback → DDTehsil postback → DDLocations
  ↓ Fills all required form fields
  ↓ Submits with fuplAttatchment (empty file)
Pakistan Post (ep.gov.pk)
  ↓ Returns complaint ID (CMP-XXXXXX) and due date
Node API
  ↓ Parses complaint ID and due date from response
  ↓ Stores in shipment.complaintText and shipment.complaintStatus = "FILED"
  ↓ Charges COMPLAINT_UNIT_COST from user's unit balance
  ↓ Returns complaintId, dueDate, trackingId to frontend
Frontend
  ↓ Closes modal, refreshes shipments list
  ↓ Row now shows Complaint ID badge instead of button
```

## Required Fields
All of these must be non-empty and not "-" for the complaint to proceed:
- `ArticleNo` — tracking number
- `SenderName` — sender's company/name
- `SenderAddress` — sender's address
- `ReceiverName` — consignee name
- `ReceiverAddress` — consignee address
- `SenderCity` — sender city (matched to dropdown)
- `ReceiverCity` — receiver city (matched to dropdown)
- `District` — district ID from ep.gov.pk hierarchy
- `Tehsil` — tehsil ID from ep.gov.pk hierarchy
- `DeliveryOffice` — delivery location ID from ep.gov.pk hierarchy
- `Mobile` — 03XXXXXXXXX formatted phone
- `Remarks` — complaint text

## Autofill Logic
The district/tehsil/location hierarchy is auto-resolved from `city/post office list.csv`:
1. Delivery office from tracking events → matched against CSV
2. Prefill endpoint (`/api/tracking/complaint/prefill/:tn`) returns matched district/tehsil/location plus canonical `addresseeName`, `addresseeAddress`, and `addresseeCity`
3. Frontend waits for complaint prefill to finish before enabling submit
4. Addressee fields map in this order: API prefill → tracking raw dataset → upload dataset fallback
5. If no hierarchy match is found, the first available district/tehsil/location is used as fallback

## Complaint Status Card
- Active complaints replace the row-level complaint button with a clickable green card
- Card displays `Complaint ID`, `Due Date`, and a compact status badge
- Clicking the card opens the complaint modal in detail mode and disables re-submission while the complaint is active

## Complaint State Rules (2026-06-03)

## Stuck PROCESSING Timeout Guard (2026-06-03)

### Problem
Queue rows set to `processing` by `markComplaintQueueProcessing()` could remain stuck indefinitely if:
- A DB/network error occurred between `markComplaintQueueProcessing()` and the main `try/catch` in `processComplaintQueueById`.
- The BullMQ job expired or the worker crashed before completing.

`getQueuedComplaintsForRetry` only picks `queued | retry_pending`, so stuck `processing` rows were never retried.

### Fix
- **`COMPLAINT_PROCESSING_STALE_AFTER_MS = 10 minutes`** — stale threshold constant.
- **`rescueStuckProcessingComplaints()`** — runs at every complaint-retry cron sweep (every 1 minute). Finds all `processing` rows with `updatedAt < now - 10min` and transitions them to `retry_pending` (or `manual_review` if retries exhausted).
- **`processComplaintQueueById`** — all I/O after `markComplaintQueueProcessing()` is now inside the `try/catch`, eliminating the stuck-state path.
- **`findActiveComplaintDuplicate`** — skips stale `processing` rows so they do not block reopen submissions.

### Queue State Transitions
```
QUEUED → (worker picks up) → PROCESSING
  → SUBMITTED | DUPLICATE      (success)
  → RETRY_PENDING               (failure, retries remaining)
  → MANUAL_REVIEW               (failure, max retries exhausted)
  → RETRY_PENDING               (rescue: stuck > 10 min, retries remaining)
  → MANUAL_REVIEW               (rescue: stuck > 10 min, max retries exhausted)
```

### UI Behavior
- Cards with `PROCESSING` elapsed > 10 minutes show "Stale — Pending Retry (HH:MM:SS)" instead of "Processing...".
- A 5-second fast-refresh effect activates when any stale PROCESSING card is visible (admin view).

## Complaint History Idempotency + Timer Stop (2026-06-03)

### Problem
- A duplicate worker callback could append the same complaint ID again, causing:
  - `Complaint Count` inflation (e.g., 2 after one real submit)
  - duplicate `Attempt #1` cards
- UI could continue showing PROCESSING timer even after complaint ID/due date existed.

### Backend Rules
- Stored history is normalized to unique complaint IDs (`CMP-*`) and sequential attempts.
- Appending history is idempotent:
  - if incoming complaint ID already exists, do not append a new history row.
  - reopen adds one new row only when complaint ID is genuinely new.
- `complaintStateReason` is based on effective latest attempt after dedupe.

### UI Rules
- If complaint ID and due date are present, card state resolves to `ACTIVE`.
- If queue state is `SUBMITTED` or `DUPLICATE`, card resolves to `ACTIVE`.
- PROCESSING timer appears only when queue is actually `processing` and no complaint ID exists yet.
- History modal deduplicates repeated complaint IDs and re-sequences attempts to avoid duplicate labels.

### Migration Artifact
- Prisma migration SQL created for missing table:
  - `apps/api/prisma/migrations/20260603223000_add_complaint_notifications/migration.sql`


- Newly submitted complaint state starts as `ACTIVE`.
- Reopened/resubmitted complaint state starts as `ACTIVE`.
- If authoritative shipment status is `PENDING` (system or manual override), complaint state must remain `ACTIVE` or `PROCESSING`.
- Complaint becomes `RESOLVED` only when latest verified Pakistan Post tracking state is `DELIVERED` or `RETURNED`.
- If tracking is unavailable/uncertain during sync, complaint must not resolve and remains `ACTIVE` or `PROCESSING`.
- Sync metadata persisted in complaint header:
  - `shipmentStatusAtComplaintSubmit`
  - `trackingStateAtSync`
  - `complaintStateReason`

## Sync, Alerts, And Audit
- `POST /api/admin/complaints/sync` manually syncs complaint state
- Scheduled sync runs every 6 hours
- Derived states: `ACTIVE`, `PROCESSING`, `RESOLVED`, `CLOSED`
- SLA alerts are stored in `complaint_notification_logs`
- Admin audit entries are stored in `complaint_audit_logs`
- CSV export endpoint: `GET /api/admin/complaints/export`
- Audit feed endpoint: `GET /api/admin/complaint-audit`

## Backup
- Complaint backup runs every 12 hours
- Snapshots are stored under:
  - `/backups/complaints/`
  - `/backups/labels/`
  - `/backups/money-orders/`
- Last 30 snapshots are retained per category

## Duplicate Handling
- Before submission, `parseStoredComplaintLifecycle()` checks `shipment.complaintText` for an existing `COMPLAINT_ID` with a future `DUE_DATE`
- If active: returns HTTP 409 with existing `complaintId` and `dueDate`
- Frontend shows "Complaint already active" alert and does not re-submit

## Storage Format
```
COMPLAINT_ID: CMP-984183 | DUE_DATE: 03-05-2026 | COMPLAINT_STATE: ACTIVE | shipmentStatusAtComplaintSubmit: PENDING | trackingStateAtSync: UNSYNCED | complaintStateReason: submitted_pending_sync
User complaint:
[user remarks]

Response:
[full response text from Pakistan Post]
```

## Unit Consumption
- `COMPLAINT_UNIT_COST` units are deducted on `FILED` status only
- Daily and monthly limits enforced via `getComplaintAllowance()`
- On `FAILED` status, units are NOT charged (or refunded if pre-checked)

## Retry Logic
- 3 attempts max with delays: 2s / 4s / 8s between retries
- Retries triggered on: `ConnectionReset`, `ReadTimeout`, `ConnectionError`, `ProtocolError`
- Per-request timeout: 90 seconds
