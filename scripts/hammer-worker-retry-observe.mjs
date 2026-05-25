#!/usr/bin/env node

import { runSingleHammerScenario } from "./hammer-core.mjs";

const recordCount = Number(process.env.HAMMER_RETRY_OBSERVE_RECORDS || 2001);
if (!Number.isInteger(recordCount) || recordCount < 2001) {
  console.error("[HAMMER-WORKER-RETRY-OBSERVE] FAIL Use record count >= 2001 to exceed safe render threshold.");
  process.exit(1);
}

const result = await runSingleHammerScenario({
  scenarioName: "worker-retry-observe",
  recordCount,
  expectedStatus: "FAILED",
  verifyDownload: false,
  credentialsTag: "hammer.retry.observe",
  maxWaitMs: Number(process.env.HAMMER_RETRY_MAX_WAIT_MS || 300000),
});

const errorText = String(result.jobError || "");
const thresholdMessageSeen = /safe worker render limit|memory exhaustion/i.test(errorText);

console.log("[HAMMER-WORKER-RETRY-OBSERVE] PASS", JSON.stringify({
  jobId: result.jobId,
  finalStatus: result.finalStatus,
  elapsedMs: result.elapsedMs,
  error: errorText || null,
  thresholdMessageSeen,
  attemptsMade: result.job?.attemptsMade ?? null,
  retries: result.job?.retries ?? null,
  note: "Use API/worker logs to confirm retry behavior timeline if retries are configured in queue settings.",
}));
