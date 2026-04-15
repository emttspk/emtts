import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { canonicalShipmentStatus } from "./apps/api/src/services/trackingStatus.ts";
import { processTracking } from "./apps/api/src/services/trackingStatus.ts";

const tn = "VPL26030230";
const row = await prisma.shipment.findFirst({ where: { trackingNumber: tn }, select: { trackingNumber: true, status: true, rawJson: true } });
if (!row) {
  console.log(JSON.stringify({ found: false, tracking_number: tn }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}
const raw = row.rawJson ? JSON.parse(row.rawJson) : {};
const processed = processTracking(raw, {
  explicitMo: String(raw?.moIssuedNumber ?? raw?.mo_issued_number ?? "").trim() || null,
  trackingNumber: row.trackingNumber,
});
const finalStatus = String(processed.systemStatus ?? row.status ?? "").trim();
const key = canonicalShipmentStatus(finalStatus, null);
const delivered = key === "DELIVERED" ? 1 : 0;
const pending = key === "PENDING" ? 1 : 0;
const returned = key === "RETURN" ? 1 : 0;
console.log(JSON.stringify({
  found: true,
  tracking_number: row.trackingNumber,
  source_db_status: row.status,
  source_final_status: finalStatus,
  dashboard_key: key,
  delivered_count: delivered,
  pending_count: pending,
  returned_count: returned,
}, null, 2));
await prisma.$disconnect();
