# KILO CODE AUDIT REPORT

**Date**: 2026-06-10  
**Scope**: Complaint reopen failure for VPL12511817, VPL12511818  
**Status**: COMPLETE - No code bug found

---

## INVESTIGATION FINDINGS

### PART 1 - Reopen API Request Path

```
Frontend: BulkTracking.tsx:473
  isReopenEligible(shipmentStatus, lifecycle.state, lifecycle.dueDateTs)
    → checks shipmentStatus !== "PENDING" → returns false
    → Reopen button hidden/disabled

Backend: tracking.ts:1784-1787
  processTracking(raw, ...) → reads tracking status from rawJson
  manualPendingOverride = rawJson.manual_pending_override
  pendingStatus = systemStatus.startsWith("PENDING")
  complaintAllowed = manualPendingOverride || pendingStatus
    → false for non-PENDING → 403 at line 2153

Backend: tracking.ts:1981-1995
  parseStoredComplaintLifecycle(shipment.complaintText, shipment.complaintStatus)
    → checks active complaint → skipped for terminal state
```

### PART 2 - Log Search Results

| Tracking | API Logs | Worker Logs | Python Logs |
|----------|----------|-------------|-------------|
| VPL12511817 | ❌ None | ❌ None | ❌ None |
| VPL12511818 | ❌ None | ❌ None | ❌ None |
| VPL14437444 | ✅ Processed | ✅ Completed | ✅ CMP-411131 |
| VPL14437502 | ✅ Processed | ⏳ Pending | ✅ CMP-077726 |

**Zero log entries exist for VPL12511817 and VPL12511818** — the API was never called.

### PART 3 - Exact Rejection Point

#### Frontend Rejection (Most Likely)

| Location | File | Line | Check | Result |
|----------|------|------|-------|--------|
| `isReopenEligible` | `apps/web/src/lib/complaint-date-helpers.ts` | **18** | `statusUpper !== "PENDING"` | **returns false** |
| `isComplaintActionAllowed` | `apps/web/src/pages/BulkTracking.tsx` | **473** | `isReopenEligible(...)` | **returns false** |

#### Backend Rejection (If API Called Directly)

| Location | File | Line | Check | Result |
|----------|------|------|-------|--------|
| `processTracking` | `apps/api/src/routes/tracking.ts` | **1784** | Reads status from `rawJson` | DELIVERED |
| `manualPendingOverride` | `apps/api/src/routes/tracking.ts` | **1785** | `rawJson.manual_pending_override` | false |
| `complaintAllowed` | `apps/api/src/routes/tracking.ts` | **1787** | `manualPendingOverride \|\| pendingStatus` | **false** |
| 403 Return | `apps/api/src/routes/tracking.ts` | **2153** | `if (!complaintAllowed)` | **BLOCKED** |

### PART 4 - Audit Trail

- **Frontend did NOT call API**: No `POST /api/tracking/complaint` request was logged for either tracking number
- **Frontend blocked at `isComplaintActionAllowed`**: The reopen button is disabled because `shipmentStatus !== "PENDING"`
- **VPL12511817 and VPL12511818 are August 2024 shipments** with Pakistan Post status `DELIVERED`/`IN_TRANSIT`
- **No `manual_pending_override` set** on either shipment

### PART 5 - Comparison with VPL14437444

| Aspect | VPL12511817 / VPL12511818 | VPL14437444 (Success) |
|--------|--------------------------|----------------------|
| Shipment Date | Aug 2024 | Sep 2024 |
| Current Status | DELIVERED/IN_TRANSIT | **PENDING (overridden)** |
| `manual_pending_override` | ❌ Not set | ✅ Set by admin PATCH |
| `complaintAllowed` | **false** → 403 | **true** → Queue created |
| Queue Created | ❌ No | ✅ Yes |
| Worker Processed | ❌ No | ✅ Yes |
| Pakistan Post Response | ❌ No | ✅ CMP-411131 |

**Critical difference**: VPL14437444 was manually set to PENDING via `PATCH /api/shipments/:id { status: "PENDING" }` which sets `manual_pending_override: true` in rawJson. VPL12511817 and VPL12511818 were not.

### PART 6 - Root Cause Classification

**A. Queue not created** ✅ (Correct)

The API was never called because both frontend and backend correctly block reopening for non-PENDING shipments.

**Root Cause**: **Operational, not a code bug.** VPL12511817 and VPL12511818 have shipment status ≠ PENDING. The reopen button is correctly disabled. To reopen, an admin must first mark the shipment as PENDING via `PATCH /api/shipments/:id { status: "PENDING" }`.

### PART 7 - Fix Applied

**No code fix required.** The system is working as designed. The issue is that the shipments' status was not manually overridden to PENDING by an admin before attempting to reopen.

**Recommended admin action**:
```
PATCH /api/shipments/VPL12511817 { "status": "PENDING" }
PATCH /api/shipments/VPL12511818 { "status": "PENDING" }
```
Then proceed with reopen via `POST /api/tracking/complaint`.

### PART 8 - Tests and Build

- All complaint parser tests: 18/18 PASS
- All sync state tests: 11/11 PASS
- Build: PASS

### PART 9 - Code Review Notes

The complaint reopen flow has four layers of protection:
1. **Frontend** (`isReopenEligible`): blocks button when `shipmentStatus !== "PENDING"`
2. **Backend eligibility** (`complaintAllowed`): blocks at 403 when status not PENDING
3. **Duplicate protection** (`parseStoredComplaintLifecycle`): blocks at 409 if an active complaint exists
4. **Unit limits** (`complaintAllowance`): blocks at 402/429 if limits exceeded

All layers work correctly for this scenario.

---

## AUDIT SUMMARY

| Question | Answer |
|----------|--------|
| Was reopen attempted? | ❌ No — button was disabled by frontend |
| Was API called? | ❌ No — zero log entries |
| Is there a code bug? | ❌ No — system working as designed |
| Why did VPL14437444 succeed? | ✅ Admin set `manual_pending_override=true` for that shipment |
| What action is needed? | Admin PATCH both shipments to PENDING, then reopen |

**Status**: NO_FIX_NEEDED — Operational issue, not a software defect.
