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
- `JAZZCASH_TXN_TYPE`
- `JAZZCASH_BANK_ID`
- `JAZZCASH_PRODUCT_ID`
- `JAZZCASH_SUBMERCHANT_ID`

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
2. User clicks `Pay with JazzCash`, enters the JazzCash mobile number in a modal, then clicks `Pay Now`.
3. Frontend calls the JazzCash create endpoint only after the modal confirmation.
4. Backend validates the plan and price, creates a pending payment row, and returns public form fields plus a relay token.
5. Frontend auto-submits the form to the backend relay endpoint on the API origin, not the web origin, using a URL-encoded POST body.
6. Backend relay injects JazzCash secrets server-side and auto-submits the signed form to JazzCash.
7. JazzCash posts back to the callback URL.
8. Backend verifies `pp_SecureHash`, validates amount and reference, updates payment status, and activates the subscription once.
9. User is redirected back to `/billing?payment=success|failed|pending`.

## JazzCash Fresh Test Rule

- The old EP Gateway pending-payment URL is not a JazzCash checkout path.
- Fresh JazzCash testing must always start from `/billing` and the `Pay with JazzCash` button.
- Do not use `Resume payment` from an older pending EP Gateway invoice for JazzCash validation.

## Callback URL

- Default callback: `POST/GET /api/payments/jazzcash/callback`
- If configured, `JAZZCASH_RETURN_URL` overrides the callback URL.

## JazzCash Portal URL Setup

- Return URL: `https://api.epost.pk/api/payments/jazzcash/callback`
- IPN URL: `https://api.epost.pk/api/payments/jazzcash/ipn`
- Do not use web origin URLs for callback or IPN: `https://www.epost.pk/api/...`
- Browser/portal readiness check: `GET /api/payments/jazzcash/ipn` returns JSON and does not process payments.
- Live verification: `GET https://api.epost.pk/api/payments/jazzcash/ipn` returns `200 OK` JSON readiness metadata.
- Live verification: `POST https://api.epost.pk/api/payments/jazzcash/ipn` returns a safe JSON processing response.
- Live verification: `POST https://api.epost.pk/api/payments/jazzcash/callback` returns the expected safe redirect behavior for empty payloads.

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

## Railway Variable Status (2026-05-28)

- `JAZZCASH_ENV=sandbox`
- `JAZZCASH_RETURN_URL=https://api.epost.pk/api/payments/jazzcash/callback`
- `FRONTEND_URL=https://www.epost.pk`
- `JAZZCASH_MERCHANT_ID` present
- `JAZZCASH_PASSWORD` present
- `JAZZCASH_INTEGRITY_SALT` present
- `JAZZCASH_SANDBOX_ENDPOINT` present
- `JAZZCASH_LIVE_ENDPOINT` present
- `JAZZCASH_TXN_TYPE` missing
- `JAZZCASH_BANK_ID` missing
- `JAZZCASH_PRODUCT_ID` missing
- Values were checked in Railway and masked before reporting.

## v4.2 Documentation Cross-Check (2026-05-28)

- Source checked: `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/index.html`
- Source checked: `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/features.html`
- Source checked: `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/Resources.html`
- Source checked: `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/ApiReferences.html`
- Confirmed from v4.2 HTTP POST Mobile Account sample:
	- `pp_Version=1.1`
	- `pp_TxnType=MWALLET`
	- `pp_BankID=TBANK`
	- `pp_ProductID=RETL`
	- `pp_SubMerchantID` present and typically blank unless assigned
	- `ppmpf_1..ppmpf_5` present
- Confirmed from v4.2 resources:
	- `000` = success
	- `124` = pending voucher financials
	- `157` = pending (Mwallet/MIgs)
	- `101` = invalid merchant credentials
	- `115` = invalid hash

## v4.2 vs Live Payload Snapshot (Pre-Fix)

- Endpoint action URL: `https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/`
- `pp_MerchantID`: present
- `pp_TxnType`: `MWALLET`
- `pp_ReturnURL`: `https://api.epost.pk/api/payments/jazzcash/callback`
- `pp_Amount`: `99900`
- `pp_TxnCurrency`: `PKR`
- `pp_BillReference`: present
- `pp_Description`: present
- `pp_SubMerchantID`: present blank
- `pp_BankID`: present blank
- `pp_ProductID`: present blank
- `ppmpf_1`: present (mobile)
- `pp_SecureHash`: present
- Main mismatch found against v4.2 sample: `pp_BankID` and `pp_ProductID` were blank instead of `TBANK` and `RETL` for Mobile Account page redirection.

## Corrected Payload Rules (Code)

- `pp_TxnType` is now configurable via `JAZZCASH_TXN_TYPE` (default `MWALLET`).
- `pp_BankID` is now configurable via `JAZZCASH_BANK_ID`.
	- Default: `TBANK` in sandbox mode.
- `pp_ProductID` is now configurable via `JAZZCASH_PRODUCT_ID`.
	- Default: `RETL` in sandbox mode.
- `pp_SubMerchantID` is now configurable via `JAZZCASH_SUBMERCHANT_ID` (default blank).
- Return URL remains API-origin callback URL only.
- IPN remains configured in JazzCash portal and processed on `POST /api/payments/jazzcash/ipn`.

## Post-Fix Live Validation (2026-05-28)

- Billing flow validation:
	- `/billing` -> `Pay with JazzCash` opens popup modal.
	- Pending `Resume payment` now reopens JazzCash modal (not legacy mock checkout URL).
	- Modal submit redirects through API relay to JazzCash sandbox.
- Live create+relay payload validation after update:
	- `pp_TxnType=MWALLET`
	- `pp_BankID=TBANK`
	- `pp_ProductID=RETL`
	- `pp_SubMerchantID` present blank
	- `pp_ReturnURL=https://api.epost.pk/api/payments/jazzcash/callback`
- Sandbox outcome remains:
	- `Sorry! Your transaction could not be processed due to insufficient merchant information.`
- Conclusion:
	- App-side payload and redirect flow are aligned with v4.2 Mobile Account sample.
	- Remaining blocker is sandbox merchant profile/configuration on JazzCash side.

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
- Billing UI now uses a JazzCash popup/modal instead of exposing the mobile number field on the card.

## Pending Manual Steps

- Insert real JazzCash live credentials into environment variables only outside version control.
- Confirm the JazzCash merchant profile uses the same approved return/callback URL.
- Execute sandbox transaction with merchant-provided test wallet and verify callback lands on `/billing?payment=success`.
- Execute sandbox declined/canceled transaction and verify callback lands on `/billing?payment=failed`.
- Promote to live by setting `JAZZCASH_ENV=production` and live credential set in deployment secrets only.
- Keep manual wallet payment path available for rollback until live JazzCash canary confirms stability.

## Final Tested Result

- Fresh hosted JazzCash checkout reaches the sandbox merchant page.
- The sandbox currently rejects the merchant profile with `insufficient merchant information`.
- The generated payload is correct and includes masked live-tested values from the production API service.
- Remaining action is merchant-profile / portal-side activation or URL/credential correction, not app relay changes.

## Legacy EP Gateway Mock Checkout Handling

- Billing resume flow no longer redirects normal users to `/api/subscriptions/checkout/...`.
- Pending JazzCash resumes via JazzCash modal flow only.
- Pending non-JazzCash payments resume through the manual payment modal only.
- Legacy EP Gateway hosted mock checkout route is disabled in production and only available for development/internal testing.

## JazzCash Sandbox Support / Escalation Note

- Merchant ID: `MC771933`
- Return URL: `https://api.epost.pk/api/payments/jazzcash/callback`
- IPN URL: `https://api.epost.pk/api/payments/jazzcash/ipn`
- Verified app payload:
	- `pp_MerchantID` present
	- `pp_Password` present
	- `pp_ReturnURL` correct
	- `pp_Amount=99900` for Rs.999
	- `pp_TxnType=MWALLET`
	- `pp_SubMerchantID` blank
	- `ppmpf_1=03123456789`
	- `pp_SecureHash` present
	- Sandbox endpoint in use
- Issue observed in sandbox:
	- `Sorry! Your transaction could not be processed due to insufficient merchant information.`
- Request to JazzCash support:
	- Activate/verify hosted checkout + `MWALLET` for this sandbox merchant profile.
	- Confirm whether this merchant account requires a different transaction type.
	- Confirm whether blank `pp_SubMerchantID` is correct for this profile.
	- Confirm whether IPN may be the same URL as Return URL for this profile.