import { prisma } from "./apps/api/src/prisma.ts";
import { processTracking } from "./apps/api/src/services/trackingStatus.ts";
import { buildTrackingCycleAuditRecord } from "./apps/api/src/services/trackingCycleAudit.ts";
import { getTrackingCycleCorrections } from "./apps/api/src/services/trackingCycleCorrections.ts";

const tn = "VPL26030700";
const row = await prisma.shipment.findFirst({
  where: { trackingNumber: tn },
  select: { trackingNumber: true, status: true, rawJson: true },
});

if (!row) {
  console.log(JSON.stringify({ found: false, tracking_number: tn }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

const raw = row.rawJson ? JSON.parse(row.rawJson) : {};
const processed = processTracking(raw, {
  explicitMo: String(raw?.moIssuedNumber ?? raw?.mo_issued_number ?? "").trim() || null,
  trackingNumber: tn,
});

const corrections = await getTrackingCycleCorrections();
const audit = buildTrackingCycleAuditRecord(
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

console.log(JSON.stringify({
  found: true,
  tracking_number: tn,
  db_status: row.status,
  computed_system_status: processed.systemStatus,
  computed_status: processed.status,
  audit_expected_status: audit.expected_status,
  audit_cycle_detected: audit.cycle_detected,
  audit_issue: audit.issue,
  audit_correction_required: audit.correction_required,
  audit_reason: audit.reason,
}, null, 2));

await prisma.$disconnect();
