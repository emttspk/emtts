-- Create MoneyOrder model for money order tracking with global uniqueness on mosNumber
-- Phase 1: Add MOS unique constraint at model level

CREATE TABLE "MoneyOrder" (
    "seq" BIGSERIAL NOT NULL PRIMARY KEY,
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "mosNumber" TEXT NOT NULL UNIQUE,
    "segmentIndex" INTEGER NOT NULL DEFAULT 0,
    "trackingId" TEXT,
    "issueDate" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoneyOrder_userId_trackingNumber_segmentIndex_key" UNIQUE("userId", "trackingNumber", "segmentIndex")
);

-- Create indexes for efficient querying
CREATE INDEX "MoneyOrder_userId_idx" ON "MoneyOrder"("userId");
CREATE INDEX "MoneyOrder_trackingNumber_idx" ON "MoneyOrder"("trackingNumber");
CREATE INDEX "MoneyOrder_trackingId_idx" ON "MoneyOrder"("trackingId");
CREATE INDEX "MoneyOrder_issueDate_idx" ON "MoneyOrder"("issueDate");
