-- Phase C: safe local upload cleanup metadata (additive only)
-- Tracks local deletion lifecycle for upload source files after confirmed R2 sync.

ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadLocalCleanupStatus" TEXT;
ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadLocalCleanupAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadLocalCleanupLastError" TEXT;
ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadLocalCleanupNextRetryAt" TIMESTAMP(3);
ALTER TABLE "LabelJob" ADD COLUMN IF NOT EXISTS "uploadLocalDeletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "LabelJob_uploadLocalCleanupStatus_uploadLocalCleanupNextRetryAt_idx"
  ON "LabelJob" ("uploadLocalCleanupStatus", "uploadLocalCleanupNextRetryAt");

CREATE INDEX IF NOT EXISTS "LabelJob_uploadLocalDeletedAt_idx"
  ON "LabelJob" ("uploadLocalDeletedAt");
