-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LabelJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "unitCount" INTEGER NOT NULL DEFAULT 0,
    "includeMoneyOrders" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "uploadPath" TEXT NOT NULL,
    "labelsPdfPath" TEXT,
    "moneyOrderPdfPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabelJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LabelJob" ("createdAt", "error", "id", "labelsPdfPath", "moneyOrderPdfPath", "originalFilename", "recordCount", "status", "updatedAt", "uploadPath", "userId") SELECT "createdAt", "error", "id", "labelsPdfPath", "moneyOrderPdfPath", "originalFilename", "recordCount", "status", "updatedAt", "uploadPath", "userId" FROM "LabelJob";
DROP TABLE "LabelJob";
ALTER TABLE "new_LabelJob" RENAME TO "LabelJob";
CREATE INDEX "LabelJob_userId_idx" ON "LabelJob"("userId");
CREATE INDEX "LabelJob_status_idx" ON "LabelJob"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
