# Package Usage — Complaint Quota Tracking

## Overview
Each complaint submission consumes `COMPLAINT_UNIT_COST` units from the user's monthly label balance. Usage is tracked per-action via the `usage_logs` raw SQL table.

## Constants
```typescript
// apps/api/src/usage/unitConsumption.ts
COMPLAINT_UNIT_COST = 1   // units charged per successfully filed complaint
```

## Daily Limit
- Free plan: 1 complaint per day
- All other plans: 5 complaints per day
- Enforced via `getComplaintAllowance().dailyRemaining > 0`
- Source: `SELECT COUNT(*) FROM usage_logs WHERE action_type='complaint' AND DATE(created_at) = TODAY`

## Monthly Count
- Tracked via `SELECT COUNT(*) FROM usage_logs WHERE action_type='complaint' AND month = YYYY-MM`
- Exposed on `/api/me` as `balances.complaintMonthlyUsed`
- Shown in complaint modal header

## Unit Check
Before submission, `getComplaintAllowance()` checks:
1. `dailyRemaining > 0` — daily quota not exceeded
2. `remainingUnits >= COMPLAINT_UNIT_COST` — enough monthly units

If either check fails, API returns HTTP 402.

## Deduction Timing
Units are deducted ONLY after `status === "FILED"` (successful complaint).
On `FAILED` or `ERROR` status, no units are charged.

## Refund
If a complaint fails after units are pre-checked, units are not deducted (deduction only on FILED). Admin can manually adjust `extraLabelCredits` for edge cases.

## Quota Status in UI
The complaint modal header shows:
```
Today: 2 used / 3 remaining (limit 5)    This month: 8 total
```
Data sourced from `me?.balances` fetched on login/refresh.
