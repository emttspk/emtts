-- Add support ticket notifications for customer and admin support activity.
CREATE TABLE IF NOT EXISTS "SupportTicketNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "ticketId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportTicketNotification_userId_isRead_createdAt_idx" ON "SupportTicketNotification"("userId", "isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicketNotification_ticketId_idx" ON "SupportTicketNotification"("ticketId");
CREATE INDEX IF NOT EXISTS "SupportTicketNotification_type_idx" ON "SupportTicketNotification"("type");
CREATE INDEX IF NOT EXISTS "SupportTicketNotification_createdAt_idx" ON "SupportTicketNotification"("createdAt");

DO $$ BEGIN
  ALTER TABLE "SupportTicketNotification"
    ADD CONSTRAINT "SupportTicketNotification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportTicketNotification"
    ADD CONSTRAINT "SupportTicketNotification_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;