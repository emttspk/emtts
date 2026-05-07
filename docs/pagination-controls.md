# Pagination Controls (Top + Bottom)

## Required Controls
Each paginated table uses full controls at both top and bottom:
- First
- Previous
- Next
- Last

## Implemented Locations
- Complaints page:
  - `apps/web/src/pages/Complaints.tsx`
  - controls present at two positions (top and bottom blocks)
- Admin page (Invoices + Manual Payments):
  - `apps/web/src/pages/Admin.tsx`
  - controls present for each table at top and bottom
- Bulk Tracking page:
  - `apps/web/src/pages/BulkTracking.tsx`
  - controls present at two positions

## Server Pagination
- `GET /api/shipments?page=<n>&limit=<k>` used by complaints/tracking views.
- Admin tables paginate in UI over fetched datasets.
