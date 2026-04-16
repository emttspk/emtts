-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyName" TEXT,
    "address" TEXT,
    "contactNumber" TEXT,
    "originCity" TEXT,
    "extraLabelCredits" INTEGER NOT NULL DEFAULT 0,
    "extraTrackingCredits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "monthlyLabelLimit" INTEGER NOT NULL,
    "monthlyTrackingLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageMonthly" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "labelsGenerated" INTEGER NOT NULL DEFAULT 0,
    "labelsQueued" INTEGER NOT NULL DEFAULT 0,
    "trackingGenerated" INTEGER NOT NULL DEFAULT 0,
    "trackingQueued" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "unitCount" INTEGER NOT NULL DEFAULT 0,
    "includeMoneyOrders" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "uploadPath" TEXT NOT NULL,
    "labelsPdfPath" TEXT,
    "moneyOrderPdfPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "mosId" TEXT,
    "articleType" TEXT,
    "bookingOffice" TEXT,
    "deliveryOffice" TEXT,
    "consigneeName" TEXT,
    "consigneeAddress" TEXT,
    "consigneePhone" TEXT,
    "lastScanDate" TIMESTAMP(3),
    "currentStatus" TEXT,
    "returnReason" TEXT,
    "complaintEligible" BOOLEAN NOT NULL DEFAULT false,
    "complaintDate" TIMESTAMP(3),
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
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackingId" TEXT,
    "complaintId" TEXT,
    "units" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageMonthly_userId_month_key" ON "UsageMonthly"("userId", "month");

-- CreateIndex
CREATE INDEX "UsageMonthly_month_idx" ON "UsageMonthly"("month");

-- CreateIndex
CREATE INDEX "LabelJob_userId_idx" ON "LabelJob"("userId");

-- CreateIndex
CREATE INDEX "LabelJob_status_idx" ON "LabelJob"("status");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageMonthly" ADD CONSTRAINT "UsageMonthly_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelJob" ADD CONSTRAINT "LabelJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;