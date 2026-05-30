-- Add missing Payment columns (staging schema drift recovery; additive only)
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "txnRefNo" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerTxnId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "responseCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "responseMessage" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "rawRequest" JSONB;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "rawResponse" JSONB;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "hashVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Payment_txnRefNo_idx" ON "Payment"("txnRefNo");
