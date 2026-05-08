# Post-Cleanup Regression Fix Report

Date: 2026-05-08  
Railway Project: 144be6f4-a17c-47ec-8c23-3d5963c4d5fb

## Scope

Mandatory recovery loop after cleanup phase with explicit restriction: repair only, no additional cleanup.

Required outcomes:
- Restore money order background behavior in preview/PDF/print pipeline.
- Restore authenticated user access for Generate Labels and Generate Money Order.
- Keep admin-only protection for admin pages.
- Complete validation loop and deploy API + Web.

## Root Cause Summary

### 1) Route access regression

User routes for generation workflows were forwarding to admin route aliases.
Those admin aliases are protected by `RequireAdmin`, so authenticated non-admin users were blocked.

### 2) Money order background regression

Template background URLs with leading slash format (example: `/templates/mo-front-default.png`) were not always mapped to filesystem paths in the API resolver.
In some runtime layouts this caused backgrounds to be skipped in rendered output.

## Code-Level Repairs

### apps/web/src/App.tsx
- `/generate-labels` now directly renders `<GenerateLabels />`.
- `/generate-money-orders` now directly renders `<GenerateMoneyOrder />`.
- `/admin/generate-labels` now redirects to `/generate-labels`.
- `/admin/generate-money-orders` now redirects to `/generate-money-orders`.
- `/admin` and other admin routes remain protected by `RequireAdmin`.

### apps/web/src/components/Sidebar.tsx
- Generate Labels nav target set to `/generate-labels`.
- Generate Money Order nav target set to `/generate-money-orders`.
- Match prefixes keep compatibility for active state during alias navigation.

### apps/web/src/lib/navigation.ts
- Shared nav definitions now point Generate Labels and Generate Money Order to user-safe paths.
- Admin definitions are preserved.

### apps/api/src/money-order/backgrounds.ts
- Added fallback resolution for leading-slash background URLs by probing:
  - `apps/web/public/<normalized>`
  - `apps/api/templates/<normalized>`
- Existing handling retained for:
  - uploaded template backgrounds under `/api/admin/templates/background/...`
  - explicit `http/https/data:` URLs (ignored for local file conversion)

## Validation Log

- npm install: PASS
- npm run lint: PASS
- npm run typecheck: PASS
- npm run build: PASS
- npm run dev: PASS
- npm run test: PASS (`@labelgen/api` smoke railway test success)

## Deployment Log

- Api deploy: `railway up --service Api --detach`
  - Build logs id: `024430ab-1117-4e4e-b1c3-0f1a45caf0b4`
- Web deploy: `railway up --service Web --detach`
  - Build logs id: `bb325e11-9abb-4733-b751-4db3d6850190`

Recent logs confirm active live traffic:
- API: `/api/me`, `/api/shipments/stats`, bulk tracking processing entries.
- Web: successful `200` responses for workspace routes and generated bundles.

## Access Model After Fix

- Authenticated users can access:
  - Dashboard
  - Tracking workspace
  - Generate Labels
  - Generate Money Order
- Admin-only pages remain restricted by `RequireAdmin`.

## Notes

- This loop performed repair-only actions; no cleanup deletions were executed.
- The fix isolates user workflows from admin-only route enforcement and hardens template background resolution across deployment path layouts.
