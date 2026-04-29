import cron from "node-cron";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { listComplaintRecords } from "../services/complaint.service.js";

let complaintBackupStarted = false;

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyIfPresent(source: string, target: string) {
  try {
    await fs.access(source);
    await fs.copyFile(source, target);
  } catch {
    // ignore missing files
  }
}

async function trimBackupSnapshots(dir: string, keep = 30) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const snapshots = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const full = path.join(dir, entry.name);
      const stat = await fs.stat(full);
      return { full, mtimeMs: stat.mtimeMs };
    }));
    snapshots.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const stale of snapshots.slice(keep)) {
      await fs.rm(stale.full, { recursive: true, force: true });
    }
  } catch {
    // ignore backup pruning failures
  }
}

export async function runComplaintBackupJob() {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const root = path.resolve(process.cwd(), "backups");
  const complaintsDir = path.join(root, "complaints", stamp);
  const labelsDir = path.join(root, "labels", stamp);
  const moneyOrdersDir = path.join(root, "money-orders", stamp);
  await Promise.all([ensureDir(complaintsDir), ensureDir(labelsDir), ensureDir(moneyOrdersDir)]);

  const complaints = await listComplaintRecords();
  await fs.writeFile(path.join(complaintsDir, "complaints.json"), JSON.stringify(complaints, null, 2), "utf8");

  const jobs = await prisma.labelJob.findMany({
    where: { status: "COMPLETED" },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, labelsPdfPath: true, moneyOrderPdfPath: true },
  });

  for (const job of jobs) {
    if (job.labelsPdfPath) {
      await copyIfPresent(path.resolve(process.cwd(), job.labelsPdfPath), path.join(labelsDir, path.basename(job.labelsPdfPath)));
    }
    if (job.moneyOrderPdfPath) {
      await copyIfPresent(path.resolve(process.cwd(), job.moneyOrderPdfPath), path.join(moneyOrdersDir, path.basename(job.moneyOrderPdfPath)));
    }
  }

  await Promise.all([
    trimBackupSnapshots(path.join(root, "complaints")),
    trimBackupSnapshots(path.join(root, "labels")),
    trimBackupSnapshots(path.join(root, "money-orders")),
  ]);

  return {
    stamp,
    complaintCount: complaints.length,
    backedUpJobs: jobs.length,
  };
}

export function startComplaintBackupJob() {
  if (complaintBackupStarted) return;
  complaintBackupStarted = true;
  cron.schedule("0 */12 * * *", () => {
    runComplaintBackupJob().catch((error) => {
      console.error("[ComplaintBackup] Scheduled backup failed:", error instanceof Error ? error.message : error);
    });
  });
  console.log("[ComplaintBackup] Cron job scheduled: every 12 hours");
}