# Help: Complaint Recovery Procedures

## Complaint Filed But No ID Returned

**Symptom:** Alert shows "Complaint Registered" but Complaint ID is blank.

**Cause:** Pakistan Post response was missing the complaint number in the expected format.

**Action:**
1. Check Railway Python logs for `[ComplaintAPI] ParsedComplaintID=-`
2. The system generates a fallback ID (`CMP-{timestamp}`) in this case
3. Cross-check with Pakistan Post tracking history manually at https://ep.gov.pk

---

## Complaint Stuck at FILED But Due Date Expired

**Symptom:** Row shows Complaint ID badge but due date is in the past, button is inactive.

**Cause:** `complaintStatus = FILED` persists even after due date passes.

**Action:**
1. Admin or user can re-open complaint modal after due date passes (lifecycle.active becomes false)
2. Or manually reset via DB: `UPDATE shipment SET complaintStatus='NOT_REQUIRED', complaintText=NULL WHERE trackingNumber='...'`

---

## Complaint Submission Failed — Validation Error

**Symptom:** Error "Complaint submission failed due to missing required fields: ReceiverName"

**Cause:** Receiver name was not found in upload data or tracking response.

**Action:**
1. Open complaint modal
2. Manually fill in Receiver Name, Receiver Address fields
3. Re-submit

---

## Duplicate Complaint

**Symptom:** HTTP 409 returned with "Complaint already registered"

**Cause:** Existing active complaint already stored for this tracking number.

**Action:**
- This is expected behaviour — wait until due date passes or existing complaint is resolved
- Existing complaint ID and due date are shown in the alert

---

## Complaint State Looks Stale

**Symptom:** Complaint card shows old state or missing SLA alerts.

**Action:**
1. Run admin manual sync: `POST /api/admin/complaints/sync`
2. Check alerts feed: `GET /api/admin/complaints/alerts`
3. Review audit feed: `GET /api/admin/complaint-audit`

Scheduled sync also runs every 6 hours automatically.

---

## Need Complaint Export CSV

**Action:**
- Admin can download the latest complaint export from `GET /api/admin/complaints/export`
- Export columns: `trackingId`, `complaintId`, `dueDate`, `status`, `createdAt`, `updatedAt`

---

## Restore From Complaint Backup

**Action:**
1. Check `/backups/complaints/` for the latest snapshot
2. Use `/backups/labels/` and `/backups/money-orders/` if related generated files also need recovery
3. Snapshots are generated every 12 hours and the latest 30 are retained

---

## Units Not Returned After Failed Complaint

**Symptom:** Complaint failed but units were deducted.

**Cause:** Units are only deducted on FILED status. If this happens, check logs for incorrect status assignment.

**Action:**
- Contact admin to add `extraLabelCredits` via `PATCH /api/admin/users/:id`
- Review Python logs for unexpected `status=SUCCESS` on a failed submission

---

## Re-Submitting a Complaint After Fix

After fixing data (e.g., correcting receiver name in upload):
1. Re-track the shipment to refresh rawJson
2. Open complaint modal — it will re-prefill from updated data
3. Submit complaint

If old FILED status blocks submission, admin must reset `complaintStatus` in DB.
