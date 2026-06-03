import { api } from "./api";
import { logDevTiming } from "./devTiming";
import type { MeResponse } from "./types";

const ME_CACHE_TTL_MS = 15_000;

let meCache: MeResponse | null = null;
let meCacheAt = 0;
let meInFlight: Promise<MeResponse> | null = null;

function cacheFresh() {
  return meCache !== null && meCacheAt > 0 && Date.now() - meCacheAt < ME_CACHE_TTL_MS;
}

export function clearMeCache() {
  meCache = null;
  meCacheAt = 0;
  meInFlight = null;
}

export function primeMeCache(payload: MeResponse) {
  meCache = payload;
  meCacheAt = Date.now();
}

export async function fetchMe(options?: { force?: boolean; source?: string }) {
  const source = options?.source ?? "unknown";
  if (!options?.force && cacheFresh()) {
    return meCache as MeResponse;
  }

  if (meInFlight) {
    return meInFlight;
  }

  const startedAt = performance.now();
  meInFlight = api<MeResponse>("/api/me")
    .then((payload) => {
      primeMeCache(payload);
      logDevTiming("/api/me", performance.now() - startedAt, { source, cache: "miss" });
      return payload;
    })
    .finally(() => {
      meInFlight = null;
    });

  return meInFlight;
}
