# Admin Legacy Restore Audit (2026-05-29)

## Baseline
- Previous stable commit audited: `23d6cda` (pre new admin dashboard rollout).
- Compared files:
  - `apps/web/src/pages/Admin.tsx` (legacy stable operations)
  - `apps/web/src/pages/admin/AdminCommandCenter.tsx` (new command center)
  - `apps/api/src/routes/admin.ts` (admin API compatibility)

## Legacy Function Inventory

| Old function | Old file/route | Current status before restore | Restore action | Safety rule |
|---|---|---|---|---|
| User create/add account | `Admin.tsx` (not exposed in new CC), `POST /api/admin/users` missing | Missing | Added `POST /api/admin/users`; added Add Account modal in legacy operations embedded into Users tab | Admin-only, input validation, optional plan assignment |
| User edit | `PATCH /api/admin/users/:userId` + legacy preview | Partially exposed | Restored through embedded legacy Users tab | Admin-only patch fields |
| Suspend/reactivate account | `POST /api/admin/users/:userId/suspend|unsuspend` | Partially exposed | Restored in embedded Users tab; added alias `POST /api/admin/users/:userId/reactivate` | Admin-only |
| Delete account | `DELETE /api/admin/users/:userId` | Missing in new CC tab flow | Restored via embedded Users tab actions | Confirmation required in UI |
| Add units manually | `POST /api/admin/users/:userId/credits` | Missing in new CC tab flow | Restored via embedded Users preview; added alias `POST /api/admin/users/:userId/units` | Clamp at zero on deductions |
| Assign/change plan | `POST /api/admin/users/:userId/subscription` | Missing in new CC tab flow | Restored via embedded Users preview | Admin-only |
| Plan create/edit/suspend/delete | `POST/PUT/DELETE /api/admin/plans*` | Missing in new CC tab flow | Restored via embedded Plans tab | Existing backend blockers preserved |
| Invoice list/download | `GET /api/admin/invoices`, `GET /api/admin/invoices/:id/download` | Partial | Restored via embedded Invoices tab | Admin-only |
| Invoice status management | Old UI had list only; backend lacked explicit status patch route | Missing | Added `PATCH /api/admin/invoices/:invoiceId` and connected in Invoices actions | Admin-only, explicit status values |
| Invoice delete/cancel/void | Missing in new CC and no explicit route | Missing | Added `DELETE /api/admin/invoices/:invoiceId` and `VOID` status action in Invoices tab | Block deletion for paid/approved-payment invoices |
| Manual payment approve/reject | `POST /api/admin/manual-payments/:id/approve|reject` | Missing in new CC tab flow | Restored via embedded Payments tab; added aliases `/api/admin/payments/:id/approve|reject` | Admin-only |
| Exempt file option | Billing settings exempt textarea in legacy | Missing | Restored through embedded Billing/Settings tab | Persist through existing validated save path |
| MO designer template option | Legacy overview button + `/admin/template-designer` | Missing | Restored dashboard button in Command Center + legacy access | No protected renderer logic touched |
| Shipment admin edit | `PATCH /api/admin/shipments/:shipmentId` | Partial | Restored via embedded Shipments tab | Admin-only |
| Complaint admin actions | `/api/admin/complaints/*` | Present | Kept in Command Center complaints tab | No complaint engine rewrite |
| Job retry/cancel | `/api/admin/jobs/:jobId/retry|cancel` | Partial | Kept in Command Center jobs tab | No queue engine rewrite |
| Storage cleanup tools | No legacy stable destructive cleanup API found | Not available | Left non-destructive monitoring in Storage tab | Destructive cleanup not introduced without prior stable behavior |

## Route and Access Confirmation
- `/admin` remains protected and serves `AdminCommandCenter`.
- `RequireAdmin` gate remains active.
- `/admin/legacy` remains protected fallback/comparison route.

## Protected Scope
No changes to protected finalized files/functions:
- `labels.ts`
- `multipage-label.html`
- barcode engine internals
- MOS/UMO calculation logic
- money order amount calculation logic
- finalized label generation logic
- finalized tracking upload logic
- finalized complaint filing/sync engine internals
