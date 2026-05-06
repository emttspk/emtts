# Plan CRUD, Wallet Proof, Global Plan Sync, and Template Hydration

## Scope
This document captures frontend/backend binding fixes only. It does not alter billing lifecycle, invoice lifecycle, manual payment approval logic, subscription activation logic, or money-order generation logic.

## Plan CRUD Binding

### API
- `GET /api/admin/plans`
  - Returns plan pricing + lifecycle metadata:
    - `fullPriceCents`
    - `discountPriceCents`
    - `discountPct`
    - `isSuspended`
  - Returns plan capability metadata:
    - `unitsIncluded`
    - `labelsIncluded`
    - `trackingIncluded`
    - `moneyOrdersIncluded`
    - `complaintsIncluded`
    - `dailyComplaintLimit`
    - `monthlyComplaintLimit`

- `POST /api/admin/plans`
  - Accepts full plan payload and persists all fields.

- `PUT /api/admin/plans/:planId`
  - Supports full object patching for all editable fields.

- `DELETE /api/admin/plans/:planId`
  - Protected by active-subscription guard.
  - Returns conflict when active subscriptions exist.

- `POST /api/admin/plans/:planId/suspend`
  - Toggles suspension state used by purchase flow and UI.

### Runtime persistence model
Plan metadata is stored in runtime-safe Plan columns (created if missing):
- `full_price_cents`
- `discount_price_cents`
- `is_suspended`
- `units_included`
- `labels_included`
- `tracking_included`
- `money_orders_included`
- `complaints_included`
- `daily_complaint_limit`
- `monthly_complaint_limit`

## Wallet Proof System

### Upload
- Manual payment proof now accepts image and PDF files.
- Proof file names preserve extension for downstream preview support.

### Queue binding
- Admin payment queue includes:
  - `screenshotUrl`
  - `proofFileName`
  - `proofMimeType`

### Preview behavior
- Queue action opens in-app modal (not direct download):
  - Image mime types -> inline image preview
  - PDF mime type -> iframe preview
  - Unknown/unsupported -> open-in-new-tab fallback

### Protected access
- Proof route stays protected by auth and ownership/admin checks:
  - `GET /api/manual-payments/screenshot/:requestId`

## Global Plan Sync

### Source of truth
- Plan cards and package selection surfaces consume centralized plans API.
- Subscription payload (`GET /api/me`) is enriched with plan metadata columns for synchronized account surfaces.

### Removed hardcoded dependencies
- Settings no longer imports hardcoded catalog metadata for plan display math.
- Plan-dependent fields read from API-enriched plan data.

## Template Loader Architecture

### List + hydration
- Designer now keeps full template list in state.
- Active badge remains visible for active template.
- Selection loads selected template into editor.

### Switching active template
- Sidebar supports `Set Active` action.
- Selecting active updates and refreshes template list.

### Fallback behavior
- If no active template exists, the first template is selected automatically for editor hydration.

## Validation checklist
- Wallet proof preview opens from admin queue in modal.
- Full plan edit persists all fields after reload.
- Delete removes plan only when no active subscriptions exist.
- Suspended plans show badge/disabled purchase behavior.
- Template list is visible, switch works, editor hydrates selected template.
