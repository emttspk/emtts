import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

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

function readCachedShipmentStatsEntry() {
  if (typeof window === "undefined") return null;
  const cachedRaw = window.localStorage.getItem(SHIPMENT_STATS_CACHE_KEY);
  if (!cachedRaw) return null;
  try {
    return JSON.parse(cachedRaw) as ShipmentStatsCacheEntry;
  } catch {
    return null;
  }
}

function readCachedShipmentStats() {
  return readCachedShipmentStatsEntry()?.value ?? null;
}

function readCachedShipmentStatsTs() {
  return Number(readCachedShipmentStatsEntry()?.ts ?? 0) || 0;
}

function writeCachedShipmentStats(value: ShipmentStats, ts = Date.now()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SHIPMENT_STATS_CACHE_KEY, JSON.stringify({ value, ts } satisfies ShipmentStatsCacheEntry));
}

export function useShipmentStats() {
  const [shipmentStats, setShipmentStats] = useState<ShipmentStats | null>(() => readCachedShipmentStats());
  const [shipmentStatsFetchedAt, setShipmentStatsFetchedAt] = useState<number>(() => readCachedShipmentStatsTs());
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

    const request = api<ShipmentStats>("/api/shipments/stats").then((latest) => {
      setShipmentStats(latest);
      setShipmentStatsFetchedAt(Date.now());
      writeCachedShipmentStats(latest, Date.now());
      return latest;
    }).finally(() => {
      inFlightRef.current = null;
    });

    inFlightRef.current = request;
    return request;
  }, [shipmentStats, shipmentStatsFetchedAt]);

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

  return { shipmentStats, refreshShipmentStats, shipmentStatsFetchedAt };
}