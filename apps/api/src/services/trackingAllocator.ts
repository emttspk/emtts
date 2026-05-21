import { buildTrackingId, formatIdentifierDateCode, getTrackingPrefix } from "../validation/trackingId.js";

export type TrackingAllocatorPolicy = {
  publicFormat: "prefix+yymm+4-5-seq";
  futurePreparedFormat: "prefix+yymm+6-7-seq";
  currentMaxSequence: number;
  futureMaxSequence: number;
};

export const TRACKING_ALLOCATOR_POLICY: TrackingAllocatorPolicy = {
  publicFormat: "prefix+yymm+4-5-seq",
  futurePreparedFormat: "prefix+yymm+6-7-seq",
  currentMaxSequence: 99_999,
  futureMaxSequence: 9_999_999,
};

type AllocatorBucket = {
  key: string;
  prefix: string;
  dateCode: string;
  firstSeq: number;
  lastSeq: number;
  generated: number;
  retryLikeEvents: number;
  gapEvents: number;
  gapUnits: number;
  lastLogAt: number;
};

const allocatorBuckets = new Map<string, AllocatorBucket>();
const OBS_LOG_EVERY_GENERATIONS = 200;
const OBS_MIN_LOG_INTERVAL_MS = 60_000;

function parseTrackingIdentifier(value: string) {
  const match = /^([A-Z]{3})(\d{4})(\d{4,7})$/.exec(String(value ?? "").trim().toUpperCase());
  if (!match) return null;
  return {
    prefix: match[1],
    dateCode: match[2],
    seq: Number.parseInt(match[3], 10),
  };
}

function getAllocatorBucket(prefix: string, dateCode: string, seq: number): AllocatorBucket {
  const key = `${prefix}:${dateCode}`;
  const now = Date.now();
  const existing = allocatorBuckets.get(key);
  if (existing) return existing;
  const created: AllocatorBucket = {
    key,
    prefix,
    dateCode,
    firstSeq: seq,
    lastSeq: seq,
    generated: 0,
    retryLikeEvents: 0,
    gapEvents: 0,
    gapUnits: 0,
    lastLogAt: now,
  };
  allocatorBuckets.set(key, created);
  return created;
}

function shouldLogBucket(bucket: AllocatorBucket, now: number) {
  if (bucket.generated === 1) return true;
  if (bucket.generated % OBS_LOG_EVERY_GENERATIONS === 0) return true;
  return now - bucket.lastLogAt >= OBS_MIN_LOG_INTERVAL_MS;
}

function logBucket(bucket: AllocatorBucket, context: { trackingId: string; seq: number; delta: number }) {
  const payload = {
    event: "tracking_allocator_observability",
    key: bucket.key,
    prefix: bucket.prefix,
    dateCode: bucket.dateCode,
    generated: bucket.generated,
    firstSeq: bucket.firstSeq,
    lastSeq: bucket.lastSeq,
    retryLikeEvents: bucket.retryLikeEvents,
    gapEvents: bucket.gapEvents,
    gapUnits: bucket.gapUnits,
    latestTrackingId: context.trackingId,
    latestSeq: context.seq,
    latestDelta: context.delta,
    timestamp: new Date().toISOString(),
  };
  console.info("[AllocatorObs]", JSON.stringify(payload));
}

export function getTrackingAllocatorObservabilitySnapshot() {
  return Array.from(allocatorBuckets.values())
    .map((bucket) => ({
      key: bucket.key,
      prefix: bucket.prefix,
      dateCode: bucket.dateCode,
      generated: bucket.generated,
      firstSeq: bucket.firstSeq,
      lastSeq: bucket.lastSeq,
      retryLikeEvents: bucket.retryLikeEvents,
      gapEvents: bucket.gapEvents,
      gapUnits: bucket.gapUnits,
    }))
    .sort((a, b) => b.generated - a.generated);
}

export function resolveTrackingAllocatorPrefix(shipmentType: unknown) {
  return getTrackingPrefix(shipmentType);
}

export function buildTrackingIdCurrent(sequence: number, value?: string | Date, shipmentType?: unknown) {
  const trackingId = buildTrackingId(sequence, value, shipmentType);
  const parsed = parseTrackingIdentifier(trackingId);
  if (!parsed) {
    return trackingId;
  }

  const bucket = getAllocatorBucket(parsed.prefix, parsed.dateCode, parsed.seq);
  bucket.generated += 1;

  const previousSeq = bucket.lastSeq;
  const delta = parsed.seq - previousSeq;
  if (delta <= 0) {
    bucket.retryLikeEvents += 1;
  } else if (delta > 1) {
    bucket.gapEvents += 1;
    bucket.gapUnits += delta - 1;
  }
  bucket.lastSeq = parsed.seq;

  const now = Date.now();
  if (shouldLogBucket(bucket, now)) {
    logBucket(bucket, { trackingId, seq: parsed.seq, delta });
    bucket.lastLogAt = now;
  }

  return trackingId;
}

export function resolveTrackingDateCode(value?: string | Date) {
  return formatIdentifierDateCode(value);
}
