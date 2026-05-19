# Tracking Backfill and Historical Cleanup - 2026-05-19

## Scope

- Backfill historical tracking JSON artifacts to Cloudflare R2 normalized keys.
- Run safe historical local cleanup for labels PDFs, money-order PDFs, and tracking JSONs.
- Preserve recent and unsynced artifacts.

## Preconditions

- R2 authentication repaired and validated with dedicated `r2` profile in earlier step.
- Database was not reachable from local workspace (`localhost:5432` unavailable), so active-job exclusion used conservative fallback:
  - keep recent artifacts (last 7 days)
  - only delete files whose corresponding R2 object exists

## Backfill Action

Normalized key format used:

- `json/production/{jobId}/tracking-result.json`

Result:

- Historical candidates: 132
- Uploaded during run: 5
- Already present in R2: 127
- Failed: 0

Manifest:

- `forensic-artifacts/tracking-backfill-manifest.json`

## Cleanup Action

Deletion policy:

- Older than 7 days
- R2 object existence verified before delete
- Unsynced artifacts skipped

Result:

- Deleted tracking JSON files: 132
- Deleted labels PDFs: 0
- Deleted money-order PDFs: 0
- Skipped as unsynced: 65
- Reclaimed local space: 3,413,273 bytes (3.26 MiB)

Manifest:

- `forensic-artifacts/historical-cleanup-manifest.json`

## Post-Cleanup Validation

- Representative deleted tracking sample confirmed absent locally.
- Corresponding R2 object confirmed readable.
- Spot-check summary from run:
  - Deleted sample keys checked: 10
  - R2 readable after delete: 10
  - Validation pass: true

## Remaining Local Storage (artifact dirs)

- `apps/api/storage/outputs`: 38 files, 10,332,783 bytes
- `apps/api/apps/api/storage/outputs`: 29 files, 7,897,549 bytes
- `apps/api/storage/generated`: 1 file, 85,984 bytes
- Total: 68 files, 18,316,316 bytes (17.47 MiB)

## Risk Notes

- Local DB unavailability prevented direct active-job DB checks during this run.
- Conservative retention + R2 existence checks were used to avoid unsafe deletion.
- A follow-up run with reachable DB is recommended to enforce status-based active-job exclusion directly.
