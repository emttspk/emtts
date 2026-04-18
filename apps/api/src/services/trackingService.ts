import { applyTrackingPatchLayer } from "./trackingPatch.js";

export type PythonTrackResult = {
  tracking_number: string;
  status: string;
  city?: string | null;
  latest_date?: string | null;
  latest_time?: string | null;
  days_passed?: number | null;
  complaint_eligible?: boolean;
  complaint_remaining_hours?: number | null;
  pending_level?: string | null;
  mos_id?: string | null;
  events?: Array<{ date: string; time: string; location: string; description: string }>;
  display_events?: Array<{ date: string; time: string; location: string; description: string }>;
  meta?: {
    final_status: "Pending" | "Delivered" | "Return";
    total_cycles: number;
    final_cycle_index: number;
    current_cycle: number;
    cycle_description: string;
    decision_reason: string;
    last_event: string;
    complaint_enabled: boolean;
    mos_id: string | null;
    delay_bucket: "Pending";
    hours_passed: number;
    days_passed: number;
    delay: string;
    audit: {
      sorted: boolean;
      strict_delivered: boolean;
      flow_sequence: boolean;
      first_delivery_leg: boolean;
      cycle_valid: boolean;
      mos_override: boolean;
      first_lt_last: boolean;
      no_invalid_status_labels: boolean;
      complaint_rule: boolean;
      delay_rule: boolean;
      status_rule: boolean;
      repaired: boolean;
      ok: boolean;
    };
  };
  raw?: unknown | null;
  // Failure detection fields
  service_status?: string;
  failure_reason?: string;
  consume_units?: boolean;
  refund_required?: boolean;
};

export class PythonServiceUnavailableError extends Error {
  baseUrl: string;
  constructor(baseUrl: string, cause?: unknown) {
    super(
      `Tracking service is offline (${baseUrl}). Start it with: cd python-service && uvicorn app:app --host 0.0.0.0 --port 8000`,
    );
    this.name = "PythonServiceUnavailableError";
    this.baseUrl = baseUrl;
    (this as any).cause = cause;
  }
}

export class PythonServiceTimeoutError extends Error {
  baseUrl: string;
  constructor(baseUrl: string, cause?: unknown) {
    super(`Tracking service timed out (${baseUrl}). Try again, or restart python-service.`);
    this.name = "PythonServiceTimeoutError";
    this.baseUrl = baseUrl;
    (this as any).cause = cause;
  }
}

function baseUrl() {
  if (!process.env.PYTHON_SERVICE_URL) {
    throw new Error("PYTHON_SERVICE_URL is missing");
  }

  const value = String(process.env.PYTHON_SERVICE_URL).trim();
  if (!value || value.toLowerCase() === "dummy") {
    throw new Error("PYTHON_SERVICE_URL is missing");
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(value);
  } catch {
    console.warn("PYTHON_SERVICE_URL not valid, skipping external service");
    throw new Error("PYTHON_SERVICE_URL not valid");
  }

  return parsed.toString().replace(/\/+$/, "");
}

const TRACK_CACHE_TTL_MS = 10 * 60 * 1000;
const TRACK_REQUEST_INTERVAL_MS = 400;
const TRACK_BULK_BATCH_SIZE = 100;
const MIN_HISTORY_FOR_CACHE = 2;
const trackResultCache = new Map<string, { expiresAt: number; value: PythonTrackResult }>();
const inFlightTrackRequests = new Map<string, Promise<PythonTrackResult>>();
const inFlightBulkRequests = new Map<string, Promise<PythonTrackResult[]>>();
let trackQueue: Promise<void> = Promise.resolve();
let bulkTrackQueue: Promise<void> = Promise.resolve();
let nextTrackSlotAt = 0;

function isConnRefused(err: unknown) {
  const anyErr = err as any;
  if (anyErr?.code === "ECONNREFUSED") return true;
  if (String(anyErr?.message ?? "").includes("ECONNREFUSED")) return true;
  const cause = anyErr?.cause;
  if (cause?.code === "ECONNREFUSED") return true;
  if (String(cause?.message ?? "").includes("ECONNREFUSED")) return true;
  if (cause?.errors && Array.isArray(cause.errors)) {
    return cause.errors.some((e: any) => e?.code === "ECONNREFUSED" || String(e?.message ?? "").includes("ECONNREFUSED"));
  }
  return false;
}

async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 120_000, ...rest } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    console.log("Calling tracking service:", url);
    const res = await fetch(url, {
      ...rest,
      headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Python service error ${res.status}: ${text || res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    const base = baseUrl();
    if ((e as any)?.name === "AbortError") throw new PythonServiceTimeoutError(base, e);
    if (isConnRefused(e)) throw new PythonServiceUnavailableError(base, e);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function cacheKey(trackingNumber: string, includeRaw: boolean) {
  return `${trackingNumber.trim().toUpperCase()}|${includeRaw ? "raw" : "summary"}`;
}

function getCachedTrackResult(key: string) {
  const hit = trackResultCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    trackResultCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedTrackResult(key: string, value: PythonTrackResult) {
  if (!isCacheableTrackResult(value)) return;
  trackResultCache.set(key, { expiresAt: Date.now() + TRACK_CACHE_TTL_MS, value });
}

function timelineSummary(events?: Array<{ date: string; time: string; location: string; description: string }>) {
  const list = Array.isArray(events) ? events : [];
  const first = list[0] ? `${String(list[0].date ?? "").trim()} ${String(list[0].time ?? "").trim()}`.trim() : "-";
  const last = list[list.length - 1] ? `${String(list[list.length - 1].date ?? "").trim()} ${String(list[list.length - 1].time ?? "").trim()}`.trim() : "-";
  return { count: list.length, first, last };
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseCollectedAmount(raw: any): number {
  if (!raw || typeof raw !== "object") return 0;
  const candidates = [
    raw.collected_amount,
    raw.collect_amount,
    raw.CollectAmount,
    raw.collectAmount,
    raw?.tracking?.collected_amount,
    raw?.tracking?.collect_amount,
    raw?.tracking?.CollectAmount,
    raw?.tracking?.collectAmount,
  ];
  for (const c of candidates) {
    const text = String(c ?? "").trim();
    if (!text) continue;
    const m = text.match(/[\d,]+(?:\.\d+)?/);
    const n = Number((m ? m[0] : text).replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function isCacheableTrackResult(value: PythonTrackResult): boolean {
  const status = String(value.status ?? "").trim().toUpperCase();
  if (!status || status === "-" || status === "NOT_FOUND" || status === "ERROR") return false;
  if (!["DELIVERED", "RETURN", "RETURNED", "RETURN_IN_PROCESS"].includes(status)) return false;

  const raw = value.raw as any;
  const history = raw?.history ?? raw?.tracking?.history;
  if (!Array.isArray(history) || history.length < MIN_HISTORY_FOR_CACHE) return false;

  const tn = String(value.tracking_number ?? "").trim().toUpperCase();
  const serviceType = String(raw?.service_type ?? raw?.tracking?.service_type ?? "").trim().toUpperCase();
  const codScope = ["VPL", "VPP", "COD"].includes(serviceType) || tn.startsWith("VPL") || tn.startsWith("VPP") || tn.startsWith("COD") || parseCollectedAmount(raw) > 0;
  const mos = String(raw?.latest_mos_id ?? raw?.mos_number ?? raw?.MOS_Number ?? "").trim().toUpperCase();
  const hasMos = mos.startsWith("MOS");
  if (codScope && status === "DELIVERED" && !hasMos) return false;

  return true;
}

function scheduleTrackedRequest<T>(task: () => Promise<T>) {
  const run = async () => {
    const waitMs = Math.max(0, nextTrackSlotAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    nextTrackSlotAt = Date.now() + TRACK_REQUEST_INTERVAL_MS;
    return task();
  };

  const next = trackQueue.then(run, run);
  trackQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function scheduleBulkRequest<T>(task: () => Promise<T>) {
  const run = async () => task();
  const next = bulkTrackQueue.then(run, run);
  bulkTrackQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function fallbackTrackFromHttp(trackingNumber: string, includeRaw: boolean): Promise<PythonTrackResult> {
  const normalized = trackingNumber.trim().toUpperCase();
  const endpoint = `https://ep.gov.pk/emtts/EPTrack_Live.aspx?ArticleIDz=${encodeURIComponent(normalized)}`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.8",
      "referer": "https://ep.gov.pk/emtts/EPTrack_Live.aspx",
    },
  });

  if (!res.ok) {
    throw new Error(`Fallback tracking endpoint failed with status ${res.status}`);
  }

  const html = await res.text();
  const normalizedText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const upper = normalizedText.toUpperCase();

  let status: "Pending" | "Delivered" | "Return" = "Pending";
  if (upper.includes("DELIVERED")) {
    status = "Delivered";
  } else if (upper.includes("RETURN")) {
    status = "Return";
  }

  const result: PythonTrackResult = {
    tracking_number: normalized,
    status,
    city: null,
    latest_date: null,
    latest_time: null,
    days_passed: null,
    complaint_eligible: status === "Pending",
    events: [],
    service_status: "fallback_http",
    failure_reason: "python_service_unavailable",
  };

  if (includeRaw) {
    result.raw = {
      source: "eptrack_http_fallback",
      endpoint,
      page_excerpt: normalizedText.slice(0, 4000),
    };
  }

  return result;
}

export async function pythonHealthCheck(opts?: { timeoutMs?: number }) {
  const base = baseUrl();
  return fetchJson<{ ok: boolean }>(`${base}/health`, { method: "GET", timeoutMs: opts?.timeoutMs ?? 1500 });
}

export async function pythonTrackBulk(
  trackingNumbers: string[],
  opts?: { includeRaw?: boolean; batchSize?: number; batchTimeoutMs?: number },
) {
  const base = baseUrl();
  const includeRawFlag = opts?.includeRaw === true;
  const includeRaw = includeRawFlag ? "?include_raw=true" : "";
  // Final override: enforce 100-sized bulk batches.
  const batchSize = TRACK_BULK_BATCH_SIZE;
  const batchTimeoutMs = Math.max(60_000, opts?.batchTimeoutMs ?? 120_000);

  const normalized = trackingNumbers.map((t) => t.trim()).filter(Boolean);
  if (normalized.length === 0) return [] as PythonTrackResult[];

  const orderedUnique: string[] = [];
  const uniqueSeen = new Set<string>();
  for (const id of normalized) {
    const key = id.toUpperCase();
    if (uniqueSeen.has(key)) continue;
    uniqueSeen.add(key);
    orderedUnique.push(id);
  }

  const bulkRequestKey = `${includeRawFlag ? "raw" : "summary"}|${orderedUnique.map((id) => id.toUpperCase()).join("|")}`;
  const existingBulk = inFlightBulkRequests.get(bulkRequestKey);
  if (existingBulk) {
    console.log(`[BulkTracking] Reusing in-flight bulk request | ids=${orderedUnique.length}`);
    return existingBulk;
  }

  const runTask = async () => {
    const resultByUpper = new Map<string, PythonTrackResult>();
    const nonCached: string[] = [];

    for (const id of orderedUnique) {
      const key = cacheKey(id, includeRawFlag);
      const cached = getCachedTrackResult(key);
      if (cached) {
        const patchedCached = applyTrackingPatchLayer(cached);
        const before = timelineSummary(cached.events);
        const after = timelineSummary(patchedCached.events);
        console.log(
          `[TRACE] stage=API_CACHE_BEFORE_RETURN tn=${id} status_before_patch=${cached.status ?? "-"} status_after_patch=${patchedCached.status ?? "-"} event_count=${after.count} first_event_before=${before.first} last_event_before=${before.last} first_event_after=${after.first} last_event_after=${after.last}`,
        );
        resultByUpper.set(id.toUpperCase(), patchedCached);
        console.log(`[TrackingCache] ${id} | Cache Hit (pre-filter)`);
        console.log(`CACHE_STATUS = "${cached.status ?? "-"}"`);
      } else {
        nonCached.push(id);
      }
    }

    console.log(
      `[BulkTracking] Pre-filter complete | total=${orderedUnique.length} cached=${resultByUpper.size} non_cached=${nonCached.length}`,
    );

    const batches = chunk(nonCached, batchSize);
    for (let i = 0; i < batches.length; i += 1) {
      const batch = batches[i];
      console.log(`[BulkTracking] Batch ${i + 1}/${batches.length} | size=${batch.length}`);

      let batchMap: Record<string, PythonTrackResult> | null = null;
      try {
        batchMap = await fetchJson<Record<string, PythonTrackResult>>(`${base}/track/bulk${includeRaw}`, {
          method: "POST",
          body: JSON.stringify({ tracking_ids: batch }),
          timeoutMs: batchTimeoutMs,
        });
      } catch (err) {
        try {
          const list = await fetchJson<PythonTrackResult[]>(`${base}/track-bulk${includeRaw}`, {
            method: "POST",
            body: JSON.stringify({ tracking_numbers: batch }),
            timeoutMs: batchTimeoutMs,
          });
          batchMap = Object.fromEntries(list.map((row) => [String(row.tracking_number ?? "").trim().toUpperCase(), row]));
          if (err instanceof Error) {
            console.warn(`[BulkTracking] /track/bulk fallback used: ${err.message}`);
          }
        } catch (innerErr) {
          if (innerErr instanceof PythonServiceUnavailableError || innerErr instanceof PythonServiceTimeoutError) {
            const fallbackRows = await Promise.all(batch.map((id) => fallbackTrackFromHttp(id, includeRawFlag)));
            batchMap = Object.fromEntries(fallbackRows.map((row) => [String(row.tracking_number ?? "").trim().toUpperCase(), row]));
            if (innerErr instanceof Error) {
              console.warn(`[BulkTracking] HTTP fallback used for batch ${i + 1}/${batches.length}: ${innerErr.message}`);
            }
          } else {
            throw innerErr;
          }
        }
      }

      for (const id of batch) {
        const upper = id.toUpperCase();
        const item = batchMap[id] ?? batchMap[upper];
        if (!item) continue;
        const patchedItem = applyTrackingPatchLayer(item);
        const before = timelineSummary(item.events);
        const after = timelineSummary(patchedItem.events);
        console.log(
          `[TRACE] stage=API_PATCHED_BULK tn=${id} status_before_patch=${item.status ?? "-"} status_after_patch=${patchedItem.status ?? "-"} event_count=${after.count} first_event_before=${before.first} last_event_before=${before.last} first_event_after=${after.first} last_event_after=${after.last}`,
        );
        resultByUpper.set(upper, patchedItem);
        setCachedTrackResult(cacheKey(id, includeRawFlag), patchedItem);
      }
    }

    return normalized.map((id) => {
      const hit = resultByUpper.get(id.toUpperCase());
      return hit ?? { tracking_number: id, status: "Pending" };
    });
  };

  const run = orderedUnique.length <= 100
    ? runTask()
    : scheduleBulkRequest(runTask);

  inFlightBulkRequests.set(bulkRequestKey, run);
  try {
    return await run;
  } finally {
    inFlightBulkRequests.delete(bulkRequestKey);
  }
}

export async function pythonTrackOne(trackingNumber: string, opts?: { includeRaw?: boolean }) {
  const base = baseUrl();
  const normalizedTracking = trackingNumber.trim();
  const includeRawFlag = opts?.includeRaw === true;
  const key = cacheKey(normalizedTracking, includeRawFlag);
  const cached = getCachedTrackResult(key);
  if (cached) {
    const patchedCached = applyTrackingPatchLayer(cached);
    const before = timelineSummary(cached.events);
    const after = timelineSummary(patchedCached.events);
    console.log(
      `[TRACE] stage=API_CACHE_BEFORE_RETURN tn=${normalizedTracking} status_before_patch=${cached.status ?? "-"} status_after_patch=${patchedCached.status ?? "-"} event_count=${after.count} first_event_before=${before.first} last_event_before=${before.last} first_event_after=${after.first} last_event_after=${after.last}`,
    );
    console.log(`CACHE_STATUS = "${cached.status ?? "-"}"`);
    return patchedCached;
  }

  const existing = inFlightTrackRequests.get(key);
  if (existing) return existing;

  const request = scheduleTrackedRequest(async () => {
    const includeRaw = includeRawFlag ? "?include_raw=true" : "";
    const encoded = encodeURIComponent(normalizedTracking);
    let result: PythonTrackResult;
    try {
      result = await fetchJson<PythonTrackResult>(`${base}/track/${encoded}${includeRaw}`, {
        method: "GET",
        timeoutMs: 120_000,
      });
    } catch (error) {
      if (error instanceof PythonServiceUnavailableError || error instanceof PythonServiceTimeoutError) {
        result = await fallbackTrackFromHttp(normalizedTracking, includeRawFlag);
      } else {
        throw error;
      }
    }
    const patchedResult = applyTrackingPatchLayer(result);
    const before = timelineSummary(result.events);
    const after = timelineSummary(patchedResult.events);
    console.log(
      `[TRACE] stage=API_PATCHED_SINGLE tn=${normalizedTracking} status_before_patch=${result.status ?? "-"} status_after_patch=${patchedResult.status ?? "-"} event_count=${after.count} first_event_before=${before.first} last_event_before=${before.last} first_event_after=${after.first} last_event_after=${after.last}`,
    );
    setCachedTrackResult(key, patchedResult);
    return patchedResult;
  });

  inFlightTrackRequests.set(key, request);
  try {
    return await request;
  } finally {
    inFlightTrackRequests.delete(key);
  }
}

export async function pythonSubmitComplaint(
  trackingNumber: string,
  phone: string,
  context?: {
    complainant_name?: string;
    sender_name?: string;
    sender_address?: string;
    sender_city?: string;
    sender_contact?: string;
    booking_office?: string;
    receiver_name?: string;
    receiver_address?: string;
    receiver_city?: string;
    delivery_city?: string;
    mapped_city?: string;
    upload_name?: string;
    upload_address?: string;
    upload_consignee_name?: string;
    upload_consignee_address?: string;
    upload_consignee_city?: string;
    profile_name?: string;
    booking_date?: string;
    service_type?: string;
    complaint_reason?: string;
    remarks?: string;
    complaint_text?: string;
    reply_mode?: "POST" | "EMAIL" | "SMS";
    reply_email?: string;
    recipient_city?: string;
    recipient_district?: string;
    recipient_tehsil?: string;
    recipient_location?: string;
  },
) {
  const base = baseUrl();
  return fetchJson<{
    success: boolean;
    response_text: string;
    complaint_number?: string;
    due_date?: string;
    already_exists?: boolean;
    status?: string;
    reason?: string;
    consume_units?: boolean;
    refund_required?: boolean;
  }>(`${base}/submit-complaint`, {
    method: "POST",
    body: JSON.stringify({ tracking_number: trackingNumber, phone, ...(context ?? {}) }),
    timeoutMs: 180_000,
  });
}
