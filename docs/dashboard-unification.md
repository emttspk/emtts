# Dashboard/Tracking Card Unification

## Objective
Use one shared card model/component for Dashboard and Tracking Workspace so count and amount metrics are aligned.

## Implementation
- Shared UI component: `apps/web/src/components/UnifiedShipmentCards.tsx`
- Shared backend stats source: `GET /api/shipments/stats`
- Dashboard uses stats + local cache:
  - `apps/web/src/pages/Dashboard.tsx`
- Bulk Tracking uses stats + fallback summary:
  - `apps/web/src/pages/BulkTracking.tsx`

## Data Contract
Stats include:
- counts: `total`, `delivered`, `pending`, `returned`, `complaints`
- amounts: `totalAmount`, `deliveredAmount`, `pendingAmount`, `returnedAmount`

## Production Notes
- Latest deployment shows Web and Api running/success (`temp-live-status-latest.utf8.json`).
- Card amount rendering path is centralized via `formatAmount()` in `UnifiedShipmentCards`.
