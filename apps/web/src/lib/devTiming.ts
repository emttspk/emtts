const DEV_TIMING_ENABLED = import.meta.env.DEV && String(import.meta.env.VITE_ENABLE_TIMING_LOGS ?? "true") !== "false";

export function isDevTimingEnabled() {
  return DEV_TIMING_ENABLED;
}

export function logDevTiming(label: string, durationMs: number, extra?: Record<string, unknown>) {
  if (!DEV_TIMING_ENABLED) return;
  const duration = Math.max(0, Math.round(durationMs * 100) / 100);
  if (extra && Object.keys(extra).length > 0) {
    console.info(`[timing] ${label}: ${duration}ms`, extra);
    return;
  }
  console.info(`[timing] ${label}: ${duration}ms`);
}
