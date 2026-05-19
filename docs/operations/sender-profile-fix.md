# Sender Profile Fix — 2026-05-08

## Problem
`SenderProfileCard` was imported and built but never rendered in any page.
The regression occurred in commit `2f01006` (fix railway mobile routing) which dropped the
`xl:grid-cols-[1fr_260px]` sidebar layout from BulkTracking, orphaning the sidebar placement.
Subsequent refactors never re-added the card to the new flat layout.

## Root Cause
- `SenderProfileCard` was defined in `apps/web/src/components/SenderProfileCard.tsx`
- `SenderProfileSidecard` (earlier version) was replaced with `SenderProfileCard` in commit `314da43`
- Commit `2f01006` restructured the BulkTracking layout, removing the sidebar grid and the card with it
- No other page (Upload/GenerateLabels) ever rendered it

## Fix Applied
**File:** `apps/web/src/pages/BulkTracking.tsx`
- Added import: `import SenderProfileCard from "../components/SenderProfileCard"`
- Added render after `<UnifiedShipmentCards>`: `<SenderProfileCard me={me} compact className="shadow-sm" />`

**File:** `apps/web/src/pages/Upload.tsx`
- Added import: `import SenderProfileCard from "../components/SenderProfileCard"`
- Added render at top of content area: `<SenderProfileCard me={me} compact className="shadow-sm" />`

## Data Source
Single source: `GET /api/me` → `meRouter` in `apps/api/src/routes/me.ts`

Fields hydrated:
- `me.user.companyName` → Name
- `me.user.cnic` → CNIC
- `me.user.address` → Address
- `me.user.originCity` → City
- `me.user.contactNumber` → Mobile
- `me.subscription.plan.name` / `me.activePackage.planName` → Package
- `me.balances.unitsRemaining` → Remaining Units
- `me.balances.labelLimit` → Total Shared Units
- `me.balances.complaintDailyLimit` / `me.balances.complaintMonthlyLimit` → Complaint Limits

## Validation
- `npm run build` ✓
- `npm run typecheck` ✓
- `npm run lint` ✓
- Git commit: `4bd9fe3`
- Railway deployed: Api + Web
