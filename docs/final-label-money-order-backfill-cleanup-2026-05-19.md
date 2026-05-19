# Final Label/Money-Order Backfill and Storage Cleanup - 2026-05-19

## Execution Scope

- Completed one-go historical migration pass for local label and money-order PDFs.
- Uploaded only to normalized R2 keys:
  - `pdf/production/{jobId}/labels.pdf`
  - `pdf/production/{jobId}/money-orders.pdf`
- Preserved recent artifacts (7-day retention).
- Deleted only historical artifacts verified in R2.
- Preserved unsynced artifacts.

## Generated Manifests

- `forensic-artifacts/pdf-backfill-cleanup-2026-05-19T18-00-45-370Z-uploaded.json`
- `forensic-artifacts/pdf-backfill-cleanup-2026-05-19T18-00-45-370Z-already-existing.json`
- `forensic-artifacts/pdf-backfill-cleanup-2026-05-19T18-00-45-370Z-deleted.json`
- `forensic-artifacts/pdf-backfill-cleanup-2026-05-19T18-00-45-370Z-skipped.json`
- `forensic-artifacts/pdf-backfill-cleanup-2026-05-19T18-00-45-370Z-unsynced.json`
- `forensic-artifacts/pdf-backfill-cleanup-2026-05-19T18-00-45-370Z-failed.json`
- `forensic-artifacts/pdf-backfill-cleanup-2026-05-19T18-00-45-370Z-summary.json`

## Results

From the final one-go run summary:

- Local PDF candidates found: 1
- Historical candidates: 0
- Recent candidates preserved: 1

Backfill:

- Label PDFs uploaded in final pass: 0
- Label PDFs already existing in R2 (among historical candidates): 0
- Money-order PDFs uploaded in final pass: 0
- Money-order PDFs already existing in R2 (among historical candidates): 0

Cleanup:

- Deleted local artifacts in final pass: 0
- Skipped (recent preserved): 1
- Unsynced skipped: 0
- Failed: 0
- Reclaimed space in final pass: 0 bytes

## Retrieval Validation

- Final pass had no deleted PDF samples; retrieval check is trivially pass.
- Additional direct R2 retrieval checks were executed and succeeded:
  - Representative label object: readable
  - Representative money-order object: readable

## Remaining Local Artifact Storage

- Remaining local PDF artifact size: 130,694 bytes (0.12 MiB)
- Directory breakdown:
  - `apps/api/storage/outputs`: 44,710 bytes (2 files)
  - `apps/api/apps/api/storage/outputs`: 0 bytes (0 files)
  - `apps/api/storage/generated`: 85,984 bytes (1 file)

## Fallback/Operational Safety

- API routing still contains dual-provider download fallback wiring for labels/money-order retrieval paths.
- Cleanup safety guard in cron still checks sync markers before PDF deletion when dual-write is enabled.

## Caveat

- Local database remained unreachable in this workspace during this run (`localhost:5432` unavailable).
- Active-job exclusion used conservative fallback via recent-file preservation plus R2-verified deletion only.
