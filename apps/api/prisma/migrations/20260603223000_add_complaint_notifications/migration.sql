-- Add complaint notifications table for complaint lifecycle events.
CREATE TABLE IF NOT EXISTS "ComplaintNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trackingId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'complaint_status_change',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplaintNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ComplaintNotification_userId_isRead_createdAt_idx" ON "ComplaintNotification"("userId", "isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "ComplaintNotification_trackingId_idx" ON "ComplaintNotification"("trackingId");
CREATE INDEX IF NOT EXISTS "ComplaintNotification_type_idx" ON "ComplaintNotification"("type");
CREATE INDEX IF NOT EXISTS "ComplaintNotification_createdAt_idx" ON "ComplaintNotification"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ComplaintNotification"
    ADD CONSTRAINT "ComplaintNotification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
