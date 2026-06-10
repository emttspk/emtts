# Complaint UI

**File**: `apps/web/src/pages/BulkTracking.tsx`  
**Last updated**: 2026-06-10

## Card Rendering

Each tracking table row has a complaint card (rightmost column) showing:

| Section | Content |
|---------|---------|
| Complaint ID | From lifecycle or queue snapshot |
| Due Date | From lifecycle or queue snapshot |
| Attempt count | From history entries count |
| Stage badge | Color-coded badge (see below) |
| Timer | Live elapsed timer for in-flight states |
| State message | Contextual help text |
| Action button | Context-sensitive (Complaint, Reopen, Filed, etc.) |
| History button | If complaintCount > 0 |
| Confirm Resolved | If shipment delivered and complaint active/overdue |

## Stage Badges

| Badge | Color | Meaning |
|-------|-------|---------|
| QUEUED | Slate | Waiting for worker to pick up |
| PROCESSING | Blue | Worker is submitting to Pakistan Post |
| SUBMITTED | Emerald | Successfully submitted (queue) |
| FILED | Emerald | Complaint registered (shipment record) |
| RETRY PENDING | Amber | Failed, will retry automatically |
| MANUAL REVIEW | Red | Max retries reached, needs admin attention |
| SUBMITTING | Slate | Transitioning to submitted state |
| FAILED | Red | Submission failed permanently |
| ERROR | Red | Network/parser error |
| ACTIVE | Violet | Within due date, tracking not terminal |
| OVERDUE | Orange | Due date passed, tracking not terminal |
| IN PROCESS | Blue | Reopen in progress or queue active |
| RESOLVED | Emerald | Live tracking confirms delivery/return |
| CLOSED | Emerald | Admin closed or second sync confirmed |

## Processing Timer

When queue status is `queued`, `processing`, or `retry_pending` and no
`complaintId` has been received yet, a live elapsed timer shows:

| Duration | Display |
|----------|---------|
| 0-5 min | `QUEUED... 00:32` / `PROCESSING... 01:45` |
| 5-10 min | `Taking longer than expected (05:22)` |
| 10+ min | `Stale — Pending Retry (12:05)` |

## Auto-Refresh

Two mechanisms keep the card updated:

1. **Post-submit polling** (schedulePostSubmitRefresh): Every 2s for up to 120s
   after a complaint is submitted. Refreshes both shipments and queue data.

2. **In-flight watcher** (useEffect on complaintQueueByTracking): Every 3s while
   any queue entry is in-flight (queued/processing/retry_pending without
   complaintId, or submitted/duplicate with complaintId). Automatically stops
   when all entries settle.

## Action Labels

| Label | When Shown |
|-------|-----------|
| Complaint | No existing complaint |
| Queued for Submission | Queue status = QUEUED |
| Submitting to Pakistan Post... | Queue status = PROCESSING |
| Retry Pending | Queue status = RETRY PENDING |
| Complaint requires manual review | Queue status = MANUAL REVIEW |
| Filed | Queue status = SUBMITTED or DUPLICATE |
| Reopen Complaint | Shipment PENDING, complaint terminal/due expired |
| In Process | Reopen in progress or active complaint |
