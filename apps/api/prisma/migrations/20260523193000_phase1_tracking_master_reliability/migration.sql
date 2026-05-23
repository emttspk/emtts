-- Phase 1: Tracking master reliability (additive only)
ALTER TABLE "LabelJob"
  ADD COLUMN IF NOT EXISTS "trackingMasterPath" TEXT,
  ADD COLUMN IF NOT EXISTS "deleteAfterAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retentionTierSnapshot" TEXT;

CREATE INDEX IF NOT EXISTS "LabelJob_deleteAfterAt_idx" ON "LabelJob"("deleteAfterAt");
