# Complaint Full Map

**System:** epost.pk — Pakistan Post complaint integration  
**Version:** 2.0 (multi-attempt chain)  
**Last Updated:** 2026-05-08

---

## 1. Complaint Schema

### Shipment Record (Postgres — `shipments` table)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Internal row ID |
| `userId` | string | Owner user ID |
| `trackingNumber` | string | Pakistan Post tracking number (e.g. VPL...) |
| `complaintStatus` | string | `FILED` / `ERROR` / `null` |
| `complaintText` | text | Full structured complaint text blob (see §3) |
| `updatedAt` | DateTime | Last modification time |

### ComplaintQueue Record (Postgres — `complaint_queue` table)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Queue row ID |
| `userId` | string | Owner user ID |
| `trackingId` | string | Pakistan Post tracking number |
| `payloadJson` | JSON | Full submission payload (see §2) |
| `complaintStatus` | string | `queued` / `processing` / `submitted` / `duplicate` / `retry_pending` / `manual_review` / `resolved` / `closed` |
| `complaintId` | string? | Returned complaint ID from Pakistan Post (e.g. `CMP-001400`) |
| `dueDate` | DateTime? | Due date returned from Pakistan Post |
| `retryCount` | int | Number of retry attempts |
| `nextRetryAt` | DateTime? | Scheduled next retry time |
| `lastError` | string? | Last error message |
| `browserSessionJson` | JSON? | Browser session state for worker |
| `createdAt` | DateTime | Queue submission time |
| `updatedAt` | DateTime | Last update time |

---

## 2. Pakistan Post Payload Fields

```typescript
type ComplaintQueuePayload = {
  tracking_number: string;        // Required: e.g. "VPL26030761"
  phone: string;                  // Required: complainant phone
  complaint_text: string;         // Required: free-text complaint
  attempt_number?: number;        // Attempt # in chain (1, 2, 3...)
  previous_complaint_reference?: string; // Prior complaint ID for chain
  sender_name?: string;           // Sender name
  sender_address?: string;        // Sender address
  sender_city_value?: string;     // Sender city (district/location)
  receiver_name?: string;         // Receiver name
  receiver_address?: string;      // Receiver address
  receiver_city_value?: string;   // Receiver city
  receiver_contact?: string;      // Receiver phone
  booking_date?: string;          // Booking date DD-MM-YYYY
  booking_office?: string;        // Booking post office
  complaint_reason?: string;      // e.g. "Pending Delivery"
  prefer_reply_mode?: "POST" | "EMAIL" | "SMS"; // Reply mode
  reply_email?: string;           // If EMAIL mode
  service_type?: string;          // e.g. "VPL", "EMS"
  recipient_city_value?: string;  // Recipient city
  recipient_district?: string;    // District
  recipient_tehsil?: string;      // Tehsil
  recipient_location?: string;    // Post office location
};
```

---

## 3. Response Fields from Pakistan Post

```typescript
type ComplaintResponse = {
  success: boolean;
  complaint_id: string;      // e.g. "CMP-001400" or raw number
  due_date: string;          // DD-MM-YYYY format
  status: string;            // e.g. "FILED"
  message: string;           // Human-readable response
  tracking_id: string;       // Echo of tracking number
};
```

---

## 4. Stored ComplaintText Blob Format

The `complaintText` field in the `shipments` table stores a structured text blob. Format:

```
COMPLAINT_ID: CMP-001400 | DUE_DATE: 14-05-2026 | COMPLAINT_STATE: ACTIVE
User complaint:
Parcel VPL26030761 has not been delivered. Last status shows pending since booking.

Response:
Complaint filed successfully. Expected resolution by 14-05-2026.

COMPLAINT_HISTORY_JSON:{"entries":[
  {
    "complaintId": "CMP-001400",
    "trackingId": "VPL26030761",
    "createdAt": "2026-05-06T13:35:38.000Z",
    "dueDate": "14-05-2026",
    "status": "ACTIVE",
    "attemptNumber": 1,
    "previousComplaintReference": ""
  }
]}
```

### Fields in COMPLAINT_HISTORY_JSON.entries[]

| Field | Type | Description |
|---|---|---|
| `complaintId` | string | Pakistan Post complaint ID (`CMP-XXXXXX`) |
| `trackingId` | string | Tracking number this complaint is for |
| `createdAt` | ISO string | When this attempt was created |
| `dueDate` | string | Due date in `DD-MM-YYYY` format |
| `status` | string | `ACTIVE` or `ERROR` |
| `attemptNumber` | number | 1-based attempt index in chain |
| `previousComplaintReference` | string | complaintId of previous attempt (empty for attempt 1) |

---

## 5. Real Sanitized Sample

**Tracking Number:** VPL25110252  
**Status:** PENDING (not delivered)  
**Filed:** 2026-05-06

**complaintText stored:**
```
COMPLAINT_ID: CMP-001400 | DUE_DATE: 14-05-2026 | COMPLAINT_STATE: ACTIVE
User complaint:
Article not delivered. Please investigate and deliver at the earliest.

Response:
Complaint filed. Reference CMP-001400. Due date: 14-05-2026.

COMPLAINT_HISTORY_JSON:{"entries":[{"complaintId":"CMP-001400","trackingId":"VPL25110252","createdAt":"2026-05-06T13:35:38.000Z","dueDate":"14-05-2026","status":"ACTIVE","attemptNumber":1,"previousComplaintReference":""}]}
```

---

## 6. Due Date Logic

- Pakistan Post returns `due_date` in `DD-MM-YYYY` format in the response.
- The system stores it in `DD-MM-YYYY` format in `complaintText` and `dueDate` (DateTime) in `complaint_queue`.
- **Active threshold:** A complaint is considered "active" (blocking re-submission) if:
  - `complaintStatus === "FILED"` AND
  - A valid `dueDate` exists AND
  - `dueDate >= today` (due date has NOT yet passed)
- **Overdue threshold:** Once `dueDate < today`, the complaint is considered expired and a new complaint may be filed (reopen logic triggers).

### Date Parsing Priority (frontend)
1. Latest entry in `COMPLAINT_HISTORY_JSON.entries`
2. `DUE_DATE:` in complaintText structured line
3. Free-text match: `Due Date on DD/MM/YYYY`

---

## 7. Reopen Logic

A new complaint is **allowed** when ALL conditions are true:

| Condition | Check |
|---|---|
| Shipment is NOT delivered | `status !== "DELIVERED"` |
| Previous complaint due date has passed | `dueDate < today` |
| No active queue entry with future due date | Queue `submitted` entry dueDate expired |

A new complaint is **blocked** when:
- `complaintStatus === "FILED"` AND `dueDate >= today` (existing active complaint)
- Queue entry with status `queued` / `processing` / `retry_pending` / `duplicate` / `manual_review` exists (regardless of due date)
- Queue entry with status `submitted` AND `dueDate >= today`

### Chain Behavior on Reopen
When a new complaint is filed after due date expiry:
1. `attempt_number` is incremented (e.g. 1 → 2)
2. `previous_complaint_reference` is set to the prior `complaintId`
3. A new entry is appended to `COMPLAINT_HISTORY_JSON.entries`
4. Pakistan Post receives the new attempt in the submission payload

---

## 8. Complaint States

| State | Description |
|---|---|
| `FILED` / `ACTIVE` | Complaint accepted by Pakistan Post, within due date |
| `IN PROCESS` | Worker is actively processing (queue status: processing/queued/retry_pending) |
| `RESOLVED` | Complaint resolved (queue status: resolved/closed) |
| `REJECTED` / `ERROR` | Submission failed |
| `DUPLICATE` | Pakistan Post returned duplicate; prior complaint ID retained |

---

## 9. API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tracking/complaints` | Submit new complaint for tracking number |
| `GET` | `/api/tracking/complaints/queue` | Get user's complaint queue entries |
| `POST` | `/api/admin/complaints/manual-override` | Admin: manually set complaint status |

### POST /api/tracking/complaints — Request Body
```json
{
  "trackingNumber": "VPL26030761",
  "phone": "03001234567",
  "remarks": "Parcel not delivered",
  "senderName": "Ahmed Ali",
  "senderAddress": "123 Main St",
  "senderCityValue": "Lahore",
  "receiverName": "Bilal Khan",
  "receiverAddress": "456 Park Rd",
  "receiverCityValue": "Karachi",
  "replyMode": "POST",
  "complaintReason": "Pending Delivery",
  "district": "Karachi",
  "tehsil": "Karachi Central",
  "location": "Main Post Office"
}
```

### POST /api/tracking/complaints — Response (success)
```json
{
  "success": true,
  "message": "Complaint queued for processing",
  "jobId": "uuid-of-queue-row",
  "trackingId": "VPL26030761"
}
```

### POST /api/tracking/complaints — Response (duplicate)
```json
{
  "success": false,
  "message": "Complaint already registered. Complaint ID: CMP-001400 Due Date: 14-05-2026",
  "complaintId": "CMP-001400",
  "dueDate": "14-05-2026",
  "trackingId": "VPL26030761",
  "status": "FILED"
}
```

---

## 10. Frontend Complaint Lifecycle States (UI)

Parsed by `parseComplaintLifecycle()` in `BulkTracking.tsx`:

| `lifecycle.state` | Display | Action Available |
|---|---|---|
| `ACTIVE` | Green badge "FILED" | None (within due date) |
| `IN PROCESS` | Amber spinner | None (queued/processing) |
| `RESOLVED` | Grey "Resolved" | Reopen if due date passed + not delivered |
| `REJECTED` | Red "Error" | New complaint allowed |
| `CLOSED` | Grey "Closed" | Reopen if not delivered |

---

## 11. Complaint History Modal

Accessible via **"View History (N)"** button in tracking table when `complaintCount > 0`.

Shows all entries from `COMPLAINT_HISTORY_JSON.entries` sorted by `attemptNumber`:
- Attempt #
- Complaint ID
- Filed Date (from `createdAt`)
- Due Date
- Status
- Previous Reference (if attempt > 1)
