import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { trackingQueue } from "../queue/queue.js";
import { getQueuedComplaintsForRetry } from "../services/complaint-queue.service.js";

let started = false;

export async function runComplaintRetryJob() {
  const rows = await getQueuedComplaintsForRetry(25);
  let queued = 0;
  for (const row of rows) {
    const retryToken = Number(row.retryCount ?? 0);
    const enqueueToken = Date.now();
    const retryJob = await prisma.trackingJob.create({
      data: {
        userId: row.userId,
        kind: "COMPLAINT",
        status: "QUEUED",
        recordCount: 1,
        originalFilename: null,
        uploadPath: null,
      },
      select: { id: true },
    });

    await trackingQueue.add(
      "process-complaint",
      { jobId: retryJob.id, kind: "COMPLAINT", queueId: row.id, trackingNumber: row.trackingId, phone: "" },
      { jobId: `complaint-queue-${row.id}-${retryToken}-${enqueueToken}` },
    );

    await prisma.complaintQueue.update({
      where: { id: row.id },
      data: {
        complaintStatus: "queued",
        nextRetryAt: null,
      },
    });

    queued += 1;
  }
  if (queued > 0) {
    console.log(`[ComplaintRetry] queued ${queued} complaint retry job(s)`);
  }
  return { queued };
}

export function startComplaintRetryJob() {
  if (started) return;
  started = true;
  void runComplaintRetryJob().catch((error) => {
    console.error("[ComplaintRetry] Startup retry sweep failed:", error instanceof Error ? error.message : error);
  });
  cron.schedule("* * * * *", () => {
    runComplaintRetryJob().catch((error) => {
      console.error("[ComplaintRetry] Scheduled retry failed:", error instanceof Error ? error.message : error);
    });
  });
  console.log("[ComplaintRetry] Cron scheduled: every 1 minute");
}
