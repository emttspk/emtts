# Money Order Front Background Fix

## Problem

Money-order front background could fail when active template `backgroundUrl` was stored as an absolute URL string containing an API background path, especially with query/hash suffixes.

## Root Cause

Resolver logic handled direct relative API paths (`/api/admin/templates/background/...`) but did not normalize absolute URL strings before path matching.

## Fix Applied

Updated `resolveActiveTemplateFrontDataUrl` in `apps/api/src/money-order/backgrounds.ts`:

- Added URL/pathname normalization helper to extract path safely.
- Strips query and hash fragments before filename resolution.
- Supports absolute URL values where pathname matches:
  - `/api/admin/templates/background/<file>`
- Preserves existing handling for non-local `http/https/data:` sources.

## Result

Active template front background now resolves consistently for:

- Relative API background URLs
- Absolute URLs that point to API background endpoint
- Paths that include query/hash suffixes

## Files Changed

- `apps/api/src/money-order/backgrounds.ts`

## Validation Summary

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm run test`: PASS (`smoke:railway`)
