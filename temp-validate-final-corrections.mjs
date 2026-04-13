import { prisma } from "./apps/api/src/prisma.ts";
import { processTracking } from "./apps/api/src/services/trackingStatus.ts";

const trackingNumbers = ["VPL26030230", "VPL14437502", "VPL14437563", "VPL14437444", "VPL12511818"];

const out = [];
for (const tn of trackingNumbers) {
  const row = await prisma.shipment.findFirst({
    where: { trackingNumber: tn },
    select: { trackingNumber: true, status: true, city: true, rawJson: true },
  });
  if (!row) {
    out.push({ tracking_number: tn, found: false });
    continue;
  }
  const raw = row.rawJson ? JSON.parse(row.rawJson) : {};
  const p = processTracking(raw, {
    explicitMo: String(raw?.moIssuedNumber ?? raw?.mo_issued_number ?? "").trim() || null,
    trackingNumber: tn,
  });
  out.push({
    tracking_number: tn,
    found: true,
    db_status: row.status,
    db_city: row.city,
    resolved_delivery_office: p.resolvedDeliveryOffice,
    computed_system_status: p.systemStatus,
    computed_status: p.status,
    mo_issued: p.moIssued,
    tracking_mo: p.trackingMo,
  });
}

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
