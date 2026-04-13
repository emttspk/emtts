import { prisma } from "./apps/api/src/prisma.ts";
import { processTracking } from "./apps/api/src/services/trackingStatus.ts";

const tn = "VPL26030230";

const row = await prisma.shipment.findFirst({
  where: { trackingNumber: tn },
  select: { rawJson: true, status: true },
});

if (!row) {
  console.log(JSON.stringify({ found: false, tracking_number: tn }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

const raw = row.rawJson ? JSON.parse(row.rawJson) : {};
const computed = processTracking(raw, {
  explicitMo: String(raw?.moIssuedNumber ?? "").trim() || null,
  trackingNumber: tn,
});

console.log(
  JSON.stringify(
    {
      found: true,
      tracking_number: tn,
      db_status: row.status,
      computed_system_status: computed.systemStatus,
      computed_status: computed.status,
      moIssued: computed.moIssued,
      trackingMo: computed.trackingMo,
      systemMo: computed.systemMo,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
