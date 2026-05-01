import cron from "node-cron";
import { trackingQueue } from "../queue/queue.js";
import { getQueuedComplaintsForRetry } from "../services/complaint-queue.service.js";

let started = false;

export async function runComplaintRetryJob() {
  const rows = await getQueuedComplaintsForRetry(25);
  for (const row of rows) {
    await trackingQueue.add(
      "process-complaint",
      { jobId: `cq-${row.id}`, kind: "COMPLAINT", queueId: row.id, trackingNumber: row.trackingId, phone: "" },
      { jobId: `complaint-queue-${row.id}` },
    );
  }
  return { queued: rows.length };
}

export function startComplaintRetryJob() {
  if (started) return;
  started = true;
  cron.schedule("*/5 * * * *", () => {
    runComplaintRetryJob().catch((error) => {
      console.error("[ComplaintRetry] Scheduled retry failed:", error instanceof Error ? error.message : error);
    });
  });
  console.log("[ComplaintRetry] Cron scheduled: every 5 minutes");
}
