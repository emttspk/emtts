# Tracking Tenant Isolation Audit

Date: 2026-06-07

## Summary

I audited the tracking workspace, shipment stats, batch history, complaints, and direct job/file access paths for cross-account leakage.

## Root Cause

The primary leak vector was client-side cache reuse across auth changes:

- The bulk tracking workspace restored render state, view state, and snapshot data from global browser cache keys.
- Shipment stats were cached in localStorage under a single global key.
- The complaints page used a page cache key that did not include the authenticated user.
- The app shell rendered protected pages before the authenticated user record finished loading, which allowed stale cache to paint briefly during auth bootstrap.

## Backend Findings

I traced the tracking-related routes and confirmed ownership filters are enforced on the user-facing paths:

- `/api/tracking/bulk`
- `/api/tracking/upload`
- `/api/tracking/live-bulk`
- `/api/tracking/track/:trackingNumber`
- `/api/tracking/complaint/prefill/:trackingNumber`
- `/api/tracking/batches`
- `/api/tracking/batches/:batchId/master-file`
- `/api/tracking/batches/:batchId/run`
- `/api/tracking/batches/:batchId`
- `/api/tracking/:jobId`
- `/api/tracking/complaint`
- `/api/shipments`
- `/api/shipments/stats`
- `/api/shipments/diff`
- `/api/shipments/:id`
- `/api/shipments/refresh-pending`
- `/api/shipments/batch-delete`

The direct batch and job readers use `userId` checks, and the shipment/complaint queries are constrained to the authenticated account.

## Fixes Applied

- Scoped tracking workspace render cache, view state, and snapshot storage by authenticated user.
- Cleared tracking workspace caches on logout and session changes.
- Scoped shipment stats cache by authenticated user.
- Scoped complaints page cache by authenticated user.
- Scoped complaint phone/email browser persistence by authenticated user.
- Reset bulk tracking in-memory state when the user scope changes.
- Prevented protected workspace pages from mounting until the authenticated user is loaded.

## Validation Matrix

Scenario: User A uploads tracking data, then User B logs in on the same browser.

| Area | Expected | Result |
| --- | --- | --- |
| Summary cards | User B sees only User B stats | Scoped by user and refreshed from User B cache/API |
| Shipment table | User B sees only User B shipments | User-scoped API results and cache reset |
| Batch history | User B sees only User B batches | User-scoped API plus scoped browser cache |
| Complaint counts | User B sees only User B complaint totals | User-scoped stats cache and API ownership filters |
| Downloads/exports | User B can only download User B artifacts | Batch/job/file endpoints enforce `userId` ownership |
| Direct URL access | User B cannot access User A batch/job URLs | 404 on mismatched ownership |

## Security Verification

| Endpoint | Ownership Checked | Fixed | Verified |
| --- | --- | --- | --- |
| `/api/tracking/batches` | Yes | Not needed | Yes |
| `/api/tracking/batches/:batchId/master-file` | Yes | Not needed | Yes |
| `/api/tracking/batches/:batchId/run` | Yes | Not needed | Yes |
| `/api/tracking/batches/:batchId` | Yes | Not needed | Yes |
| `/api/tracking/:jobId` | Yes | Not needed | Yes |
| `/api/tracking/complaint` | Yes | Not needed | Yes |
| `/api/shipments` | Yes | Not needed | Yes |
| `/api/shipments/stats` | Yes | Not needed | Yes |
| `/api/shipments/:id` | Yes | Not needed | Yes |
| `/api/shipments/diff` | Yes | Not needed | Yes |
| `/api/shipments/refresh-pending` | Yes | Not needed | Yes |
| `/api/shipments/batch-delete` | Yes | Not needed | Yes |

## Build Result

- `npm run build`: PASS

## Notes

- Public tracking endpoints remain public by design.
- Admin/system-only consumers of complaint records remain exempt from per-user scoping when they are intentionally operating across accounts.
