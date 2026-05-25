#!/usr/bin/env node

import { runSingleHammerScenario } from "./hammer-core.mjs";

const result = await runSingleHammerScenario({
  scenarioName: "r500",
  recordCount: 500,
  expectedStatus: "COMPLETED",
  verifyDownload: true,
  credentialsTag: "hammer.r500",
});

console.log("[HAMMER-500] PASS", JSON.stringify({
  jobId: result.jobId,
  uploadResponseMs: result.uploadResponseMs,
  jobCompletionMs: result.jobCompletionMs,
  elapsedMs: result.elapsedMs,
  pdfBytes: result.pdfBytes,
}));
