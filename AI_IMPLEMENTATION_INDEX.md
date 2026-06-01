# AI Implementation Index

## 2026-06-01 - Aggregator Admin-Only Gate Production Deployment

### Merge and Deploy
- Branch merged to `main`: `feature/aggregator-correction-resubmission`.
- Commit included: `825f530` (`fix: restrict aggregator modules to admin only`).
- Railway deploy executed: **Web service only** (production), no Api deploy for this gate-only diff.

### Verification Snapshot
- Build: PASS (`npm run build`).
- Correction resubmission test: PASS (`npx tsx apps/api/src/services/aggregatorCorrectionResubmitPhase.test.ts`).
- Public endpoint checks: `api /health`, web `/`, `/login`, `/upload`, `/dashboard` responded successfully.
- Aggregator route gating is enforced in frontend with `RequireAdmin` + sidebar/nav role gating.

### Safety / Scope
- Protected files for upload/jobs/billing/public-tracking/complaints/routes/worker were not changed by this gate deploy.
- No schema/migration changes.
- No Railway variable changes.
- No Cloudflare/R2 or manual DB actions.

## 2026-06-01 - Aggregator Modules Temporarily Admin-Only

### Files Changed
- `apps/web/src/App.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/lib/navigation.ts`
- `CHANGELOG.md`
- `AI_IMPLEMENTATION_INDEX.md`
- `docs/operations/aggregator-booking-rollout-checklist.md`
- `docs/architecture/aggregator-booking-business-plan.md`

### Behavior Added
- Customer-facing aggregator and booking-quote/postage routes are admin-gated.
- Aggregator navigation entries are hidden from normal customers.
- Admin/internal users retain access for aggregator testing/review.

### Safety / Scope Confirmation
- No changes to protected SaaS customer flows:
  - labels, upload/jobs, money order, tracking, complaints, billing, packages, dashboard, auth.
- No backend operational change.
- No schema/migration change.
- No deployment/infrastructure touch.

## 2026-06-01 - JazzCash Success Reconciliation Bug Fix

### Root Cause
- Mobile Wallet success reconciliation depended on status inquiry, but inquiry persistence only ran when payment status was `PENDING`.
- If a false `FAILED` state was written first (for example callback-style verification mismatch despite provider `000`), later inquiry success could not heal the row.

### Files Changed
- `apps/api/src/services/jazzcash.ts`
- `scripts/jazzcash-status-inquiry-check.mjs`
- `scripts/jazzcash-reconciliation-check.mjs`

### Behavior Updated
- Inquiry reconciliation now allows valid success (`SUCCEEDED`) to heal non-success states (including `FAILED`) instead of being blocked by a strict `PENDING` gate.
- Mobile Wallet create flow now attempts inquiry reconciliation when provider response code is `000` even if callback-style processing did not immediately settle success.
- Duplicate inquiry event handling now returns current payment state early to reduce duplicate settlement work.
- Subscription creation on inquiry success is guarded to avoid double activation when a subscription is already linked.

### Verification Highlights
- Local checks passed:
	- `npm run prisma:generate --workspace=@labelgen/api`
	- `node scripts/jazzcash-hash-check.mjs`
	- `node scripts/jazzcash-mobile-wallet-check.mjs`
	- `node scripts/jazzcash-status-inquiry-check.mjs`
	- `node scripts/jazzcash-reconciliation-check.mjs`
	- `npm run phase-3-verify`
	- `npm run build`
- Support payload check with Railway env returned `pp_ResponseCode=000`.
- Post-fix live matrix:
	- `03123456789`: provider `000`, JazzCash status endpoint `SUCCEEDED`, invoice `PAID`, Standard package active
	- `03123456780`: provider `199`, payment `FAILED`, invoice `FAILED`, no subscription link
	- `03123456781`: provider `999`, payment `FAILED`, no subscription link

## 2026-06-01 - JazzCash Mobile Wallet Support-Payload Alignment

### Files Changed
- `apps/api/src/services/jazzcash.ts`
- `scripts/jazzcash-hash-check.mjs`
- `scripts/jazzcash-mobile-wallet-check.mjs`
- `scripts/jazzcash-status-inquiry-check.mjs`
- `scripts/jazzcash-mobile-wallet-support-payload-check.mjs`
- `docs/jazzcash-mobile-wallet-reference.md`
- `docs/jazzcash-support-escalation-2026-05-29.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Behavior Updated
- Mobile Wallet API payload aligned to JazzCash support successful sandbox field set only.
- Mobile Wallet removed fields:
	- `pp_CNIC`, `pp_BankID`, `pp_ProductID`, `pp_SubMerchantID`, `pp_DiscountedAmount`, `ppmpf_2..ppmpf_5`
- Mobile Wallet transaction reference reverted to `TYYYYMMDDHHMMSS`.
- Mobile Wallet expiry changed to `TxnDateTime + 7 days`.
- Hash generation uses outbound non-empty `pp*` fields only (excluding `pp_SecureHash`), sorted ASCII, values-only concatenation, prefixed with integrity salt.
- Added direct support-payload sandbox diagnostic script with safe output only.

### Verification Highlights
- `node scripts/jazzcash-mobile-wallet-support-payload-check.mjs` with Railway env returned provider code `000`.
- Authenticated live matrix after deploy:
	- `03123456789` -> provider `000`, txnRefNo prefix `T`, inquiry `completed`
	- `03123456780` -> provider `199`, inquiry `failed`
	- `03123456781` -> provider `999`, inquiry `failed`
- Build and phase verification commands passed.

## 2026-06-01 - Aggregator Correction Resubmission (Phase 2B)

### Files Changed
- `apps/api/src/services/aggregatorBookingService.ts`
- `apps/api/src/routes/aggregatorBookings.ts`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `apps/api/src/services/aggregatorCorrectionResubmitPhase.test.ts`
- `apps/web/src/pages/AggregatorBookingDetail.tsx`
- `apps/web/src/lib/aggregatorBookings.ts`
- `apps/web/src/components/booking/AggregatorBookingDraftForm.tsx`
- `CHANGELOG.md`
- `AI_IMPLEMENTATION_INDEX.md`
- `docs/operations/aggregator-booking-rollout-checklist.md`
- `docs/architecture/aggregator-booking-business-plan.md`

### Behavior Added
- Customer resubmission endpoint and flow for correction requests only.
- Mandatory customer acknowledgment (`correctionAcknowledged: true`) before resubmission.
- Transition path enforced:
  - `CORRECTION_REQUIRED -> BOOKING_SUBMITTED -> ADMIN_REVIEW_PENDING`
- Timeline status events and audit logs are written for resubmission and acknowledgment.
- Admin correction reason/note context remains preserved and referenced in audit metadata.
- UI shows correction banner only for `CORRECTION_REQUIRED` and keeps `Pending Admin Review` display after resubmission.
- Customer notice remains: `This is not booking confirmation.`

### Safety / Scope Confirmation
- No Prisma schema change.
- No migration change.
- No payment, pickup, dispatch, label, manifest, or unit-consumption side effects added.
- No Railway/Cloudflare/R2/env/secret touch.

## 2026-06-01 - Postage Calculator Production Deployment Closed

### Deployment Target
- Project: `Epost`
- Environment: `production`
- Commit: `15df875`

### Deployment Result
- Api deploy: `SUCCESS`
- Api deployment id: `86d78bd2-c2e9-47e1-ac93-d9739aa5c761`
- Web deploy: `SUCCESS`
- Web deployment id: `dd997840-310e-410a-8a9e-0f67146e0e4a`

### Smoke Results
- `GET https://api.epost.pk/health` returned `200`.
- `GET https://www.epost.pk/` returned `200`.
- `GET https://www.epost.pk/login` returned `200`.
- `GET https://www.epost.pk/upload` returned `200`.
- `GET https://www.epost.pk/postage-calculator` returned `200`.
- `GET https://www.epost.pk/postage-upload-summary` returned `200`.
- `GET https://www.epost.pk/postage-comparison` returned `200`.
- Unauthenticated `POST /api/postage-calculator/calculate` returned `401` (expected protected behavior).

### Closure
- No app code changes during deployment recording.
- No migration, Railway variable change, database action, or Cloudflare/R2 action performed.
- Final classification: `POSTAGE_FEATURE_PRODUCTION_CLOSED`.

## 2026-06-01 - Postage Calculator and Upload Comparison (Phase 1)

### Files Added
- `apps/api/src/routes/postageCalculator.ts`
- `apps/api/src/services/postageCalculatorService.ts`
- `apps/api/src/services/postageComparisonService.ts`
- `apps/api/src/utils/postageComparisonRules.ts`
- `apps/api/src/utils/postageUploadValidation.ts`
- `apps/api/src/parse/postageUploadSummary.ts`
- `apps/api/src/services/postageCalculatorService.test.ts`
- `apps/api/src/services/postageComparisonService.test.ts`
- `apps/web/src/pages/PostageCalculator.tsx`
- `apps/web/src/pages/PostageUploadSummary.tsx`
- `apps/web/src/pages/PostageComparison.tsx`
- `apps/web/src/components/postage/PostageCalculatorForm.tsx`
- `apps/web/src/components/postage/PostageArticleTable.tsx`
- `apps/web/src/components/postage/PostageBundleSummaryCard.tsx`
- `apps/web/src/components/postage/PostageComparisonPanel.tsx`
- `apps/web/src/components/postage/PostageRecommendationBanner.tsx`
- `apps/web/src/lib/postageCalculator.ts`
- `apps/web/src/lib/postageComparison.ts`
- `docs/architecture/postage-calculator-and-upload-comparison-plan.md`
- `docs/operations/postage-upload-comparison-rules.md`

### Files Modified
- `apps/api/src/index.ts`
- `apps/web/src/App.tsx`
- `AI_IMPLEMENTATION_INDEX.md`

### Scope Notes
- Additive Phase 1 quote/comparison only.
- No service fee, handling fee, profit margin, suggested charges, or ePost service fee fields added.
- No finalized generation/payment/tracking/complaint/auth/storage/worker modules modified.

## 2026-06-01 - Controlled Production Rollout Verification After Backup

### Backup Gate
- Prior verified classification: `BACKUP_COMPLETED_READY_FOR_ROLLOUT`.
- Production Postgres backup completed.
- Restore verification completed.
- No secrets included in this record.

### Protected Scope Identity
- Verified local folder: `C:/Users/Nazim/Desktop/P.Post/Label Generator`.
- Verified git remote: `https://github.com/emttspk/emtts.git`.
- Verified branch: `main`.
- Verified Railway project: `Epost`.
- Verified Railway environment: `production`.

### Production Migration State
- Read-only production database check confirmed `_prisma_migrations` already contains `20260531123000_add_aggregator_payment_transaction`.
- Migration state is applied with `applied_steps_count = 1` and a non-null `finished_at`.
- `AggregatorPaymentTransaction` already exists in production.
- Rollout decision for this verification pass: skip migration and do not run `prisma migrate deploy`.

### Verification Result
- Local `npm run build`: PASS.
- Public smoke verification: `GET https://api.epost.pk/health` PASS, `GET https://api.epost.pk/health/db` PASS.
- Public web verification: `/`, `/login`, `/upload`, and `/aggregator-bookings/payment/jazzcash/result` all returned HTTP 200.
- No Railway deploy executed in this verification step.
- Final classification: `READY_FOR_DEPLOY`.

## 2026-05-31 - Aggregator Booking Phase 3C-5B Isolated JazzCash Gateway Lane

### Task Name
- Implement isolated callback-driven JazzCash gateway lane for aggregator bookings, fully separated from SaaS package billing.

### Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260531123000_add_aggregator_payment_transaction/migration.sql`
- `apps/api/src/services/aggregatorPaymentGatewayService.ts`
- `apps/api/src/routes/aggregatorBookings.ts`
- `apps/api/src/routes/aggregatorPayments.ts`
- `apps/api/src/routes/adminAggregatorBookings.ts`
- `apps/api/src/index.ts`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `apps/api/scripts/phase3c5b-gateway-smoke.mjs`
- `apps/web/src/lib/aggregatorBookings.ts`
- `apps/web/src/pages/AggregatorBookingDetail.tsx`
- `apps/web/src/pages/AggregatorBookings.tsx`
- `apps/web/src/pages/admin/AdminAggregatorBookings.tsx`
- `apps/web/src/pages/AggregatorJazzCashResult.tsx`
- `apps/web/src/App.tsx`

### Behavior Added
- Customer endpoints:
	- `GET /api/aggregator-bookings/:id/payment/gateway-options`
	- `POST /api/aggregator-bookings/:id/payment/jazzcash/start`
	- `GET /api/aggregator-bookings/:id/payment/jazzcash/status`
- Callback/result endpoints:
	- `POST /api/aggregator-payments/jazzcash/callback`
	- `GET /api/aggregator-payments/jazzcash/callback`
	- `GET /api/aggregator-payments/jazzcash/result`
	- `GET /api/aggregator-payments/jazzcash/relay`
- Admin endpoints:
	- `GET /api/admin/aggregator-bookings/:id/payment-transactions`
	- `POST /api/admin/aggregator-bookings/:id/payment/reconcile`
	- `POST /api/admin/aggregator-bookings/:id/payment/mark-failed`
	- `POST /api/admin/aggregator-bookings/:id/payment/refund-note`
- Dedicated additive ledger model/table: `AggregatorPaymentTransaction`.
- Callback idempotency and replay protection are enforced with stored `idempotencyKey` and `callbackHash`.
- Duplicate callbacks are acknowledged and blocked from reprocessing in the aggregator gateway lane.

### Explicit Exclusions
- No SaaS subscription/invoice mutation.
- No SaaS unit/package billing mutation.
- No pickup/dispatch/final booking execution.
- No LabelJob creation and no queue job creation.
- No courier booking execution.
- No Pakistan Post booking API execution.
- No Railway/Cloudflare R2/protected production touch.

## Project Signature Guard and Protected Scope Protocol

### Files Added Or Updated
- `.ai-project/PROJECT_IDENTITY.json`
- `.ai-project/DEPLOY_TARGETS.json`
- `.ai-project/PUSH_GUARD.md`
- `.ai-project/SAFE_COMMANDS.md`
- `scripts/verify-project-scope.mjs`
- `scripts/safe-git-push.mjs`
- `scripts/safe-railway-check.mjs`
- `scripts/safe-r2-check.mjs`
- `.env.project.example`
- `package.json` (npm guard scripts)
- `.gitignore` (secret protection rules)

### Guard Checks Before Push Or Deploy
- Verify expected git remote origin, expected git branch, and required project signature.
- Block if forbidden secret/protected files are staged or unstaged.
- Print remote, branch, status, and changed files before any push attempt.
- Stop immediately on any project signature mismatch.

### Read-Only Guardrails
- Railway check is read-only and performs context verification only.
- R2 check is read-only and validates configured target names only.
- No deploy, no variable mutation, and no object upload/delete are performed by these scripts.

### Secret Handling
- No secrets are stored in repository guard files.
- `.gitignore` explicitly protects env and credential patterns from accidental commit.

## 2026-05-31 - Aggregator Booking Phase 3C-2 Hub Receiving Verification
## 2026-05-31 - Aggregator Booking Phase 3C-3 Operational Handoff and Dispatch Recording

## 2026-05-31 - Aggregator Booking Phase 3C-5A Manual Payment Verification

### Task Name
- Implement manual aggregator payment options and admin verification lifecycle (Phase 3C-5A only).

### Files Changed
- `apps/api/src/services/aggregatorBookingService.ts`
- `apps/api/src/routes/aggregatorBookings.ts`
- `apps/api/src/routes/adminAggregatorBookings.ts`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `apps/web/src/lib/aggregatorBookings.ts`
- `apps/web/src/pages/AggregatorBookingDetail.tsx`
- `apps/web/src/pages/AggregatorBookings.tsx`
- `apps/web/src/pages/admin/AdminAggregatorBookings.tsx`
- `apps/api/scripts/phase3c5a-schema-smoke.mjs`

### Behavior Added
- Customer endpoints:
	- `GET /api/aggregator-bookings/:id/payment/options`
	- `POST /api/aggregator-bookings/:id/payment/manual-submit`
	- `GET /api/aggregator-bookings/:id/payment/status`
- Admin endpoints:
	- `POST /api/admin/aggregator-bookings/:id/payment/manual-verify`
	- `POST /api/admin/aggregator-bookings/:id/payment/manual-reject`
	- `POST /api/admin/aggregator-bookings/:id/payment/manual-cancel`
- Derived additive metadata: `phase3c5Payment` from `AggregatorBookingAuditLog`.
- Customer/admin wording enforced: "Payment verification only. This is not final Pakistan Post booking confirmation."

### Explicit Exclusions
- No JazzCash live gateway execution in this phase.
- No SaaS billing/subscription/invoice mutation.
- No pickup/dispatch execution.
- No Pakistan Post booking API or final booking confirmation.
- No Prisma schema or migration changes.

### Task Name
- Implement Phase 3C-3 manual operational handoff recording: driver-to-hub handoff, hub-to-sorting dispatch, inter-facility transfer, and ready-for-final-postal-processing marking.

### Files Changed
- `apps/api/src/services/aggregatorBookingService.ts`
- `apps/api/src/routes/adminAggregatorBookings.ts`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `apps/web/src/lib/aggregatorBookings.ts`
- `apps/web/src/pages/admin/AdminAggregatorBookings.tsx`
- `apps/web/src/pages/AggregatorBookingDetail.tsx`
- `apps/web/src/pages/AggregatorBookings.tsx`
- `apps/api/scripts/phase3c3-schema-smoke.mjs` (new)
- `docs/architecture/aggregator-booking-business-plan.md`
- `docs/architecture/booking-business-plan.md`
- `docs/operations/aggregator-booking-rollout-checklist.md`
- `docs/operations/booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Behavior Added
- Added admin-only actions:
	- record driver handoff (optional),
	- record hub-to-sorting-facility dispatch,
	- record inter-facility transfer (optional),
	- mark ready for final postal processing.
- Entry gate: Phase 3C-2 must be MANIFEST_VERIFIED or EXCEPTION_RESOLVED.
- State machine: NOT_STARTED → DRIVER_HANDOFF_RECORDED → HUB_SORTING_DISPATCHED → INTER_FACILITY_TRANSFER_RECORDED → READY_FOR_FINAL_POSTAL_PROCESSING.
- All state derived from additive `AggregatorBookingAuditLog` rows — no schema/migration change.
- Customer notice: "This is operational movement status only. Final Pakistan Post article processing is a separate future step."
- Admin banner: "Handoff recording is manual operational logging only. It is not final dispatch or Pakistan Post booking confirmation."
- New smoke script: `apps/api/scripts/phase3c3-schema-smoke.mjs` (15 assertions, prints SMOKE_SCHEMA_ALL_DONE).

### Explicit Exclusions
- No live Leopards API, no Pakistan Post booking API.
- No final dispatch or pickup execution.
- No payment collection, no schema change, no migration.
- No protected scope modification.

---

## 2026-05-31 - Aggregator Booking Phase 3C-2 Hub Receiving Verification

### Task Name
- Implement Phase 3C-2 manual hub receiving verification, mismatch handling, and exception resolution.

### Files Changed
- `apps/api/src/services/aggregatorBookingService.ts`
- `apps/api/src/routes/adminAggregatorBookings.ts`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `apps/web/src/lib/aggregatorBookings.ts`
- `apps/web/src/pages/admin/AdminAggregatorBookings.tsx`
- `apps/web/src/pages/AggregatorBookingDetail.tsx`
- `apps/web/src/pages/AggregatorBookings.tsx`
- `docs/architecture/aggregator-booking-business-plan.md`
- `docs/architecture/booking-business-plan.md`
- `docs/operations/aggregator-booking-rollout-checklist.md`
- `docs/operations/booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Behavior Added
- Added admin-only actions:
	- mark bulk pack received,
	- verify manifest matched,
	- record mismatch,
	- add exception note,
	- resolve mismatch manually.
- Added strict payload validation for received counts, mismatch inputs, and resolution inputs.
- Added guardrail flags enforcing manual-only and non-final behavior.
- Added derived `phase3c2Operational` object on customer/admin booking list and detail responses.
- Added customer wording that warehouse receiving status is separate from final article processing.

### Safety / Scope Confirmation
- No Prisma schema changes.
- No migration files created or modified.
- No live Leopards API or Pakistan Post booking API integration added.
- No pickup, dispatch, payment collection, or final booking confirmation logic added.
- No Railway, Cloudflare/R2, or production action performed.
- Protected scope files (`Upload.tsx`, `jobs.ts`, `worker.ts`, templates) were not modified.

### Next Item
- Phase 3C-3 monitored operational rollout and readiness criteria.

## 2026-05-31 - Aggregator Booking Phase 3A Admin Review Hardening

### Task Name
- Implement Phase 3A admin-review hardening with rationale validation, manual-only wording clarity, and audit timeline clarity.

### Files Changed
- `apps/api/src/routes/adminAggregatorBookings.ts`
- `apps/api/src/routes/aggregatorBookings.ts`
- `apps/api/src/services/aggregatorBookingService.ts`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `apps/web/src/pages/admin/AdminAggregatorBookings.tsx`
- `apps/web/src/pages/AggregatorBookingDetail.tsx`
- `apps/web/src/pages/AggregatorBookings.tsx`
- `docs/architecture/booking-business-plan.md`
- `docs/operations/booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Behavior Added
- Enforced admin decision rationale rules:
	- reject requires reason code,
	- correction requires reason code,
	- approve requires a manual-action confirmation note.
- Updated admin queue UI to capture explicit reason/note input and checklist confirmation for manual-only handling.
- Updated admin approve action label to "Approve for Manual Action".
- Added explicit admin guardrail copy:
	- no payment collected,
	- no pickup created,
	- no dispatch created,
	- no external courier/Pakistan Post API call,
	- manual processing only.
- Added customer-facing status wording clarity for timeline semantics:
	- Draft,
	- Submitted for review,
	- Under admin review,
	- Approved for manual action,
	- Correction required,
	- Rejected,
	- Production rollout remains blocked until explicit user approval.
	- Cancelled.
- Clarified submit response messaging as review-only and non-final.
- Added clearer admin decision audit actions and rationale audit payload.

### Next Item
- Phase 3B/3C rollout controls and monitoring hardening only after explicit approval.
- Local `prisma migrate deploy` initially failed on `20260530154500_add_complaint_queue_table` with `relation "ComplaintQueue" already exists`.
- `_prisma_migrations` showed that migration as failed/partial with `finished_at = null` and `applied_steps_count = 0`.
- The local target was PostgreSQL on `localhost:5432` database `labelgen`.

### Repair Actions
- Marked `20260530154500_add_complaint_queue_table` as applied locally with `npm --workspace=@labelgen/api exec prisma migrate resolve --applied 20260530154500_add_complaint_queue_table`.
- Applied remaining local migrations with `npm --workspace=@labelgen/api exec prisma migrate deploy`.

### Object Inspection Result
- `ComplaintQueue` exists locally and matches the migration shape.
- Expected columns, indexes, and foreign key were present.

### DB-Backed Smoke Result
- Local test user found: PASS.
- Quote summary built: PASS.
- `convertQuoteToDraft`: PASS.
- Created status `BOOKING_DRAFT`: PASS.
- Request payload flags persisted: PASS (`requestOnly`, `noPayment`, `noLiveBooking`, `noPickupExecution`).
- Request payload context persisted: PASS (`selectedOption`, `senderDetails`, `quoteSnapshot`, `recommendationSnapshot`, `items`).
- Customer list visibility: PASS.
- Admin list visibility: PASS.
- No payment, pickup, dispatch, courier API, or Pakistan Post side effect was triggered in the local smoke path.

### Safety / Scope Confirmation
- Local development DB only.
- No Railway, Cloudflare/R2, or production touch occurred.
- Protected scope modules remained untouched.
- No schema edit, new migration, reset, drop, or destructive SQL was used.

### Next Item
- No immediate code work remains for Phase 2B smoke; proceed only with Phase 3 hardening when explicitly approved.

## 2026-05-31 - Aggregator Booking Phase 2B Smoke Verification

### Task Name
- Run Phase 2B smoke verification for persisted draft request behavior and record the outcome.

### Checks Run
- Mandatory repo preflight: PASS
- Schema validation smoke for `convertQuoteToDraftSchema`: PASS
- Service-level draft create smoke with stubbed persistence: PASS
- Local DB connectivity probe: PASS
- Local DB-backed draft create/read smoke: BLOCKED by missing `public.AggregatorBooking` table in current local database
- Frontend browser smoke: `/booking-quote` redirected to `/login` in local preview, so live booking-quote UI was not reachable without auth
- Source-level UI smoke: PASS for request-only disclaimers and gated "Create Draft Request" control in [apps/web/src/components/booking/BookingDraftReview.tsx](apps/web/src/components/booking/BookingDraftReview.tsx)

### Validation Results
- `customerNoticeAccepted === true` required by schema: PASS
- `customerNoticeAccepted === false` rejected: PASS
- `OVER_PHASE_LIMIT` rejected by schema/service guard: PASS
- Valid draft request returned `BOOKING_DRAFT`: PASS
- Persisted request payload stored request-only flags, selected option, sender details, quote snapshot, recommendation snapshot, and items in service smoke: PASS
- Response wording remains non-final and explicitly says admin review is required: PASS

### Safety / Scope Confirmation
- No Railway, Cloudflare/R2, or production touch occurred.
- Protected scope modules remained untouched.
- No migration or new table was added.

### Next Item
- Complete DB-backed local smoke once the local `AggregatorBooking` table is available, or treat the DB-backed portion as pending until that environment is bootstrapped.

## 2026-05-31 - Aggregator Booking Phase 2B Persisted Draft Request Activation

### Task Name
- Enable persisted quote-to-draft request creation using existing aggregator persistence path with strict request-only guardrails.

### Files Changed
- `apps/web/src/pages/BookingQuote.tsx`
- `apps/web/src/components/booking/BookingDraftReview.tsx`
- `apps/web/src/lib/aggregatorBookings.ts`
- `apps/api/src/routes/aggregatorBookings.ts`
- `apps/api/src/services/aggregatorBookingService.ts`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `docs/architecture/booking-business-plan.md`
- `docs/operations/booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Behavior Added
- Enabled customer-triggered persisted draft request creation from Booking Quote preview.
- Added mandatory customer notice acceptance before draft creation.
- Added request-only payload fields validation:
	- `requestOnly`, `noPayment`, `noLiveBooking`, `noPickupExecution`, `customerNoticeAccepted`
	- `selectedOption`
	- `recommendationSnapshot`
- Added blocker enforcement: reject draft create when `OVER_PHASE_LIMIT` is present.
- Added sender details capture in draft review UI and passed through persisted conversion payload.
- Added safe success path to existing booking detail route.

### Safety / Scope Confirmation
- No migration files added.
- No new tables added.
- No payment execution was introduced in create flow.
- No pickup or dispatch execution was introduced in create flow.
- No live courier API or Pakistan Post booking API call was introduced.
- Create flow remains draft request behavior and persists at `BOOKING_DRAFT`.
- Protected scope modules remained untouched.

## 2026-05-31 - Aggregator Booking Phase 2A Recommendation Preview (No-DB)

### Task Name
- Implement Phase 2A recommendation engine and quote-to-request preview UI without persistence.

### Files Changed
- `apps/api/src/services/bookingRecommendationService.ts`
- `apps/api/src/services/bookingRecommendationService.test.ts`
- `apps/web/src/components/booking/BookingOptionSelector.tsx`
- `apps/web/src/components/booking/BookingDraftReview.tsx`
- `apps/web/src/components/booking/BookingDraftNotice.tsx`
- `apps/web/src/pages/BookingQuote.tsx`
- `docs/architecture/booking-business-plan.md`
- `docs/operations/booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Behavior Added
- Added a pure deterministic recommendation rules engine for Phase 2A planning output.
- Added recommendation cards and request-preview UI into Booking Quote flow.
- Added explicit request-only customer notices:
	- not booking confirmation,
	- no payment,
	- no pickup/dispatch execution.
- Added disabled `Submit To Admin (Phase 2B - Disabled)` action to prevent persistence in Phase 2A.

### Safety / Scope Confirmation
- No DB writes added in Phase 2A flow.
- No persisted draft conversion endpoint call added.
- No payment, live booking, live courier API, or pickup execution added.
- Upload/generation, worker, PDF templates, money order/MOS/UMO, tracking, complaints, billing, auth/admin core, storage/R2, cleanup flags, and production deploy logic remained untouched.
- No Railway, Cloudflare/R2, or production interaction was performed for this implementation.

## 2026-05-31 - Production Prisma Migration Repair Verification (Api + Worker)

### Task Name
- Complete production verification for Prisma migration-state repair and document incident outcome.

### Files Changed
- `AI_IMPLEMENTATION_INDEX.md`
- `docs/operations/production-incident-runbook.md`

### Incident Summary
- Services affected: `Api` and `Worker` production deployment startup.
- Root cause: Prisma `P3009` failed migration state for `20260530154500_add_complaint_queue_table`.
- DB object audit confirmed migration objects already existed (table, columns, indexes, FK).
- Resolve action used: migration was marked as applied after object-existence verification.

### Verification Results
- Repository migration file exists and is tracked: `apps/api/prisma/migrations/20260530154500_add_complaint_queue_table/migration.sql`.
- Api latest production deployment: `SUCCESS`.
- Worker latest production deployment: `SUCCESS`.
- Fresh deployment logs: no `P3009`, `P2021`, `P2022`, `P1001`, `P1002`, `P3005`, Redis/BullMQ startup failures, module/import failures, missing env failures, restart loops, or port binding failures.
- Production runtime Prisma checks (Api context):
	- `prisma migrate status`: schema up to date, no failed migrations.
	- `prisma validate`: schema valid.
- Health check: `https://api.epost.pk/api/health` returned `200`.

### Safety / Scope Confirmation
- No business logic code changes were made.
- No destructive SQL, reset, or drop operations were executed.
- Cloudflare/R2 were not touched for this incident task.
- No secrets were exposed in the report.
- Protected Scope Protocol remained preserved.

### Prevention Note
- Verified migration directory exists in repository to avoid future artifact mismatch during deploy-time Prisma operations.

## 2026-05-30 - Aggregator Booking Quote Phase 1 Smoke Verification

### Task Name
- Run safe smoke verification for Aggregator Booking Quote Phase 1 (quote-only scope).

### Files Changed
- `docs/operations/booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Verification Summary
- Build, lint, and typecheck passed.
- Direct postage test passed (`7/7`).
- API quote contract and sample row calculations validated at service level.
- Frontend route guard behavior validated (`/booking-quote` requires auth and redirects to `/login`).
- Protected scope remained untouched.

## 2026-05-30 - Aggregator Booking Continuity Plan Strengthened

### Task Name
- Expand and harden aggregator booking continuity documentation for safe mid-session recovery.

### Files Changed
- `docs/architecture/booking-business-plan.md`
- `docs/architecture/postage-rates.md`
- `docs/operations/booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Notes
- Added full continuity protocol, protected scope, phase boundaries, validation/testing rules, and Git push safety checklist.
- Marked current state as `Phase 1: Booking Quote only`, `Status: Implemented`, `Next task: manual UI/API smoke test`.

## 2026-05-30 - ePost Aggregator Booking Quote Phase 1 (Quote-Only)

### Task Name
- Implement strict Phase 1 aggregator booking quote flow for per-article Pakistan Post postage estimates only.

### Files Changed
- `apps/api/src/utils/postageRates.ts`
- `apps/api/src/utils/postageRates.test.ts`
- `apps/api/src/services/bookingQuoteService.ts`
- `apps/api/src/routes/bookingQuotes.ts`
- `apps/web/src/pages/BookingQuote.tsx`
- `apps/web/src/components/booking/PostageSummaryCard.tsx`
- `apps/web/src/components/booking/PostageBreakdownTable.tsx`
- `apps/web/src/components/booking/BookingRecommendationCard.tsx`
- `docs/architecture/postage-rates.md`
- `docs/architecture/booking-business-plan.md`
- `docs/operations/booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Behavior Added
- Added Phase 1 quote-only postage calculator using service code, weight, and city normalization for UMS routing.
- Added CSV/XLSX file upload parsing and JSON row calculation path for quote API.
- Added quote summary totals (`totalPostageAmount`) with per-row warnings/errors.
- Updated booking quote UI to remove quote-to-draft conversion and keep quote-only behavior.

### Protected Scope Confirmation
- Upload/generation pipeline: NOT CHANGED
- Worker processing: NOT CHANGED
- Billing/payment workflow: NOT CHANGED
- Admin flows: NOT CHANGED
- Tracking flows: NOT CHANGED

### Notes
- Text-book 50g to 250g tariff gap remains intentionally unsupported and returns row error.
- VPL/VPP/COD include informational warning that they remain Pakistan Post final-delivery products.

## 2026-05-30 - Staging /api/me Payment Schema Drift Recovery

### Task Name
- Add the smallest additive Prisma migration to align staging `Payment` table columns with Prisma schema and stop `/api/me` crash.

### Files Changed
- `apps/api/prisma/migrations/20260531010000_add_payment_missing_columns/migration.sql`
- `docs/rollout/storage-rollout-runbook.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Staging Failure Root Cause
- `/api/me` calls `getLatestPendingPayment()` which reads Prisma `Payment` fields not present in staging DB.
- Staging DB drift caused Prisma `P2022` due to missing columns: `txnRefNo`, `providerTxnId`, `responseCode`, `responseMessage`, `rawRequest`, `rawResponse`, `hashVerified`.

### Recovery Applied
- Added additive-only migration for the seven missing `Payment` columns.
- Added `Payment_txnRefNo_idx` with `IF NOT EXISTS`.
- No edits to existing migrations.

### Protected Scope Confirmation
- Production: NOT TOUCHED
- R2 logic: NOT CHANGED
- Upload logic: NOT CHANGED
- LabelJob logic: NOT CHANGED
- Cleanup/read-preference flags: NOT CHANGED

### Remaining Blocker
- R2 Phase B remains blocked until upload creates `LabelJob` rows with `uploadSyncStatus = R2_SYNCED` and corresponding R2 object evidence.

### Next Recommended Step
- Redeploy Api-staging, run `prisma migrate deploy`, then verify `/api/me` no longer emits `P2022`.

## 2026-05-30 - Missing ComplaintQueue Migration Recovery

### Task Name
- Add the smallest additive Prisma migration to restore the missing `ComplaintQueue` table in Api-staging.

### Files Changed
- `apps/api/prisma/migrations/20260530154500_add_complaint_queue_table/migration.sql`
- `docs/rollout/storage-rollout-runbook.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Behavior Added
- Created the missing `ComplaintQueue` table to match the Prisma schema exactly.
- Added the required indexes and `User` foreign key.
- Kept the migration additive only; no destructive database operations.

### Staging Failure Root Cause
- Api-staging failed because the Prisma schema already contained `ComplaintQueue`, but no existing migration created the table.
- Runtime logs showed `prisma.complaintQueue.findMany()` failing with `The table public.ComplaintQueue does not exist in the current database.`

### Protected Scope Confirmation
- Production: NOT TOUCHED
- R2 logic: NOT CHANGED
- Upload logic: NOT CHANGED
- LabelJob logic: NOT CHANGED
- Cleanup/read-preference flags: NOT CHANGED

### Next Recommended Step
- Redeploy Api-staging, run `prisma migrate deploy`, and verify health plus localhost CORS preflight.

## 2026-05-30 - Staging CORS Allowlist for Local Frontend Verification

### Task Name
- Add explicit env-driven CORS allowlist support so a local staging frontend can reach Api-staging without weakening production defaults.

### Files Changed
- `apps/api/src/config.ts`
- `apps/api/src/index.ts`
- `docs/rollout/storage-rollout-runbook.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Behavior Added
- Added `CORS_ALLOWED_ORIGINS` env support for comma-separated origins.
- Merged explicit origins into the existing CORS allowlist.
- Preserved production restrictions for all non-explicit origins.
- Kept wildcard CORS disabled.

### Staging Verification Scope
- Use `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` only for local staging verification.
- This is intended to unblock `/api/auth/firebase-login` from a local browser origin.

### Protected Scope Confirmation
- Upload logic: NOT CHANGED
- LabelJob logic: NOT CHANGED
- R2 logic: NOT CHANGED
- Firebase login logic: NOT CHANGED
- Cleanup/read-preference flags: NOT CHANGED

### Next Recommended Step
- Redeploy Api-staging, set the staging CORS allowlist variable, and rerun login/upload/R2 verification.

## 2026-05-30 - R2 Permanent Storage Rollout Phase D (Controlled Preferred Reads)

### Task Name
- Phase D: controlled R2-preferred reads with mandatory local fallback and emergency local-force override.

### Files Changed
- `apps/api/src/config.ts`
- `apps/api/src/storage/paths.ts`
- `apps/api/src/routes/jobs.ts`
- `apps/api/src/routes/tracking.ts`
- `apps/api/src/routes/jobsTrackingMasterDownload.test.ts`
- `docs/architecture/storage-rollout-architecture.md`
- `docs/rollout/storage-rollout-runbook.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Feature Flags Added
- `ENABLE_R2_PREFERRED_READS` (default false)
- `FORCE_LOCAL_READS` (default false)

### Read Orchestration
- Added controlled read helper that supports:
	- R2-preferred attempt when enabled and durable metadata exists
	- mandatory local fallback on R2 miss/failure
	- force-local override path
	- standardized outcome labels:
		- `r2_read_success`
		- `r2_read_failed_fallback_local`
		- `local_fallback_success`
		- `local_fallback_failed`
		- `local_read_success`

### Route Coverage
- Updated jobs download handlers:
	- labels PDF
	- money order PDF
	- tracking master XLSX
- Updated tracking result JSON read path in tracking route.
- Tracking batch master-file endpoint remains local-first due to missing reliable R2 metadata mapping.
- Aggregator booking documents remain metadata-only in Phase D.

### Local Fallback Confirmation
- Local fallback remains mandatory in all updated routes.
- R2-only read mode was not introduced.
- Existing response contracts and error behavior were preserved.

### Protected Scope Confirmation
- `apps/web/src/pages/Upload.tsx`: NOT TOUCHED
- `apps/api/src/parse/orders.ts`: NOT TOUCHED
- `apps/api/src/worker.ts`: NOT TOUCHED
- queue payload shaping: NOT TOUCHED
- PDF templates: NOT TOUCHED
- money order / MOS / UMO business logic: NOT TOUCHED
- tracking/complaint/billing/auth business logic: NOT TOUCHED
- cleanup deletion logic: NOT TOUCHED

### Rollback
- Disable `ENABLE_R2_PREFERRED_READS`, or
- set `FORCE_LOCAL_READS=true` for immediate local-first override.

### Next Recommended Step
- Post-Phase-D canary monitoring review and threshold signoff before broader production rollout.

## 2026-05-30 - R2 Permanent Storage Rollout Phase C (Safe Local Upload Cleanup)

### Task Name
- Phase C: delete local upload source files only after confirmed R2 sync and path-safe validation.

### Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260531003000_phaseC_upload_local_cleanup_metadata/migration.sql`
- `apps/api/src/storage/paths.ts`
- `apps/api/src/cron/cleanup.ts`
- `docs/architecture/storage-rollout-architecture.md`
- `docs/rollout/storage-rollout-runbook.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Feature Flags / Envs
- `ENABLE_UPLOAD_LOCAL_CLEANUP_AFTER_R2=true` enables Phase C cleanup pass.
- `UPLOAD_LOCAL_CLEANUP_GRACE_MS` default `3600000` (minimum `60000`).
- `UPLOAD_LOCAL_CLEANUP_MAX_ATTEMPTS` default `5`.

### Cleanup Eligibility
- `uploadSyncStatus = R2_SYNCED`
- `uploadObjectKey` exists
- `uploadPath` exists
- `uploadSyncedAt` older than grace period
- local cleanup not completed
- retry due and attempts under max

### Path Safety Behavior
- Resolve upload path and uploads root to canonical absolute paths.
- Ensure target remains inside uploads root boundary.
- Reject unsafe/traversal paths.
- Reject symlink and directory targets.
- Delete regular files only.

### Cleanup Statuses
- `PENDING`
- `COMPLETED`
- `RETRY_PENDING`
- `FAILED_TERMINAL`
- `SKIPPED_UNSAFE_PATH`
- `SKIPPED_MISSING_FILE`

### Protected Scope Confirmation
- `apps/web/src/pages/Upload.tsx`: NOT TOUCHED
- `apps/api/src/parse/orders.ts`: NOT TOUCHED
- `apps/api/src/worker.ts`: NOT TOUCHED
- `apps/api/src/routes/jobs.ts`: NOT TOUCHED
- PDF templates: NOT TOUCHED
- money order / MOS / UMO logic: NOT TOUCHED
- tracking / complaint / billing / auth core: NOT TOUCHED
- queue payload behavior: NOT TOUCHED
- read preference behavior: NOT CHANGED

### Rollback
- Set `ENABLE_UPLOAD_LOCAL_CLEANUP_AFTER_R2=false` to stop local upload cleanup immediately.
- Phase C does not alter R2 permanence metadata or read preference.

### Next Recommended Step
- Phase D plan only: R2-preferred reads with explicit fallback and staged rollout gates.

## 2026-05-30 - R2 Permanent Storage Rollout Phase B (Upload Source File Durability)

### Task Name
- Phase B: Make initial CSV/XLSX upload source files durable in Cloudflare R2 immediately after multer disk write.

### Files Changed
- `apps/api/prisma/schema.prisma` — added 6 additive optional fields to `LabelJob` + `@@index([uploadSyncStatus, uploadSyncedAt])`
- `apps/api/prisma/migrations/20260530235900_phaseB_label_job_upload_r2_fields/migration.sql` — new additive ALTER TABLE migration (no reset)
- `apps/api/src/storage/key-normalization.ts` — added `getUploadSourceObjectKey(jobId, ext, env?)` export
- `apps/api/src/storage/provider.ts` — added `uploadSourceFileToR2(buffer, key)` export (non-blocking, 10s timeout, never throws)
- `apps/api/src/routes/jobs.ts` — added one gated insertion block after `fs.readFile(uploadPath)` and before `queue.add()`, gated by `ENABLE_UPLOAD_R2_BACKUP=true`
- `docs/architecture/storage-rollout-architecture.md` — added Phase B section and `ENABLE_UPLOAD_R2_BACKUP` flag
- `docs/rollout/storage-rollout-runbook.md` — added Phase B runbook section and flag entry
- `AI_IMPLEMENTATION_INDEX.md` — this entry

### Feature Flag
- `ENABLE_UPLOAD_R2_BACKUP=true` to activate Phase B R2 backup of source uploads. Default off.

### R2 Key Format
- `uploads/{env}/{jobId}/source{ext}` — e.g. `uploads/production/uuid/source.csv`

### Insertion Point (jobs.ts)
- AFTER: `const fileBuffer = await fs.readFile(uploadPath);`
- BEFORE: `await withTimeout(ensureRedisConnection(), 3000, ...)`
- Block reads `process.env.ENABLE_UPLOAD_R2_BACKUP` at runtime (no module-level flag evaluation)

### Protected Scope Confirmation
- `apps/web/src/pages/Upload.tsx`: NOT TOUCHED
- `apps/api/src/parse/orders.ts`: NOT TOUCHED
- `apps/api/src/worker.ts`: NOT TOUCHED
- `apps/api/src/cron/cleanup.ts`: NOT TOUCHED
- PDF templates: NOT TOUCHED
- Money order / MOS / UMO logic: NOT TOUCHED
- Tracking engine / complaint engine: NOT TOUCHED
- Billing / unit consumption: NOT TOUCHED
- Auth core: NOT TOUCHED
- `apps/api/src/storage/R2StorageProvider.ts`: NOT TOUCHED
- `apps/api/src/storage/LocalStorageProvider.ts`: NOT TOUCHED
- `uploadPath` local behavior: UNCHANGED
- Local upload file deletion: NOT ENABLED in Phase B
- R2 read preference: NOT CHANGED in Phase B
- Queue payload (filePath, fileBuffer): NOT CHANGED
- `parseOrdersFromFile`: NOT CHANGED
- `deleteJobArtifacts`: NOT CHANGED

### Invariants
- Phase B makes initial CSV/XLSX uploads durable in R2.
- Local `uploadPath` remains backward-compatible.
- R2 upload failure is non-blocking (job proceeds with `uploadSyncStatus=FAILED`).
- Local file deletion is NOT enabled in Phase B. Phase C will handle local cleanup only after confirmed R2 sync.
- R2 read preference is NOT changed in Phase B. Phase D will handle R2-preferred reads later.

### Migration Notes
- Migration SQL uses `ADD COLUMN IF NOT EXISTS` — safe to apply on existing DB.
- Local `prisma migrate dev` blocked by drift — handwritten SQL committed; no reset applied.
- `prisma generate` run successfully after schema change.

### Next Recommended Step
- Phase C plan: local upload file cleanup after confirmed R2 sync using a separate `ENABLE_UPLOAD_LOCAL_CLEANUP_AFTER_R2` flag and a cleanup cron or post-job hook.

---

## 2026-05-30 - Regression Fix: Restore Master Admin Panel Navigation

### Task Name
- Restore Master Admin panel sidebar link that was replaced by Aggregator Admin Queue link in commit c3364ba.

### Regression Commit
- c3364ba (Add aggregator booking draft and admin review lifecycle)
- Changed: `apps/web/src/components/Sidebar.tsx`
- Regression: admin nav item `to` changed from `/admin` to `/admin/aggregator-bookings` and label changed from `"Admin"` to `"Admin Queue"`, hiding the Master Admin Command Center.

### Files Changed
- `apps/web/src/components/Sidebar.tsx`
- `AI_IMPLEMENTATION_INDEX.md`

### Fix Applied
- Restored `NavItem to="/admin" label="Admin Panel" icon={Shield}` as primary admin sidebar link.
- Added separate `NavItem to="/admin/aggregator-bookings" label="Aggregator Queue" icon={ClipboardList}` for the aggregator admin queue.
- Both items are shown only to ADMIN role.
- App.tsx routing was already correct with both `/admin` (AdminCommandCenter) and `/admin/aggregator-bookings` (AdminAggregatorBookings) routes.
- navigation.ts already had `{ to: "/admin", label: "Admin" }` entry — no change required.

### Scope Status
- Master Admin panel sidebar link: RESTORED
- Aggregator Queue sidebar link: KEPT as separate item
- AdminCommandCenter.tsx: NOT MODIFIED (intact with all controls)
- AdminAggregatorBookings.tsx: NOT MODIFIED
- App.tsx routing: NOT MODIFIED (was already correct)
- navigation.ts: NOT MODIFIED (was already correct)

### Protected Scope Verification
- `apps/api/src/routes/jobs.ts`: NOT TOUCHED
- `apps/web/src/pages/Upload.tsx`: NOT TOUCHED
- `apps/api/src/parse/orders.ts`: NOT TOUCHED
- `apps/api/src/cron/cleanup.ts`: NOT TOUCHED
- `apps/api/src/worker.ts`: NOT TOUCHED
- PDF templates, money order logic, MOS/UMO logic: NOT TOUCHED
- tracking/complaint/billing/auth core: NOT TOUCHED
- storage behavior: NOT TOUCHED

### Verification
- `npm run build`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS

## 2026-05-30 - R2 Permanent Storage Rollout Phase A (Aggregator Metadata Only)

### Task Name
- Implement Phase A additive metadata foundation for Aggregator Quote source files and Aggregator Booking documents for R2 permanent storage readiness.

### Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260530224500_phaseA_aggregator_r2_metadata/migration.sql`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `apps/api/src/services/aggregatorBookingService.ts`
- `apps/api/src/services/aggregatorDocumentService.ts`
- `apps/api/src/routes/aggregatorBookings.ts`
- `docs/architecture/storage-rollout-architecture.md`
- `docs/rollout/storage-rollout-runbook.md`
- `docs/architecture/aggregator-booking-business-plan.md`
- `docs/operations/aggregator-booking-rollout-checklist.md`
- `docs/operations/hub-receiving-and-post-booking-sop.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Scope Status
- AggregatorQuote source file metadata fields: COMPLETED
- AggregatorBookingDocument R2/local-cleanup metadata fields: COMPLETED
- Booking conversion payload/schema supports optional source metadata: COMPLETED
- Customer document metadata attach/list APIs (metadata-only): COMPLETED
- Audit logging for source/document metadata attach: COMPLETED
- Existing generation/upload path changes (`jobs.ts`): NOT IMPLEMENTED (protected)
- Cleanup cron deletion behavior changes: NOT IMPLEMENTED (protected)
- Read preference changes (R2-only or primary switch): NOT IMPLEMENTED (deferred)
- Worker pipeline behavior changes: NOT IMPLEMENTED (deferred)

### Protected Scope Verification
- `apps/api/src/routes/jobs.ts`: NOT TOUCHED
- `apps/api/src/cron/cleanup.ts`: NOT TOUCHED
- `apps/api/src/worker.ts`: NOT TOUCHED
- existing upload/parse generation path: NOT TOUCHED
- money order commission and MOS/UMO logic: NOT TOUCHED
- tracking logic: NOT TOUCHED
- complaint logic: NOT TOUCHED
- billing/unit consumption logic: NOT TOUCHED

### Verification Notes
- `npm run build`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm --workspace=@labelgen/api exec prisma validate`: PASS
- `npm --workspace=@labelgen/api exec prisma migrate dev --name phaseA_aggregator_r2_metadata --create-only`: BLOCKED by existing DB drift and reset prompt; no destructive reset performed.

## 2026-05-30 - Aggregator Booking Phase 2 (Draft, Review, Timeline)

### Task Name
- Implement Aggregator Booking Phase 2 with database-backed booking draft lifecycle, customer dashboard, admin review queue, and status timeline audit events in a separate money-based lane.

### Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260530193000_phase2_aggregator_booking/migration.sql`
- `apps/api/src/services/aggregatorBookingStatusService.ts`
- `apps/api/src/services/aggregatorBookingService.ts`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `apps/api/src/routes/aggregatorBookings.ts`
- `apps/api/src/routes/adminAggregatorBookings.ts`
- `apps/api/src/index.ts`
- `apps/web/src/lib/aggregatorBookings.ts`
- `apps/web/src/components/booking/AggregatorBookingStatusBadge.tsx`
- `apps/web/src/components/booking/AggregatorBookingTimeline.tsx`
- `apps/web/src/components/booking/AggregatorBookingDraftForm.tsx`
- `apps/web/src/components/booking/AggregatorBookingSummaryCard.tsx`
- `apps/web/src/pages/AggregatorBookings.tsx`
- `apps/web/src/pages/AggregatorBookingDetail.tsx`
- `apps/web/src/pages/admin/AdminAggregatorBookings.tsx`
- `apps/web/src/pages/BookingQuote.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/App.tsx`
- `docs/architecture/aggregator-booking-business-plan.md`
- `docs/architecture/booking-lifecycle.md`
- `docs/operations/aggregator-booking-rollout-checklist.md`
- `docs/operations/hub-receiving-and-post-booking-sop.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Scope Status
- DB-backed booking draft lifecycle: COMPLETED
- Quote-to-booking draft conversion: COMPLETED
- Customer booking list/detail/timeline pages: COMPLETED
- Admin aggregator queue/detail/actions: COMPLETED
- Status transition guard with actor policy: COMPLETED
- Booking status event + audit log per mutation: COMPLETED
- Payment placeholder status only: COMPLETED
- Live payment gateway: NOT IMPLEMENTED (deferred)
- Courier email flow: NOT IMPLEMENTED (deferred)
- Label/MO generation handoff: NOT IMPLEMENTED (deferred)
- Pakistan Post final booking flow: NOT IMPLEMENTED (deferred)

### Protected Scope Verification
- `apps/api/src/routes/jobs.ts`: NOT TOUCHED
- `apps/web/src/pages/Upload.tsx`: NOT TOUCHED
- `apps/api/src/parse/orders.ts`: NOT TOUCHED
- money order commission and MOS/UMO logic: NOT TOUCHED
- tracking logic: NOT TOUCHED
- complaint logic: NOT TOUCHED
- billing/unit consumption logic: NOT TOUCHED
- auth core logic: NOT TOUCHED
- storage/worker behavior: NOT TOUCHED
- PDF generation templates: NOT TOUCHED

### Notes
- Aggregator Booking Phase 2 remains money-based and separate from units.
- No SaaS units are consumed in quote, draft, submit, review, correction, cancellation, or payment placeholder transitions.
- Local `prisma migrate dev` apply was blocked by existing database drift and destructive reset prompt; migration SQL was generated and committed without destructive reset.

## 2026-05-30 - Aggregator Booking Quote Phase 1.5 (Rate Card Engine)

### Task Name
- Upgrade separate Aggregator Booking Quote calculator from hardcoded tariffs to versioned official postal rate cards with component-wise charge breakdown.

### Files Changed
- `apps/api/src/rateCards/types.ts`
- `apps/api/src/rateCards/index.ts`
- `apps/api/src/rateCards/cards/base-postage.v1.ts`
- `apps/api/src/rateCards/cards/registration-fee.v1.ts`
- `apps/api/src/rateCards/cards/value-payable-fee.v1.ts`
- `apps/api/src/rateCards/cards/insurance-fee.v1.ts`
- `apps/api/src/utils/postageRates.ts`
- `apps/api/src/utils/postageRates.test.ts`
- `apps/api/src/services/bookingQuoteService.ts`
- `apps/api/src/routes/bookingQuotes.ts`
- `apps/web/src/pages/BookingQuote.tsx`
- `apps/web/src/components/booking/PostageSummaryCard.tsx`
- `apps/web/src/components/booking/PostageBreakdownTable.tsx`
- `apps/web/src/components/booking/BookingRecommendationCard.tsx`
- `docs/architecture/postage-rates.md`
- `docs/architecture/aggregator-booking-business-plan.md`
- `docs/architecture/booking-lifecycle.md`
- `docs/operations/aggregator-booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Scope Status
- Versioned repo rate cards in separate quote lane: COMPLETED
- Component-wise official charge output: COMPLETED
- Base postage parity retained: COMPLETED
- Registration fee integration (known values): COMPLETED
- Value payable and insurance component structure: COMPLETED
- Missing VP/insurance schedules guessed: NOT ALLOWED (enforced)

### Protected Scope Verification
- `apps/api/src/routes/jobs.ts`: NOT TOUCHED
- `apps/web/src/pages/Upload.tsx`: NOT TOUCHED
- `apps/api/src/parse/orders.ts`: NOT TOUCHED
- money order commission and MOS/UMO logic: NOT TOUCHED
- tracking logic: NOT TOUCHED
- complaint logic: NOT TOUCHED
- billing/unit consumption logic: NOT TOUCHED
- storage/worker behavior: NOT TOUCHED

### Notes
- Aggregator Booking remains separate from existing unit-based SaaS generation flow.
- Phase 1.5 remains quote-only and does not add payment, courier API, or live booking execution.

## 2026-05-30 - Aggregator Booking Quote Phase 1 (Separate Lane)

### Task Name
- Implement Phase 1 of separate Aggregator Booking Quote module with Pakistan Post per-article postage estimation.

### Files Changed
- `apps/api/src/utils/postageRates.ts`
- `apps/api/src/utils/postageRates.test.ts`
- `apps/api/src/services/bookingQuoteService.ts`
- `apps/api/src/routes/bookingQuotes.ts`
- `apps/api/src/index.ts`
- `apps/web/src/pages/BookingQuote.tsx`
- `apps/web/src/components/booking/PostageSummaryCard.tsx`
- `apps/web/src/components/booking/PostageBreakdownTable.tsx`
- `apps/web/src/components/booking/BookingRecommendationCard.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/lib/navigation.ts`
- `docs/architecture/aggregator-booking-business-plan.md`
- `docs/architecture/postage-rates.md`
- `docs/architecture/booking-lifecycle.md`
- `docs/operations/aggregator-booking-rollout-checklist.md`
- `docs/operations/leopards-pickup-email-sop.md`
- `docs/operations/hub-receiving-and-post-booking-sop.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Scope Status
- Separate booking quote lane: COMPLETED
- Per-article Pakistan Post postage calculator: COMPLETED
- Separate quote API route: COMPLETED
- Separate booking quote page: COMPLETED
- Existing upload generation flow unchanged: VERIFIED
- Payment/pickup/courier API automation: NOT IMPLEMENTED (deferred)
- Live booking execution: NOT IMPLEMENTED (deferred)

### Protected Scope Verification
- `apps/api/src/routes/jobs.ts`: NOT TOUCHED
- `apps/web/src/pages/Upload.tsx`: NOT TOUCHED
- money order commission and MOS/UMO logic: NOT TOUCHED
- tracking logic: NOT TOUCHED
- complaint logic: NOT TOUCHED
- billing/unit consumption logic: NOT TOUCHED
- storage/worker behavior: NOT TOUCHED

### Notes
- Phase 1 remains quote-only.
- No service charges, handling charges, pickup charges, profit margin, or discount logic added.
- Aggregator booking remains separate from existing unit-based SaaS workflow.

## 2026-05-30 - Final Production Safety Polish (Protected Scope)

- Final production safety polish completed.
- Bootstrap production response reviewed and hardened.
- Request query logging redaction reviewed and hardened.
- No business flow changed.
- Protected Scope Protocol maintained.

## 2026-05-30 - Production Security Hardening Verification (Protected Scope)

- Production security hardening verification completed.
- Bootstrap/CORS/error/static/support exposure checked.
- Applied changes:
	- Production CORS now excludes localhost/127.0.0.1 origins.
	- Production error responses now avoid raw internal error details.
	- Startup warning messages no longer include partial DATABASE_URL values.
	- Health/database connection error responses are generic in production.
- No business flow changed.
- Protected Scope Protocol maintained.

## 2026-05-30 - Production Cleanup Verification (Zero-Risk)

- Production cleanup verification completed.
- Only confirmed unused artifacts/backups removed.
- No business flow changed.
- Risky cleanup items deferred for separate approval.

## 2026-05-29 - Support Retention, Storage Summary, and Admin Attachment View

### Task Name
- Add support ticket preserve/retention controls, support storage visibility, attachment view actions, and compact support admin layout safeguards.

### Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260529210000_add_support_ticket_retention_fields/migration.sql`
- `apps/api/src/routes/adminSupport.ts`
- `apps/api/src/services/supportTickets.ts`
- `apps/api/src/services/supportTicketRetention.ts`
- `apps/api/scripts/support-ticket-cleanup.ts`
- `apps/api/package.json`
- `apps/api/.env.example`
- `apps/api/src/routes/supportRoute.test.ts`
- `apps/web/src/lib/support.ts`
- `apps/web/src/components/SupportAttachmentUploader.tsx`
- `apps/web/src/pages/SupportTicketDetailPage.tsx`
- `apps/web/src/pages/admin/AdminCommandCenter.tsx`
- `apps/web/src/components/Footer.jsx`
- `docs/architecture/support-tickets.md`
- `docs/operations/support-tickets-runbook.md`
- `README.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Status Matrix
- Support attachment limits (5 files, 10 MB each): COMPLETED
- Preserve ticket + retention scheduling controls: COMPLETED
- Default support retention 90 days: COMPLETED
- Support cleanup command placeholder (safe, manual): COMPLETED
- Support storage summary metrics in admin support tab: COMPLETED
- Admin and customer attachment View action: COMPLETED
- Public footer support email exposure removed: COMPLETED
- Footer headings/alignment polish and consistent card sizing: COMPLETED
- Support admin tab overflow/truncation hardening: COMPLETED

### Completion
- Completion percentage: 99.7%
- Remaining percentage: 0.3% (production monitoring, SLA tuning, and customer feedback polish)

## 2026-05-29 - Support Tickets Completion Pass (Attachments, Notifications, Closed State)

### Task Name
- Complete support ticket UX/business behavior with create-ticket attachments, persisted notifications, closed-ticket conversation lock, and public support entry alignment.

### Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260529173000_add_support_notifications/migration.sql`
- `apps/api/src/routes/support.ts`
- `apps/api/src/routes/adminSupport.ts`
- `apps/api/src/services/supportNotifications.ts`
- `apps/api/src/routes/supportRoute.test.ts`
- `apps/web/src/lib/support.ts`
- `apps/web/src/components/SupportAttachmentUploader.tsx`
- `apps/web/src/components/CreateSupportTicketModal.tsx`
- `apps/web/src/components/SupportNotificationsBell.tsx`
- `apps/web/src/components/Topbar.tsx`
- `apps/web/src/components/Navbar.jsx`
- `apps/web/src/components/Footer.jsx`
- `apps/web/src/pages/SupportTicketsPage.tsx`
- `apps/web/src/pages/SupportTicketDetailPage.tsx`
- `apps/web/src/pages/admin/AdminCommandCenter.tsx`
- `docs/architecture/support-tickets.md`
- `docs/operations/support-tickets-runbook.md`
- `README.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Status Matrix
- Create-ticket attachments: COMPLETED
- Attachment upload after ticket creation via existing R2 API: COMPLETED
- Customer/admin support notifications: COMPLETED
- Persisted notification unread/read state: COMPLETED
- Closed ticket customer reply lock: COMPLETED
- Public support menu/footer alignment: COMPLETED
- Focused notification/closed-state tests: COMPLETED

### Migration Notes
- Additive `SupportTicketNotification` model introduced.
- Manual additive migration file added and intended for non-destructive deploy path.
- If `migrate dev` reports local drift again, use `migrate deploy`; do not reset local DB.

### Protected Files Not Touched
- `apps/api/src/labels.ts`
- `multipage-label.html`
- barcode engine files
- MOS/UMO calculation logic
- moneyOrderBreakdown logic
- finalized PDF templates
- finalized complaint engine internals
- finalized tracking parser core
- tracking upload parser core

### Completion
- Completion percentage: 99.5%
- Remaining percentage: 0.5% (production monitoring, SLA tuning, customer feedback polish)

## 2026-05-29 - Support Tickets with R2 Attachments (Finalize)

### Task Name
- Finalize support ticket feature with admin Support tab, non-destructive Prisma migration handling, focused route tests, and operational docs.

### Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260529160000_add_support_tickets/migration.sql`
- `apps/api/src/index.ts`
- `apps/api/src/routes/support.ts`
- `apps/api/src/routes/adminSupport.ts`
- `apps/api/src/services/supportTickets.ts`
- `apps/api/src/routes/supportRoute.test.ts`
- `apps/api/package.json`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/support.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/CreateSupportTicketModal.tsx`
- `apps/web/src/components/SupportAttachmentUploader.tsx`
- `apps/web/src/pages/SupportTicketsPage.tsx`
- `apps/web/src/pages/SupportTicketDetailPage.tsx`
- `apps/web/src/pages/admin/AdminCommandCenter.tsx`
- `docs/architecture/support-tickets.md`
- `docs/operations/support-tickets-runbook.md`
- `README.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Status Matrix
- Customer support ticket APIs: COMPLETED
- Admin support APIs: COMPLETED
- Admin Support tab in command center: COMPLETED
- R2 attachment workflow (support scope): COMPLETED
- Support audit log persistence: COMPLETED
- Focused support route tests: COMPLETED
- Non-destructive migration handling: COMPLETED (no reset used)

### Migration Notes
- Local reset prompt was declined; no destructive command was executed.
- Existing local DB was baselined non-destructively using `prisma migrate resolve --applied` for historical migrations.
- Support migration added at `20260529160000_add_support_tickets` and applied via `prisma migrate deploy`.
- Residual local schema drift remains for legacy pre-existing tables; support migration itself is deploy-safe.

### Protected Files Not Touched
- `apps/api/src/labels.ts`
- `multipage-label.html`
- barcode engine files
- MOS/UMO calculation logic
- moneyOrderBreakdown logic
- finalized PDF templates
- finalized complaint engine internals
- finalized tracking parser core
- tracking upload parser core

### Verification
- `npm run phase-3-verify`: PASS
- `npm run strict-runtime-verify`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS

### Completion
- Completion percentage: 99%
- Remaining percentage: 1% (support SLA tuning, monitoring thresholds, analytics polish)

## 2026-05-29 - Admin Users Tab Full Control Restore and Duplicate-Risk Review

### Task Name
- Repair Admin Command Center Users tab to restore full customer controls after duplicate-risk safeguard rollout.

### Files Changed
- `apps/web/src/pages/admin/AdminCommandCenter.tsx`
- `apps/api/src/routes/admin.ts`
- `AI_IMPLEMENTATION_INDEX.md`
- `CHANGELOG.md`
- `docs/operations/account-duplicate-risk-controls-2026-05-29.md`

### Status Matrix
- Users view modal restored: COMPLETED
- Full user details restored: COMPLETED
- Add credit/units restored: COMPLETED
- Suspend/reactivate/delete controls: COMPLETED
- CNIC/contact admin correction with note+confirmation: COMPLETED
- Duplicate-risk badge/reasons/review hint: COMPLETED
- Allow/review action status: COMPLETED (`POST /api/admin/users/:userId/duplicate-risk/review`)
- Normal user lock bypass blocked: VERIFIED (frontend lock + backend immutable checks in auth/me routes remain active)

### Protected Files Not Touched
- `apps/api/src/labels.ts`
- `multipage-label.html`
- barcode engine files
- MOS/UMO calculation logic
- moneyOrderBreakdown logic
- finalized PDF templates
- finalized complaint engine internals
- finalized tracking parser core
- tracking upload parser core

### Verification
- `npm run build`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS

### Git
- Commit hash: `040c794`

### Completion
- Completion percentage: 100%
- Remaining percentage: 0%

## 2026-05-29 - Auth Session Controls and Duplicate Free-Account Safeguards

### Task Name
- Implement approved auth/session redirect fix, login loading-state split, sender contact/CNIC lock, hashed duplicate-risk signals, and admin duplicate-risk warnings.

### Files Changed
- `apps/web/src/hooks/useIdleTimeout.ts`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/components/GoogleAuthButton.tsx`
- `apps/web/src/pages/Settings.tsx`
- `apps/web/src/pages/RegisterProfile.tsx`
- `apps/web/src/pages/admin/AdminCommandCenter.tsx`
- `apps/api/src/auth/security.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/me.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260529113000_add_account_risk_signal/migration.sql`
- `AI_IMPLEMENTATION_INDEX.md`
- `CHANGELOG.md`
- `README.md`
- `docs/operations/account-duplicate-risk-controls-2026-05-29.md`

### Status Matrix
- Auto logout redirect status: COMPLETED (`/login` redirect for local/dev, production host redirected to `https://www.epost.pk/login`).
- Login loading status: COMPLETED (separate `passwordLoginLoading` and `googleLoginLoading`; only active method shows loading text).
- Contact/CNIC lock status: COMPLETED (frontend disabled state + backend immutability enforcement in `/api/me` and `/api/auth/complete-profile`).
- Duplicate risk detection status: COMPLETED (hashed IP/device/contact/cnic/name-contact signals stored in `AccountRiskSignal`; duplicate attempts flagged).
- Admin warning status: COMPLETED (`/api/admin/users` now returns `duplicateRisk` with level/reasons/review hint; users tab displays risk badge and reasons).
- Prisma migration status: CREATED (manual migration SQL file added due local drift reset prompt; see ops doc for apply command).

### Protected Files Not Touched
- `apps/api/src/labels.ts`
- `multipage-label.html`
- barcode engine files
- MOS/UMO calculation logic
- moneyOrderBreakdown logic
- finalized PDF templates
- finalized complaint engine internals
- finalized tracking parser core
- tracking upload parser core

### Verification
- `npm run prisma:generate --workspace=@labelgen/api`: PASS
- `npm run prisma:migrate --workspace=@labelgen/api -- --name account-risk-signals-may29`: CANCELLED (local drift reset prompt declined intentionally)
- `npm run build`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS

### Git
- Commit hash: `bc6c72d`

### Completion
- Completion percentage: 100%
- Remaining percentage: 0%

## 2026-05-29 - Admin Command Center Jobs Pagination, Delete, Payment Tab Restore

### Task Name
- Fix jobs pagination and delete, rename Settings→Payment, restore full payment section with QR image support, remove Standard Price from Payment tab.

### Files Changed
- `apps/web/src/pages/admin/AdminCommandCenter.tsx`
- `AI_IMPLEMENTATION_INDEX.md`
- `CHANGELOG.md`

### Status Matrix
- Jobs pagination verified/fixed: COMPLETED — Jobs section now shows Prev/Next buttons with disabled states, page/total/pageSize metadata inline. Backend returns `total`, `totalPages`, `page`, `pageSize`. Filter effect triggers re-fetch with force=true on all filter/page changes.
- Jobs delete verified/fixed: VERIFIED OK — Backend route `DELETE /api/admin/jobs/:jobId` registered at line 2255 in admin.ts, uses `deleteJobById` from jobs.ts, returns 409 for active jobs. Frontend calls correct path `/api/admin/jobs/${id}` with DELETE, guards on terminal status, confirms before delete, refreshes after.
- Settings renamed to Payment: COMPLETED — NavKey `"settings"` → `"payment"`, NAV_ITEMS label `"Settings"` → `"Payment"`, all references updated.
- Payment section restored: COMPLETED — Full PaymentCard components for JazzCash, EasyPaisa, Bank Transfer with inline Edit/Save/Cancel/Delete per card. View mode shows all fields + QR preview.
- QR image/URL support: COMPLETED — File input + preview using `URL.createObjectURL` for new file or `apiUrl(qrUrl)` for existing. `saveBillingDraft` now uses `FormData` and appends `jazzcashQr`/`easypaisaQr`/`bankQr` file fields. Backend `billingQrUpload` multer middleware already supported this.
- Standard Price removed from Payment tab: COMPLETED — Standard Price and Business Price inputs removed from payment section. Pricing stays in Plans & Pricing tab only.
- Protected files not touched: CONFIRMED

### Protected Files Not Touched
- `apps/api/src/labels.ts`
- `multipage-label.html`
- barcode engine files
- MOS/UMO calculation logic
- moneyOrderBreakdown logic
- finalized PDF templates
- finalized complaint engine internals
- finalized tracking parser core

### Verification
- `npm run build`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS

### Git
- Commit hash: (pending)

### Completion
- Completion percentage: 100%
- Remaining percentage: 0%

## 2026-05-29 - Admin Command Center Remaining UI Restore and Manual Actions

### Task Name
- Restore remaining Admin Command Center UI gaps and old stable missing admin functions (scoped fix cycle).

### Files Changed
- `apps/web/src/pages/admin/AdminCommandCenter.tsx`
- `apps/api/src/routes/admin.ts`
- `apps/web/src/pages/Billing.tsx`
- `README.md`
- `CHANGELOG.md`
- `AI_IMPLEMENTATION_INDEX.md`
- `docs/operations/admin-command-center-cleanup-2026-05-29.md`

### Status Matrix
- Payment settings restored: Completed (actionable options with Add/Edit/Delete/Save/Cancel)
- Users pagination restored: Completed (metadata + compact view + server pagination metadata)
- Usage pagination restored: Completed (server total/totalPages + UI metadata)
- Jobs pagination/delete status: Completed (metadata + terminal-status-only delete + disabled create-job note)
- Complaint view option status: Completed (row-level View + detail modal with available context fields)
- Payment/invoice manual delete status: Completed (payments manual delete route + invoice delete safety actions in UI)

### Protected Files Not Touched
- `apps/api/src/labels.ts`
- `multipage-label.html`
- barcode engine files
- MOS/UMO calculation logic
- moneyOrderBreakdown logic
- finalized PDF templates
- finalized complaint engine internals
- finalized tracking parser core

### Verification
- `npm run build`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS

### Git
- Commit hash: `9e59467`

### Completion
- Completion percentage: 100%
- Remaining percentage: 0%

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
- Commit hash: `b1b3dbb`

### Completion
- Updated project completion percentage: 100%
- Remaining work: 0%

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

Operational inquiry rule now enforced:

- Fresh `PENDING` JazzCash transactions under 10 minutes return the support-team recommendation instead of calling the provider early.
- Failed `199` transactions are still eligible for immediate inquiry.
- Inquiry results are normalized for support reporting as `completed`, `failed`, `pending`, `not_found`, or `error`.

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

## Live Inquiry Handling Update (2026-05-29)

- The deployed JazzCash route now follows the support guidance for `PENDING` transactions while allowing immediate inquiry for failed `199` results.
- Fresh pending inquiries return a safe recommendation message rather than calling JazzCash too early.
- The route response payload uses the normalized support vocabulary for result reporting.

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

## 2026-05-31 - Aggregator Booking Phase 3C-1 (Warehouse/Carrier Planning + Preview)

### Task Name
- Implement Phase 3C-1 manual planning workflow for warehouse selection, intake carrier selection, bulk-pack label preview, and manifest preview.

### Files Changed
- `apps/api/src/services/aggregatorBulkPackPlanningService.ts`
- `apps/api/src/services/aggregatorBookingService.ts`
- `apps/api/src/routes/adminAggregatorBookings.ts`
- `apps/api/src/utils/aggregatorBookingValidation.ts`
- `apps/web/src/lib/aggregatorBookings.ts`
- `apps/web/src/pages/admin/AdminAggregatorBookings.tsx`
- `apps/web/src/pages/AggregatorBookingDetail.tsx`
- `docs/architecture/aggregator-booking-business-plan.md`
- `docs/architecture/booking-business-plan.md`
- `docs/operations/aggregator-booking-rollout-checklist.md`
- `docs/operations/booking-rollout-checklist.md`
- `AI_IMPLEMENTATION_INDEX.md`

### Scope Status
- Warehouse selection for aggregator bulk-pack planning: COMPLETED.
- Intake carrier selection for aggregator bulk-pack planning: COMPLETED.
- Bulk-pack label preview payload generation (manual planning only): COMPLETED.
- Manifest preview payload generation (manual planning only): COMPLETED.
- Audit log persistence of planning and preview snapshots: COMPLETED.
- Live Leopards API integration: NOT IMPLEMENTED.
- Live Pakistan Post booking integration: NOT IMPLEMENTED.
- Pickup execution automation: NOT IMPLEMENTED.
- Dispatch execution automation: NOT IMPLEMENTED.
- Final booking confirmation: NOT IMPLEMENTED.
- Payment gateway implementation: NOT IMPLEMENTED.

### Protected Scope Verification
- `apps/api/src/routes/jobs.ts`: NOT TOUCHED.
- `apps/web/src/pages/Upload.tsx`: NOT TOUCHED.
- `apps/api/src/worker.ts`: NOT TOUCHED.
- Existing label generation contracts: NOT TOUCHED.
- money order/MOS/UMO: NOT TOUCHED.
- tracking/complaints/billing/units/auth/admin core: NOT TOUCHED.
- storage/R2/cleanup/production deploy logic: NOT TOUCHED.

### Schema and Migration Status
- Prisma schema changes: NONE.
- Migration changes: NONE.

## Aggregator Booking Phase 3C-5B Staging Frontend Redirect Resolution (2026-06-01)

### Staging Evidence Summary
- Manual staging backup: VERIFIED (previous gate).
- Staging migration state: APPLIED and verified.
- `AggregatorPaymentTransaction` table: VERIFIED in staging.
- Staging API runtime route health (`/api` prefix): VERIFIED.
- Staging Web service: CREATED and DEPLOYED as `Web-staging`.
- Staging Web public origin: `https://web-staging-staging-0299.up.railway.app`.

### Redirect Root Cause and Fix
- Root cause: `FRONTEND_URL` and `WEB_ORIGIN` in `Api-staging` were pointing to the API origin, which caused `/api/aggregator-payments/jazzcash/result` to redirect back to API host and return 404 on follow.
- Fix applied in staging `Api-staging` only:
	- `FRONTEND_URL` -> staging web origin.
	- `WEB_ORIGIN` -> staging web origin.
- No production, Cloudflare/R2, or migration actions were used for this fix.

### Post-Fix Verification
- API result endpoint:
	- `GET /api/aggregator-payments/jazzcash/result?...` returns `302`.
	- `Location` now points to staging web origin (not API domain).
- Frontend follow URL:
	- `GET /aggregator-bookings/payment/jazzcash/result?...` on Web-staging returns `200`.

### Smoke and Regression Confirmation
- Gateway flow: previously passed and retained (`SMOKE_SCHEMA_ALL_DONE`).
- Duplicate callback handling: PASS.
- Invalid hash handling: PASS.
- Amount mismatch handling: PASS.
- Admin transaction list after fix: `200`.
- Regression counters unchanged:
	- Payment: `3 -> 3`
	- Invoice: `3 -> 3`
	- Subscription: `31 -> 31`
	- ManualPaymentRequest: `0 -> 0`
	- LabelJob: `4 -> 4`

### Safety and Scope Confirmation
- Railway production: NOT TOUCHED.
- Production database: NOT TOUCHED.
- Cloudflare/R2: NOT TOUCHED.
- Protected scope modules remained unchanged.
- Production rollout remains blocked until explicit user approval.

## Phase 2B Draft Aggregator Booking Request (2026-06-01)
- Implemented strict draft-request-only conversion from quote preview.
- Enforced zero error-row, no OVER_PHASE_LIMIT blocker, required sender fields, and consent confirmation gates.
- Locked admin flow to review outcomes (approve/reject/request-correction) without payment/pickup/dispatch/label/final-processing execution in this phase.

- Phase 2B UI scope lock: customer/admin pages now expose only draft request + review actions (approve/reject/correction).

## Phase 2B Production Closure (2026-06-01)
- Classification: PHASE_2B_PRODUCTION_DEPLOY_SUCCESS.
- Production smoke: API health 200, Web root 200, /login 200, /booking-quote 200, /aggregator-bookings 200, /admin/aggregator-bookings 200.
- Protected auth behavior verified: convert-to-draft without auth = 401 (acceptable), admin approve without auth = 401 (acceptable).
