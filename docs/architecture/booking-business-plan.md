# ePost Aggregator Booking Continuity Plan

## Purpose
This document is the continuity authority for the Aggregator Booking module so future sessions can resume safely when work is interrupted mid-implementation.

It defines:
- strict project boundaries,
- protected scope,
- phase-by-phase scope gates,
- API/UI calculator contract,
- test and Git safety protocol,
- break-resume instructions.

## Current Phase Marker
Phase 3C-2: Hub receiving verification and mismatch handling
Status: Implemented (manual verification only)
Next task: Phase 3C-3 monitored operational rollout and readiness criteria

## Phase Intent
The Aggregator Booking initiative is intentionally incremental.

- Phase 1: quote-only postage estimation and diagnostics.
- Phase 2: controlled quote-to-draft workflow (no payment execution).
- Phase 3: post-draft operational workflow hardening and controlled rollout.

At all times, existing customer upload and generation production paths must remain stable and unchanged.

## Mandatory Project Boundary Safety

### Git Boundary
- Work only inside the Label Generator monorepo root.
- Confirm remote is the official ePost repository before edits.
- Confirm branch is correct before edits and before push.
- Never push unrelated modifications.
- Never stage secrets, env files, or private credentials.

### Railway Boundary
- Do not use Railway for this continuity documentation task.
- No deploy, no variable mutation, no service restart, no migration run.

### Cloudflare/R2 Boundary
- Do not modify R2 logic, R2 routing, or storage behavior.
- No bucket/object operations for this task.

## Protected Scope (Do Not Touch)
The following areas are out of scope unless explicit approval is provided in a dedicated task:

- Existing upload generation flow
- `Upload.tsx`
- `jobs.ts` generation behavior
- `worker.ts`
- PDF templates
- money order, MOS, UMO
- tracking
- complaints
- billing and units
- auth and admin
- storage and R2
- cleanup flags
- production deploy logic

Also forbidden in this continuity scope:
- new migrations,
- new DB tables,
- service charges,
- handling charges,
- pickup charges,
- profit margin,
- payment flow,
- live booking execution,
- courier API integration,
- discounts.

## Phase Boundaries

### Phase 1 Boundary (Booking Quote Only)
Allowed:
- parse CSV/XLSX/JSON quote rows,
- calculate per-article postage estimate,
- return row warnings/errors,
- return quote summary totals,
- present quote UI only.

Not allowed:
- booking creation,
- payment initiation,
- label generation,
- money-order generation,
- operational intake state transitions.

### Phase 2 Boundary

#### Phase 2A Boundary (Recommendation + Request Preview Only)
Allowed:
- deterministic recommendation output from quote snapshot,
- customer option selection preview,
- request-preview object generation in UI state only,
- explicit customer safety notices.

Strictly not allowed:
- DB writes or persisted draft creation,
- payment execution,
- fulfillment provider booking,
- pickup execution,
- label/MO generation side effects.

#### Phase 2B Boundary (Future, Approval Required)
Allowed only after explicit approval:
- controlled conversion of a valid quote snapshot into a persisted booking draft state,
- sender/intake metadata capture,
- audit-safe state transition record.

Still not allowed:
- payment execution,
- fulfillment provider booking,
- label/MO generation side effects.

Phase 2B implementation guardrails:
- persisted create requires explicit customer notice acceptance,
- persisted create stores request-only flags and recommendation snapshot,
- persisted create remains `BOOKING_DRAFT`,
- no auto-operational action at create time (no pickup/dispatch/live booking),
- no payment initiation at create time.

### Phase 3 Boundary (Operational Continuity)
Allowed only after explicit approval:
- admin-review hardening,
- payment placeholder lifecycle hardening,
- operational runbook controls,
- phased rollout gates with rollback steps.

Still constrained:
- no unapproved production-impacting flow rewrites,
- no protected-scope module rewiring.

Phase 3A completed scope:
- admin decision rationale validation hardening,
- admin manual-only approval semantics,
- customer status/timeline wording clarity,
- audit action/rationale clarity.

Phase 3A blocked scope:
- live payment collection,
- pickup/dispatch execution,
- external courier/Pakistan Post API booking,
- final booking confirmation semantics.

Phase 3C-1 implemented scope:
- admin warehouse selection and intake carrier selection for bundle movement planning,
- preview-only bulk-pack label payload generation,
- preview-only manifest payload generation,
- audit-log persistence for planning metadata and preview snapshots,
- customer visibility of selected warehouse instructions (if available).

Phase 3C-1 blocked scope:
- live Leopards API,
- live Pakistan Post booking API,
- pickup execution,
- dispatch execution,
- final booking confirmation,
- schema/migration changes.

Phase 3C-2 implemented scope:
- admin manual hub receiving confirmation,
- expected vs received manifest verification,
- mismatch recording with reason and admin note,
- manual exception note trail,
- manual exception resolution,
- customer read-only non-final receiving/exception visibility,
- additive audit-log JSON persistence with derived operational state.

Phase 3C-2 blocked scope:
- live Leopards API,
- live Pakistan Post booking API,
- pickup execution,
- dispatch execution,
- final booking confirmation,
- payment collection,
- service/handling/profit/discount logic,
- schema/migration changes.

## Calculator Contract

### Inputs
Per row, calculator expects:
- `serviceCode`: one of `UMS`, `COD`, `RGL`, `VPL`, `VPP`, `IRL`, `PAR`
- `weightGrams`: positive numeric value
- `senderCity`: optional for non-UMS; used for UMS/COD route normalization
- `receiverCity`: optional for non-UMS; used for UMS/COD route normalization
- `articleCategory`: optional category override
- `isTextbook`: optional flag to map to textbook category

### Row Output
Per row result includes:
- `articleCategory`
- `postalProduct`
- `weightGrams`
- `chargeableWeightGrams`
- `postageAmount`
- `matchedSlab`
- `warnings[]`
- `errors[]`

Compatibility totals may still be populated for downstream non-Phase-1 consumers, but Phase 1 business output is postage-first.

## Quote Summary Output
The quote response summary must include:
- `totalArticles`
- `totalActualWeightGrams`
- `totalChargeableWeightGrams`
- `totalPostageAmount`
- `byCategory[]` with grouped totals
- `byProduct[]` with grouped totals
- `perArticlePostageBreakdown[]`
- `warningRows[]`
- `errorRows[]`

Response mode must remain quote-only.

## Validation Rules
- Reject missing rows.
- Reject missing weight with row-level error.
- Reject invalid/zero weight with row-level error.
- Reject negative weight with row-level error.
- Reject unsupported service code with row-level error.
- Keep textbook gap strict (above 50g and not exceeding 250g unsupported).
- For UMS/COD:
	- normalize sender/receiver city,
	- local tariff only when local is confidently matched,
	- otherwise city-to-city tariff with warning.
- Never invent unavailable slabs.
- Never infer forbidden fee components.

## Phase 2B Smoke Status
- Schema/service smoke passed.
- Local DB drift was repaired safely with a local-only Prisma resolve and deploy.
- The local database now contains the required aggregator tables.
- DB-backed Phase 2B smoke passed with `BOOKING_DRAFT` creation and customer/admin visibility.
- No Railway, Cloudflare/R2, or production systems were touched during repair or smoke.

## Testing Rules
For continuity sessions touching quote logic, validate in this order:

1. focused unit behavior (calculator and summary),
2. API route behavior (JSON + file upload),
3. UI quote behavior (render + diagnostics visibility),
4. non-regression checks for protected scope.

Documentation-only updates do not require build, but must still run `git status --short` and keep diff clean to intended docs.

## Git Push Safety Rules
Before commit/push:

1. confirm repo identity,
2. confirm branch,
3. run `git status --short`,
4. verify only intended files are modified,
5. verify no `.env`, key, token, secret, credential, or private files are staged,
6. stage only explicit files,
7. commit with scope-accurate message,
8. push only when all above are true.

Do not push if unrelated files appear.

## Break-and-Resume Continuity Protocol
If work stops mid-session, next session must follow these steps exactly:

1. Re-run mandatory preflight:
	 - directory,
	 - remote,
	 - branch,
	 - git status,
	 - staged-file secret check.
2. Read this file first.
3. Read `AI_IMPLEMENTATION_INDEX.md` latest entries.
4. Read `docs/architecture/postage-rates.md` for current calculator contract.
5. Read `docs/operations/booking-rollout-checklist.md` for operational verification sequence.
6. Continue only within current phase boundary.
7. If uncertain about scope, stop and request clarification rather than editing protected modules.

## Continuation Checklist for Next Session
- Confirm Phase marker still accurate.
- Proceed only to Phase 3 hardening when explicitly approved.
- Keep all future work away from protected scope modules unless a dedicated task grants approval.

## Cross-Reference
- Postage detail rules: `docs/architecture/postage-rates.md`
- Rollout execution checklist: `docs/operations/booking-rollout-checklist.md`
