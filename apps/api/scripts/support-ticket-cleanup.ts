import "dotenv/config";
import { cleanupExpiredSupportTickets } from "../src/services/supportTicketRetention.js";

async function main() {
  const result = await cleanupExpiredSupportTickets();
  console.log("support-ticket-cleanup completed", result);
}

main().catch((error) => {
  console.error("support-ticket-cleanup failed", error);
  process.exitCode = 1;
});
