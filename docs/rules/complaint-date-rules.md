# Complaint Date Rules

## Single Source of Truth

All date calculations for complaint state must use the shared helper in `apps/api/src/lib/complaint-date-helpers.ts` (backend) or `apps/web/src/lib/complaint-date-helpers.ts` (frontend).

## Rules

### ACTIVE
- `today <= dueDate`
- Due date day is NOT expired
- Complaint is active and can receive responses

### OVERDUE
- `today > dueDate`
- Due date has passed
- Complaint is overdue and can be reopened

### REOPEN
- Eligible only when: `today > dueDate`
- Only allowed in PENDING shipment status
- Lifecycle state must be: RESOLVED, CLOSED, or REJECTED
- OR due date must be expired

## Date Format: DD-MM-YYYY ONLY

Complaint due dates are stored and transmitted ONLY in `DD-MM-YYYY` format (e.g., `08-06-2026` = 8 June 2026).

### Parsing Rules

1. **DD-MM-YYYY is the canonical format**. Dates with dashes (`-`) are always parsed as DD-MM-YYYY (day-month-year).
2. **DD/MM/YYYY (slash) is accepted** for backward compatibility with legacy data.
3. **YYYY-MM-DD (ISO) is accepted** for database timestamps.
4. **NEVER use `new Date(string)` or `Date.parse(string)`** for complaint due dates. These treat `MM/DD/YYYY` and `MM-DD-YYYY` as month-day-year, which swaps the day and month for dates with day <= 12.
5. **Unrecognized formats return `null`**, not a best-effort parse. This prevents silent mis-interpretation.
6. **Leading zeros are optional**: `8-6-2026` is valid and equals `08-06-2026`.

### Valid `parseDueDateToTs` Implementation

```typescript
function parseDueDateToTs(input: string): number | null {
  const value = String(input ?? "").trim();
  if (!value) return null;

  // DD/MM/YYYY
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const dt = new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]), 0, 0, 0, 0).getTime();
    return Number.isFinite(dt) ? dt : null;
  }

  // DD-MM-YYYY (canonical complaint format)
  const dash = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    const dt = new Date(Number(dash[3]), Number(dash[2]) - 1, Number(dash[1]), 0, 0, 0, 0).getTime();
    return Number.isFinite(dt) ? dt : null;
  }

  // YYYY-MM-DD (ISO, used by database)
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0).getTime();
    return Number.isFinite(dt) ? dt : null;
  }

  return null; // NEVER use new Date(value) or Date.parse(value)
}
```

## Implementation

```typescript
export function isDueDateExpired(dueDateTs: number | null): boolean {
  if (dueDateTs == null) return false;
  const todayStart = getTodayStart();
  return dueDateTs < todayStart.getTime();
}

export function getTodayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
```

## Important Notes

1. **Midnight Comparison**: Always compare against `todayStart` (midnight), not `Date.now()` which includes time-of-day
2. **Due Date Day**: The due date day itself is NOT expired; only days AFTER the due date are expired
3. **Consistency**: Frontend and backend must use identical logic
4. **DD-MM-YYYY is strict**: No `new Date(value)` fallback for complaint due dates
5. **DUE_DATE regex**: Both structured (`DUE_DATE: 08-06-2026`) and natural language (`Due Date on 08-06-2026`) regex patterns must include dashes, not just slashes