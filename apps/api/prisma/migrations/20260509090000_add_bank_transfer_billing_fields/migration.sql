-- AlterTable
ALTER TABLE "BillingSettings"
ADD COLUMN "bankName" TEXT,
ADD COLUMN "bankTitle" TEXT,
ADD COLUMN "bankAccountNumber" TEXT,
ADD COLUMN "bankIban" TEXT,
ADD COLUMN "bankQrPath" TEXT;
