-- Create isolated admin template designer tables.
CREATE TABLE IF NOT EXISTS "MoneyOrderTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "backgroundUrl" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MoneyOrderTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MoneyOrderTemplateField" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "fieldType" TEXT NOT NULL,
  "x" DOUBLE PRECISION NOT NULL,
  "y" DOUBLE PRECISION NOT NULL,
  "width" DOUBLE PRECISION NOT NULL,
  "height" DOUBLE PRECISION NOT NULL,
  "fontSize" INTEGER NOT NULL DEFAULT 12,
  "fontWeight" TEXT NOT NULL DEFAULT 'normal',
  "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MoneyOrderTemplateField_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MoneyOrderTemplate_isActive_idx" ON "MoneyOrderTemplate"("isActive");
CREATE INDEX IF NOT EXISTS "MoneyOrderTemplateField_templateId_idx" ON "MoneyOrderTemplateField"("templateId");
CREATE INDEX IF NOT EXISTS "MoneyOrderTemplateField_fieldKey_idx" ON "MoneyOrderTemplateField"("fieldKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MoneyOrderTemplateField_templateId_fkey'
  ) THEN
    ALTER TABLE "MoneyOrderTemplateField"
      ADD CONSTRAINT "MoneyOrderTemplateField_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "MoneyOrderTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
