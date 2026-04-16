-- Align previously pushed schema with Prisma data model

-- Add missing TrackingJob table and indexes
CREATE TABLE IF NOT EXISTS "TrackingJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BULK_TRACK',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "originalFilename" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "uploadPath" TEXT,
    "resultPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrackingJob_userId_idx" ON "TrackingJob"("userId");
CREATE INDEX IF NOT EXISTS "TrackingJob_status_idx" ON "TrackingJob"("status");
CREATE INDEX IF NOT EXISTS "TrackingJob_kind_idx" ON "TrackingJob"("kind");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'TrackingJob_userId_fkey'
    ) THEN
        ALTER TABLE "TrackingJob"
            ADD CONSTRAINT "TrackingJob_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add missing Shipment constraints and indexes
CREATE INDEX IF NOT EXISTS "Shipment_status_idx" ON "Shipment"("status");
CREATE INDEX IF NOT EXISTS "Shipment_complaintStatus_idx" ON "Shipment"("complaintStatus");
CREATE INDEX IF NOT EXISTS "Shipment_userId_idx" ON "Shipment"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_userId_trackingNumber_key" ON "Shipment"("userId", "trackingNumber");

-- Align RefundRequest shape with current Prisma schema
ALTER TABLE "RefundRequest" DROP COLUMN IF EXISTS "complaintId";
ALTER TABLE "RefundRequest" DROP COLUMN IF EXISTS "approvedAt";
ALTER TABLE "RefundRequest" DROP COLUMN IF EXISTS "rejectedAt";
ALTER TABLE "RefundRequest" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "RefundRequest_userId_idx" ON "RefundRequest"("userId");
CREATE INDEX IF NOT EXISTS "RefundRequest_status_idx" ON "RefundRequest"("status");
