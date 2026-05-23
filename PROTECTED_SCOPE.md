# Protected Scope Policy

## Protected Files And Systems
The following systems are release-protected and must not be modified without explicit approval:

- labels.ts geometry
- universal 9x4 render structure
- box shipment templates
- barcode rendering engine
- MOS/UMO calculations
- premium label layout
- benchmark render snapshots
- protected render paths
- finalized workflow logic

## Benchmark References
Use these baselines for regression comparison before any approved change:

- test-results/final-stabilization/
- forensic-artifacts/final-ui-polish/restored/
- forensic-artifacts/final-ui-polish/stabilization/

## Modification Rules
1. No direct edits in protected render/template files during stabilization unless explicitly approved.
2. All non-protected changes must be isolated and reviewable in minimal commits.
3. Generated artifacts (PDF/HTML/cache outputs) must not be committed.
4. Any proposed protected-file change requires a written impact note and benchmark delta report.

## Approval Rules
1. Protected-file modifications require explicit written approval from repository owner.
2. Approval must specify exact files and acceptable change scope.
3. Unapproved edits must be reverted before merge.

## Regression Policy
1. Mandatory pre-merge checks:
   - npm run lint
   - npm run typecheck
   - npm run build
   - npm run strict-runtime-verify
2. Verify protected snapshots remain unchanged unless approval is documented.
3. If regression risk appears in protected paths, stop implementation and produce audit-only report.
