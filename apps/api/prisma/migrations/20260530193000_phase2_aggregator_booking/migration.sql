-- CreateTable
CREATE TABLE "AggregatorQuote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quoteVersion" TEXT NOT NULL,
    "quoteInputJson" JSONB NOT NULL,
    "quoteResultJson" JSONB NOT NULL,
    "rateCardVersionSetJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregatorQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatorBooking" (
    "id" TEXT NOT NULL,
    "bookingNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aggregatorQuoteId" TEXT NOT NULL,
    "quoteSnapshotJson" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "intakeMethod" TEXT NOT NULL,
    "hubCity" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "senderAddress" TEXT NOT NULL,
    "senderCity" TEXT NOT NULL,
    "specialInstructions" TEXT,
    "totalArticles" INTEGER NOT NULL,
    "totalActualWeightGrams" INTEGER NOT NULL,
    "totalChargeableWeightGrams" INTEGER NOT NULL,
    "totalBasePostage" INTEGER NOT NULL,
    "totalRegistrationFee" INTEGER NOT NULL,
    "totalValuePayableFee" INTEGER NOT NULL,
    "totalInsuranceFee" INTEGER NOT NULL,
    "totalOfficialPostalCharge" INTEGER NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "adminReviewStatus" TEXT NOT NULL,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,

    CONSTRAINT "AggregatorBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatorBookingItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "rowNo" INTEGER NOT NULL,
    "receiverName" TEXT,
    "receiverPhone" TEXT,
    "receiverAddress" TEXT,
    "receiverCity" TEXT,
    "serviceCode" TEXT NOT NULL,
    "articleCategory" TEXT NOT NULL,
    "weightGrams" INTEGER,
    "chargeableWeightGrams" INTEGER,
    "basePostage" INTEGER NOT NULL,
    "registrationFee" INTEGER NOT NULL,
    "valuePayableFee" INTEGER NOT NULL,
    "insuranceFee" INTEGER NOT NULL,
    "totalOfficialPostalCharge" INTEGER NOT NULL,
    "missingComponentsJson" JSONB NOT NULL,
    "warningsJson" JSONB NOT NULL,
    "errorsJson" JSONB NOT NULL,
    "futurePakistanPostTrackingNo" TEXT,

    CONSTRAINT "AggregatorBookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatorBookingStatusEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reasonCode" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregatorBookingStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatorBookingAuditLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetField" TEXT,
    "oldValueJson" JSONB,
    "newValueJson" JSONB,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregatorBookingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatorBookingDocument" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregatorBookingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatorPaymentPlaceholder" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "placeholderMethod" TEXT,
    "placeholderReference" TEXT,
    "placeholderAmount" INTEGER,
    "placeholderCurrency" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregatorPaymentPlaceholder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AggregatorQuote_userId_createdAt_idx" ON "AggregatorQuote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AggregatorQuote_expiresAt_idx" ON "AggregatorQuote"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AggregatorBooking_bookingNo_key" ON "AggregatorBooking"("bookingNo");

-- CreateIndex
CREATE INDEX "AggregatorBooking_userId_createdAt_idx" ON "AggregatorBooking"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AggregatorBooking_status_createdAt_idx" ON "AggregatorBooking"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AggregatorBooking_adminReviewStatus_createdAt_idx" ON "AggregatorBooking"("adminReviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "AggregatorBooking_intakeMethod_idx" ON "AggregatorBooking"("intakeMethod");

-- CreateIndex
CREATE INDEX "AggregatorBooking_hubCity_idx" ON "AggregatorBooking"("hubCity");

-- CreateIndex
CREATE INDEX "AggregatorBookingItem_bookingId_rowNo_idx" ON "AggregatorBookingItem"("bookingId", "rowNo");

-- CreateIndex
CREATE INDEX "AggregatorBookingStatusEvent_bookingId_createdAt_idx" ON "AggregatorBookingStatusEvent"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "AggregatorBookingStatusEvent_toStatus_createdAt_idx" ON "AggregatorBookingStatusEvent"("toStatus", "createdAt");

-- CreateIndex
CREATE INDEX "AggregatorBookingAuditLog_bookingId_createdAt_idx" ON "AggregatorBookingAuditLog"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "AggregatorBookingAuditLog_action_createdAt_idx" ON "AggregatorBookingAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AggregatorBookingDocument_bookingId_createdAt_idx" ON "AggregatorBookingDocument"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AggregatorPaymentPlaceholder_bookingId_key" ON "AggregatorPaymentPlaceholder"("bookingId");

-- CreateIndex
CREATE INDEX "AggregatorPaymentPlaceholder_paymentStatus_createdAt_idx" ON "AggregatorPaymentPlaceholder"("paymentStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "AggregatorQuote" ADD CONSTRAINT "AggregatorQuote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatorBooking" ADD CONSTRAINT "AggregatorBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatorBooking" ADD CONSTRAINT "AggregatorBooking_aggregatorQuoteId_fkey" FOREIGN KEY ("aggregatorQuoteId") REFERENCES "AggregatorQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatorBookingItem" ADD CONSTRAINT "AggregatorBookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "AggregatorBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatorBookingStatusEvent" ADD CONSTRAINT "AggregatorBookingStatusEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "AggregatorBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatorBookingAuditLog" ADD CONSTRAINT "AggregatorBookingAuditLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "AggregatorBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatorBookingDocument" ADD CONSTRAINT "AggregatorBookingDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "AggregatorBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatorPaymentPlaceholder" ADD CONSTRAINT "AggregatorPaymentPlaceholder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "AggregatorBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

