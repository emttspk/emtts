ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "isPreserved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deleteAfter" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SupportTicket_isPreserved_idx" ON "SupportTicket"("isPreserved");
CREATE INDEX IF NOT EXISTS "SupportTicket_deleteAfter_idx" ON "SupportTicket"("deleteAfter");
