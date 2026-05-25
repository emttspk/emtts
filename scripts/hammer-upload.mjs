#!/usr/bin/env node

import { runSingleHammerScenario } from "./hammer-core.mjs";

function parseArgs(argv) {
  const opts = {
    records: Number(process.env.HAMMER_RECORDS || 10),
    scenario: process.env.HAMMER_SCENARIO || "custom",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--records" && argv[i + 1]) {
      opts.records = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--scenario" && argv[i + 1]) {
      opts.scenario = String(argv[i + 1]);
      i += 1;
    }
  }

  return opts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(args.records) || args.records < 1) {
    throw new Error(`--records must be a positive integer. Received: ${args.records}`);
  }

  const result = await runSingleHammerScenario({
    scenarioName: args.scenario,
    recordCount: args.records,
    expectedStatus: "COMPLETED",
    verifyDownload: true,
    credentialsTag: `hammer.${args.scenario}`,
  });

  console.log("[HAMMER] PASS", JSON.stringify({
    scenario: result.scenarioName,
    records: args.records,
    jobId: result.jobId,
    status: result.finalStatus,
    elapsedMs: result.elapsedMs,
    pdfBytes: result.pdfBytes,
    apiBaseUrl: result.apiBaseUrl,
  }));
}

main().catch((error) => {
  console.error("[HAMMER] FAIL", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
