# Complaint State Machine

## States

| State | Description |
|-------|-------------|
| ACTIVE | Complaint is open and active |
| OVERDUE | Due date has passed, awaiting resolution |
| RESOLVED | Complaint resolved by delivery confirmation |
| CLOSED | Manually closed by admin |
| REJECTED | Complaint rejected |
| QUEUED | Waiting to be submitted to Pakistan Post |
| PROCESSING | Currently being submitted to Pakistan Post |
| RETRY PENDING | Submission failed, waiting for retry |
| MANUAL REVIEW | Requires manual intervention |

## State Transitions

### Via Sync (`complaint-sync.service.ts`)
```
ACTIVE → OVERDUE: due date passed, tracking not terminal
ACTIVE → RESOLVED: live tracking confirms DELIVERED/RETURNED
RESOLVED → CLOSED: confirmed on second sync cycle
OVERDUE → RESOLVED: live tracking confirms DELIVERED/RETURNED
```

### Via Manual Action
```
RESOLVED → CLOSED: admin close
ACTIVE/OVERDUE → RESOLVED: admin confirm resolved
ACTIVE/OVERDUE → CLOSED: admin close
```

### Via Reopen
```
RESOLVED/CLOSED/REJECTED → Reopen allowed (pending status)
OVERDUE → Reopen allowed (pending status)
```

## Reopen Rules

### When Reopen is Allowed
1. Shipment status must be PENDING
2. Lifecycle state must be: RESOLVED, CLOSED, or REJECTED
3. OR due date must be expired (today > dueDate)

### When Reopen is BLOCKED
1. Queue state is: QUEUED, PROCESSING, or RETRY PENDING
2. User cannot submit a new complaint while one is in flight

## Button States

| Label | Meaning | Button State |
|-------|---------|--------------|
| Complaint | No existing complaint | Enabled |
| Queued for Submission | QUEUED | Disabled |
| Submitting to Pakistan Post... | PROCESSING | Disabled |
| Retry Pending | RETRY PENDING | Disabled |
| Complaint requires manual review | MANUAL REVIEW | Disabled |
| Reopen Complaint | Terminal state + pending | Enabled (if queue not blocking) |
| In Process | Active complaint | Disabled |

## Implementation

```typescript
// Check if reopen is allowed
export function isReopenEligible(
  shipmentStatus: string | null,
  lifecycleState: string | null,
  lifecycleDueDateTs: number | null,
): boolean {
  const statusUpper = String(shipmentStatus ?? "").trim().toUpperCase();
  const stateUpper = String(lifecycleState ?? "").trim().toUpperCase();
  if (statusUpper !== "PENDING") return false;
  if (["RESOLVED", "CLOSED", "REJECTED"].includes(stateUpper)) return true;
  return isDueDateExpired(lifecycleDueDateTs);
}

// Check if queue is blocking reopen
export function isQueueStateBlockingReopen(queueStatus: string | null): boolean {
  const normalized = String(queueStatus ?? "").trim().toUpperCase().replace(/[\-_]+/g, " ");
  return ["QUEUED", "PROCESSING", "RETRY PENDING"].includes(normalized);
}
```