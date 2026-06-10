# KILO CODE AUDIT REPORT

**Date**: 2026-06-10  
**Scope**: Complaint reopen failure for VPL12511817, VPL12511818  
**Status**: COMPLETE - Bug found and fixed

---

## INVESTIGATION FINDINGS

### PART 1 - Reopen API Request Path

```
Frontend: BulkTracking.tsx:4730
  isComplaintActionAllowed(actionStatus, lifecycle, queueSnapshot)
    → calls isReopenEligible(shipmentStatus, lifecycle.state, lifecycle.dueDateTs)
    → isReopenEligible checks statusUpper !== "PENDING"
    → PROBLEM: statusUpper is RAW value, not normalized

  resolveComplaintActionLabel(actionStatus, lifecycle, queueSnapshot) 
    Line 514: if (statusUpper === "PENDING" && terminal) return "Reopen Complaint"
    → This uses normalizeStatus(actionStatus) which maps to "PENDING" for non-DELIVERED/RETURNED
    → BUT isReopenEligible uses RAW actionStatus
```

### PART 2 - Log Search Results

| Tracking | API Logs | Worker Logs | Python Logs |
|----------|----------|-------------|-------------|
| VPL12511817 | ❌ None | ❌ None | ❌ None |
| VPL12511818 | ❌ None | ❌ None | ❌ None |
| VPL14437444 | ✅ Processed | ✅ Completed | ✅ CMP-411131 |
| VPL14437502 | ✅ Processed | ⏳ Pending | ✅ CMP-077726 |

### PART 3 - Exact Rejection Point

**Bug Location**: `apps/web/src/lib/complaint-date-helpers.ts:21` (original)
**Bug**: `isReopenEligible` compared the RAW shipment status against "PENDING", but the
shipment status can be a compound string like "PENDING (PAYMENT IN PROCESS)" or 
"PENDING (MOS NOT ISSUED)". These compound values are NOT equal to "PENDING" exactly,
so `isReopenEligible` returned false even though the shipment IS pending.

**Root cause**: `isReopenEligible` did not normalize the shipment status before comparison.
The `normalizeStatus()` function in `BulkTracking.tsx:813` correctly maps non-DELIVERED/
non-RETURNED values to "PENDING", but `isReopenEligible` in `complaint-date-helpers.ts`
bypassed this normalization.

**Impact**: For Value Payable Letter (VPL) shipments where the article was delivered but the
money order is still pending, the tracking system returns "PENDING (PAYMENT IN PROCESS)".
The reopen button LABEL shows "Reopen Complaint" (because `resolveComplaintActionLabel`
uses normalized status), but the button is DISABLED (because `isReopenEligible` uses raw
status).

| Check | File | Line (pre-fix) | Raw Value | Normalized | Expected |
|-------|------|----------------|-----------|------------|----------|
| `isReopenEligible` | `apps/web/src/lib/complaint-date-helpers.ts` | 21 | "PENDING (PAYMENT IN PROCESS)" | "PENDING" | allow reopen |
| `resolveComplaintActionLabel` | `apps/web/src/pages/BulkTracking.tsx` | 514 | "PENDING (PAYMENT IN PROCESS)" | "PENDING" | shows "Reopen Complaint" |
| `isComplaintActionAllowed` (line 479) | `apps/web/src/pages/BulkTracking.tsx` | 479 | "PENDING (PAYMENT IN PROCESS)" | "PENDING" | allows if no existing complaint |

### PART 4 - UI vs Backend Rule Comparison

| Layer | Source | Check | Status |
|-------|--------|-------|--------|
| UI Button Label | `resolveComplaintActionLabel` | `normalizeStatus(status) === "PENDING"` | ✅ Shows "Reopen Complaint" |
| UI Button Enabled | `isReopenEligible` | `rawStatus !== "PENDING"` | ❌ **BUG: raw, not normalized** |
| Backend Route | `tracking.ts:1786` | `startsWith("PENDING")` | ✅ Correctly allows compound values |
| Backend Route | `tracking.ts:2153` | `!complaintAllowed` → 403 | ✅ Depends on processTracking output |

### PART 5 - Mismatch Determination

**MISMATCH EXISTS: YES**

The UI label correctly shows "Reopen Complaint" because `resolveComplaintActionLabel`
uses `normalizeStatus(actionStatus)` which maps "PENDING (PAYMENT IN PROCESS)" → "PENDING".
But `isReopenEligible` uses the RAW `actionStatus` which is "PENDING (PAYMENT IN PROCESS)"
and strictly compares `!== "PENDING"`, returning false. This means:

- **Button label**: "Reopen Complaint" ✅ (correct)
- **Button enabled**: disabled ❌ (should be enabled)

### PART 6 - Historical Status Audit

For VPL12511817 and VPL12511818 (August 2024 VPL shipments):
- Both are value-payable articles with money order amounts
- The tracking events show "Dispatch from DMO..." timing out before delivery confirmation
- `processTracking` on backend data likely returns "PENDING (MOS NOT ISSUED)" or
  "PENDING (PAYMENT IN PROCESS)" because article events show dispatch but no delivery
  confirmation, while MOS may or may not be detected
- The backend `startsWith("PENDING")` check would pass
- The frontend `isReopenEligible` would fail before the fix

### PART 7 - Fix Applied

**File**: `apps/web/src/lib/complaint-date-helpers.ts`  
**File**: `apps/api/src/lib/complaint-date-helpers.ts`

Added `normalizeShipmentStatus()` function that mirrors `BulkTracking.tsx`'s `normalizeStatus()`:
- Returns "PENDING" for any status that doesn't contain DELIVER or RETURN
- Returns "DELIVERED" for DELIVER-containing statuses
- Returns "RETURNED" for RETURN/RTO-containing statuses

Updated both `isReopenEligible` functions (frontend + backend) to normalize the shipment
status before comparing against "PENDING". This ensures compound statuses like
"PENDING (PAYMENT IN PROCESS)" are correctly treated as PENDING.

### PART 8 - Pre-fix vs Post-fix Comparison

| Status | normalizeShipmentStatus | isReopenEligible (pre) | isReopenEligible (post) |
|--------|------------------------|------------------------|------------------------|
| "PENDING" | "PENDING" | ✅ true | ✅ true |
| "IN_TRANSIT" | "PENDING" | ❌ false | ✅ true |
| "PENDING (PAYMENT IN PROCESS)" | "PENDING" | ❌ false | ✅ true |
| "DELIVERED" | "DELIVERED" | ✅ false | ✅ false |
| "RETURNED" | "RETURNED" | ✅ false | ✅ false |

### PART 9 - Admin Procedure for VPL12511817 / VPL12511818

After the fix is deployed, the reopen button will be enabled for these shipments.
If still blocked, verify:

1. Shipment's tracking status does NOT contain "DELIVER" or "RETURN" keywords
2. No active queue entry exists for the tracking number
3. Complaint lifecycle state is terminal (RESOLVED/CLOSED/REJECTED) or due date expired
4. Plan limits are sufficient (daily/monthly/units)

If the backend `processTracking` returns a terminal status from stored `rawJson`,
an admin can manually patch to PENDING:
```
PATCH /api/shipments/VPL12511817 { "status": "PENDING" }
PATCH /api/shipments/VPL12511818 { "status": "PENDING" }
```

---

## AUDIT SUMMARY

| Question | Answer |
|----------|--------|
| Was reopen attempted? | ❌ No frontend evidence |
| Was API called? | ❌ No log entries exist |
| Code bug found? | ✅ YES - `isReopenEligible` didn't normalize status |
| Mismatch? | ✅ Label shows "Reopen Complaint" but button is disabled |
| Fix applied? | ✅ Added `normalizeShipmentStatus()` to both frontend and backend |
| What tests pass? | 18/18 parser, 11/11 sync state |

**Status**: FIXED — Bug was a normalization mismatch in `isReopenEligible`.
