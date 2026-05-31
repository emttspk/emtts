-- CreateTable
CREATE TABLE "AggregatorPaymentTransaction" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "orderRef" TEXT NOT NULL,
    "gatewayTxnRef" TEXT,
    "status" TEXT NOT NULL,
    "requestPayloadJson" JSONB,
    "callbackPayloadJson" JSONB,
    "statusInquiryJson" JSONB,
    "secureHashVerified" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "callbackHash" TEXT,
    "failureReason" TEXT,
    "reconciliationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregatorPaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AggregatorPaymentTransaction_orderRef_key" ON "AggregatorPaymentTransaction"("orderRef");

-- CreateIndex
CREATE UNIQUE INDEX "AggregatorPaymentTransaction_idempotencyKey_key" ON "AggregatorPaymentTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AggregatorPaymentTransaction_bookingId_status_idx" ON "AggregatorPaymentTransaction"("bookingId", "status");

-- CreateIndex
CREATE INDEX "AggregatorPaymentTransaction_gatewayTxnRef_idx" ON "AggregatorPaymentTransaction"("gatewayTxnRef");

-- CreateIndex
CREATE INDEX "AggregatorPaymentTransaction_callbackHash_idx" ON "AggregatorPaymentTransaction"("callbackHash");

-- CreateIndex
CREATE INDEX "AggregatorPaymentTransaction_createdAt_idx" ON "AggregatorPaymentTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "AggregatorPaymentTransaction" ADD CONSTRAINT "AggregatorPaymentTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "AggregatorBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatorPaymentTransaction" ADD CONSTRAINT "AggregatorPaymentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
