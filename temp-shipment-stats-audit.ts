import { PrismaClient } from "@prisma/client";
import { canonicalShipmentStatus, isComplaintEnabled, processTracking } from "./apps/api/src/services/trackingStatus.ts";
import { listComplaintRecords } from "./apps/api/src/services/complaint.service.ts";

const prisma = new PrismaClient();

function toAmount(rawJson?: string | null): number {
  if (!rawJson) return 0;
  try {
    const parsed = JSON.parse(rawJson);
    const val = parsed?.CollectAmount ?? parsed?.collect_amount ?? parsed?.collected_amount ?? parsed?.collectAmount ?? 0;

    if (typeof val === "string") {
      const match = val.match(/[\d,]+(?:\.\d+)?/);
      if (!match) return 0;
      const num = Number(match[0].replace(/,/g, ""));
      return Number.isFinite(num) ? num : 0;
    }

    const num = Number(val);
    return Number.isFinite(num) ? num : 0;
  } catch {
    return 0;
  }
}

async function main() {
  const email = String(process.argv[2] ?? "nazimsaeed@gmail.com").trim().toLowerCase();
  if (!email) {
    throw new Error("Email is required");
  }

  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new Error(`User not found for ${email}`);
  }

  const shipments = await prisma.shipment.findMany({
    where: { userId: user.id },
    select: {
      trackingNumber: true,
      status: true,
      daysPassed: true,
      rawJson: true,
      createdAt: true,
    },
  });

  const complaints = await listComplaintRecords({ userId: user.id });
  const shipmentAmounts = new Map<string, number>();
  const shipmentStatuses = new Map<string, string>();

  const totals = {
    total: { count: 0, amount: 0 },
    delivered: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    returned: { count: 0, amount: 0 },
    delayed: { count: 0, amount: 0 },
    complaints: { count: complaints.length, amount: 0 },
    complaintWatch: { count: 0, amount: 0 },
  };

  for (const shipment of shipments) {
    const raw = shipment.rawJson ? JSON.parse(shipment.rawJson) : {};
    const processed = processTracking(raw, {
      explicitMo: String(raw?.moIssuedNumber ?? raw?.mo_issued_number ?? "").trim() || null,
      trackingNumber: shipment.trackingNumber,
    });
    const computedStatus = String(processed.systemStatus ?? shipment.status ?? "").trim();
    const key = canonicalShipmentStatus(computedStatus, null);
    const amount = toAmount(shipment.rawJson);

    shipmentAmounts.set(shipment.trackingNumber, amount);
    shipmentStatuses.set(shipment.trackingNumber, key);

    totals.total.count += 1;
    totals.total.amount += amount;

    if (key === "DELIVERED") {
      totals.delivered.count += 1;
      totals.delivered.amount += amount;
    } else if (key === "RETURN") {
      totals.returned.count += 1;
      totals.returned.amount += amount;
    } else {
      totals.pending.count += 1;
      totals.pending.amount += amount;
    }

    if (isComplaintEnabled(shipment.daysPassed, computedStatus) && key === "PENDING") {
      totals.delayed.count += 1;
      totals.delayed.amount += amount;
    }
  }

  for (const complaint of complaints) {
    const trackingId = String(complaint.trackingId ?? "").trim();
    const amount = shipmentAmounts.get(trackingId) ?? 0;
    totals.complaints.amount += amount;
    if (complaint.active && shipmentStatuses.get(trackingId) === "PENDING") {
      totals.complaintWatch.count += 1;
      totals.complaintWatch.amount += amount;
    }
  }

  console.log(JSON.stringify({
    auditedUser: user.email,
    auditedAt: new Date().toISOString(),
    totals,
  }, null, 2));
}

main()
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });