# Sample Complaint Document

**Source:** Sanitized from production data — epost.pk  
**Date:** 2026-05-07  
**Purpose:** Full example of a complaint lifecycle record, payloads, and stored metadata.

---

## 1. Shipment Details

| Field | Value |
|---|---|
| Tracking ID | VPL25110252 |
| Article Type | Small Packet |
| Booking Office | Sahiwal |
| Destination Office | Lahore |
| Shipper | [Sanitized] |
| Consignee | [Sanitized] |
| Phone | 0321XXXXXXX (sanitized) |
| Collect Amount | PKR 1,025 |
| Ordered Via | METAFORM |
| Events Recorded | 14 scan events |

---

## 2. Complaint Details

| Field | Value |
|---|---|
| Complaint ID | CMP-001400 |
| Tracking ID | VPL25110252 |
| Attempt Number | 1 |
| Previous Complaint Reference | (none — first attempt) |
| Filed Date | 2026-05-07 15:33:21 UTC |
| Due Date | 14-05-2026 |
| Complaint State | RESOLVED |
| Last Sync | 2026-05-07 18:00:29 UTC |
| Last Tracking Status | RETURNED |
| Remarks | Live complaint finalization smoke for VPL25110252 |
| Escalation Remarks | (none) |
| Reopen Reason | (not reopened — single attempt) |

---

## 3. Pakistan Post Payload (Sanitized)

The payload sent to Pakistan Post complaint endpoint:

```json
{
  "ArticleNo": "VPL25110252",
  "ArticleType": "Small Packet",
  "BookingOffice": "Sahiwal",
  "DestinationOffice": "Lahore",
  "SenderName": "[Sanitized Sender]",
  "SenderAddress": "[Sanitized Address]",
  "SenderPhone": "03XXXXXXXXX",
  "ReceiverName": "[Sanitized Receiver]",
  "ReceiverAddress": "[Sanitized Address]",
  "ReceiverPhone": "0321XXXXXXX",
  "Mobile": "0321XXXXXXX",
  "BookingDate": "2025-11-XX",
  "ComplaintDate": "2026-05-07",
  "Remarks": "Live complaint finalization smoke for VPL25110252 at 2026-05-07T15:32:03.574Z",
  "CollectAmount": 1025
}
```

---

## 4. Pakistan Post Response

```json
{
  "success": true,
  "complaintId": "CMP-001400",
  "message": "You complaint has been submitted successfully. A Pakistan Post representative will contact you soon. Thanks!",
  "dueDate": "14-05-2026"
}
```

---

## 5. Stored `complaintText` Blob (Raw)

```
COMPLAINT_ID: CMP-001400 | DUE_DATE: 14-05-2026 | COMPLAINT_STATE: RESOLVED | LAST_SYNC_AT: 2026-05-07T18:00:29.989Z | LAST_TRACKING_STATUS: RETURNED
User complaint:
Live complaint finalization smoke for VPL25110252 at 2026-05-07T15:32:03.574Z

Response:
You complaint has been submitted successfully. A Pakistan Post representative will contact you soon. Thanks!

COMPLAINT_HISTORY_JSON: {"entries":[{"complaintId":"CMP-001400","trackingId":"VPL25110252","createdAt":"2026-05-07T15:33:21.447Z","dueDate":"14-05-2026","status":"ACTIVE","attemptNumber":1,"previousComplaintReference":""}]}
```

---

## 6. COMPLAINT_HISTORY_JSON Parsed

```json
{
  "entries": [
    {
      "complaintId": "CMP-001400",
      "trackingId": "VPL25110252",
      "createdAt": "2026-05-07T15:33:21.447Z",
      "dueDate": "14-05-2026",
      "status": "ACTIVE",
      "attemptNumber": 1,
      "previousComplaintReference": ""
    }
  ]
}
```

---

## 7. Due Date Logic

| Field | Value |
|---|---|
| Filed Date | 2026-05-07 |
| Due Date | 2026-05-14 (7 calendar days) |
| Due Date Source | Pakistan Post response field `dueDate` |
| Due Date Expiry | After 14-05-2026, complaint is eligible for reopen |

The due date is returned by Pakistan Post in `DD-MM-YYYY` format in the complaint submission response. The system stores it as-is in `complaintText` and in the `ComplaintQueue.dueDate` column (as a `DateTime`).

---

## 8. Reopen Logic

A new complaint can be filed for the same tracking number when:
- The previous complaint's `dueDate` has passed (i.e., `dueDate < now`)
- OR there is no active complaint for that tracking number

**Implementation:** `findActiveComplaintDuplicate()` in `complaint-queue.service.ts` checks:
```typescript
if (queueDuplicate.dueDate && queueDuplicate.dueDate < now) {
  // Past due — not a blocking duplicate, allow new complaint
  continue;
}
```

---

## 9. Complaint States

| State | Meaning |
|---|---|
| `queued` | Added to queue, not yet submitted |
| `processing` | Submission in progress (browser session active) |
| `submitted` | Successfully submitted to Pakistan Post |
| `retry_pending` | Failed, scheduled for retry |
| `duplicate` | Duplicate detected, skipped |
| `manual_review` | Failed multiple retries, needs manual intervention |
| `resolved` | Complaint closed by Pakistan Post |
| `closed` | Manually closed |

---

## 10. Complaint Amount (Stats)

The `complaintAmount` in `/api/shipments/stats` is computed as:

```
complaintAmount = sum of CollectAmount for all shipments
  WHERE ComplaintQueue.userId = userId
  AND ComplaintQueue.complaintStatus IN ['queued', 'processing', 'submitted', 'retry_pending', 'manual_review']
  AND ComplaintQueue.trackingId = Shipment.trackingNumber
```

This reflects the monetary value of shipments currently under active complaint.

---

## 11. API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tracking/complaint` | File a new complaint |
| `GET` | `/api/shipments/stats` | Get stats including `complaintAmount` and `complaints` count |
| `GET` | `/api/admin/complaints/monitor` | Admin: view complaint queue |
| `POST` | `/api/admin/complaints/:id/process` | Admin: manually process a queued complaint |

---

## 12. Frontend Lifecycle States (BulkTracking)

| State | Shown When |
|---|---|
| `NOT_REQUIRED` | `complaintStatus === 'NOT_REQUIRED'` |
| `FILED` | `complaintStatus === 'FILED'` |
| `ACTIVE` | Active complaint in queue |
| `RESOLVED` | `COMPLAINT_STATE: RESOLVED` in complaintText |
| `View History (N)` | Button shown when `complaintCount > 0` |

The "View History" button opens a modal listing all past complaint attempts from `COMPLAINT_HISTORY_JSON`.

---

## 13. Live Reopen Example (Verified)

The following production reopen cycle was verified live after the final API gating fix.

| Field | Value |
|---|---|
| Tracking ID | VPL13688853 |
| Previous Complaint ID | CMP-312118 |
| Previous Due Date | 09-05-2026 |
| Previous Stored State | CLOSED |
| New Complaint ID | CMP-349225 |
| New Due Date | 15-05-2026 |
| Attempt Number | 2 |
| Previous Complaint Reference | CMP-312118 |
| New Entry Status | ACTIVE |

### Live Submission Result

```json
{
  "success": true,
  "queued": true,
  "jobId": "d5bb1afc-f9b2-461f-88aa-450f1c18a5f7",
  "trackingId": "VPL13688853",
  "status": "QUEUED",
  "message": "Complaint queued for worker processing."
}
```

### Stored Reopen `complaintText` Excerpt

```text
COMPLAINT_ID: CMP-349225 | DUE_DATE: 15-05-2026 | COMPLAINT_STATE: ACTIVE
User complaint:
FINAL_VERIFICATION_REOPEN 2026-05-08T10:15:05.117Z

Previous Complaint IDs:
CMP-312118

Previous Due Dates:
09-05-2026

Previous Remarks:
1. Dear Complaint Team,
   ... prior complaint body persisted ...

Repeated unresolved complaint.
Closing unresolved complaint without written legal response may result in escalation before PMG office, Consumer Court, or Federal Ombudsman.
```

### Persisted `COMPLAINT_HISTORY_JSON`

```json
{
  "entries": [
    {
      "complaintId": "CMP-312118",
      "trackingId": "VPL13688853",
      "createdAt": "2026-05-08T10:15:49.247Z",
      "dueDate": "09-05-2026",
      "status": "CLOSED",
      "attemptNumber": 1,
      "previousComplaintReference": "",
      "userComplaint": "Dear Complaint Team, ..."
    },
    {
      "complaintId": "CMP-349225",
      "trackingId": "VPL13688853",
      "createdAt": "2026-05-08T10:15:49.247Z",
      "dueDate": "15-05-2026",
      "status": "ACTIVE",
      "attemptNumber": 2,
      "previousComplaintReference": "CMP-312118",
      "userComplaint": "FINAL_VERIFICATION_REOPEN 2026-05-08T10:15:05.117Z"
    }
  ]
}
```

This confirms the final required behavior: terminal-state complaints can reopen, a new complaint ID and due date are created, previous IDs and due dates are appended, previous remarks are preserved, the mandatory escalation warning is present, and the lifecycle is persisted in the database.

---

## 14. Post-Deploy Runtime Reopen Example (Latest)

Final proof captured after commit `2f65f76` and Railway deployment `2622b258-a8d9-4508-aead-c0bb68896269`.

| Field | Value |
|---|---|
| Tracking ID | VPL25110554 |
| Previous Complaint ID | CMP-663087 |
| Previous Due Date | 09-05-2026 |
| New Complaint ID | CMP-474826 |
| New Due Date | 15-05-2026 |
| Attempt Number | 2 |
| Previous Complaint Reference | CMP-663087 |
| New Entry Status | ACTIVE |

### Required Remarks Append (Exact)

```text
Previous Complaint IDs:
CMP-663087

Previous Due Dates:
09-05-2026

Previous Remarks:
1. Dear Complaint Team, ...

This complaint remains unresolved despite previous closure.
Closing unresolved complaint without written lawful response may result in escalation before Consumer Court, PMG office, or Federal Ombudsman.
```

### Persisted History (Post-Deploy)

From `temp-live-reopen-proof-postdeploy.json`:

```json
{
  "complaintId": "CMP-474826",
  "trackingId": "VPL25110554",
  "dueDate": "15-05-2026",
  "status": "ACTIVE",
  "attemptNumber": 2,
  "previousComplaintReference": "CMP-663087"
}
```

This confirms the runtime post-deploy behavior required by the mandatory bug fix loop: new reopen complaint created, due date rotated, history appended, and exact warning persisted.
