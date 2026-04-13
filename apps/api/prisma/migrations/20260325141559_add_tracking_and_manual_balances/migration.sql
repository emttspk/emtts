-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "monthlyLabelLimit" INTEGER NOT NULL,
    "monthlyTrackingLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Plan" ("createdAt", "id", "monthlyLabelLimit", "monthlyTrackingLimit", "name", "priceCents") SELECT "createdAt", "id", "monthlyLabelLimit", "monthlyLabelLimit", "name", "priceCents" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE TABLE "new_UsageMonthly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "labelsGenerated" INTEGER NOT NULL DEFAULT 0,
    "labelsQueued" INTEGER NOT NULL DEFAULT 0,
    "trackingGenerated" INTEGER NOT NULL DEFAULT 0,
    "trackingQueued" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UsageMonthly_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UsageMonthly" ("id", "labelsGenerated", "labelsQueued", "month", "updatedAt", "userId") SELECT "id", "labelsGenerated", "labelsQueued", "month", "updatedAt", "userId" FROM "UsageMonthly";
DROP TABLE "UsageMonthly";
ALTER TABLE "new_UsageMonthly" RENAME TO "UsageMonthly";
CREATE INDEX "UsageMonthly_month_idx" ON "UsageMonthly"("month");
CREATE UNIQUE INDEX "UsageMonthly_userId_month_key" ON "UsageMonthly"("userId", "month");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyName" TEXT,
    "address" TEXT,
    "contactNumber" TEXT,
    "originCity" TEXT,
    "extraLabelCredits" INTEGER NOT NULL DEFAULT 0,
    "extraTrackingCredits" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("address", "companyName", "contactNumber", "createdAt", "email", "id", "originCity", "passwordHash", "role", "suspended") SELECT "address", "companyName", "contactNumber", "createdAt", "email", "id", "originCity", "passwordHash", "role", "suspended" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
