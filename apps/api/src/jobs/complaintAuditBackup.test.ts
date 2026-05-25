import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { runComplaintBackupJob } from "./complaint-backup.job.js";
import { listComplaintAuditLogs, logComplaintAudit } from "../services/complaint-audit.service.js";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

async function withPrismaAuditBackupMock(run: (ctx: { auditRows: any[] }) => Promise<void>) {
  const p = prisma as any;
  const original = {
    $executeRawUnsafe: p.$executeRawUnsafe,
    $queryRawUnsafe: p.$queryRawUnsafe,
    shipment: p.shipment,
    labelJob: p.labelJob,
  };

  const auditRows: any[] = [];

  p.$executeRawUnsafe = async (sql: string, ...values: unknown[]) => {
    if (sql.includes("INSERT INTO complaint_audit_logs")) {
      auditRows.push({
        actorEmail: String(values[1] ?? ""),
        action: String(values[2] ?? ""),
        trackingId: values[3] ?? null,
        complaintId: values[4] ?? null,
        details: values[5] ?? null,
      });
      return 1;
    }
    return 1;
  };

  p.$queryRawUnsafe = async (sql: string) => {
    if (sql.includes("SELECT * FROM complaint_audit_logs")) {
      return [{ id: "a1", actor_email: "system", action: "complaint_created" }];
    }
    if (sql.includes("SELECT id, actor_email")) {
      return auditRows.map((row, index) => ({
        id: `row-${index + 1}`,
        actorEmail: row.actorEmail,
        action: row.action,
        trackingId: row.trackingId,
        complaintId: row.complaintId,
        details: row.details,
        createdAt: new Date().toISOString(),
      }));
    }
    return [];
  };

  p.shipment = {
    findMany: async () => ([
      {
        userId: "u-1",
        user: { email: "u1@example.com" },
        trackingNumber: "VPL26050001",
        complaintStatus: "FILED",
        complaintText: "COMPLAINT_ID: CMP-100 | DUE_DATE: 26-05-2026 | COMPLAINT_STATE: ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
  };

  p.labelJob = {
    findMany: async () => [],
  };

  try {
    await run({ auditRows });
  } finally {
    p.$executeRawUnsafe = original.$executeRawUnsafe;
    p.$queryRawUnsafe = original.$queryRawUnsafe;
    p.shipment = original.shipment;
    p.labelJob = original.labelJob;
  }
}

const tests: TestCase[] = [
  {
    name: "audit logger writes and list returns normalized rows",
    async run() {
      await withPrismaAuditBackupMock(async () => {
        await logComplaintAudit({
          actorEmail: "",
          action: "complaint_updated",
          trackingId: "VPL26050001",
          complaintId: "CMP-100",
          details: "queued",
        });

        const rows = await listComplaintAuditLogs(20);
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.actorEmail, "system");
        assert.equal(rows[0]?.action, "complaint_updated");
      });
    },
  },
  {
    name: "backup job writes complaint and audit snapshots with synthetic data",
    async run() {
      await withPrismaAuditBackupMock(async () => {
        const previousCwd = process.cwd();
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "complaint-backup-test-"));
        process.chdir(tempRoot);
        try {
          const result = await runComplaintBackupJob();
          assert.equal(result.complaintCount, 1);
          assert.equal(result.auditCount, 1);

          const complaintsRoot = path.join(tempRoot, "backups", "complaints", result.stamp, "complaints.json");
          const auditRoot = path.join(tempRoot, "backups", "audit-logs", result.stamp, "complaint-audit.json");
          const complaintsJson = JSON.parse(await fs.readFile(complaintsRoot, "utf8"));
          const auditJson = JSON.parse(await fs.readFile(auditRoot, "utf8"));
          assert.equal(complaintsJson.length, 1);
          assert.equal(auditJson.length, 1);
        } finally {
          process.chdir(previousCwd);
          await fs.rm(tempRoot, { recursive: true, force: true });
        }
      });
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS complaint audit/backup: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL complaint audit/backup: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`complaint audit/backup tests passed: ${tests.length}`);
}
