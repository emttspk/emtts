# Money Order Template Forensic Recovery

Date: 2026-05-08

## Objective

Run a forensic-only recovery loop for money-order template integrity and front-background rendering without refactoring unrelated logic.

## Phase 1: Git Forensic History

Target file:

- `apps/api/templates/mo-sample-two-records.html`

Findings:

- Full history shows add-only origin commit:
  - `b4ae475cd02be7b2c6de8d12f9b6716d13f124aa`
- Deletion-filter search (`--diff-filter=D`) returned no deletion commit.

Conclusion:

- No file deletion event exists in git history for the target template.

## Phase 2: Restore Decision

Restore criteria:

- Restore only if missing or modified from original commit blob.

Blob verification:

- `ORIG_BLOB=6aa3e5533dcbf103e0e029f8e0a1a22722b0fed7`
- `CURR_BLOB=6aa3e5533dcbf103e0e029f8e0a1a22722b0fed7`
- Result: `MATCH_EXACT_ORIGINAL`

Conclusion:

- Restore not required. File is already exact original content at original path.

## Phase 3: Render-Chain Trace and Repair

Chain audited:

- Worker PDF path:
  - `apps/api/src/worker.ts`
  - `loadMoneyOrderBackgrounds()` -> `moneyOrderHtml(..., { backgrounds })`
- Template render path:
  - `apps/api/src/templates/labels.ts`
  - `resolveBenchmarkMoTemplatePath()` -> `loadBenchmarkMoHtml()`
  - `applyFrontBackgroundToBenchmarkHtml(...)` for first two front `.bg` blocks
- Admin preview path:
  - `apps/api/src/routes/adminTemplates.ts`

Gap found:

- Admin preview route rendered `moneyOrderHtml(...)` without loading active backgrounds, while worker PDF route did.

Forensic repair applied:

- Updated `apps/api/src/routes/adminTemplates.ts`:
  - Imported `loadMoneyOrderBackgrounds`.
  - Loaded backgrounds in preview handler and passed them to `moneyOrderHtml(...)`.

## Phase 4: Template Structural Integrity

Template marker audit:

- `sheet_count=2`
- `front_half_count=2`
- `back_half_count=2`
- `bg_div_count=4`

Interpretation:

- Template structure is complete for duplex front/back generation.

## Phase 5: Visual/PDF Verification Evidence

Live generation proof:

- Forensic runner: `temp-money-order-forensic-recovery.mjs`
- Report output: `temp-money-order-forensic-recovery-report.json`
- Generated files:
  - `forensic-artifacts/35664778-a105-4a11-a83d-28b852107d56-labels.pdf`
  - `forensic-artifacts/35664778-a105-4a11-a83d-28b852107d56-money-orders.pdf`

Job result:

- `jobId=35664778-a105-4a11-a83d-28b852107d56`
- `status=COMPLETED`

PDF evidence metrics:

- Labels PDF: `51440` bytes, image tokens: `1`
- Money-orders PDF: `358443` bytes, image tokens: `5`

Note:

- Money-order PDF contains embedded image resources consistent with background/barcode rendering.

## Phase 6: Filename Exemption Regression

Exempt filename test:

- Filename: `LCS 15-13-11-2024.xls`
- Upload #1: `200`, job `07b15b54-a61e-47c9-8440-9f1089094d7c`
- Upload #2: `200`, job `6e84e02a-d5c0-4a57-becb-06823862208d`
- Expected outcome: second upload accepted (bypass duplicate block)
- Result: PASS

Non-exempt duplicate test:

- Filename: `forensic-non-exempt-1778279244700.csv`
- Upload #1: `200`, job `49c80933-bd1e-4823-8228-8d03c87dfd42`
- Upload #2: `409`, message `This file name already exists.`
- Expected outcome: second upload blocked
- Result: PASS

Admin exemption list mutation check:

- `GET /api/admin/settings` with current token returned `403 Forbidden`
- Interpretation: admin-only endpoint; dynamic list mutation not testable with non-admin token in this run.

## Phase 7: Validation Loop

- `npm install`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm run dev`: PASS
- `npm run test`: PASS (`@labelgen/api smoke:railway`)

## Phase 8: Railway Deploy and Logs

Deploy commands:

- `railway up --service Api --detach`
  - Build Logs id: `aa6f172c-b15b-452b-8938-c31ceb1f0ebd`
- `railway up --service Web --detach`
  - Build Logs id: `db9a46ab-435c-4d86-886d-29d1a2af3fb2`

Post-deploy log summary:

- API logs: worker processed jobs successfully, duplicate checks enforced as expected, download endpoints served.
- Web logs: service started and served app/assets with `200` status.

## Final Forensic Outcome

- Template deletion hypothesis: NOT SUPPORTED by git history.
- Template restore action: NOT REQUIRED (already exact original blob).
- Front-background render-chain mismatch: IDENTIFIED in preview path and REPAIRED.
- Regression safety checks: PASS for exempt and non-exempt duplicate rules.
- Validation + deployment: PASS.
