# Strict Execution Verification - 2026-05-22

## Scope
This report documents strict execution validation after enforcing hard contradictions and worker strict row-failure behavior.

## Code Changes Verified
- `apps/api/src/validation/trackingId.ts`
  - VPL/VPP/COD with collect amount <= 0 now hard-fails (`severity: error`).
- `apps/api/src/services/labelDocument.ts`
  - Added `strictValidation` mode that aggregates row errors and throws.
- `apps/api/src/worker.ts`
  - Worker runs `prepareLabelOrders(..., strictValidation: true)`.
  - Worker aborts batch on skipped/invalid rows (no partial continuation).
- `scripts/phase-3-verify.mjs`
  - Updated contradiction expectations to hard-fail for payable+zero.
  - Added universal label payment-panel visibility checks.
- `scripts/strict-runtime-verify.mjs`
  - New strict runtime matrix and upload-core verification script with evidence output.

## Executed Commands (Fresh)
1. `npm run lint` - PASS
2. `npm run typecheck` - PASS
3. `npm run build` - PASS
4. `npm run phase-3-verify` - PASS
5. `npx tsx scripts/strict-runtime-verify.mjs` - PASS

## Evidence Artifacts
- `forensic-artifacts/strict-runtime-verify-2026-05-22T15-37-55-417Z.json`
  - `failures: 0`
  - `renderChecks: 28`
  - `collectRuleChecks: 7`
  - `uploadCoreChecks: 5`
  - `parRuleChecks: 3`

## Runtime Assertions Covered
- Collect contradiction hard-fail matrix:
  - VPL/VPP/COD + collect=0 -> hard error.
  - IRL/UMS/RGL/PAR + collect>0 -> hard error.
- Label render matrix:
  - 7 shipment services x 4 print modes rendered.
  - unresolved-token scan performed for each output.
  - PDF generation validated for each output.
- Universal panel behavior:
  - Payment summary shown only for value-payable services.
  - Hidden for IRL/UMS/RGL/PAR.
- Upload-core runtime paths (executed through parser + strict label prep):
  - same shipment manual file
  - mixed shipment file
  - missing tracking IDs (hard fail with row errors)
  - hybrid auto+mix processing with allocated tracking IDs
  - PAR track parcel path
- PAR and recommendation constraints:
  - PAR not money-order eligible.
  - VPL remains money-order eligible.
- Duplicate bypass identity normalization:
  - default exemption filename normalization validated.

## Blockers / Gaps
- Live HTTP `/jobs/upload` integration run was blocked locally because API startup aborted before route availability due unreachable local PostgreSQL (`localhost:5432`).
- Because the strict gate required real upload endpoint execution, deploy and commit/push were not executed.

## Strict Readiness
- Current strict execution readiness: **84%**
- Rationale:
  - All static/build/runtime matrix checks passed.
  - Remaining gap is environment-gated HTTP upload endpoint execution (DB reachability), which blocks full 100% gate and deploy action.

## Required To Reach 100%
1. Restore local PostgreSQL reachability for API startup.
2. Execute live authenticated `/jobs/upload` endpoint scenarios (same/mixed/missing/hybrid/PAR/duplicate-bypass) and capture logs/artifacts.
3. If all pass, proceed with deploy and then commit/push.
