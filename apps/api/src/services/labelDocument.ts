import { type LabelOrder, type LabelPrintMode, generateLabelBarcodeBase64 } from "../templates/labels.js";
import { getTrackingPrefix, validateTrackingId, validateUploadedTrackingId, resolveShipmentType as resolveShipmentTypeCanonical } from "../validation/trackingId.js";
import { logCatalogShadowWarning } from "../catalog/legacyShipmentAliases.js";

type TrackingScheme = "standard" | "rl" | "ums";
type CarrierType = "pakistan_post" | "courier";
type ShipmentType = "RGL" | "IRL" | "UMS" | "VPL" | "VPP" | "PAR" | "COD" | "COURIER" | "RL" | null;

function resolveShipmentType(order: Record<string, unknown>, fallback: ShipmentType, enforceFallbackOnly = false): string | undefined {
  const rowShipmentType = resolveShipmentTypeCanonical(order.shipmentType ?? order.shipmenttype);
  const fallbackValue = resolveShipmentTypeCanonical(fallback);
  if (enforceFallbackOnly) {
    return fallbackValue || undefined;
  }
  if (rowShipmentType) {
    if (fallbackValue && rowShipmentType !== fallbackValue) {
      logCatalogShadowWarning("row_override", `Row shipment type '${rowShipmentType}' overrode selected shipment type '${fallbackValue}'.`);
    }
    return rowShipmentType;
  }
  if (!fallbackValue) {
    logCatalogShadowWarning("service_mismatch", "Unable to resolve shipment type from row or selected fallback.");
  }
  return fallbackValue || undefined;
}

export function prepareLabelOrders(
  orders: Array<Record<string, unknown>>,
  opts: {
    autoGenerateTracking: boolean;
    barcodeMode: "manual" | "auto";
    trackingScheme: TrackingScheme;
    carrierType: CarrierType;
    shipmentType: ShipmentType;
    outputMode: LabelPrintMode;
  },
): LabelOrder[] {
  const skipRows: number[] = [];

  return orders.map((order, idx) => {
    try {
      // Step 1: Extract and normalize manual tracking ID with safe trimming
      const manualRaw = String(order.TrackingID ?? "").trim();
      const manualTracking = manualRaw.toUpperCase().replace(/\s+/g, "");

      // Step 2: Resolve tracking number - use manual if valid, else generate or skip
      let trackingNumber: string;
      const resolvedShipmentType = resolveShipmentType(order, opts.shipmentType, opts.autoGenerateTracking);

      if (opts.autoGenerateTracking) {
        // Auto mode uses worker-allocated IDs to keep numbering globally monotonic.
        const allocated = String((order as any).__allocatedTrackingId ?? "").trim().toUpperCase();
        if (!allocated) {
          throw new Error("Missing allocated tracking ID in auto-generate mode.");
        }
        trackingNumber = allocated;
      } else if (manualTracking) {
        // Manual mode: uploaded tracking ID must match canonical tracking format.
        const validated = validateUploadedTrackingId(manualTracking);
        if (!validated.ok) {
          throw new Error(`Invalid tracking ID in row: ${(validated as any).reason}`);
        }
        trackingNumber = validated.value;
      } else {
        // Manual mode but no ID provided and auto is disabled - skip this row
        console.warn(
          `[BarcodeValidation] Row ${idx + 2}: Skipping - no tracking ID provided in manual barcode mode`,
        );
        skipRows.push(idx);
        return null as any;
      }

      // Step 3: Final validation
      // For system-generated IDs, apply strict format validation.
      // For uploaded IDs (already resolved above), skip regex check — just re-normalize.
      let trackingId: string;
      if (opts.autoGenerateTracking) {
        // Generated ID — strict validation
        const validated = validateTrackingId(trackingNumber);
        if (!validated.ok) {
          throw new Error(`Failed validation: ${(validated as any).reason}`);
        }
        const expectedPrefix = getTrackingPrefix(resolvedShipmentType);
        if (!validated.value.startsWith(expectedPrefix)) {
          throw new Error(`Generated tracking prefix mismatch: expected ${expectedPrefix}, got ${validated.value}`);
        }
        trackingId = validated.value;
      } else {
        // Uploaded ID — accept as-is (already non-empty validated above)
        trackingId = trackingNumber;
      }

      return {
        ...(order as LabelOrder),
        barcodeMode: opts.barcodeMode,
        TrackingID: trackingId,
        trackingNumber: trackingId,
        barcodeValue: trackingId,
        barcodeBase64: generateLabelBarcodeBase64(trackingId),
        skipGlobalBarcode: opts.outputMode === "envelope",
        carrierType: opts.carrierType,
        shipmentType: resolvedShipmentType,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[BarcodeValidation] Row ${idx + 2}: ${message}`);
      skipRows.push(idx);
      return null as any;
    }
  }).filter((o) => o !== null);
}