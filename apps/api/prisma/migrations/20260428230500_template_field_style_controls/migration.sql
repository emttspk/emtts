-- Add richer style controls for template designer fields.
ALTER TABLE "MoneyOrderTemplateField"
  ADD COLUMN IF NOT EXISTS "fontFamily" TEXT NOT NULL DEFAULT 'Arial',
  ADD COLUMN IF NOT EXISTS "fontStyle" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "textColor" TEXT NOT NULL DEFAULT '#0f172a',
  ADD COLUMN IF NOT EXISTS "textAlign" TEXT NOT NULL DEFAULT 'left';
