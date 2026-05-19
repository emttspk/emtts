-- Add R2 synchronization tracking columns to LabelJob
ALTER TABLE "LabelJob" ADD COLUMN "labelsPdfSyncedAt" TIMESTAMP(3),
ADD COLUMN "moneyOrderPdfSyncedAt" TIMESTAMP(3);

-- Add indexes for efficient querying during cleanup
CREATE INDEX "LabelJob_labelsPdfSyncedAt_idx" ON "LabelJob"("labelsPdfSyncedAt");
CREATE INDEX "LabelJob_moneyOrderPdfSyncedAt_idx" ON "LabelJob"("moneyOrderPdfSyncedAt");

-- Add R2 synchronization tracking column to TrackingJob
ALTER TABLE "TrackingJob" ADD COLUMN "resultSyncedAt" TIMESTAMP(3);

-- Add index for efficient querying during cleanup
CREATE INDEX "TrackingJob_resultSyncedAt_idx" ON "TrackingJob"("resultSyncedAt");
