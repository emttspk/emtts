#!/usr/bin/env node

import { runSingleHammerScenario } from "./hammer-core.mjs";

const result = await runSingleHammerScenario({
  scenarioName: "r2000",
  recordCount: 2000,
  expectedStatus: "COMPLETED",
  verifyDownload: true,
  credentialsTag: "hammer.r2000",
});

console.log("[HAMMER-2000] PASS", JSON.stringify({
  jobId: result.jobId,
  uploadResponseMs: result.uploadResponseMs,
  jobCompletionMs: result.jobCompletionMs,
  elapsedMs: result.elapsedMs,
  pdfBytes: result.pdfBytes,
}));
