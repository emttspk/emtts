import { env } from "../config.js";
import { applyTrackingPatchLayer } from "./trackingPatch.js";
export class PythonServiceUnavailableError extends Error {
    baseUrl;
    constructor(baseUrl, cause) {
        super(`Tracking service is offline (${baseUrl}). Start it with: cd python-service && uvicorn app:app --host 0.0.0.0 --port 8000`);
        this.name = "PythonServiceUnavailableError";
        this.baseUrl = baseUrl;
        this.cause = cause;
    }
}
export class PythonServiceTimeoutError extends Error {
    baseUrl;
    constructor(baseUrl, cause) {
        super(`Tracking service timed out (${baseUrl}). Try again, or restart python-service.`);
        this.name = "PythonServiceTimeoutError";
        this.baseUrl = baseUrl;
        this.cause = cause;
    }
}
function baseUrl() {
    return env.PYTHON_SERVICE_URL.replace(/\/+$/, "");
}
const TRACK_CACHE_TTL_MS = 10 * 60 * 1000;
const TRACK_REQUEST_INTERVAL_MS = 400;
const TRACK_BULK_BATCH_SIZE = 100;
const MIN_HISTORY_FOR_CACHE = 2;
const trackResultCache = new Map();
const inFlightTrackRequests = new Map();
const inFlightBulkRequests = new Map();
let trackQueue = Promise.resolve();
let bulkTrackQueue = Promise.resolve();
let nextTrackSlotAt = 0;
function isConnRefused(err) {
    const anyErr = err;
    if (anyErr?.code === "ECONNREFUSED")
        return true;
    if (String(anyErr?.message ?? "").includes("ECONNREFUSED"))
        return true;
    const cause = anyErr?.cause;
    if (cause?.code === "ECONNREFUSED")
        return true;
    if (String(cause?.message ?? "").includes("ECONNREFUSED"))
        return true;
    if (cause?.errors && Array.isArray(cause.errors)) {
        return cause.errors.some((e) => e?.code === "ECONNREFUSED" || String(e?.message ?? "").includes("ECONNREFUSED"));
    }
    return false;
}
async function fetchJson(url, init = {}) {
    const { timeoutMs = 120_000, ...rest } = init;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            ...rest,
            headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Python service error ${res.status}: ${text || res.statusText}`);
        }
        return (await res.json());
    }
    catch (e) {
        const base = baseUrl();
        if (e?.name === "AbortError")
            throw new PythonServiceTimeoutError(base, e);
        if (isConnRefused(e))
            throw new PythonServiceUnavailableError(base, e);
        throw e;
    }
    finally {
        clearTimeout(timeout);
    }
}
function cacheKey(trackingNumber, includeRaw) {
    return `${trackingNumber.trim().toUpperCase()}|${includeRaw ? "raw" : "summary"}`;
}
function getCachedTrackResult(key) {
    const hit = trackResultCache.get(key);
    if (!hit)
        return null;
    if (hit.expiresAt <= Date.now()) {
        trackResultCache.delete(key);
        return null;
    }
    return hit.value;
}
function setCachedTrackResult(key, value) {
    if (!isCacheableTrackResult(value))
        return;
    trackResultCache.set(key, { expiresAt: Date.now() + TRACK_CACHE_TTL_MS, value });
}
function timelineSummary(events) {
    const list = Array.isArray(events) ? events : [];
    const first = list[0] ? `${String(list[0].date ?? "").trim()} ${String(list[0].time ?? "").trim()}`.trim() : "-";
    const last = list[list.length - 1] ? `${String(list[list.length - 1].date ?? "").trim()} ${String(list[list.length - 1].time ?? "").trim()}`.trim() : "-";
    return { count: list.length, first, last };
}
function chunk(items, size) {
    if (size <= 0)
        return [items];
    const out = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}
function parseCollectedAmount(raw) {
    if (!raw || typeof raw !== "object")
        return 0;
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
        if (!text)
            continue;
        const m = text.match(/[\d,]+(?:\.\d+)?/);
        const n = Number((m ? m[0] : text).replace(/,/g, ""));
        if (Number.isFinite(n))
            return n;
    }
    return 0;
}
function isCacheableTrackResult(value) {
    const status = String(value.status ?? "").trim().toUpperCase();
    if (!status || status === "-" || status === "NOT_FOUND" || status === "ERROR")
        return false;
    if (!["DELIVERED", "RETURN", "RETURNED", "RETURN_IN_PROCESS"].includes(status))
        return false;
    const raw = value.raw;
    const history = raw?.history ?? raw?.tracking?.history;
    if (!Array.isArray(history) || history.length < MIN_HISTORY_FOR_CACHE)
        return false;
    const tn = String(value.tracking_number ?? "").trim().toUpperCase();
    const serviceType = String(raw?.service_type ?? raw?.tracking?.service_type ?? "").trim().toUpperCase();
    const codScope = ["VPL", "VPP", "COD"].includes(serviceType) || tn.startsWith("VPL") || tn.startsWith("VPP") || tn.startsWith("COD") || parseCollectedAmount(raw) > 0;
    const mos = String(raw?.latest_mos_id ?? raw?.mos_number ?? raw?.MOS_Number ?? "").trim().toUpperCase();
    const hasMos = mos.startsWith("MOS");
    if (codScope && status === "DELIVERED" && !hasMos)
        return false;
    return true;
}
function scheduleTrackedRequest(task) {
    const run = async () => {
        const waitMs = Math.max(0, nextTrackSlotAt - Date.now());
        if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        nextTrackSlotAt = Date.now() + TRACK_REQUEST_INTERVAL_MS;
        return task();
    };
    const next = trackQueue.then(run, run);
    trackQueue = next.then(() => undefined, () => undefined);
    return next;
}
function scheduleBulkRequest(task) {
    const run = async () => task();
    const next = bulkTrackQueue.then(run, run);
    bulkTrackQueue = next.then(() => undefined, () => undefined);
    return next;
}
export async function pythonHealthCheck(opts) {
    const base = baseUrl();
    return fetchJson(`${base}/health`, { method: "GET", timeoutMs: opts?.timeoutMs ?? 1500 });
}
export async function pythonTrackBulk(trackingNumbers, opts) {
    const base = baseUrl();
    const includeRawFlag = opts?.includeRaw === true;
    const includeRaw = includeRawFlag ? "?include_raw=true" : "";
    // Final override: enforce 100-sized bulk batches.
    const batchSize = TRACK_BULK_BATCH_SIZE;
    const batchTimeoutMs = Math.max(60_000, opts?.batchTimeoutMs ?? 120_000);
    const normalized = trackingNumbers.map((t) => t.trim()).filter(Boolean);
    if (normalized.length === 0)
        return [];
    const orderedUnique = [];
    const uniqueSeen = new Set();
    for (const id of normalized) {
        const key = id.toUpperCase();
        if (uniqueSeen.has(key))
            continue;
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
        const resultByUpper = new Map();
        const nonCached = [];
        for (const id of orderedUnique) {
            const key = cacheKey(id, includeRawFlag);
            const cached = getCachedTrackResult(key);
            if (cached) {
                const patchedCached = applyTrackingPatchLayer(cached);
                const before = timelineSummary(cached.events);
                const after = timelineSummary(patchedCached.events);
                console.log(`[TRACE] stage=API_CACHE_BEFORE_RETURN tn=${id} status_before_patch=${cached.status ?? "-"} status_after_patch=${patchedCached.status ?? "-"} event_count=${after.count} first_event_before=${before.first} last_event_before=${before.last} first_event_after=${after.first} last_event_after=${after.last}`);
                resultByUpper.set(id.toUpperCase(), patchedCached);
                console.log(`[TrackingCache] ${id} | Cache Hit (pre-filter)`);
                console.log(`CACHE_STATUS = "${cached.status ?? "-"}"`);
            }
            else {
                nonCached.push(id);
            }
        }
        console.log(`[BulkTracking] Pre-filter complete | total=${orderedUnique.length} cached=${resultByUpper.size} non_cached=${nonCached.length}`);
        const batches = chunk(nonCached, batchSize);
        for (let i = 0; i < batches.length; i += 1) {
            const batch = batches[i];
            console.log(`[BulkTracking] Batch ${i + 1}/${batches.length} | size=${batch.length}`);
            let batchMap = null;
            try {
                batchMap = await fetchJson(`${base}/track/bulk${includeRaw}`, {
                    method: "POST",
                    body: JSON.stringify({ tracking_ids: batch }),
                    timeoutMs: batchTimeoutMs,
                });
            }
            catch (err) {
                const list = await fetchJson(`${base}/track-bulk${includeRaw}`, {
                    method: "POST",
                    body: JSON.stringify({ tracking_numbers: batch }),
                    timeoutMs: batchTimeoutMs,
                });
                batchMap = Object.fromEntries(list.map((row) => [String(row.tracking_number ?? "").trim().toUpperCase(), row]));
                if (err instanceof Error) {
                    console.warn(`[BulkTracking] /track/bulk fallback used: ${err.message}`);
                }
            }
            for (const id of batch) {
                const upper = id.toUpperCase();
                const item = batchMap[id] ?? batchMap[upper];
                if (!item)
                    continue;
                const patchedItem = applyTrackingPatchLayer(item);
                const before = timelineSummary(item.events);
                const after = timelineSummary(patchedItem.events);
                console.log(`[TRACE] stage=API_PATCHED_BULK tn=${id} status_before_patch=${item.status ?? "-"} status_after_patch=${patchedItem.status ?? "-"} event_count=${after.count} first_event_before=${before.first} last_event_before=${before.last} first_event_after=${after.first} last_event_after=${after.last}`);
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
    }
    finally {
        inFlightBulkRequests.delete(bulkRequestKey);
    }
}
export async function pythonTrackOne(trackingNumber, opts) {
    const base = baseUrl();
    const normalizedTracking = trackingNumber.trim();
    const includeRawFlag = opts?.includeRaw === true;
    const key = cacheKey(normalizedTracking, includeRawFlag);
    const cached = getCachedTrackResult(key);
    if (cached) {
        const patchedCached = applyTrackingPatchLayer(cached);
        const before = timelineSummary(cached.events);
        const after = timelineSummary(patchedCached.events);
        console.log(`[TRACE] stage=API_CACHE_BEFORE_RETURN tn=${normalizedTracking} status_before_patch=${cached.status ?? "-"} status_after_patch=${patchedCached.status ?? "-"} event_count=${after.count} first_event_before=${before.first} last_event_before=${before.last} first_event_after=${after.first} last_event_after=${after.last}`);
        console.log(`CACHE_STATUS = "${cached.status ?? "-"}"`);
        return patchedCached;
    }
    const existing = inFlightTrackRequests.get(key);
    if (existing)
        return existing;
    const request = scheduleTrackedRequest(async () => {
        const includeRaw = includeRawFlag ? "?include_raw=true" : "";
        const encoded = encodeURIComponent(normalizedTracking);
        const result = await fetchJson(`${base}/track/${encoded}${includeRaw}`, {
            method: "GET",
            timeoutMs: 120_000,
        });
        const patchedResult = applyTrackingPatchLayer(result);
        const before = timelineSummary(result.events);
        const after = timelineSummary(patchedResult.events);
        console.log(`[TRACE] stage=API_PATCHED_SINGLE tn=${normalizedTracking} status_before_patch=${result.status ?? "-"} status_after_patch=${patchedResult.status ?? "-"} event_count=${after.count} first_event_before=${before.first} last_event_before=${before.last} first_event_after=${after.first} last_event_after=${after.last}`);
        setCachedTrackResult(key, patchedResult);
        return patchedResult;
    });
    inFlightTrackRequests.set(key, request);
    try {
        return await request;
    }
    finally {
        inFlightTrackRequests.delete(key);
    }
}
export async function pythonSubmitComplaint(trackingNumber, phone, context) {
    const base = baseUrl();
    return fetchJson(`${base}/submit-complaint`, {
        method: "POST",
        body: JSON.stringify({ tracking_number: trackingNumber, phone, ...(context ?? {}) }),
        timeoutMs: 180_000,
    });
}
