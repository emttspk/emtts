// Optional: metrics dump helper for manual inspection
import { metrics } from "./metrics.js";

export function dumpMetricsSnapshot() {
  try {
    const snapshot = metrics.snapshot();
    console.log("[METRICS]", JSON.stringify(snapshot, null, 2));
    return snapshot;
  } catch (err) {
    console.warn("[metrics-dump] error", err);
    return null;
  }
}
