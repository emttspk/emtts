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

export function resolveTrackingAllocatorPrefix(shipmentType: unknown) {
  return getTrackingPrefix(shipmentType);
}

export function buildTrackingIdCurrent(sequence: number, value?: string | Date, shipmentType?: unknown) {
  return buildTrackingId(sequence, value, shipmentType);
}

export function resolveTrackingDateCode(value?: string | Date) {
  return formatIdentifierDateCode(value);
}
