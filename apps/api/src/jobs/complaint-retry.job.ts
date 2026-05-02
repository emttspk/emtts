import cron from "node-cron";
import { trackingQueue } from "../queue/queue.js";
import { getQueuedComplaintsForRetry } from "../services/complaint-queue.service.js";

let started = false;

export async function runComplaintRetryJob() {
  const rows = await getQueuedComplaintsForRetry(25);
  let queued = 0;
  for (const row of rows) {
    const retryToken = Number(row.retryCount ?? 0);
    const enqueueToken = Date.now();
    await trackingQueue.add(
      "process-complaint",
      { jobId: `cq-${row.id}-${retryToken}-${enqueueToken}`, kind: "COMPLAINT", queueId: row.id, trackingNumber: row.trackingId, phone: "" },
      { jobId: `complaint-queue-${row.id}-${retryToken}-${enqueueToken}` },
    );
    queued += 1;
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
