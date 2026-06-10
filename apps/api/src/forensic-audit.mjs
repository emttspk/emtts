import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const targets = [
  "VPL26030243",
  "VPL26020745",
  "VPL26030470",
  "VPL26030350",
  "VPL26020549",
];

async function main() {
  for (const tn of targets) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`TARGET: ${tn}`);
    console.log(`${"=".repeat(80)}`);

    // Fetch shipment
    const shipments = await prisma.shipment.findMany({
      where: { trackingNumber: tn },
      select: {
        userId: true,
        trackingNumber: true,
        complaintStatus: true,
        complaintText: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (shipments.length === 0) {
      console.log(`  No shipment found for ${tn}`);
      continue;
    }

    for (const s of shipments) {
      console.log(`\n  --- Shipment Record ---`);
      console.log(`  complaintStatus: ${s.complaintStatus}`);
      console.log(`  createdAt: ${s.createdAt.toISOString()}`);
      console.log(`  updatedAt: ${s.updatedAt.toISOString()}`);
      console.log(`  complaintText:`);
      console.log(`  ${"-".repeat(40)}`);
      // Print first line (header metadata)
      const firstLine = (s.complaintText ?? "").split("\n")[0];
      console.log(`  [HEADER] ${firstLine}`);

      // Print COMPLAINT_HISTORY_JSON
      const historyMarker = "COMPLAINT_HISTORY_JSON:";
      const histIdx = (s.complaintText ?? "").lastIndexOf(historyMarker);
      if (histIdx >= 0) {
        const raw = (s.complaintText ?? "").slice(histIdx + historyMarker.length).trim();
        try {
          const parsed = JSON.parse(raw);
          const entries = Array.isArray(parsed?.entries) ? parsed.entries : Array.isArray(parsed) ? parsed : [];
          console.log(`  [HISTORY] ${entries.length} entries:`);
          for (const e of entries) {
            console.log(`    complaintId: ${e.complaintId}`);
            console.log(`      dueDate: ${e.dueDate}`);
            console.log(`      createdAt: ${e.createdAt}`);
            console.log(`      attemptNumber: ${e.attemptNumber}`);
            console.log(`      status: ${e.status}`);
            console.log(`      previousComplaintReference: ${e.previousComplaintReference}`);
          }
        } catch {
          console.log(`  [HISTORY] Failed to parse: ${raw.slice(0, 200)}`);
        }
      } else {
        console.log(`  [HISTORY] No COMPLAINT_HISTORY_JSON marker found`);
        // Try to extract from header
        const idMatch = (s.complaintText ?? "").match(/COMPLAINT_ID\s*:\s*([A-Z0-9\-]+)/i);
        const dueMatch = (s.complaintText ?? "").match(/DUE_DATE\s*:\s*([^\n|]+)/i);
        const stateMatch = (s.complaintText ?? "").match(/COMPLAINT_STATE\s*:\s*([^\n|]+)/i);
        console.log(`    [INFERRED] ID: ${idMatch?.[1] ?? "N/A"}, Due: ${dueMatch?.[1] ?? "N/A"}, State: ${stateMatch?.[1] ?? "N/A"}`);
      }
    }

    // Fetch queue rows
    const queueRows = await prisma.complaintQueue.findMany({
      where: { trackingId: tn },
      select: {
        id: true,
        trackingId: true,
        complaintStatus: true,
        complaintId: true,
        dueDate: true,
        retryCount: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        payloadJson: true,
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`\n  --- ComplaintQueue Rows (${queueRows.length}) ---`);
    for (const q of queueRows) {
      console.log(`  Queue ID: ${q.id}`);
      console.log(`    status: ${q.complaintStatus}`);
      console.log(`    complaintId: ${q.complaintId}`);
      console.log(`    dueDate: ${q.dueDate?.toISOString() ?? "null"}`);
      console.log(`    createdAt: ${q.createdAt.toISOString()}`);
      console.log(`    updatedAt: ${q.updatedAt.toISOString()}`);
      console.log(`    retryCount: ${q.retryCount}`);
      console.log(`    lastError: ${q.lastError}`);
      if (q.payloadJson) {
        const pj = typeof q.payloadJson === "string" ? JSON.parse(q.payloadJson) : q.payloadJson;
        console.log(`    payloadJson.attempt_number: ${pj.attempt_number}`);
        console.log(`    payloadJson.previous_complaint_reference: ${pj.previous_complaint_reference}`);
      }
    }
  }

  // Count all records with mismatched due dates
  console.log(`\n${"=".repeat(80)}`);
  console.log(`PART 4: DUE DATE MISMATCH ANALYSIS`);
  console.log(`${"=".repeat(80)}`);

  // Count records where latest attempt has earlier due date than previous
  const allShipments = await prisma.shipment.findMany({
    where: {
      complaintText: { contains: "COMPLAINT_HISTORY_JSON:" },
    },
    select: {
      trackingNumber: true,
      complaintText: true,
      createdAt: true,
    },
  });

  let mismatchCount = 0;
  let sameDateCount = 0;
  let totalMultiAttempt = 0;

  for (const s of allShipments) {
    const marker = "COMPLAINT_HISTORY_JSON:";
    const idx = (s.complaintText ?? "").lastIndexOf(marker);
    if (idx < 0) continue;
    const raw = (s.complaintText ?? "").slice(idx + marker.length).trim();
    let entries;
    try {
      const parsed = JSON.parse(raw);
      entries = Array.isArray(parsed?.entries) ? parsed.entries : Array.isArray(parsed) ? parsed : [];
    } catch {
      continue;
    }

    if (entries.length < 2) continue;
    totalMultiAttempt++;

    const last = entries[entries.length - 1];
    const prev = entries[entries.length - 2];

    // Compare attempt numbers
    const lastAttempt = Number(last.attemptNumber ?? 0);
    const prevAttempt = Number(prev.attemptNumber ?? 0);

    // Compare due dates
    const parseDDMMYYYY = (d) => {
      if (!d) return null;
      const m = String(d).match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      const m2 = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m2) return new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
      return null;
    };

    const lastDue = parseDDMMYYYY(last.dueDate);
    const prevDue = parseDDMMYYYY(prev.dueDate);

    if (lastDue && prevDue && lastDue.getTime() < prevDue.getTime()) {
      mismatchCount++;
      console.log(`  MISMATCH: ${s.trackingNumber} - Attempt ${lastAttempt} due ${last.dueDate} < Attempt ${prevAttempt} due ${prev.dueDate}`);
    }

    // Check if createdAt dates are the same
    if (last.createdAt && prev.createdAt && last.createdAt === prev.createdAt) {
      sameDateCount++;
      if (!(lastDue && prevDue) || lastDue.getTime() >= prevDue.getTime()) {
        // Only log if we didn't already log it above
        console.log(`  SAME_CREATED: ${s.trackingNumber} - both attempts have createdAt ${last.createdAt}`);
      }
    }
  }

  console.log(`\n  Total multi-attempt records: ${totalMultiAttempt}`);
  console.log(`  Records with earlier due date on later attempt: ${mismatchCount}`);
  console.log(`  Records with identical createdAt: ${sameDateCount}`);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
