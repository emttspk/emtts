#!/usr/bin/env node

import { runSingleHammerScenario } from "./hammer-core.mjs";

const result = await runSingleHammerScenario({
  scenarioName: "r100",
  recordCount: 100,
  expectedStatus: "COMPLETED",
  verifyDownload: true,
  credentialsTag: "hammer.r100",
});

console.log("[HAMMER-100] PASS", JSON.stringify({
  jobId: result.jobId,
  uploadResponseMs: result.uploadResponseMs,
  jobCompletionMs: result.jobCompletionMs,
  elapsedMs: result.elapsedMs,
  pdfBytes: result.pdfBytes,
}));
