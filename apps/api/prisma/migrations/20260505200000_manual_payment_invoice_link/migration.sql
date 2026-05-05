-- AlterTable: add invoiceId to ManualPaymentRequest
ALTER TABLE "ManualPaymentRequest" ADD COLUMN "invoiceId" TEXT;

-- AddForeignKey
ALTER TABLE "ManualPaymentRequest" ADD CONSTRAINT "ManualPaymentRequest_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ManualPaymentRequest_invoiceId_idx" ON "ManualPaymentRequest"("invoiceId");
