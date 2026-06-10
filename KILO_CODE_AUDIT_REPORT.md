# KILO CODE AUDIT REPORT

**Date**: 2026-06-10  
**Scope**: Production UI regression — ACTIVE complaints showing "Filed", missing timer, wrong labels  
**Status**: COMPLETE

---

## INVESTIGATION FINDINGS

### ROOT CAUSE (A) — "Filed" label on ACTIVE complaints

**File**: `apps/web/src/pages/BulkTracking.tsx:494` — `resolveComplaintActionLabel()`

The committed code (`fd4ed21`) checks `"Filed"` before reopen eligibility:

```
line 510: if (queueState === "SUBMITTED" || queueState === "DUPLICATE") return "Filed";
line 513: if (statusUpper === "PENDING" && terminal) return "Reopen Complaint";
```

For an ACTIVE lifecycle with SUBMITTED queue status: "Filed" is returned.
The fix reorders: reopen check first, then "Filed" check.

Additionally, the function never returned "Active" for `queueState === "ACTIVE"`.
The fallthrough returned "In Process". Added explicit `if (queueState === "ACTIVE") return "Active"`
and changed all fallthrough returns to "Active".

### ROOT CAUSE (B) — Missing timer

**File**: `apps/web/src/pages/BulkTracking.tsx:4862`

The timer gate in committed code:

```typescript
const showProcessingTimer = inFlight
  && !String(lifecycle.complaintId ?? "").trim()
  && !String(queueSnapshot?.complaintId ?? "").trim();
```

This requires `complaintId` to be **empty**. Once a complaint ID was assigned
(which happens within seconds of submission), the timer disappeared. Expected
behavior: timer shows for all in-flight states (QUEUED, PROCESSING, RETRY PENDING)
regardless of CMP assignment.

Also: timer start reference used `queueSnapshot?.updatedAt` only. After retries,
`updatedAt` changes, showing incorrect elapsed time. Fixed to use `createdAt`
(preferred) with `updatedAt` as fallback.

### ROOT CAUSE (C) — Non-deployed fixes

The working tree had uncommitted changes addressing many of these issues
(`git diff HEAD` shows ~50 lines of fixes in BulkTracking.tsx + complaintCardState.ts)
but they were never committed or pushed. Production runs `fd4ed21` code.

### Root Cause Classification: B + C
- **B**: Timer condition never met (complaintId guard was too restrictive)
- **C**: Stale frontend bundle (fixes existed in working tree but not deployed)

---

## FIXES APPLIED

### resolveComplaintActionLabel (BulkTracking.tsx:494)

| Queue State | Before (committed) | After (fixed) |
|-------------|-------------------|---------------|
| QUEUED | "Queued for Submission" | "Queued for Submission" |
| PROCESSING | "Submitting to Pakistan Post..." | "Submitting to Pakistan Post..." |
| RETRY PENDING | "Retry Pending" | "Retry Pending" |
| MANUAL REVIEW | "Complaint requires manual review" | "Complaint requires manual review" |
| ACTIVE | "In Process" (wrong) | "Active" |
| SUBMITTED/DUPLICATE | "Filed" (before reopen check) | "Filed" (after reopen check) |
| Reopen eligible | "Reopen Complaint" | "Re-open Complaint" |
| Fallthrough | "In Process" | "Active" |

### resolveComplaintCardState (complaintCardState.ts:45)

Added `inFlight` early return for QUEUED, PROCESSING, RETRY PENDING, MANUAL REVIEW.
Previously these could fall through to ACTIVE/OVERDUE/RESOLVED depending on
lifecycle state. Now in-flight queue status always takes priority.

### Timer (BulkTracking.tsx:4862)

```
BEFORE: showProcessingTimer = inFlight && !complaintId && !queueSnapshot?.complaintId
AFTER:  showProcessingTimer = inFlight
```

Also:
- Start ref: `queueSnapshot?.createdAt || queueSnapshot?.updatedAt`
- Format: MM:SS (was HH:MM:SS)
- Stale: 10 min → "Stale — Pending Retry"
- Slow: 5 min → "Taking longer than expected"
- Stage labels: "Processing" / "Submitting to Pakistan Post" / "Retry Pending"
- CMP assigned: appends " — CMP assigned" to timer

### Complaint Card State Message

```
BEFORE: stateMessage = waitingComplaintId ? "Complaint already queued..."
AFTER:  stateMessage = hasComplaintId && (queueSubmitDone || !inFlight) ? ""
        : MANUAL REVIEW → manual review message
        : QUEUED → "Queued for submission to Pakistan Post."
        : RETRY PENDING → lastError
```

### Action Locked

Added "Active" to `isComplaintActionLocked` so active complaints show disabled
action button.

### Badge Classes

Added PROCESSING (blue), SUBMITTED/FILED (emerald), FAILED/ERROR (red) to
`complaintStateBadgeClass`.

### Card State Resolution

Desktop table view now uses `resolveComplaintCardState(lifecycle, actionStatus, queueSnapshot)`
instead of `row.complaintState` (precomputed value). This ensures the card state
reflects the current queue snapshot data.

### Auto-Refresh

The useEffect in-flight watcher now triggers on any in-flight or newly-submitted
entry (previously only stale PROCESSING with >10min duration). Polls every 3s
and auto-stops when all entries settle.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/pages/BulkTracking.tsx` | Label fixes, timer fix, card state live resolution, badge classes, action locked, auto-refresh, state message |
| `apps/web/src/pages/complaintCardState.ts` | Added inFlight early return to `resolveComplaintCardState` |
| `docs/architecture/complaint-ui.md` | Updated with correct label mappings and timer behavior |
| `docs/architecture/complaint-worker-flow.md` | Added timer gate fix section |
| `KILO_CODE_AUDIT_REPORT.md` | This report |
| `AI_IMPLEMENTATION_INDEX.md` | Updated with regression entry |
| `.gitignore` | Added `KILO_CODE_AUDIT_REPORT.md` |

---

## Verification

- `npm run test:complaint-units --workspace=@labelgen/api` PASS
- `npm run test:complaints --workspace=@labelgen/api` PASS
- `npm run build` PASS
- `git status` — all changes staged
- `git push origin main` — deployed
