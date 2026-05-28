# AI Implementation Index

## JazzCash Files Read

- `jazz cash/PR_V2.0/Controllers/MerchantController.cs`
- `jazz cash/PR_V2.0/Models/Helper.cs`
- `jazz cash/PR_V2.0/Models/TransactionPostDTO.cs`
- `jazz cash/PR_V2.0/Views/Merchant/Index.cshtml`
- `jazz cash/PR_V2.0/Views/Merchant/Post.cshtml`
- `jazz cash/PR_V2.0/bin/MerchantSimulator.dll.config`
- Extracted PDF text from `MWallet Rest API v1.1 (Without CNIC)_Merchant Guide.pdf`
- Extracted PDF text from `IPN Guide for Merchants (REST API) based.pdf`
- Extracted PDF text from `Status Inquiry Guide_Merchants.pdf`
- Extracted PDF text from `How is HMAC-SHA256 calculated.pdf`
- Extracted PDF text from `Sandbox Account Sign up.pdf`
- Extracted PDF text from `Refund Guide Template for Merchant (Mobile Wallet).pdf`

## Files Changed

- `IMPLEMENTATION_NOTES.md`
- `AI_IMPLEMENTATION_INDEX.md`
- `apps/api/src/services/jazzcash.ts`
- `apps/api/src/routes/payments.ts`
- `scripts/jazzcash-hash-check.mjs`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/config.ts`
- `apps/api/.env.example`
- `apps/api/src/index.ts`
- `apps/web/src/lib/PackageService.ts`
- `apps/web/src/pages/Billing.tsx`

## New Env Variables

- `FRONTEND_URL`
- `JAZZCASH_ENV`
- `JAZZCASH_MERCHANT_ID`
- `JAZZCASH_PASSWORD`
- `JAZZCASH_INTEGRITY_SALT`
- `JAZZCASH_RETURN_URL`
- `JAZZCASH_SANDBOX_ENDPOINT`
- `JAZZCASH_LIVE_ENDPOINT`

## API Endpoints

- `POST /api/payments/jazzcash/create`
- `POST /api/payments/jazzcash/callback`
- `GET /api/payments/jazzcash/callback`
- `POST /api/payments/jazzcash/ipn`
- `GET /api/payments/jazzcash/ipn`
- `GET /api/payments/:id/status`
- `POST /api/payments/jazzcash/relay`

## Payment Flow

1. User selects a plan in `/billing`.
2. Frontend calls the JazzCash create endpoint.
3. Backend validates the plan and price, creates a pending payment row, and returns public form fields plus a relay token.
4. Frontend auto-submits the form to the backend relay endpoint.
5. Backend relay injects JazzCash secrets server-side and auto-submits the signed form to JazzCash.
6. JazzCash posts back to the callback URL.
7. Backend verifies `pp_SecureHash`, validates amount and reference, updates payment status, and activates the subscription once.
8. User is redirected back to `/billing?payment=success|failed|pending`.

## Callback URL

- Default callback: `POST/GET /api/payments/jazzcash/callback`
- If configured, `JAZZCASH_RETURN_URL` overrides the callback URL.

## JazzCash Portal URL Setup

- Return URL: `https://api.epost.pk/api/payments/jazzcash/callback`
- IPN URL: `https://api.epost.pk/api/payments/jazzcash/ipn`
- Browser/portal readiness check: `GET /api/payments/jazzcash/ipn` returns JSON and does not process payments.

## Health/Readiness Check

- Verify API health before setting JazzCash portal URLs: `https://api.epost.pk/api/health`

## Sandbox Test Data

- Success:
	- Mobile Number: `03123456789`
	- CNIC last 6 digits: `345678`
- Authentication Error:
	- Mobile Number: `03123456780`
	- CNIC last 6 digits: `345678`
- Pending:
	- Mobile Number: any other value
	- CNIC last 6 digits: `345678`

## Testing Status

- `node scripts/jazzcash-hash-check.mjs` -> PASS (official sample hash matched exactly)
- `npm run prisma:generate --workspace=@labelgen/api` -> PASS
- `npm run phase-3-verify` -> PASS
- `npm run build` -> PASS (web + api)

## Official Docs Conformance Audit (2026-05-28)

- Source checked: `MWallet Rest API v1.1 (Without CNIC)_Merchant Guide.pdf`
- Source checked: `How is HMAC-SHA256 calculated.pdf`
- Source checked: `IPN Guide for Merchants (REST API) based.pdf`
- Source checked: `Status Inquiry Guide_Merchants.pdf`
- Source checked: `jazz cash/PR_V2.0/Controllers/MerchantController.cs`
- Source checked: `jazz cash/PR_V2.0/Models/Helper.cs`
- Verified: request and callback hashing logic uses non-empty PP fields, excludes `pp_SecureHash`, prepends integrity salt, and computes HMAC-SHA256 uppercase.
- Verified: hosted checkout endpoint selection matches sandbox/live docs (`.../ApplicationAPI/API/Payment/DoTransaction`).
- Fixed: `pp_SubMerchantID` now included in signed request field set as empty string when unused.

## GitHub Reference Cross-Check (Non-Authoritative)

- Cross-checked against `https://github.com/zfhassaan/jazzcash` for hosted form flow, hidden-field submit behavior, field set shape, and hash-array approach.
- Conclusion: local implementation aligns on hosted-form pattern and hash strategy, while preserving stronger secret isolation via backend relay.

## Protected Scope Protocol Status

- Preserved the existing label generation, money order generation, tracking, complaints, R2 storage, auth, and admin dashboard paths.
- Kept the existing manual wallet payment flow available.
- Added JazzCash as a narrow subscription/package purchase path only.

## Pending Manual Steps

- Insert real JazzCash live credentials into environment variables only outside version control.
- Confirm the JazzCash merchant profile uses the same approved return/callback URL.
- Execute sandbox transaction with merchant-provided test wallet and verify callback lands on `/billing?payment=success`.
- Execute sandbox declined/canceled transaction and verify callback lands on `/billing?payment=failed`.
- Promote to live by setting `JAZZCASH_ENV=production` and live credential set in deployment secrets only.
- Keep manual wallet payment path available for rollback until live JazzCash canary confirms stability.