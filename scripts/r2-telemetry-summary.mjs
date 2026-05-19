#!/usr/bin/env node

/**
 * Stage S1 Staging: Telemetry Summary
 * 
 * Analyzes telemetry events and provides summary statistics
 * Usage: npm run r2:telemetry-summary [path/to/telemetry.log]
 * 
 * Exit codes:
 *   0: Telemetry analyzed successfully
 *   1: File not found or parsing error
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const args = process.argv.slice(2);
const telemetryFile = args[0] || process.env.TELEMETRY_LOG_FILE;
const verbose = args.includes("--verbose") || args.includes("-v");

function log(msg) {
  console.log(msg);
}

function info(msg) {
  console.log(`ℹ️  ${msg}`);
}

function success(msg) {
  console.log(`✓ ${msg}`);
}

function error(msg) {
  console.error(`❌ ${msg}`);
}

async function parseTelemetry(filePath) {
  const events = [];
  
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        events.push(event);
      } catch (err) {
        // Ignore parse errors
      }
    });

    rl.on("close", () => {
      resolve(events);
    });

    rl.on("error", reject);
  });
}

async function main() {
  if (!telemetryFile) {
    error("No telemetry file specified");
    info("Usage: npm run r2:telemetry-summary [path/to/telemetry.log]");
    info("Or set: TELEMETRY_LOG_FILE=/path/to/telemetry.log");
    process.exit(1);
  }

  if (!fs.existsSync(telemetryFile)) {
    error(`Telemetry file not found: ${telemetryFile}`);
    process.exit(1);
  }

  log("\n╔════════════════════════════════════════════════════╗");
  log("║  STAGE S1: TELEMETRY SUMMARY                       ║");
  log("╚════════════════════════════════════════════════════╝\n");

  log(`Analyzing: ${telemetryFile}`);
  log("Parsing telemetry events...\n");

  const events = await parseTelemetry(telemetryFile);
  
  if (events.length === 0) {
    error("No telemetry events found");
    process.exit(1);
  }

  // Aggregate statistics
  const stats = {
    total: events.length,
    byEvent: {},
    dualWrite: {
      starts: 0,
      successes: 0,
      failures: 0,
      cleanups: 0,
      skips: 0,
    },
    canary: {
      skipped: 0,
      allowed: 0,
    },
    staging: {
      startups: 0,
      checks: 0,
    },
    r2Latencies: [],
  };

  for (const event of events) {
    const eventType = event.event || "unknown";
    stats.byEvent[eventType] = (stats.byEvent[eventType] || 0) + 1;

    // Categorize
    if (eventType === "dual_write_start") {
      stats.dualWrite.starts++;
    } else if (eventType === "dual_write_success") {
      stats.dualWrite.successes++;
      if (event.latencyMs) {
        stats.r2Latencies.push(event.latencyMs);
      }
    } else if (eventType === "dual_write_failure") {
      stats.dualWrite.failures++;
    } else if (eventType === "dual_write_stream_cleanup") {
      stats.dualWrite.cleanups++;
    } else if (eventType === "dual_write_canary_skip") {
      stats.dualWrite.skips++;
      stats.canary.skipped++;
    } else if (eventType === "dual_write_canary_allowed") {
      stats.canary.allowed++;
    } else if (eventType === "staging_startup_config") {
      stats.staging.startups++;
    } else if (eventType === "staging_r2_connectivity_check") {
      stats.staging.checks++;
    }
  }

  // Display results
  log("╔════════════════════════════════════════════════════╗");
  log("║  Event Summary                                     ║");
  log("╚════════════════════════════════════════════════════╝\n");

  success(`Total events: ${stats.total}`);
  
  log("\nEvent Types (top 10):");
  const sorted = Object.entries(stats.byEvent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  for (const [eventType, count] of sorted) {
    const pct = ((count / stats.total) * 100).toFixed(1);
    log(`  ${eventType}: ${count} (${pct}%)`);
  }

  // Dual-write metrics
  log("\n╔════════════════════════════════════════════════════╗");
  log("║  Dual-Write Metrics                                ║");
  log("╚════════════════════════════════════════════════════╝\n");

  success(`Dual-write starts: ${stats.dualWrite.starts}`);
  success(`Dual-write successes: ${stats.dualWrite.successes}`);
  success(`Dual-write failures: ${stats.dualWrite.failures}`);
  success(`Dual-write cleanups: ${stats.dualWrite.cleanups}`);

  if (stats.dualWrite.starts > 0) {
    const successRate = ((stats.dualWrite.successes / stats.dualWrite.starts) * 100).toFixed(1);
    log(`  Success rate: ${successRate}%`);
  }

  // Latency stats
  if (stats.r2Latencies.length > 0) {
    log("\n╔════════════════════════════════════════════════════╗");
    log("║  R2 Upload Latency                                 ║");
    log("╚════════════════════════════════════════════════════╝\n");

    const min = Math.min(...stats.r2Latencies);
    const max = Math.max(...stats.r2Latencies);
    const avg = stats.r2Latencies.reduce((a, b) => a + b, 0) / stats.r2Latencies.length;
    const median = stats.r2Latencies.sort((a, b) => a - b)[Math.floor(stats.r2Latencies.length / 2)];
    const p95 = stats.r2Latencies.sort((a, b) => a - b)[Math.floor(stats.r2Latencies.length * 0.95)];

    log(`  Min: ${min}ms`);
    log(`  Max: ${max}ms`);
    log(`  Avg: ${avg.toFixed(0)}ms`);
    log(`  Median: ${median}ms`);
    log(`  P95: ${p95}ms`);
  }

  // Canary metrics
  if (stats.canary.skipped > 0 || stats.canary.allowed > 0) {
    log("\n╔════════════════════════════════════════════════════╗");
    log("║  Canary Mode Metrics                               ║");
    log("╚════════════════════════════════════════════════════╝\n");

    success(`Canary jobs allowed: ${stats.canary.allowed}`);
    success(`Canary jobs skipped: ${stats.canary.skipped}`);
    
    if (stats.canary.allowed > 0) {
      const canaryRate = ((stats.canary.allowed / (stats.canary.allowed + stats.canary.skipped)) * 100).toFixed(1);
      log(`  Canary pass rate: ${canaryRate}%`);
    }
  }

  // Recommendations
  log("\n╔════════════════════════════════════════════════════╗");
  log("║  Recommendations                                   ║");
  log("╚════════════════════════════════════════════════════╝\n");

  if (stats.dualWrite.failures > 0) {
    const failureRate = ((stats.dualWrite.failures / stats.dualWrite.starts) * 100).toFixed(1);
    if (failureRate > 10) {
      error(`High failure rate: ${failureRate}% - check R2 connectivity and permissions`);
    } else {
      info(`Some failures detected (${failureRate}%) - monitor and investigate`);
    }
  }

  if (stats.r2Latencies.length > 0 && Math.max(...stats.r2Latencies) > 10000) {
    info("Some uploads took >10 seconds - consider increasing R2 timeout or investigating network");
  }

  if (stats.dualWrite.starts === 0) {
    info("No dual-write events detected - verify staging is enabled and jobs are being processed");
  } else {
    success("Telemetry looks good!");
  }

  log("\n✓ Analysis complete");
  log();
}

main().catch((err) => {
  error(`Analysis failed: ${err.message}`);
  if (verbose) console.error(err);
  process.exit(1);
});
