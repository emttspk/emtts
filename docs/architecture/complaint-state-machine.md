# Complaint State Machine

## States

| State | Meaning | Set By | Terminal? |
|-------|---------|--------|-----------|
| `ACTIVE` | Complaint within due date, tracking not terminal | `composeComplaintText` (initial write), `deriveComplaintState` (sync) | No |
| `OVERDUE` | Due date passed, tracking not yet confirmed delivered/returned | `deriveComplaintState` (sync) | No |
| `RESOLVED` | Live tracking confirms DELIVERED or RETURNED | `deriveComplaintState` (sync) | Yes |
| `CLOSED` | Second sync confirms RESOLVED, or admin manually closed | `deriveComplaintState` (sync), `markComplaintClosed` | Yes |
| `REJECTED` | Complaint submission failed permanently | Worker `markComplaintQueueFailure` | Yes |
| `IN_PROCESS` | Queue entry is being processed | Queue status normalization | Transient |

## Classification Buckets

| Classification | States Included | Behavior |
|----------------|----------------|----------|
| Active | ACTIVE | Continue sync, watch, and reopen logic normally |
| Overdue | OVERDUE | Keep in follow-up. Reopen only if: (1) shipment PENDING, (2) no queue in flight, (3) plan limits allow |
| Legacy Due Date Review | ACTIVE, OVERDUE (with `legacyDueDateReview: true`) | Flagged for admin review. Do not modify closed/settled. Do not guess due dates |
| Closed / Settled | RESOLVED, CLOSED | Leave as final. Do not modify history. Do not reopen automatically |

## Transitions

```
                ┌──────────┐
                │  ACTIVE  │ ◄── initial state on successful filing
                └────┬─────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
     ┌────────┐ ┌────────┐ ┌──────────┐
     │OVERDUE │ │RESOLVED│ │  CLOSED  │ (skip RESOLVED if already RESOLVED)
     └───┬────┘ └────────┘ └──────────┘
         │          │
         │          └──► second sync ──► CLOSED
         ▼
     ┌────────┐
     │RESOLVED│ (tracking confirms delivery)
     └────────┘
```

### Transition Rules (`deriveComplaintState`)

1. **manualStatePinned + priorState (RESOLVED/CLOSED)**: keep prior state (manual pin)
2. **manualPendingOverride**: ACTIVE (if due not passed) or OVERDUE (if due passed)
3. **tracking DELIVERED or RETURNED**: RESOLVED (or CLOSED if already RESOLVED)
4. **shipment PENDING**: ACTIVE (if due not passed) or OVERDUE (if due passed)
5. **tracking unavailable/unknown**: ACTIVE (if due not passed) or OVERDUE (if due passed)
6. **due date passed**: OVERDUE
7. **default**: ACTIVE

## Legacy Due Date Detection

Records with `legacyDueDateReview: true` have multi-attempt complaints
submitted between `2026-05-02` and `2026-06-10` where attempt 2+ may have
inherited a stale due date from the previous attempt (bug fixed in commit
`c3b62f0`). These records are flagged for admin review but their due dates
are not modified — the system does not guess authoritative due dates.
