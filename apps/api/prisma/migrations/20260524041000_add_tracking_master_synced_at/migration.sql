ALTER TABLE "LabelJob"
ADD COLUMN IF NOT EXISTS "trackingMasterSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "LabelJob_trackingMasterSyncedAt_idx"
ON "LabelJob"("trackingMasterSyncedAt");
