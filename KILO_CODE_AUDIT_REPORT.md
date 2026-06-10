# KILO CODE AUDIT REPORT

**Date**: 2026-06-10  
**Scope**: Complaint processing visibility and long-running submissions (VPL14438236, VPL14438946)  
**Status**: COMPLETE

---

## INVESTIGATION FINDINGS

### PART 1 — Queue State for VPL14438236 and VPL14438946

| Aspect | VPL14438236 | VPL14438946 |
|--------|-------------|-------------|
| API Logs | ❌ None | ❌ None |
| Worker Logs | ❌ None | ❌ None |
| Python Logs | ❌ None | ❌ None |
| Queue ID | N/A | N/A |
| Status | No recent queue or submission | No recent queue or submission |

**No log entries exist for either tracking number in any Railway service.**  
These tracking numbers have NOT been submitted as complaints in the current deployment.

### PART 2 — Why Card Shows "Submitting to Pakistan Post..."

The label "Submitting to Pakistan Post..." is returned by `resolveComplaintActionLabel`
when `normalizeQueueStatusLabel(queueSnapshot?.complaintStatus)` returns `PROCESSING`.
This requires an existing queue row with `complaintStatus = "processing"`.

Without production DB access, there are two possibilities:
1. A queue row exists with `complaintStatus = "processing"` that was created before
   the current Worker session started (the Worker log shows "Another worker instance
   is active; waiting for singleton lock release...")
2. The queue row was created but never picked up by the Worker

The fix focuses on making the card self-healing:
- Live elapsed timer on all in-flight states
- Auto-refresh every 3s when in-flight entries exist
- Stale detection at 10 minutes (triggers backend rescue)
- Timeout warning at 5 minutes

### PART 3 — Auto-Refresh Implementation

Two-layer polling:
1. **Post-submit** (schedulePostSubmitRefresh): 2s interval for 120s after complaint submit
2. **In-flight watcher** (useEffect): 3s interval while any queue entry is:
   - `queued`/`processing`/`retry_pending` without complaintId, OR
   - `submitted`/`duplicate` with complaintId (auto-update on completion)

### PART 4 — Processing Timer

| Duration | Display |
|----------|---------|
| 0-5 min | `PROCESSING... 00:32` |
| 5-10 min | `Taking longer than expected (05:22)` |
| 10+ min | `Stale — Pending Retry (12:05)` |

### PART 5 — Stage Badges Added

| Badge | Color | Code |
|-------|-------|------|
| QUEUED | Slate | `border-slate-200 bg-slate-50` |
| PROCESSING | Blue | `border-blue-200 bg-blue-100` |
| SUBMITTED | Emerald | `border-emerald-200 bg-emerald-50` |
| FILED | Emerald | `border-emerald-200 bg-emerald-50` |
| FAILED | Red | `border-red-200 bg-red-50` |
| ERROR | Red | `border-red-200 bg-red-50` |

### PART 6 — Files Changed

| File | Change |
|------|--------|
| `apps/web/src/pages/BulkTracking.tsx` | Timer format (MM:SS), all in-flight states get timer, 5min timeout warning, 3s auto-refresh, added stage badges, added `createdAt` to snapshot type, `Submitted`/`Filed` action label |
| `docs/architecture/complaint-ui.md` | New — full UI documentation for complaint card rendering |
| `docs/architecture/complaint-worker-flow.md` | Added Queue State Timeline section |
| `AI_IMPLEMENTATION_INDEX.md` | Updated with this implementation |
| `KILO_CODE_AUDIT_REPORT.md` | This report |

### PART 7 — Verification

- `.gitignore` does NOT contain `KILO_CODE_AUDIT_REPORT.md` — the audit report is
  tracked in git per standard procedure.
- No code changes to `apps/api/` — all changes are UI/docs only.
