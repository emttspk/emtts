-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trackingId" TEXT,
    "complaintId" TEXT,
    "units" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    CONSTRAINT "RefundRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "mosId" TEXT,
    "articleType" TEXT,
    "bookingOffice" TEXT,
    "deliveryOffice" TEXT,
    "consigneeName" TEXT,
    "consigneeAddress" TEXT,
    "consigneePhone" TEXT,
    "lastScanDate" DATETIME,
    "currentStatus" TEXT,
    "returnReason" TEXT,
    "complaintEligible" BOOLEAN NOT NULL DEFAULT false,
    "complaintDate" DATETIME,
    "events" TEXT,
    "shipmentType" TEXT,
    "status" TEXT,
    "city" TEXT,
    "latestDate" TEXT,
    "latestTime" TEXT,
    "daysPassed" INTEGER,
    "complaintStatus" TEXT DEFAULT 'NOT_REQUIRED',
    "complaintText" TEXT,
    "rawJson" TEXT,
    "adminCode" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shipment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Shipment" ("adminCode", "city", "complaintStatus", "complaintText", "createdAt", "daysPassed", "id", "latestDate", "latestTime", "rawJson", "shipmentType", "status", "trackingNumber", "updatedAt", "userId") SELECT "adminCode", "city", "complaintStatus", "complaintText", "createdAt", "daysPassed", "id", "latestDate", "latestTime", "rawJson", "shipmentType", "status", "trackingNumber", "updatedAt", "userId" FROM "Shipment";
DROP TABLE "Shipment";
ALTER TABLE "new_Shipment" RENAME TO "Shipment";
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");
CREATE INDEX "Shipment_complaintStatus_idx" ON "Shipment"("complaintStatus");
CREATE INDEX "Shipment_userId_idx" ON "Shipment"("userId");
CREATE UNIQUE INDEX "Shipment_userId_trackingNumber_key" ON "Shipment"("userId", "trackingNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RefundRequest_userId_idx" ON "RefundRequest"("userId");

-- CreateIndex
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");
