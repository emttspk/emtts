import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { buildTrackingCycleAuditRecord } from "./apps/api/src/services/trackingCycleAudit.ts";
import { getTrackingCycleCorrections } from "./apps/api/src/services/trackingCycleCorrections.ts";

const tn = "VPL26030230";

const row = await prisma.shipment.findFirst({
  where: { trackingNumber: tn },
  select: { trackingNumber: true, status: true, rawJson: true },
});

if (!row) {
  console.log(JSON.stringify({ tracking_number: tn, found: false }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

const corrections = await getTrackingCycleCorrections();
const rec = buildTrackingCycleAuditRecord(
  {
    trackingNumber: row.trackingNumber,
    currentStatus: row.status,
    rawJson: row.rawJson,
  },
  {
    trackingOverrides: corrections.tracking_overrides,
    issueOverrides: corrections.issue_overrides,
  },
);

console.log(
  JSON.stringify(
    {
      found: true,
      tracking_number: tn,
      mos_detected: rec.mos_detected,
      mos_linked: rec.mos_linked,
      mos_delivered: rec.mos_delivered,
      final_status: rec.expected_status,
      final_status_correct: rec.final_status_correct,
      mos_number: rec.mos_number,
      issue: rec.issue,
      error: rec.error,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
