# Tracking Production Validation

Date: 2026-06-07
Project: ePost.pk
Scope: post-fix production validation of Tracking Workspace after `1846fcc3`, `251e6da`, and `82aede3`

## What Was Validated

I validated the tracking workspace and its surrounding auth/cache/data paths from the repository source and build output.

## Validation Matrix

| Feature | User A | User B | Pass/Fail |
| --- | --- | --- | --- |
| Cards | Source-reviewed, user-scoped cache path confirmed | Source-reviewed, cache reset on session change confirmed | Pass |
| Table | Source-reviewed, scoped render cache and shipment fetch confirmed | Source-reviewed, no unscoped restore path confirmed | Pass |
| Batch History | Source-reviewed, `/api/tracking/batches` is user-scoped | Source-reviewed, batch cache clears on logout | Pass |
| Complaints | Source-reviewed, complaint prefill and submission are `userId` scoped | Source-reviewed, complaint caches are cleared or re-scoped | Pass |
| Exports | Source-reviewed, batch/file export endpoints require ownership | Source-reviewed, direct access restricted to authenticated owner | Pass |
| Downloads | Source-reviewed, batch master-file download checks `userId` and batch ownership | Source-reviewed, no cross-user file access path found | Pass |

## Browser Storage Check

Confirmed in code:

- `localStorage` keys used by tracking are user-scoped or cleared on logout.
- `sessionStorage` is cleared during logout cleanup.
- Tracking workspace IndexedDB snapshots are user-scoped and cleared on logout.

## API Ownership Check

Confirmed in source:

- `apps/api/src/routes/tracking.ts`
  - `/batches`
  - `/batches/:batchId/master-file`
  - `/batches/:batchId/run`
  - `/batches/:batchId`
  - `/:jobId`
  - `/complaint/prefill/:trackingNumber`
  - `/complaint`
- `apps/api/src/routes/shipments.ts`
  - `/stats`
  - shipment fetch/update/delete/refresh paths

These endpoints use `req.user.id` or an equivalent `userId` ownership filter on the query.

## React Query

No React Query implementation was found in `apps/web/src`, so there were no React Query cache keys to audit. The relevant caching is handled through custom localStorage and IndexedDB helpers instead.

## Build

`npm run build` PASS

## Remaining Risks

- Live browser verification with two real accounts was not executed in this environment.
- Incognito and hard-refresh verification therefore remains a production-browser follow-up item.
- If the production deployment still has stale browser storage from an older build, users may need one session logout/login cycle to fully reset older non-scoped values.

## Conclusion

From source review and successful build output, the tracking workspace is now scoped by authenticated user, clears its caches on logout, and no longer shows the crash vector introduced during the cache isolation refactor.
