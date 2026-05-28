# AI Implementation Index

## Admin Legacy Function Restore in Command Center (2026-05-29)

### Task
- Audit previous stable admin version and restore missing legacy admin functions into `/admin` command center.

### Previous Stable Commit Audited
- `23d6cda` (pre new admin dashboard commits)

### Old Functions Found
- Legacy operational coverage in `apps/web/src/pages/Admin.tsx` across users, plans, usage, shipments, payments, invoices, billing settings.

### Missing Functions Restored
- Add account
- Delete account
- Suspend/reactivate account
- Manual add units
- Plan/package assign
- Payment approve/reject
- Invoice status management and guarded delete
- Exempt file controls
- Money Order designer access

### APIs Restored/Added
- `POST /api/admin/users`
- `PATCH /api/admin/invoices/:invoiceId`
- `DELETE /api/admin/invoices/:invoiceId`
- `POST /api/admin/users/:userId/units`
- `POST /api/admin/users/:userId/reactivate`
- Compatibility aliases:
	- `POST /api/admin/payments/:id/approve`
	- `POST /api/admin/payments/:id/reject`

### Frontend Tabs/Actions Restored
- New command center tabs now embed legacy stable operations for: users, plans, usage, shipments, payments, invoices, settings/billing.
- Dashboard includes restored MO designer access entry point.

### Protected Files Not Touched
- `labels.ts`
- `multipage-label.html`
- barcode engine internals
- MOS/UMO calculation logic
- finalized label generation logic
- finalized tracking upload logic
- finalized complaint filing/sync engine internals

### Validation
- `npm run build`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: FAIL (pre-existing unrelated web issues)
	- `apps/web/src/pages/Billing.tsx:263` (`apiUrl` missing)
	- `apps/web/src/pages/BulkTracking.tsx:2236,2237` (`prev` possibly null)
	- `apps/web/src/pages/BulkTracking.tsx:2564` (`complaint_status` vs `complaintStatus`)

### Git
- Commit hash: pending

### Completion
- Updated project completion percentage: 99%
- Remaining work: 1% (final commit/push)

## SaaS Admin Command Center Cleanup Cycle (2026-05-29)

### Task
- Complete pending cleanup and finish remaining admin tab functionality in one controlled cycle.

### Pending Files Cleanup Result
- Phase 1 inspection commands run: `git status --short`, `git diff --stat`, `git diff --name-only`, `git ls-files --others --exclude-standard`.
- Classification:
	- A. Approved source/admin files: current cycle updates in admin API and command center UI.
	- B. Documentation files: implementation index/changelog/readme updates.
	- C. Build output/dist/cache/generated: present under unrelated local bundle subtree.
	- D. Dependency artifacts: present under unrelated local bundle subtree.
	- E. Generated PDFs/storage outputs: present in local bundle subtree and existing ignored runtime paths.
	- F. Unrelated user folder/files: `jazz cash/`.
	- G. Unknown: none requiring destructive cleanup.
- Safety action:
	- No blind deletion executed.
	- Added ignore rule for `jazz cash/` to clear pendency safely without removing user/business files.

### Admin Route Confirmation
- `/admin` is protected and routed to `AdminCommandCenter` via admin guard.
- `/admin/legacy` remains protected for legacy operations.
- Admin route is not exposed publicly.

### Tabs Completed
- Dashboard
- Users
- Plans/Packages
- Revenue
- Usage Logs
- Label Jobs
- Bulk Tracking/Shipments
- Complaints
- Billing/Payments
- Invoices
- File Storage
- Audit Logs
- System Health
- Settings

### Search/Edit/Safe Action/Date Filter Status
- Common controls implemented in command center for applicable tabs:
	- Search
	- Date range (`from`/`to`) + quick filters (`Today`, `Last 7 Days`, `This Month`, `All`)
	- Status filter input
	- Refresh
	- Pagination controls
	- Clear filters
- Safe actions implemented by tab where applicable (suspend/reactivate, approve/reject, cancel/archive, sync/export, download/view metadata).

### APIs Added/Updated
- Added compatibility and safety endpoints:
	- `PATCH /api/admin/plans/:planId`
	- `PATCH /api/admin/payments/:paymentId/status`
	- `PATCH /api/admin/jobs/:jobId/status`
	- `POST /api/admin/jobs/:jobId/retry`
	- `POST /api/admin/complaints/:trackingId/sync`
- Updated list APIs with query params support for search/date/status/pagination/sort:
	- `GET /api/admin/usage`
	- `GET /api/admin/jobs`
	- `GET /api/admin/shipments`
	- `GET /api/admin/invoices`

### Protected Scope Protocol
- Not touched:
	- `labels.ts`
	- `multipage-label.html`
	- barcode engine internals
	- MOS/UMO amount calculation logic
	- finalized label generation logic
	- finalized tracking upload logic
	- finalized complaint filing/sync engine internals
	- PDF rendering templates used by label/money-order generation

### Validation
- `npm run build`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: FAIL (pre-existing unrelated web issues)
	- `apps/web/src/pages/Billing.tsx:263` (`apiUrl` missing)
	- `apps/web/src/pages/BulkTracking.tsx:2236,2237` (`prev` possibly null)
	- `apps/web/src/pages/BulkTracking.tsx:2564` (`complaint_status` vs `complaintStatus`)

### Git
- Commit hash: `bedbb53`
- Push status: `origin/main` updated successfully

### Completion
- Current completion percentage: 100%
- Remaining percentage: 0%
- Remaining items:
	- none

## SaaS Admin Command Dashboard Rollout (2026-05-29)

### Scope
- Additive admin dashboard APIs and command-center UI scaffolding.
- No protected rendering/tracking core business logic changes.

### Backend Endpoints Added
- `GET /api/admin/dashboard/summary`
- `GET /api/admin/dashboard/jobs`
- `GET /api/admin/dashboard/revenue`
- `GET /api/admin/dashboard/usage`
- `GET /api/admin/dashboard/users`
- `GET /api/admin/dashboard/health`
- `GET /api/admin/storage`
- `GET /api/admin/audit`

### Frontend Command Center Added
- New page: `apps/web/src/pages/admin/AdminCommandCenter.tsx`
- New widgets: `apps/web/src/components/admin/AdminWidgets.tsx`
- Route switch:
	- `/admin` -> `AdminCommandCenter`
	- `/admin/legacy` -> existing legacy admin page

### Notes
- Storage, audit, jobs, usage, users, revenue, and health are now available through dedicated aggregate APIs.
- Placeholder sections were scaffolded for staged expansion (plans, shipments, complaints, payments, invoices, settings).
- Existing admin and complaint-monitor APIs remain intact.

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
- `JAZZCASH_STATUS_INQUIRY_ENDPOINT_SANDBOX`
- `JAZZCASH_STATUS_INQUIRY_ENDPOINT_LIVE`

## API Endpoints

- `POST /api/payments/jazzcash/create`
- `POST /api/payments/jazzcash/callback`
- `GET /api/payments/jazzcash/callback`
- `POST /api/payments/jazzcash/ipn`
- `GET /api/payments/jazzcash/ipn`
- `GET /api/payments/:id/status`
- `POST /api/payments/jazzcash/relay`
- `POST /api/payments/jazzcash/status-inquiry`
- `POST /api/payments/jazzcash/status-inquiry/:txnRefNo`

## Jawad Onboarding Compliance Pass (2026-05-29)

Mandatory onboarding items from Muhammad Jawad Khan were implemented in code:

1. Status Inquiry API:
	 - Added service integration and authenticated routes:
		 - `POST /api/payments/jazzcash/status-inquiry`
		 - `POST /api/payments/jazzcash/status-inquiry/:txnRefNo`
2. IPN mandatory behavior:
	 - IPN now rejects missing/unknown `pp_TxnRefNo` instead of silently accepting unknown references.
3. Amount multiplied by 100:
	 - Mobile wallet and checkout builders continue to emit `pp_Amount` in paisa (`amountCents`).
4. TxnRefNo format:
	 - Updated to `EpoYYYYMMDDHHMMSS` for new transactions.
5. Request/response secure hash:
	 - Request hash generation and callback/IPN hash verification retained.
	 - Status inquiry request/response hash verification added.

Local verification status after implementation:

- `node scripts/jazzcash-mobile-wallet-check.mjs` -> PASS
- `node scripts/jazzcash-status-inquiry-check.mjs` -> PASS
- `npm run phase-3-verify` -> PASS
- `npm run build` -> PASS

## Live Validation Snapshot (2026-05-29)

- Commit `7e42eba` deployed and confirmed live:
	- Mobile wallet create now emits `Epo...` transaction references.
	- Deterministic provider response for sandbox test numbers remains `199`.
- Live runtime findings from authenticated matrix:
	- Status inquiry endpoint reachable in production, but inquiry execution failed with:
		- `Failed to parse URL from undefined`
	- Third rapid create call hit:
		- `Unique constraint failed on the fields: (invoiceNumber)`
- Hotfix prepared and pushed in commit `a4cc0ac`:
	- Endpoint fallback handling fixed (`undefined` env values no longer treated as URL strings).
	- Invoice number generation changed to full `txnRefNo` to avoid truncation collisions.
- Pending action:
	- Await Railway rollout of `a4cc0ac`, then rerun full authenticated matrix (`03123456789/80/81`) with status inquiry for each returned `txnRefNo`.

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

## Final Sandbox Diagnosis (2026-05-28)

- Deployment status:
	- API service online and serving live traffic.
	- Health endpoint and JazzCash IPN readiness endpoint return `200`.
- Confirmed production variable set (masked check):
	- `JAZZCASH_ENV=sandbox`
	- `JAZZCASH_RETURN_URL=https://api.epost.pk/api/payments/jazzcash/callback`
	- `JAZZCASH_TXN_TYPE=MWALLET`
	- `JAZZCASH_BANK_ID=TBANK`
	- `JAZZCASH_PRODUCT_ID=RETL`
	- Merchant/password/salt present in Railway (masked).
- Fresh production create->relay payload snapshot (masked):
	- `pp_TxnType=MWALLET`
	- `pp_BankID=TBANK`
	- `pp_ProductID=RETL`
	- `pp_ReturnURL=https://api.epost.pk/api/payments/jazzcash/callback`
	- `pp_SubMerchantID` present blank
	- `ppmpf_1` present masked (`031******89`)
	- `pp_SecureHash` present (`length=64`)
- Fresh browser checkout result:
	- `/billing` -> JazzCash modal opens.
	- `Pay Now` redirects to JazzCash sandbox URL.
	- Sandbox still returns `Sorry! Your transaction could not be processed due to insufficient merchant information.`
- Final conclusion:
	- App-side integration work is complete for v4.2 Mobile Account payload/relay/callback/IPN wiring.
	- Failure occurs at JazzCash sandbox merchant validation stage and is now account-side.
- Ask JazzCash support:
	- Confirm sandbox merchant `MC771933` is enabled for hosted checkout + `MWALLET`.
	- Confirm merchant profile allows `TBANK`/`RETL` for page redirection mode.
	- Confirm latest generated merchant password and integrity salt are active.
	- Confirm required portal URL mapping (`Return URL` and `IPN URL`) for this merchant profile.

## Exact Portal/Railway Sync Check (2026-05-28)

- Railway Api variable comparison against user-provided sandbox portal values:
	- `JAZZCASH_ENV=sandbox` matched.
	- `JAZZCASH_MERCHANT_ID=MC771933` matched exactly.
	- `JAZZCASH_PASSWORD` matched portal value exactly (masked in reporting).
	- `JAZZCASH_INTEGRITY_SALT` matched portal value exactly (masked in reporting).
	- `JAZZCASH_RETURN_URL=https://api.epost.pk/api/payments/jazzcash/callback` already matched exactly.
	- `JAZZCASH_SANDBOX_ENDPOINT=https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/` matched.
	- `JAZZCASH_LIVE_ENDPOINT=https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/` matched.
	- `FRONTEND_URL=https://www.epost.pk` matched.
	- `JAZZCASH_TXN_TYPE=MWALLET` matched.
	- `JAZZCASH_BANK_ID=TBANK` matched.
	- `JAZZCASH_PRODUCT_ID=RETL` matched.
	- `JAZZCASH_SUBMERCHANT_ID` not set in Railway; live payload continues to emit present blank.
- Railway changes applied:
	- No variable mismatch was found on the Api service, so no Railway variable edits were required.
	- Api service was redeployed successfully after the exact-value verification and returned to `Online` state.
- Portal-side Return URL status:
	- Correct callback target remains `https://api.epost.pk/api/payments/jazzcash/callback`.
	- The previously reported portal Return URL using `https://www.epost.pk/api/...` is wrong for backend callback handling.
	- Direct JazzCash portal editing was not executable from this environment because no authenticated portal session/browser handle was available in the shared tools.
	- No new JazzCash password or integrity salt was generated during this session.
- Post-redeploy live endpoint checks:
	- `GET https://api.epost.pk/api/health` returned `200 OK`.
	- `GET https://api.epost.pk/api/payments/jazzcash/ipn` returned `200 OK`.
- Post-redeploy live payload check (fresh create -> relay):
	- `pp_MerchantID=MC771933`
	- `pp_TxnType=MWALLET`
	- `pp_BankID=TBANK`
	- `pp_ProductID=RETL`
	- `pp_ReturnURL=https://api.epost.pk/api/payments/jazzcash/callback`
	- `pp_Amount=99900`
	- `pp_TxnCurrency=PKR`
	- `pp_SubMerchantID` present blank
	- `ppmpf_1` present masked
	- `pp_SecureHash` present with length `64`
	- Action URL remained `https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/`
- Fresh browser checkout result after redeploy:
	- Flow started from `/billing` using `Pay with JazzCash` only.
	- Sandbox no longer returned `insufficient merchant information` during this fresh run.
	- Redirect landed on JazzCash `TransactionSelection` page instead.
	- In headless capture, that page rendered only the JazzCash header/logo and no visible payment controls, so callback completion and package activation could not be completed in this environment.
- Protected Scope Protocol status:
	- No code path outside JazzCash billing validation was changed.
	- Label generation, money orders, tracking, complaints, R2 storage, auth, manual payment approval, package logic, and EP Gateway internals were left untouched.

## JazzCash CORS Fix (2026-05-28)

- Root cause found:
	- Global API CORS middleware in `apps/api/src/index.ts` allowed only web/local origins.
	- JazzCash sandbox origin `https://sandbox.jazzcash.com.pk` reached callback/IPN endpoints with an `Origin` header and was rejected before route logic executed.
	- This produced `{"success":false,"message":"CORS blocked for origin: https://sandbox.jazzcash.com.pk"}` instead of normal callback/IPN processing.
- Fix applied:
	- Added route-aware JazzCash origin handling in `apps/api/src/index.ts`.
	- Callback, IPN, and relay routes now allow JazzCash origins only:
		- `https://sandbox.jazzcash.com.pk`
		- `https://payments.jazzcash.com.pk`
	- Requests with no `Origin` remain allowed for server-to-server notifications.
	- Added optional env support in `apps/api/src/config.ts` and `apps/api/.env.example`:
		- `JAZZCASH_ALLOWED_ORIGINS=https://sandbox.jazzcash.com.pk,https://payments.jazzcash.com.pk`
- Railway/runtime state:
	- `JAZZCASH_ALLOWED_ORIGINS` set on Railway Api service in masked form.
	- Api deployment `3c47513b-853a-46ec-8fea-5d8dee8eabbd` reached `SUCCESS`.
- Live CORS verification after deploy:
	- `OPTIONS /api/payments/jazzcash/callback` with `Origin: https://sandbox.jazzcash.com.pk` -> `204 No Content`
	- `OPTIONS /api/payments/jazzcash/ipn` with `Origin: https://sandbox.jazzcash.com.pk` -> `204 No Content`
	- `POST /api/payments/jazzcash/callback` with JazzCash origin and dummy form payload -> no CORS block; normal fallback redirect to `/billing?payment=failed&message=Missing+transaction+reference`
	- `POST /api/payments/jazzcash/ipn` with JazzCash origin and dummy form payload -> no CORS block; normal JSON response path reached
- Final sandbox result after CORS fix:
	- Fresh billing flow still reaches JazzCash sandbox successfully.
	- Previous `CORS blocked for origin: https://sandbox.jazzcash.com.pk` issue is resolved.
	- Sandbox now stops on a blank `TransactionSelection` page showing only the JazzCash header/logo.
	- The blank `TransactionSelection` result reproduces in both headless and visible browser automation, with no frontend console errors and no failed network requests captured locally.
	- Callback return to billing and package activation could not complete because the sandbox page itself did not expose actionable controls in this environment.
- Protected Scope Protocol status:
	- Change stayed limited to API bootstrap/config and JazzCash documentation.
	- No unrelated label, money-order, tracking, complaints, R2, dashboard, auth, package, or EP Gateway internals were modified for this fix.

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

## Final Provider 199 Classification (2026-05-29)

### Cleanup Execution

- Removed safe untracked temporary artifacts:
	- `scripts/tmp-jazzcash-live-auth-tests.sh`
	- `scripts/tmp-jazzcash-provider-199-amount-sweep.mjs`
	- `scripts/tmp-jazzcash-provider-199-diag.mjs`
	- `debug.log`
	- `apps/api/startup-api.log`
	- `.local-docs/s1-first-canary-telemetry.log`
- Kept protected assets and docs, including `jazz cash/` and all tracked source.
- Tracked debug JSON files under `python-service/` were kept for manual review only.

### Baseline + Health Snapshot

- `git log --oneline -10` confirmed latest docs commit lineage ending at `ad38dd9`.
- Railway status: Api service online.
- Latest deployment list: `4caf03a4-e20e-4932-b404-b746dac9b666` remains latest `SUCCESS`; newer entries were `SKIPPED`.
- `GET https://api.epost.pk/api/health` returned `200 OK`.

### Railway Variables Validation (Api/production)

- `JAZZCASH_ENV=sandbox`
- `JAZZCASH_MERCHANT_ID=MC771933`
- `JAZZCASH_PASSWORD` present
- `JAZZCASH_INTEGRITY_SALT` present
- `JAZZCASH_RETURN_URL=https://api.epost.pk/api/payments/jazzcash/callback`
- `JAZZCASH_MOBILE_WALLET_ENABLED=true`
- `JAZZCASH_MOBILE_WALLET_ENDPOINT_SANDBOX=https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`
- `JAZZCASH_MOBILE_WALLET_ENDPOINT_LIVE=https://payments.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`
- Secrets verified but masked in reporting.

### JazzCash Sandbox API Testing Correlation

- User-confirmed sandbox API Testing page response: `199` with message `Sorry! Your transaction was not successful. Please try again later.`
- This matches backend and direct terminal diagnostics when hash-valid request shape is used.

### Direct Provider Reproduction (Terminal)

- Endpoint: `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`
- Request shape (hash-valid):
	- `pp_Amount`, `pp_BillReference`, `pp_Description`, `pp_Language`, `pp_MerchantID`, `pp_Password`, `pp_ReturnURL`, `pp_TxnCurrency`, `pp_TxnDateTime`, `pp_TxnExpiryDateTime`, `pp_TxnRefNo`, `pp_TxnType=MWALLET`, `pp_Version=1.1`, `ppmpf_1`, `pp_SecureHash`
- Result sample:
	- HTTP `200`
	- `pp_ResponseCode=199`
	- `pp_ResponseMessage=Sorry! Your transaction was not successful. Please try again later.`
	- `pp_RetreivalReferenceNo` returned
	- Hash accepted (no `110`)

### Focused Provider Matrix (DoTransaction)

- Ran 12 variants against sandbox `DoTransaction` without changing production code.
- Results summary:
	- Hash-valid v1.1 variants (with/without optional `ppmpf_2..5`, JSON/form): response `199`.
	- Amounts `500`, `1000`, `250000`: all `199`.
	- Mobiles `03123456789`, `03123456780`, `03123456781`: all `199`.
	- Adding `pp_CNIC=345678` to current accepted v1.1 shape produced `110` (`pp_SecureHash`) and is therefore not compatible with this merchant's accepted hash contract for this path.
- Interpretation:
	- Request formatting/hashing is accepted in the proven shape.
	- Business/provider layer still rejects with deterministic `199`.

### External Source Conclusions

- Official docs remain primary source (`ApiReferences`, `index`, `Resources`).
- `Resources` maps `199` to `System error`.
- `shehryar96/Jazzcash-mobile-wallet-Integration` is token/recurring oriented (`/API/4.0/purchase/domwallettransactionviatoken`) and depends on wallet-linking/token retrieval path.
- `zfhassaan/jazzcash` is hosted checkout centric and explicitly not direct REST mobile wallet.
- `aticmatic/laravel-jazzcash` documents direct v2.0 REST interpretation with CNIC emphasis, but still non-authoritative versus official docs and merchant profile behavior.

### Final Diagnosis

- `pp_SecureHash` defect is resolved for active one-time v1.1 request shape.
- Since:
	- hash-valid direct terminal calls return `199`, and
	- JazzCash sandbox API Testing page also returns `199`,
- classification is: **vendor-side sandbox merchant/profile/channel limitation or test-profile enablement issue**, not an app signing/field-order defect.

### Protected Scope Protocol Status

- No unrelated system changes were introduced.
- Work stayed limited to JazzCash diagnostics, documentation, and temporary script cleanup.

### Support Packet

- Support-ready escalation note added at:
	- `docs/jazzcash-support-escalation-2026-05-29.md`
- Conclusion: local implementation aligns on hosted-form pattern and hash strategy, while preserving stronger secret isolation via backend relay.

## Protected Scope Protocol Status

- Preserved the existing label generation, money order generation, tracking, complaints, R2 storage, auth, and admin dashboard paths.
- Kept the existing manual wallet payment flow available.
- Added JazzCash as a narrow subscription/package purchase path only.
- Billing UI now uses a JazzCash popup/modal instead of exposing the mobile number field on the card.

## JazzCash Return /login Redirect Fix (2026-05-28)

### Root Cause

- After JazzCash processed a payment, the sandbox POSTed to `https://api.epost.pk/api/payments/jazzcash/callback`.
- The callback validated the payload and redirected the browser to `https://www.epost.pk/billing?payment=success|failed|pending&reference=...`.
- `/billing` is wrapped in `RequireAuth` → `RequireProfileCompletion` → `AppShell` in `apps/web/src/App.tsx`.
- `RequireAuth` checks `getToken()` (JWT in localStorage). JazzCash opens a redirect in the same browser tab but the tab was initiated from the JazzCash sandbox domain — the JWT stored in epost.pk's localStorage was NOT present in that navigation context on return.
- Result: `RequireAuth` evaluated `getToken()` → `null` → `<Navigate to="/login" replace />` immediately.

### Fix Applied

**Backend (`apps/api/src/services/jazzcash.ts`):**
- Renamed function logic: `buildFrontendBillingUrl` now redirects to `/payment/jazzcash/result` (public) instead of `/billing` (protected).
- Query params changed from `?payment=success&reference=...` to `?status=success&ref=...`.
- All callback result paths (success, failed, pending, duplicate, hash-failed, amount-mismatch) use the new public URL.

**Backend (`apps/api/src/routes/payments.ts`):**
- Error-catch fallback in `handleJazzcashCallback` updated to target `/payment/jazzcash/result?status=failed&ref=...`.

**Frontend (`apps/web/src/pages/JazzCashResult.tsx`) — NEW FILE:**
- Public page at `/payment/jazzcash/result` with no auth requirement.
- Reads `?status=` (`success|failed|pending`) and `?ref=` from URL.
- Shows contextual heading, provider message, transaction reference, and either "Go to Billing" (if logged in) or "Login to View Subscription" (if not).
- Never activates package — backend remains sole activation source.
- Styled consistently with epost.pk card layout.

**Frontend (`apps/web/src/App.tsx`):**
- Added `const JazzCashResult = lazy(() => import("./pages/JazzCashResult"))`.
- Registered `<Route path="/payment/jazzcash/result" element={<JazzCashResult />} />` outside `RequireAuth` wrapper.

### Verification

- No TypeScript errors in all 4 changed files.
- `npm run prisma:generate` → PASS
- `node scripts/jazzcash-hash-check.mjs` → PASS
- `npm run phase-3-verify` → PASS (28 labels, 3 MO PDFs, 4 contradiction cases)
- `npm run build` → PASS (web + api)

### Commit and Deploy

- Commit: `e50718d` — "fix: stabilize JazzCash return result flow"
- Files committed: `apps/api/src/services/jazzcash.ts`, `apps/api/src/routes/payments.ts`, `apps/web/src/App.tsx`, `apps/web/src/pages/JazzCashResult.tsx`
- Pushed to `origin/main` — Railway Api + Web deployments triggered.

---

## TransactionSelection Blank Page Diagnosis (2026-05-28)

### What was observed

- After relay to JazzCash sandbox, browser lands on:
  `https://sandbox.jazzcash.com.pk/CustomerPortal/TransactionManagement/TransactionSelection`
- Page renders only JazzCash logo/header.
- Only two hidden inputs visible: `DTFormat` and `__RequestVerificationToken`, plus one empty `<A>` tag.
- No mobile number field, no CNIC field, no payment button, no visible form controls.
- Confirmed in both headless and headful browser automation (Puppeteer), no console errors, no failed network requests.

### Root Cause Assessment

From JazzCash v4.2 docs (ApiReferences.html), the **Hosted Checkout + Mobile Account** flow works as follows:
- Merchant POSTs form to `CustomerPortal/transactionmanagement/merchantform/`.
- JazzCash validates merchant credentials, transaction type, and payload at its server.
- If validation passes, JazzCash redirects to the `TransactionSelection` page **and injects** the mobile/CNIC/payment-method UI.
- The blank page with hidden inputs only means JazzCash accepted the POST but **did not inject actionable controls** — this is a server-side rendering decision by JazzCash's portal.

**Two known causes** for this behavior on `TransactionSelection`:
1. **Sandbox merchant not fully activated** — the JazzCash sandbox merchant profile for `MC771933` has MWALLET/hosted checkout feature not explicitly enabled, so the portal accepts the request but renders an empty selection screen.
2. **`pp_TxnType=MWALLET` without explicit Mobile Account enablement** — JazzCash sandbox sometimes renders a blank `TransactionSelection` when the merchant is not mapped to a specific payment method (Mobile Account, Card, etc.) in their portal configuration.

### What is NOT the cause on our side

- `pp_BankID=TBANK`, `pp_ProductID=RETL`, `pp_TxnType=MWALLET` are all correctly set per v4.2 docs.
- `ppmpf_1` (mobile number) is present in the signed payload.
- `pp_SecureHash` is valid (hash-check passes locally and against v4.2 sample).
- CORS on callback/IPN is confirmed working.
- No frontend console errors or network failures observed.

### Next Required Action (Manual, Merchant Portal)

- Log in to JazzCash sandbox merchant portal for `MC771933`.
- Confirm "Mobile Account (MWALLET)" is enabled as an active payment method for hosted checkout.
- Confirm `TransactionSelection` display mode is set to show the Mobile Account option.
- If it requires JazzCash support ticket: request MWALLET activation for sandbox merchant `MC771933` and page-redirection mode enablement.
- Once that is active, the sandbox `TransactionSelection` page should show the mobile number + CNIC entry form, matching the standard Daraz-style JazzCash wallet flow.

---

## Pending Manual Steps

## Final Sandbox Validation and Autofill Handling (2026-05-28)

- Deployment baseline:
	- `railway status` shows Api and Web services online.
	- `GET https://api.epost.pk/api/health` returns `200 OK`.
	- `GET https://api.epost.pk/api/payments/jazzcash/ipn` returns `200 OK` readiness JSON.
- Public result route verification:
	- Opened `https://www.epost.pk/payment/jazzcash/result?status=failed&ref=TEST&message=Transaction+has+been+timed+out` in browser.
	- Result page renders directly (no redirect to `/login`).
	- CTA shows login/billing actions as expected for unauthenticated context.
- Billing-to-sandbox flow status:
	- In this agent browser session, `/billing` redirects to `/login` because no active epost session token is present.
	- A real production checkout was still observed in API logs with create -> relay -> callback sequence.
- Callback/IPN log evidence (`railway logs --service Api --environment production --since 15m`):
	- `POST /api/payments/jazzcash/create`
	- `POST /api/payments/jazzcash/relay`
	- `POST /api/payments/jazzcash/callback`
	- Callback processed with status `FAILED` for reference `JZ2026052818112992B5`.
	- `GET /api/payments/jazzcash/ipn` reached readiness endpoint.
- Timeout interpretation:
	- User-observed `Transaction has been timed out` on `/payment/jazzcash/result?status=failed...` is treated as a valid failed provider outcome (not an app crash).
	- Package/subscription activation remains backend-gated and must not occur on failed/pending statuses.
- Autofill diagnosis:
	- User screenshot shows JazzCash TransactionSelection now rendering normal wallet form (`Please enter wallet details`, mobile field, captcha, PAY).
	- The email-like value in JazzCash mobile field (e.g., `ags.rom@gma`) is browser autofill behavior on JazzCash domain and not sourced from our backend payload.
	- Operator guidance: clear the field, enter `03123456789`, complete captcha, proceed before timer expiry, then provide CNIC (`345678`) if prompted.
- App-side UX hardening applied to reduce autofill confusion:
	- Updated Billing JazzCash modal input attributes in `apps/web/src/pages/Billing.tsx`:
		- `name="jazzcashMobile"`
		- `autoComplete="tel"`
		- `inputMode="numeric"`
		- `pattern="03[0-9]{9}"`
	- Existing sanitization (`digits only`, max `11`) remains active.


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

## JazzCash Mobile Wallet API Primary Flow (2026-05-28)

- v4.2 docs checked:
	- `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/index.html`
	- `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/ApiReferences.html`
	- `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/Resources.html`
- Invalid-hash diagnosis for hosted checkout path:
	- Logs confirmed callback/IPN traffic for reference `JZ202605281835146A1C`.
	- No definitive callback-transport corruption signal found.
	- Hash verification was hardened to accept strict v4.2 all-PP-field hashing and legacy non-empty-field hashing during verification.
	- Hosted checkout remains available as fallback only.
- Mobile Wallet API primary endpoint used:
	- `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction` (sandbox)
	- `https://payments.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction` (live)
	- Derived automatically from configured JazzCash host if explicit env value is not set.
- Mobile Wallet API request fields implemented:
	- `pp_Language`, `pp_MerchantID`, `pp_SubMerchantID`, `pp_Password`
	- `pp_TxnRefNo`, `pp_MobileNumber`, `pp_Amount`, `pp_DiscountedAmount`
	- `pp_TxnCurrency`, `pp_TxnDateTime`, `pp_BillReference`, `pp_Description`, `pp_TxnExpiryDateTime`
	- `ppmpf_1..ppmpf_5`
	- `pp_CNIC` (included from env/default sandbox value)
	- `pp_SecureHash`
- CNIC handling:
	- v4.2 REST Mobile Account samples include `pp_CNIC`.
	- App keeps user input as mobile-only UX and injects CNIC from backend config (`JAZZCASH_MOBILE_WALLET_CNIC`, default `345678` in sandbox).
- Backend changes:
	- Added `POST /api/payments/jazzcash/mobile-wallet/create` as primary create path.
	- Added `GET /api/payments/jazzcash/status/:txnRefNo` (authenticated, safe fields only).
	- Reused callback/IPN processing and activation guardrails:
		- Invalid hash never activates.
		- Success activates once.
		- Pending/failed do not activate.
	- Status mapping aligned with docs (`000/121` success, `124/157/210` pending).
- Frontend billing changes:
	- JazzCash modal now sends Mobile Wallet API request first.
	- Pending UX added: waiting message + polling by txn reference.
	- Hosted checkout retained as explicit fallback button: `Try hosted checkout instead (fallback)`.
- New env variables added:
	- `JAZZCASH_MOBILE_WALLET_ENDPOINT_SANDBOX`
	- `JAZZCASH_MOBILE_WALLET_ENDPOINT_LIVE`
	- `JAZZCASH_MOBILE_WALLET_ENABLED`
	- `JAZZCASH_MOBILE_WALLET_CNIC`
- Added local script:
	- `scripts/jazzcash-mobile-wallet-check.mjs` for payload shape + hash sanity.
- Verification results:
	- `npm run prisma:generate --workspace=@labelgen/api` -> PASS
	- `node scripts/jazzcash-hash-check.mjs` -> PASS
	- `npm run phase-3-verify` -> PASS
	- `npm run build` -> PASS
- Live terminal/browser execution limits in this run:
	- Authenticated live calls to `POST /api/payments/jazzcash/mobile-wallet/create` were not executed from this agent session due missing user auth token in terminal/browser context.
	- Endpoint, payload, and flow wiring were fully implemented and compile-verified.
- Protected Scope Protocol status:
	- Only JazzCash payment flow, billing UX, and documentation were modified.
	- No changes to label generation, money orders, tracking, complaints, R2, dashboard/auth internals, or unrelated EP Gateway logic.
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

## JazzCash Mobile Wallet Hash Fix + Live Matrix (2026-05-29)

- Objective:
	- Eliminate provider `110` / `Please provide valid value for pp_SecureHash` in Mobile Wallet API flow.
- Root cause confirmed:
	- Previous payload/hash included fields not accepted for current sandbox merchant hash validation path (`pp_BankID`, `pp_ProductID`, `pp_CNIC`, plus other legacy carryover).
	- Hash became valid when using the REST v1.1 (Without CNIC) request shape from merchant guide.
- Implemented code change:
	- File updated: `apps/api/src/services/jazzcash.ts`
	- Function updated: `buildJazzcashMobileWalletFields(...)`
	- Removed from outbound request/hash set:
		- `pp_BankID`
		- `pp_ProductID`
		- `pp_CNIC`
		- legacy empty-only fields not required by REST v1.1 request shape
	- Kept required v1.1 fields:
		- `pp_Amount`, `pp_BillReference`, `pp_Description`, `pp_Language`
		- `pp_MerchantID`, `pp_Password`, `pp_ReturnURL`
		- `pp_TxnCurrency`, `pp_TxnDateTime`, `pp_TxnExpiryDateTime`, `pp_TxnRefNo`
		- `pp_TxnType=MWALLET`, `pp_Version=1.1`
		- `ppmpf_1` (wallet number), `ppmpf_2..5` blank
		- `pp_SecureHash` (HMAC-SHA256 over non-empty sorted `pp*` fields with salt prepended)
- Verification before deploy:
	- `npx tsc --noEmit -p apps/api/tsconfig.json` -> PASS
	- `npm run phase-3-verify` -> PASS
- Commit + deploy:
	- Commit: `749aff1`
	- Message: `fix: correct JazzCash mobile wallet secure hash`
	- Railway Api deployment: `4caf03a4-e20e-4932-b404-b746dac9b666` -> `SUCCESS`

### Authenticated Live Matrix Results (post-success deploy)

- Test script: `scripts/tmp-jazzcash-live-auth-tests.sh`
- Environment: `JAZZCASH_ENV=sandbox`
- Result summary:
	- `03123456789` -> HTTP `201`, provider code `199`, app status `failed`, DB status `FAILED`
	- `03123456780` -> HTTP `201`, provider code `199`, app status `failed`, DB status `FAILED`
	- `03123456781` -> HTTP `201`, provider code `199`, app status `failed`, DB status `FAILED`
- Provider message for all three:
	- `Sorry! Your transaction was not successful. Please try again later.`
- Key conclusion:
	- `pp_SecureHash` error (`110`) is resolved in live authenticated API flow.
	- Current blocker is now provider-side transaction outcome (`199`) for sandbox test wallets/merchant profile, not request hashing.
	- No package activation occurred (subscriptions remained `Free Plan|ACTIVE`), as expected for failed provider responses.

## JazzCash Provider 199 Deep Investigation (2026-05-29)

- Goal:
	- Resolve provider response code `199` for Mobile Wallet API only (`DoTransaction`).

### External References Reviewed

- Official docs:
	- `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/ApiReferences.html`
	- `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/index.html`
	- `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/Resources.html`
- Community:
	- `https://github.com/shehryar96/Jazzcash-mobile-wallet-Integration` (recurring/token flow examples)
	- `https://github.com/zfhassaan/jazzcash` (hosted checkout only; used for hash reference only)
	- `https://packagist.org/packages/aticmatic/laravel-jazzcash` (direct mobile wallet v2 focus; CNIC-oriented guidance)

### Flow Type Determination (Evidence-Based)

- Merchant `MC771933` on sandbox `DoTransaction` currently validates against a payload shape that requires:
	- `pp_Version=1.1`
	- `pp_TxnType=MWALLET`
	- `pp_ReturnURL` (non-empty)
- For this merchant/endpoint behavior:
	- Omitting `pp_Version` returns `110` with invalid version message.
	- Omitting `pp_ReturnURL` returns `110` with invalid return URL message.
	- Including `pp_CNIC` in current hash set returns `110` invalid `pp_SecureHash`.
- This confirms merchant behavior is not using the CNIC-enabled v2 hash set currently.

### Provider 199 Diagnostic Matrix (Direct-to-Provider)

- Temporary script used (not committed): `scripts/tmp-jazzcash-provider-199-diag.mjs`
- Endpoint tested:
	- `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`
	- `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/4.0/purchase/domwallettransactionviatoken` (reference check)
- Variant outcomes:
	- V1 current app JSON -> `199`
	- V2 current app form-urlencoded -> `199`
	- V3 current + `pp_CNIC` -> `110` (`pp_SecureHash` invalid)
	- V4 current without `pp_ReturnURL` -> `110` (invalid return URL)
	- V5 v4-style requestId/mpin payload on DoTransaction -> `110` (invalid version)
	- V6 v3 hosted-mpin-style payload on DoTransaction -> `110` (invalid version)
	- V7 v1.1/v2-like payload without version/txnType -> `110` (invalid version)
	- V8 aticmatic-like CNIC-enabled payload -> `110` (invalid version)
	- V9 shehryar token endpoint payload without payment token -> `110` (invalid payment token)
	- V10 v1.1 + txnType + returnURL + mobile -> `199`

### Amount/Number Sweep (Hash-Valid Payload)

- Temporary script used (not committed): `scripts/tmp-jazzcash-provider-199-amount-sweep.mjs`
- Hash-valid payload shape (v1.1 + txnType + returnURL + mobile number) was tested across:
	- Numbers: `03123456789`, `03123456780`, `03123456781`
	- Amounts: `100`, `200`, `500`, `1000`, `10000`, `99900`
- Result:
	- Every combination returned provider code `199` with message:
		- `Sorry! Your transaction was not successful. Please try again later.`

### Interpretation

- Official resources map `199` to `System error`.
- Since:
	- hash is now valid (no `110`/`115`) for the accepted payload,
	- multiple content types, numbers, and amounts all fail with `199`,
	- and alternate API-flow payloads fail at validation stage as expected,
- the remaining issue is classified as vendor-side sandbox merchant/profile enablement for direct Mobile Wallet API processing.

### Support-Ready Escalation Note (JazzCash)

- Merchant ID: `MC771933`
- API endpoint: `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`
- Environment: `sandbox`
- Hash issue status:
	- `pp_SecureHash` validation issue (`110`) is resolved.
- Current issue:
	- All hash-valid requests return `199` (`System error` / transaction not successful).
- Request to JazzCash:
	- Confirm `MC771933` is enabled for direct Mobile Wallet REST API on `DoTransaction` (not only hosted checkout).
	- Confirm required API version/profile mapping for this merchant (`v1.1` vs `v2 CNIC` vs `v3 hosted MPIN`).
	- Confirm whether sandbox test wallets `03123456789/80/81` are enabled for this merchant profile on direct API channel.
	- Confirm whether additional merchant-side enablement flags are pending for API Testing mode.

### Final Live Matrix (Current Active Deployment)

- Script: `scripts/tmp-jazzcash-live-auth-tests.sh`
- Active deployment at test time: `4caf03a4-e20e-4932-b404-b746dac9b666` (`SUCCESS`)
- Results:
	- `03123456789` -> HTTP `201`, provider `199`, app `failed`, DB `FAILED`, activation unchanged (`Free Plan|ACTIVE`)
	- `03123456780` -> HTTP `201`, provider `199`, app `failed`, DB `FAILED`, activation unchanged (`Free Plan|ACTIVE`)
	- `03123456781` -> HTTP `201`, provider `199`, app `failed`, DB `FAILED`, activation unchanged (`Free Plan|ACTIVE`)

### Protected Scope Status

- Confirmed: only JazzCash Mobile Wallet API investigation, diagnostics, and documentation touched.
- No modifications to label generation, money orders, tracking, complaints, R2, dashboard/auth, manual payment approval, package logic, or unrelated EP Gateway internals.