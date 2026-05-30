-- Phase B: Upload source file R2 durability fields (additive only)
-- Adds R2 backup tracking metadata to LabelJob.
-- Local uploadPath is unchanged and remains backward-compatible.
-- No destructive changes. No data migration required.

ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadObjectKey"   TEXT;
ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadBucket"      TEXT;
ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadSyncedAt"    TIMESTAMP(3);
ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadSyncStatus"  TEXT;
ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadSizeBytes"   INTEGER;
ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadOriginalExt" TEXT;

-- Index for backfill/retry scan queries
CREATE INDEX IF NOT EXISTS "LabelJob_uploadSyncStatus_uploadSyncedAt_idx"
  ON "LabelJob" ("uploadSyncStatus", "uploadSyncedAt");
