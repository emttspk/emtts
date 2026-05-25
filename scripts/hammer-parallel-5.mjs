#!/usr/bin/env node

import { runSingleHammerScenario } from "./hammer-core.mjs";

const parallelUsers = 5;
const recordCountPerJob = Number(process.env.HAMMER_PARALLEL_RECORDS || 100);

if (!Number.isInteger(recordCountPerJob) || recordCountPerJob < 1) {
  console.error("[HAMMER-PARALLEL-5] FAIL HAMMER_PARALLEL_RECORDS must be a positive integer");
  process.exit(1);
}

const runs = Array.from({ length: parallelUsers }, (_, idx) =>
  runSingleHammerScenario({
    scenarioName: `p5u${idx + 1}`,
    recordCount: recordCountPerJob,
    expectedStatus: "COMPLETED",
    verifyDownload: true,
    credentialsTag: `hammer.parallel.${idx + 1}`,
  }),
);

const settled = await Promise.allSettled(runs);
const failures = settled.filter((r) => r.status === "rejected");

if (failures.length > 0) {
  console.error(`[HAMMER-PARALLEL-5] FAIL ${failures.length}/${parallelUsers} jobs failed`);
  for (const failure of failures) {
    console.error(failure.reason instanceof Error ? failure.reason.message : String(failure.reason));
  }
  process.exit(1);
}

const summaries = settled
  .filter((r) => r.status === "fulfilled")
  .map((r) => ({
    jobId: r.value.jobId,
    uploadResponseMs: r.value.uploadResponseMs,
    jobCompletionMs: r.value.jobCompletionMs,
    elapsedMs: r.value.elapsedMs,
    pdfBytes: r.value.pdfBytes,
  }));

console.log("[HAMMER-PARALLEL-5] PASS", JSON.stringify({ parallelUsers, recordCountPerJob, summaries }));
