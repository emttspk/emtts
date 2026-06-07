import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { buildScopedCacheKey } from "../lib/cache";

export type ShipmentStats = {
  total: number;
  delivered: number;
  pending: number;
  returned: number;
  complaints?: number;
  complaintWatch?: number;
  complaintActive?: number;
  complaintInProcess?: number;
  complaintResolved?: number;
  complaintClosed?: number;
  complaintReopened?: number;
  delayed?: number;
  trackingUsed?: number;
  totalAmount?: number;
  deliveredAmount?: number;
  pendingAmount?: number;
  returnedAmount?: number;
  delayedAmount?: number;
  complaintAmount?: number;
  complaintWatchAmount?: number;
  complaintActiveAmount?: number;
  complaintInProcessAmount?: number;
  complaintResolvedAmount?: number;
  complaintClosedAmount?: number;
  complaintReopenedAmount?: number;
  graphData?: Array<{ date: string; total: number; byStatus: Record<string, number> }>;
};

export const SHIPMENT_STATS_CACHE_KEY = "shipment.stats.cache.v1";
export const SHIPMENT_STATS_CACHE_TTL_MS = 60_000;

type ShipmentStatsCacheEntry = {
  value?: ShipmentStats;
  ts?: number;
};

function clearShipmentStatsCache(userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildScopedCacheKey(SHIPMENT_STATS_CACHE_KEY, userId));
  } catch {
    // Best-effort cleanup only.
  }
}

function isValidShipmentStats(value: unknown): value is ShipmentStats {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCachedShipmentStatsEntry(userId?: string | null) {
  if (typeof window === "undefined") return null;
  const cachedRaw = window.localStorage.getItem(buildScopedCacheKey(SHIPMENT_STATS_CACHE_KEY, userId));
  if (!cachedRaw) return null;
  try {
    const parsed = JSON.parse(cachedRaw) as ShipmentStatsCacheEntry;
    if (!parsed || typeof parsed !== "object") {
      clearShipmentStatsCache(userId);
      return null;
    }
    if (parsed.value != null && !isValidShipmentStats(parsed.value)) {
      clearShipmentStatsCache(userId);
      return null;
    }
    return parsed;
  } catch {
    clearShipmentStatsCache(userId);
    return null;
  }
}

function readCachedShipmentStats(userId?: string | null) {
  return readCachedShipmentStatsEntry(userId)?.value ?? null;
}

function readCachedShipmentStatsTs(userId?: string | null) {
  return Number(readCachedShipmentStatsEntry(userId)?.ts ?? 0) || 0;
}

function writeCachedShipmentStats(value: ShipmentStats, ts = Date.now(), userId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    buildScopedCacheKey(SHIPMENT_STATS_CACHE_KEY, userId),
    JSON.stringify({ value, ts } satisfies ShipmentStatsCacheEntry),
  );
}

export function useShipmentStats(userId?: string | null) {
  const [shipmentStats, setShipmentStats] = useState<ShipmentStats | null>(() => readCachedShipmentStats(userId));
  const [shipmentStatsFetchedAt, setShipmentStatsFetchedAt] = useState<number>(() => readCachedShipmentStatsTs(userId));
  const [shipmentStatsLoading, setShipmentStatsLoading] = useState(() => readCachedShipmentStats(userId) == null);
  const inFlightRef = useRef<Promise<ShipmentStats> | null>(null);

  const refreshShipmentStats = useCallback(async (options?: { force?: boolean }) => {
    if (!userId) {
      console.info("[shipment-stats] skipped refresh without authenticated user");
      setShipmentStats(null);
      setShipmentStatsFetchedAt(0);
      setShipmentStatsLoading(false);
      inFlightRef.current = null;
      return null;
    }
    const cacheFresh = Boolean(
      shipmentStats
      && shipmentStatsFetchedAt > 0
      && Date.now() - shipmentStatsFetchedAt < SHIPMENT_STATS_CACHE_TTL_MS,
    );
    if (!options?.force && cacheFresh) {
      console.info("[shipment-stats] using fresh cache", { userId, fetchedAt: shipmentStatsFetchedAt });
      return shipmentStats;
    }
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    console.info("[shipment-stats] loading", { userId, force: Boolean(options?.force) });
    setShipmentStatsLoading(shipmentStats == null);
    const request = api<ShipmentStats>("/api/shipments/stats").then((latest) => {
      const fetchedAt = Date.now();
      console.info("[shipment-stats] loaded", { userId, fetchedAt });
      setShipmentStats(latest);
      setShipmentStatsFetchedAt(fetchedAt);
      writeCachedShipmentStats(latest, fetchedAt, userId);
      return latest;
    }).finally(() => {
      setShipmentStatsLoading(false);
      inFlightRef.current = null;
    });

    inFlightRef.current = request;
    return request;
  }, [shipmentStats, shipmentStatsFetchedAt, userId]);

  useEffect(() => {
    console.info("[shipment-stats] user context changed", { userId: userId ?? null });
    if (!userId) {
      setShipmentStats(null);
      setShipmentStatsFetchedAt(0);
      setShipmentStatsLoading(false);
      inFlightRef.current = null;
      return;
    }
    setShipmentStats(readCachedShipmentStats(userId));
    setShipmentStatsFetchedAt(readCachedShipmentStatsTs(userId));
    setShipmentStatsLoading(readCachedShipmentStats(userId) == null);
    inFlightRef.current = null;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const cacheFresh = Boolean(
      shipmentStats
      && shipmentStatsFetchedAt > 0
      && Date.now() - shipmentStatsFetchedAt < SHIPMENT_STATS_CACHE_TTL_MS,
    );
    if (!cacheFresh) {
      void refreshShipmentStats({ force: true });
    }
  }, [refreshShipmentStats, shipmentStats, shipmentStatsFetchedAt]);

  return { shipmentStats, refreshShipmentStats, shipmentStatsFetchedAt, shipmentStatsLoading };
}
