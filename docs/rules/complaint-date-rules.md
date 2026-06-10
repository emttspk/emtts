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