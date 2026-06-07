# Tracking Render Regression Audit

Date: 2026-06-07
Project: ePost.pk
Scope: Tracking workspace render crash after commit `251e6da`

## Summary

The tracking workspace crash was introduced by a partial tenant-cache isolation refactor. The page had been updated to restore scoped workspace cache, but one older performance-hydration path inside `BulkTracking.tsx` still referenced the legacy unscoped restore function. In the same area, cache restore checks assumed `cached.shipments` always existed and could throw if stale or malformed JSON was present in browser storage.

## Exact Crash Paths Identified

1. `apps/web/src/pages/BulkTracking.tsx`
   - Performance hydration still called the old unscoped workspace cache reader instead of the scoped reader.
   - This path was inconsistent with the rest of the tenant-scoped restore flow and could break immediately during workspace hydration.

2. `apps/web/src/pages/BulkTracking.tsx`
   - Cache restore checks used patterns like `cached?.shipments.length`.
   - If a cache object existed but `shipments` was missing or malformed, the page could throw `Cannot read properties of undefined (reading 'length')`.

## Files Changed

- `apps/web/src/pages/BulkTracking.tsx`
- `apps/web/src/hooks/useShipmentStats.ts`
- `apps/web/src/lib/trackingWorkspaceCache.ts`
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/pages/Dashboard.tsx`
- `apps/web/src/pages/Complaints.tsx`
- `AI_IMPLEMENTATION_INDEX.md`
- `docs/audits/tracking-render-regression-2026-06-07.md`

## Fixes Applied

### 1. Scoped hydration only

Updated the tracking workspace performance hydration path to use the scoped workspace cache restore flow only.

### 2. Malformed cache auto-clear

Added validation and fail-closed cleanup for:

- tracking workspace render cache
- tracking workspace view state
- tracking workspace IndexedDB snapshot
- shipment stats localStorage cache

If cached JSON is invalid or the shape is stale, the cache is cleared automatically and the page continues loading.

### 3. Safe auth guard

Updated tracking workspace behavior so that if authenticated user context is unavailable:

- the page shows a loading state
- workspace cache restore is skipped
- shipment stats refresh is skipped
- no base-key cache restoration occurs

### 4. Temporary diagnostics added

Added temporary console diagnostics around:

- user context load
- tracking page mount
- user scope change
- workspace render cache restore
- workspace snapshot restore
- shipment stats cache restore and refresh

## Validation Status

| Check | Result |
| --- | --- |
| `npm run build` | PASS |
| Dashboard code path review | PASS |
| Tracking workspace code path review | PASS |
| Malformed cache auto-clear | PASS |
| Missing user context safe loading state | PASS |
| Cross-user stale scoped restore prevention | PASS |
| Browser click-through of upload/history/logout/login flow | Not run in this environment |

## Security Result

The regression fix preserves the tenant-isolation changes from commit `251e6da` and removes the crash vectors introduced during the cache-scoping refactor. The tracking workspace now fails closed on bad cache data and no longer attempts to restore unscoped workspace cache during scoped user sessions.

## Endpoint / Cache Verification

| Surface | Ownership / Scope Check | Fixed | Verified |
| --- | --- | --- | --- |
| Tracking workspace render cache | user-scoped key required | Yes | Yes |
| Tracking workspace view state | user-scoped key required | Yes | Yes |
| Tracking workspace snapshot | user-scoped IndexedDB key required | Yes | Yes |
| Shipment stats cache | user-scoped key required | Yes | Yes |
| Missing auth state | guarded loading state | Yes | Yes |
| Legacy unscoped hydration path | removed from tracking restore flow | Yes | Yes |

## Root Cause

The tenant-isolation refactor updated most tracking cache code to be user-scoped, but one older performance-hydration branch in `BulkTracking.tsx` was left behind. That legacy restore path, combined with cache-shape assumptions like `cached?.shipments.length`, created a crash-prone restore flow when stale or malformed workspace cache existed.
