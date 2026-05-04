-- Add onboarding and identity fields for two-step registration.
ALTER TABLE "User"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "onboardingComplete" BOOLEAN NOT NULL DEFAULT true;

-- Enforce DB-level uniqueness locks.
CREATE UNIQUE INDEX "User_contactNumber_key" ON "User"("contactNumber");
CREATE UNIQUE INDEX "User_cnic_key" ON "User"("cnic");
