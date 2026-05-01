import cron from "node-cron";
import { runComplaintSync } from "../services/complaint-sync.service.js";

let started = false;

export async function runComplaintSyncJob(options?: { trackingIds?: string[]; actorEmail?: string }) {
  return runComplaintSync(options);
}

export function startComplaintSyncJob() {
  if (started) return;
  started = true;
  cron.schedule("0 */6 * * *", () => {
    runComplaintSyncJob({ actorEmail: "system" }).catch((error) => {
      console.error("[ComplaintSyncJob] Scheduled sync failed:", error instanceof Error ? error.message : error);
    });
  });
  console.log("[ComplaintSyncJob] Cron scheduled: every 6 hours");
}
