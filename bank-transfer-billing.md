# Bank Transfer Billing

Date: 2026-05-09
Status: Completed and deployed

## Summary

Bank Transfer was added as a third manual payment method alongside JazzCash and Easypaisa.

## Admin Billing Settings Additions

New fields:

- Bank Name
- Account Title
- Account Number
- IBAN
- Optional QR Image

Behavior:

- Stored in the same billing settings record as wallet settings.
- Backward compatible via nullable columns.
- QR upload/remove flow mirrors existing wallet QR handling.

## Manual Payment Flow Support

- Payment method options now include `BANK_TRANSFER`.
- Payment modal displays bank details and QR (if configured).
- Submission flow remains unchanged (same endpoint and request pipeline).

## API Support

Extended billing settings payloads and wallet info with:

- `bankName`
- `bankTitle`
- `bankAccountNumber`
- `bankIban`
- `bankQrPath`

Wallet info endpoint now returns `bankTransfer` object for display in modal.

## Database Migration

Added nullable columns to `BillingSettings`:

- `bankName`
- `bankTitle`
- `bankAccountNumber`
- `bankIban`
- `bankQrPath`

Migration file:

- `apps/api/prisma/migrations/20260509090000_add_bank_transfer_billing_fields/migration.sql`

## Files Updated

- `apps/api/prisma/schema.prisma`
- `apps/api/src/services/billing-settings.service.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/routes/manualPayments.ts`
- `apps/api/src/routes/billingSettings.ts`
- `apps/web/src/pages/Admin.tsx`
- `apps/web/src/components/ManualPaymentModal.tsx`
- `apps/web/src/pages/Billing.tsx`

## Verification

- Bank Transfer visible in Billing Settings.
- Bank Transfer selectable in payment modal.
- Bank details and QR render correctly.
- Submit flow accepts `BANK_TRANSFER`.
- Lint/typecheck/build/test pass.
- Railway deployment completed.
