-- CreateTable
CREATE TABLE "BillingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "jazzcashNumber" TEXT NOT NULL,
    "jazzcashTitle" TEXT NOT NULL,
    "jazzcashQrPath" TEXT,
    "easypaisaNumber" TEXT NOT NULL,
    "easypaisaTitle" TEXT NOT NULL,
    "easypaisaQrPath" TEXT,
    "standardPrice" INTEGER NOT NULL,
    "businessPrice" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id")
);
