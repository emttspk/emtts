-- CreateTable
CREATE TABLE "ManualPaymentRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "screenshotPath" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualPaymentRequest_userId_status_idx" ON "ManualPaymentRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "ManualPaymentRequest_planId_idx" ON "ManualPaymentRequest"("planId");

-- CreateIndex
CREATE INDEX "ManualPaymentRequest_status_idx" ON "ManualPaymentRequest"("status");

-- AddForeignKey
ALTER TABLE "ManualPaymentRequest" ADD CONSTRAINT "ManualPaymentRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentRequest" ADD CONSTRAINT "ManualPaymentRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
