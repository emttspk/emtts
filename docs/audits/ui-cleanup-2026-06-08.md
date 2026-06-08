# UI Cleanup — 2026-06-08

## Scope

Remove all onboarding and temporary progress UI per the audit requirements.

## Removals

### 1. Login Progress Modal
**File:** `apps/web/src/pages/Login.tsx`
- Removed `LoadingOverlay` import
- Removed `postLoginRedirecting` state and `loginOverlayVisible` computed
- Simplified `finalizeLogin()` (removed `setPostLoginRedirecting` + `logDevTiming`)
- Removed the full-screen overlay with steps: "Authenticate", "Load account", "Prepare workspace", "Open dashboard"

### 2. First User Success Section
**File:** `apps/web/src/pages/Dashboard.tsx`
- Removed `LoadingOverlay` import and `CheckCircle2` from imports
- Removed `firstLabelReady` and `freePlan` variables
- Removed the `LoadingOverlay` skeleton block
- Removed the entire "First User Success" Card containing:
  - "Upload your first file, generate labels, then upgrade when volume grows."
  - "Upload First File" and "View Upgrade Options" buttons
  - Step 1/2/3 guide
  - "Free plan visible", "Upgrade after success", "Ready for first label" badges

**File:** `apps/web/src/pages/Upload.tsx`
- Removed `firstLabelChecklist` array
- Removed the "First User Success" card with "Your first label batch is the milestone."
- Removed the "Ready to upgrade when you are" card with "Your first label batch is complete..."

### 3. Tracking Workspace Hero Card
**File:** `apps/web/src/pages/BulkTracking.tsx`
- Removed the hero card with "Tracking Workspace" badge, "Shipment status" heading, "Current File" and "Job State" sections
- UnifiedShipmentCards below now directly follows the prior section without the hero card

### 4. Component Deletion
**File:** `apps/web/src/components/LoadingOverlay.tsx`
- Deleted entirely (no remaining references)

## Bundle Size Impact

| Chunk | Before | After | Delta |
|-------|--------|-------|-------|
| Dashboard | 16.13 kB | 13.07 kB | −3.06 kB |
| Upload | 68.89 kB | 65.93 kB | −2.96 kB |
| BulkTracking | 157.82 kB | 155.86 kB | −1.96 kB |

## Grep Audit

All targeted strings confirmed zero matches in source code:
- "Signing you in" ❌ — only in AppShell loading state (kept, not onboarding modal)
- "Authenticate/Load account/Prepare workspace/Open dashboard" sequence — ❌
- "First User Success" — ❌
- "Upload First File" / "View Upgrade Options" — ❌
- "Free plan visible" / "Upgrade after success" — ❌
- "Ready for first label" — ❌
- "Your first label batch is the milestone." — ❌
- "Your first label batch is complete..." — ❌
- "Ready to upgrade when you are." — ❌
- "Tracking Workspace" hero card — ❌ (removed from BulkTracking)
- "Current File" / "Job State" hero card — ❌ (removed from BulkTracking)

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/pages/Login.tsx` | Removed LoadingOverlay import, postLoginRedirecting, overlay JSX |
| `apps/web/src/pages/Dashboard.tsx` | Removed LoadingOverlay import, firstLabelReady/freePlan, LoadingOverlay skeleton, First User Success card |
| `apps/web/src/pages/Upload.tsx` | Removed firstLabelChecklist, First User Success card, Ready-to-upgrade card |
| `apps/web/src/pages/BulkTracking.tsx` | Removed Tracking Workspace hero card (Shipment status, Current File, Job State) |
| `apps/web/src/components/LoadingOverlay.tsx` | **Deleted** (unused after above removals) |
| `AI_IMPLEMENTATION_INDEX.md` | Updated with sprint entry |

## Build

- `npm run build -w apps/web` — **PASS** ✅
- No TypeScript errors, no broken imports.
