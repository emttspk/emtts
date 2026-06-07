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

function readCachedShipmentStatsEntry(userId?: string | null) {
  if (typeof window === "undefined") return null;
  const cachedRaw = window.localStorage.getItem(buildScopedCacheKey(SHIPMENT_STATS_CACHE_KEY, userId));
  if (!cachedRaw) return null;
  try {
    return JSON.parse(cachedRaw) as ShipmentStatsCacheEntry;
  } catch {
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
    const cacheFresh = Boolean(
      shipmentStats
      && shipmentStatsFetchedAt > 0
      && Date.now() - shipmentStatsFetchedAt < SHIPMENT_STATS_CACHE_TTL_MS,
    );
    if (!options?.force && cacheFresh) {
      return shipmentStats;
    }
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    setShipmentStatsLoading(shipmentStats == null);
    const request = api<ShipmentStats>("/api/shipments/stats").then((latest) => {
      const fetchedAt = Date.now();
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
    setShipmentStats(readCachedShipmentStats(userId));
    setShipmentStatsFetchedAt(readCachedShipmentStatsTs(userId));
    setShipmentStatsLoading(readCachedShipmentStats(userId) == null);
    inFlightRef.current = null;
  }, [userId]);

  useEffect(() => {
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
