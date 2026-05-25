#!/usr/bin/env node

import { runSingleHammerScenario } from "./hammer-core.mjs";

const result = await runSingleHammerScenario({
  scenarioName: "r10",
  recordCount: 10,
  expectedStatus: "COMPLETED",
  verifyDownload: true,
  credentialsTag: "hammer.r10",
});

console.log("[HAMMER-10] PASS", JSON.stringify({
  jobId: result.jobId,
  uploadResponseMs: result.uploadResponseMs,
  jobCompletionMs: result.jobCompletionMs,
  elapsedMs: result.elapsedMs,
  pdfBytes: result.pdfBytes,
}));
