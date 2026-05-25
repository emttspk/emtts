#!/usr/bin/env node

import fs from "node:fs";
import { runSingleHammerScenario, getApiBaseUrl, assertSafeTarget } from "./hammer-core.mjs";

const allowFailureSim = process.env.ALLOW_R2_FAILURE_SIM === "true";

if (!allowFailureSim) {
  console.error("[HAMMER-R2-FAILURE-SIM] BLOCKED Set ALLOW_R2_FAILURE_SIM=true to run this optional scenario.");
  console.error("[HAMMER-R2-FAILURE-SIM] Intended for local/staging only with intentionally broken R2 configuration.");
  process.exit(2);
}

const apiBaseUrl = getApiBaseUrl();
assertSafeTarget(apiBaseUrl);

const expectedStatus = (process.env.HAMMER_R2_FAILURE_EXPECT_STATUS || "COMPLETED").toUpperCase();
const result = await runSingleHammerScenario({
  scenarioName: "r2-fail-sim",
  recordCount: Number(process.env.HAMMER_R2_FAILURE_RECORDS || 10),
  expectedStatus,
  verifyDownload: expectedStatus === "COMPLETED",
  credentialsTag: "hammer.r2.fail",
});

const labelsPdfPath = typeof result.job?.labelsPdfPath === "string" ? result.job.labelsPdfPath : "";
let localPathExists = null;
if (labelsPdfPath && process.env.HAMMER_VERIFY_LOCAL_PATH === "true") {
  localPathExists = fs.existsSync(labelsPdfPath);
}

console.log("[HAMMER-R2-FAILURE-SIM] PASS", JSON.stringify({
  apiBaseUrl,
  jobId: result.jobId,
  expectedStatus,
  finalStatus: result.finalStatus,
  elapsedMs: result.elapsedMs,
  labelsPdfPath: labelsPdfPath || null,
  localPathExists,
  note: "Confirm dual_write_failure and local retention behavior in API telemetry/logs.",
}));
