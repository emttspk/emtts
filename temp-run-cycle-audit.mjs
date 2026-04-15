import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { buildTrackingCycleAuditRecord } from "./apps/api/src/services/trackingCycleAudit.ts";
import { getTrackingCycleCorrections } from "./apps/api/src/services/trackingCycleCorrections.ts";

const rows = await prisma.shipment.findMany({
  orderBy: { updatedAt: "desc" },
  take: 100,
  select: {
    trackingNumber: true,
    status: true,
    rawJson: true,
    updatedAt: true,
  },
});

const corrections = await getTrackingCycleCorrections();

const audit = rows.map((row) =>
  buildTrackingCycleAuditRecord(
    {
      trackingNumber: row.trackingNumber,
      currentStatus: row.status,
      rawJson: row.rawJson,
    },
    {
      trackingOverrides: corrections.tracking_overrides,
      issueOverrides: corrections.issue_overrides,
    },
  ),
);

const output = {
  generatedAt: new Date().toISOString(),
  total: audit.length,
  mismatches: audit.filter((row) => row.correction_required).length,
  records: audit,
};

const outPath = path.join(process.cwd(), "storage", "outputs", "tracking-cycle-audit-sample.json");
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

console.log(JSON.stringify({ outPath, total: output.total, mismatches: output.mismatches }, null, 2));

await prisma.$disconnect();
