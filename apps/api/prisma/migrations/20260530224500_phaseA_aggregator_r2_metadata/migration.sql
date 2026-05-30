-- Phase A: Aggregator quote/document metadata for R2 permanent storage rollout.
-- Additive-only migration; no destructive or behavior-changing operations.

ALTER TABLE "AggregatorQuote"
ADD COLUMN "sourceFileKey" TEXT,
ADD COLUMN "sourceObjectKey" TEXT,
ADD COLUMN "sourceBucket" TEXT,
ADD COLUMN "sourceSizeBytes" INTEGER,
ADD COLUMN "sourceContentType" TEXT,
ADD COLUMN "sourceChecksum" TEXT,
ADD COLUMN "sourceOriginalFilename" TEXT,
ADD COLUMN "sourceUploadedAt" TIMESTAMP(3);

ALTER TABLE "AggregatorBookingDocument"
ADD COLUMN "bucket" TEXT,
ADD COLUMN "objectKey" TEXT,
ADD COLUMN "sizeBytes" INTEGER,
ADD COLUMN "contentType" TEXT,
ADD COLUMN "checksum" TEXT,
ADD COLUMN "uploadStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "localTempPath" TEXT,
ADD COLUMN "localCleanupStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "localCleanupAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "localCleanupLastError" TEXT,
ADD COLUMN "localCleanupNextRetryAt" TIMESTAMP(3);

CREATE INDEX "AggregatorBookingDocument_uploadStatus_createdAt_idx"
ON "AggregatorBookingDocument"("uploadStatus", "createdAt");

CREATE INDEX "AggregatorBookingDocument_localCleanupStatus_localCleanupNextRetryAt_idx"
ON "AggregatorBookingDocument"("localCleanupStatus", "localCleanupNextRetryAt");
