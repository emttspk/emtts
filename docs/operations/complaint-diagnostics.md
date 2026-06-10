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
5. If attempt 2 shows `PythonDueDate=empty` and `FinalizedSource=queueRow.dueDate` → **fallback chain activated** → ePost storage bug
6. If attempt 2 shows `PythonDueDate` equals attempt 1's `ExtractedDueDate` → **Pakistan Post returned same date** → needs further investigation

Also search Worker logs for `[ComplaintDueDateAudit]` to check if the fallback chain ever fires in production.
