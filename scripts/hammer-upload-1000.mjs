#!/usr/bin/env node

import { runSingleHammerScenario } from "./hammer-core.mjs";

const result = await runSingleHammerScenario({
  scenarioName: "r1000",
  recordCount: 1000,
  expectedStatus: "COMPLETED",
  verifyDownload: true,
  credentialsTag: "hammer.r1000",
});

console.log("[HAMMER-1000] PASS", JSON.stringify({
  jobId: result.jobId,
  uploadResponseMs: result.uploadResponseMs,
  jobCompletionMs: result.jobCompletionMs,
  elapsedMs: result.elapsedMs,
  pdfBytes: result.pdfBytes,
}));
