import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export type ShipmentStats = {
  total: number;
  delivered: number;
  pending: number;
  returned: number;
  complaints?: number;
  complaintWatch?: number;
  delayed?: number;
  trackingUsed?: number;
  totalAmount?: number;
  deliveredAmount?: number;
  pendingAmount?: number;
  returnedAmount?: number;
  delayedAmount?: number;
  complaintAmount?: number;
  complaintWatchAmount?: number;
};

export const SHIPMENT_STATS_CACHE_KEY = "shipment.stats.cache.v1";

function readCachedShipmentStats() {
  if (typeof window === "undefined") return null;
  const cachedRaw = window.localStorage.getItem(SHIPMENT_STATS_CACHE_KEY);
  if (!cachedRaw) return null;
  try {
    const cached = JSON.parse(cachedRaw) as { value?: ShipmentStats };
    return cached?.value ?? null;
  } catch {
    return null;
  }
}

export function useShipmentStats() {
  const [shipmentStats, setShipmentStats] = useState<ShipmentStats | null>(() => readCachedShipmentStats());

  const refreshShipmentStats = useCallback(async () => {
    const latest = await api<ShipmentStats>("/api/shipments/stats");
    setShipmentStats(latest);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHIPMENT_STATS_CACHE_KEY, JSON.stringify({ value: latest, ts: Date.now() }));
    }
    return latest;
  }, []);

  useEffect(() => {
    void refreshShipmentStats();
  }, [refreshShipmentStats]);

  return { shipmentStats, refreshShipmentStats };
}