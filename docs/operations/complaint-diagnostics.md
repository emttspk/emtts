# Complaint Due Date Diagnostics

## Overview

Diagnostic logging was added on 2026-06-10 to collect production evidence about complaint due date sources.

## Log Markers

All diagnostic log lines use the `[ComplaintDueDateAudit]` prefix for easy `grep` in Railway logs.

## Python Service (`python-service/app.py`)

### `_extract_due_date_from_message`

Logs every extraction attempt:

```
[ComplaintDueDateAudit] _extract_due_date_from_message raw_capture='08-06-2026'
[ComplaintDueDateAudit] _extract_due_date_from_message fmt=%d-%m-%Y parsed=08-06-2026
```

Three outcomes:
- **Regex match + format parse success**: logs the parsed normalized date
- **Regex match but no format match**: logs `no_fmt_match returning_raw`
- **No regex match**: logs `no_match` with first 200 chars of input text

### Main Submission Handler

Logged once per submission attempt:

```
[ComplaintDueDateAudit] Tracking=VPL26030243 Attempt=1 ComplaintID=CMP-356552
  RawResponseSnippet='Your complaint has been submitted successfully. Due Date on 08-06-2026'
  ExtractedDueDate=08-06-2026
  DefaultDueDate=n/a
  Timestamp=2026-06-10T10:00:00
```

Fields:
- `Tracking` — tracking number being submitted
- `Attempt` — retry attempt number (1-3)
- `ComplaintID` — complaint number returned by Pakistan Post
- `RawResponseSnippet` — first 300 chars of the Pakistan Post response message
- `ExtractedDueDate` — due date extracted from response (or empty)
- `DefaultDueDate` — `n/a` if a real due date was extracted; otherwise the computed `today+7days` timestamp
- `Timestamp` — ISO timestamp of submission processing

## TypeScript Worker (`apps/api/src/processors/complaint.processor.ts`)

Logged ONLY when `dueDate` from Python response is null/empty (i.e., fallback chain activated):

```
[ComplaintDueDateAudit] Tracking=VPL26030243 QueueId=xxx
  PythonDueDate=empty
  NormalizedDueDate=empty
  FinalizedSource=queueRow.dueDate
  FinalizedValue=11-06-2026
  QueueRowDueDate=2026-06-11T00:00:00.000Z
  ExistingParsedDueDateTs=2026-06-11T00:00:00.000Z
```

Fields:
- `PythonDueDate` — raw due date from Python response
- `NormalizedDueDate` — after normalizeDueDateToDdMmYyyy
- `FinalizedSource` — which fallback was used: `dueDate`, `queueRow.dueDate`, or `existingParsed.dueDateTs`
- `FinalizedValue` — the final due date after formatting
- `QueueRowDueDate` — the due date stored on the queue row
- `ExistingParsedDueDateTs` — parsed due date from existing shipment

## Railway Log Search Command

```bash
railway logs -s Python 2>&1 | grep ComplaintDueDateAudit
railway logs -s Worker 2>&1 | grep ComplaintDueDateAudit
```

Or combined:
```bash
railway logs -s Python --search "ComplaintDueDateAudit"
railway logs -s Worker --search "ComplaintDueDateAudit"
```

## Expected Evidence Collection Process

1. Search Python logs for `[ComplaintDueDateAudit]` on **reopened complaints** (tracking numbers that have ≥2 history entries)
2. For each tracking, find ALL log lines — there should be one per attempt
3. Compare `ExtractedDueDate` values between attempt 1 and attempt 2 for the SAME tracking number
4. If both attempts have different `ExtractedDueDate` values → Pakistan Post returned different due dates → **genuine behavior**
5. If attempt 2 shows `ExtractedDueDate=` (empty) and `DefaultDueDate=n/a` → **Python received no due date from Pakistan Post** → the worker will store empty due date for this attempt (no inheritance)
6. If attempt 2 shows `PythonDueDate=empty` → **fallback to queueRow or existingParsed is no longer possible** — the fix removed stale inheritance

Also search Worker logs for `[ComplaintDueDateAudit] NO_DUE_DATE` to track submissions where Python returned no due date.

## Fix Applied 2026-06-10

The stale due date inheritance bug was fixed in commit `XXXXXXX`. Previously, the `finalizedDueDate` fallback chain:
```typescript
// REMOVED - this fallback caused stale inheritance:
const finalizedDueDate = dueDate
  ?? queueRow.dueDate                              // stale from previous attempt's processing
  ?? (existingParsed.dueDateTs != null ? new Date(existingParsed.dueDateTs) : null);  // stale from existing shipment header
```

And `nextEntry.dueDate` also fell back to `latestHistory?.dueDate`:
```typescript
// REMOVED - this caused new entries to inherit old due dates:
dueDate: normalizedFinalDueDate || latestHistory?.dueDate || "",
```

Now the code uses ONLY the Python response's due date:
```typescript
const finalizedDueDate = dueDate;           // only from Python response
const normalizedFinalDueDate = normalizedDueDate;  // only from Python response
dueDate: normalizedFinalDueDate,            // no fallback to history
```

When Python returns no due date, the new attempt stores an empty due date rather than silently inheriting the previous attempt's date. The complaint sync service will recalculate the state based on available data.

See `docs/architecture/complaint-worker-flow.md` for updated flow details.

## Legacy Due Date Detection (2026-06-10)

After the stale due date inheritance fix (commit `c3b62f0`), the system
flags records that may have been affected by the bug.

### Detection Logic

Defined in `apps/api/src/lib/complaint-date-helpers.ts`:

- `LEGACY_DUE_DATE_BUG_START`: 2026-05-02T00:00:00.000Z (commit `be1414e`)
- `LEGACY_DUE_DATE_BUG_END`:   2026-06-10T15:43:42.000Z (commit `c3b62f0`)
- `isLegacyDueDateInheritedEntry(entry)`: returns `true` if entry has
  `attemptNumber > 1`, a non-empty `dueDate`, and `createdAt` falls within
  the bug window
- `detectLegacyDueDateReview(entries)`: returns `true` if ANY entry in
  the history matches `isLegacyDueDateInheritedEntry`

### Admin Report Visibility

The `/api/admin/complaints/monitor` endpoint now returns a `legacy_due_date_review`
count in the summary. Records flagged with `legacyDueDateReview: true` are
counted under this bucket instead of `active` or `overdue`.

### Classification Rules

| Classification | Condition | Action |
|----------------|-----------|--------|
| Active | `legacyDueDateReview: false`, state ACTIVE/OPEN/IN_PROCESS | Normal sync/watch/reopen |
| Overdue | `legacyDueDateReview: false`, state OVERDUE | Follow-up, reopen rules apply |
| Legacy Due Date Review | `legacyDueDateReview: true` | Flagged for admin review, no due date guessing |
| Closed / Settled | state RESOLVED or CLOSED | Left as final, no auto-reopen |

### Railway Log Search

```bash
railway logs -s Python --search "ComplaintDueDateAudit"
railway logs -s Worker --search "ComplaintDueDateAudit"
```
