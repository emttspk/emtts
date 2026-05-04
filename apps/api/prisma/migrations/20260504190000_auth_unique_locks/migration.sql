-- Add onboarding and identity fields for two-step registration.
ALTER TABLE "User"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "onboardingComplete" BOOLEAN NOT NULL DEFAULT true;

-- Normalize blank identity values to NULL so unique indexes are meaningful.
UPDATE "User" SET "contactNumber" = NULL WHERE "contactNumber" = '';
UPDATE "User" SET "cnic" = NULL WHERE "cnic" = '';

-- Keep the oldest record's identity values and clear duplicates on later users.
WITH ranked_contacts AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "contactNumber"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "User"
  WHERE "contactNumber" IS NOT NULL
)
UPDATE "User" u
SET "contactNumber" = NULL
FROM ranked_contacts rc
WHERE u."id" = rc."id"
  AND rc.rn > 1;

WITH ranked_cnic AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "cnic"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "User"
  WHERE "cnic" IS NOT NULL
)
UPDATE "User" u
SET "cnic" = NULL
FROM ranked_cnic rc
WHERE u."id" = rc."id"
  AND rc.rn > 1;

-- Enforce DB-level uniqueness locks.
CREATE UNIQUE INDEX "User_contactNumber_key" ON "User"("contactNumber");
CREATE UNIQUE INDEX "User_cnic_key" ON "User"("cnic");
