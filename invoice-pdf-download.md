# Invoice PDF Download

Date: 2026-05-09
Status: Completed and deployed

## Summary

Admin invoices now include a direct `Download PDF` action that generates a PDF from existing invoice records.

## Scope

- Added API endpoint:
  - `GET /api/admin/invoices/:invoiceId/download`
- Added Admin UI action:
  - `Download PDF` button in Invoices table.
- No duplicate invoice data source introduced.
- Existing invoice + manual payment linkage remains unchanged.

## PDF Content

Generated invoice PDF includes:

- Invoice ID
- Customer Name
- Plan Name
- Amount
- Payment Method
- Transaction ID
- Status
- Date

## Technical Notes

- Source of truth remains the existing `Invoice` table and linked latest manual payment record.
- PDF is generated server-side using `pdf-lib` and returned as attachment.
- File name uses invoice number when available.

## Files Updated

- `apps/api/src/routes/admin.ts`
- `apps/web/src/pages/Admin.tsx`

## Verification

- Invoices list shows `Download PDF` action.
- Download returns valid `.pdf` attachment.
- Lint/typecheck/build/test pass.
- Deployed to Railway API and Web services.
