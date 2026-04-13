-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "status" TEXT,
    "city" TEXT,
    "latestDate" TEXT,
    "latestTime" TEXT,
    "daysPassed" INTEGER,
    "complaintStatus" TEXT DEFAULT 'NOT_REQUIRED',
    "complaintText" TEXT,
    "rawJson" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shipment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrackingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BULK_TRACK',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "originalFilename" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "uploadPath" TEXT,
    "resultPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrackingJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_complaintStatus_idx" ON "Shipment"("complaintStatus");

-- CreateIndex
CREATE INDEX "Shipment_userId_idx" ON "Shipment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_userId_trackingNumber_key" ON "Shipment"("userId", "trackingNumber");

-- CreateIndex
CREATE INDEX "TrackingJob_userId_idx" ON "TrackingJob"("userId");

-- CreateIndex
CREATE INDEX "TrackingJob_status_idx" ON "TrackingJob"("status");

-- CreateIndex
CREATE INDEX "TrackingJob_kind_idx" ON "TrackingJob"("kind");
