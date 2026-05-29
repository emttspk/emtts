-- Add persistent hashed account-risk signals for duplicate-abuse monitoring.
CREATE TABLE "AccountRiskSignal" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "signalType" TEXT NOT NULL,
  "signalHash" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "planTier" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountRiskSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountRiskSignal_userId_idx" ON "AccountRiskSignal"("userId");
CREATE INDEX "AccountRiskSignal_signalType_signalHash_idx" ON "AccountRiskSignal"("signalType", "signalHash");
CREATE INDEX "AccountRiskSignal_planTier_idx" ON "AccountRiskSignal"("planTier");
CREATE INDEX "AccountRiskSignal_createdAt_idx" ON "AccountRiskSignal"("createdAt");

ALTER TABLE "AccountRiskSignal"
  ADD CONSTRAINT "AccountRiskSignal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
