-- Additive recovery migration for ComplaintQueue
-- Creates the missing table required by Prisma schema without touching existing data.

CREATE TABLE "ComplaintQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "complaintStatus" TEXT NOT NULL DEFAULT 'queued',
    "complaintId" TEXT,
    "dueDate" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "browserSessionJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ComplaintQueue_userId_idx" ON "ComplaintQueue"("userId");
CREATE INDEX "ComplaintQueue_trackingId_idx" ON "ComplaintQueue"("trackingId");
CREATE INDEX "ComplaintQueue_complaintStatus_idx" ON "ComplaintQueue"("complaintStatus");
CREATE INDEX "ComplaintQueue_nextRetryAt_idx" ON "ComplaintQueue"("nextRetryAt");

ALTER TABLE "ComplaintQueue"
  ADD CONSTRAINT "ComplaintQueue_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;