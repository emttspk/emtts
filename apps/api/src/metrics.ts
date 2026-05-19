// Lightweight in-memory metrics registry for dual-provider observability
// Supports: counters, gauges, histograms (timers)
// Thread-safe for Node.js event loop (no async race risk)
// No external dependencies

export type MetricLabels = Record<string, string | number | boolean | undefined>;

class Counter {
  private value = 0;
  inc(amount = 1) { this.value += amount; }
  get() { return this.value; }
}

class Gauge {
  private value = 0;
  set(val: number) { this.value = val; }
  inc(amount = 1) { this.value += amount; }
  dec(amount = 1) { this.value -= amount; }
  get() { return this.value; }
}

class Histogram {
  private values: number[] = [];
  observe(val: number) { this.values.push(val); }
  get() {
    if (this.values.length === 0) return { count: 0, min: 0, max: 0, avg: 0 };
    const min = Math.min(...this.values);
    const max = Math.max(...this.values);
    const sum = this.values.reduce((a, b) => a + b, 0);
    return { count: this.values.length, min, max, avg: sum / this.values.length };
  }
}

class MetricsRegistry {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();

  private key(name: string, labels?: MetricLabels) {
    if (!labels) return name;
    return name + JSON.stringify(labels);
  }

  incCounter(name: string, labels?: MetricLabels, amount = 1) {
    const k = this.key(name, labels);
    if (!this.counters.has(k)) this.counters.set(k, new Counter());
    this.counters.get(k)!.inc(amount);
  }

  setGauge(name: string, value: number, labels?: MetricLabels) {
    const k = this.key(name, labels);
    if (!this.gauges.has(k)) this.gauges.set(k, new Gauge());
    this.gauges.get(k)!.set(value);
  }

  observeHistogram(name: string, value: number, labels?: MetricLabels) {
    const k = this.key(name, labels);
    if (!this.histograms.has(k)) this.histograms.set(k, new Histogram());
    this.histograms.get(k)!.observe(value);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(Array.from(this.counters.entries()).map(([k, v]) => [k, v.get()])),
      gauges: Object.fromEntries(Array.from(this.gauges.entries()).map(([k, v]) => [k, v.get()])),
      histograms: Object.fromEntries(Array.from(this.histograms.entries()).map(([k, v]) => [k, v.get()])),
    };
  }
}

export const metrics = new MetricsRegistry();

export const heapUsageGauge = new Gauge();
export const activeR2StreamsGauge = new Gauge();
export const activeDualWritesGauge = new Gauge();
export const r2StreamDuration = new Histogram();
export const r2StreamFailures = new Counter();
export const r2ConcurrencyLimitHits = new Counter();
export const r2TimeoutCounter = new Counter();
export const r2FailureCounter = new Counter();

// Stage S1 Staging Metrics
export const canarySkippedJobsCounter = new Counter(); // Jobs gated by canary mode
export const canaryAllowedJobsCounter = new Counter(); // Jobs allowed by canary mode
export const dualWriteSuccessRatioGauge = new Gauge(); // 0-100: percentage of dual-writes that succeeded
export const unsyncedArtifactsGauge = new Gauge(); // Count of artifacts awaiting R2 sync
export const stagingModeActiveGauge = new Gauge(); // 1 if staging enabled, 0 otherwise

heapUsageGauge.set(process.memoryUsage().heapUsed);

export function refreshRuntimeMetrics() {
  heapUsageGauge.set(process.memoryUsage().heapUsed);
}
