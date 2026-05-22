import { type LabelOrder, type LabelPrintMode, generateLabelBarcodeBase64 } from "../templates/labels.js";
import { getTrackingPrefix, validateTrackingId, validateUploadedTrackingId, resolveShipmentType as resolveShipmentTypeCanonical } from "../validation/trackingId.js";

type TrackingScheme = "standard" | "rl" | "ums";
type CarrierType = "pakistan_post" | "courier";
type ShipmentMode = "single_service" | "mix_articles";
type ShipmentType = "RGL" | "IRL" | "UMS" | "PAR" | "VPL" | "VPP" | "COD" | "COURIER" | null;

function resolveShipmentType(order: Record<string, unknown>, fallback: ShipmentType, mode: ShipmentMode): string | undefined {
  const rowShipmentType = resolveShipmentTypeCanonical(order.shipmentType ?? order.shipmenttype);
  const fallbackValue = resolveShipmentTypeCanonical(fallback);
  if (mode === "single_service") {
    return fallbackValue || undefined;
  }
  if (rowShipmentType) return rowShipmentType;
  return fallbackValue || undefined;
}

export function prepareLabelOrders(
  orders: Array<Record<string, unknown>>,
  opts: {
    autoGenerateTracking: boolean;
    barcodeMode: "manual" | "auto";
    shipmentMode: ShipmentMode;
    trackingScheme: TrackingScheme;
    carrierType: CarrierType;
    shipmentType: ShipmentType;
    outputMode: LabelPrintMode;
    strictValidation?: boolean;
  },
): LabelOrder[] {
  const rowErrors: string[] = [];

  const prepared = orders.map((order, idx) => {
    try {
      // Step 1: Extract and normalize manual tracking ID with safe trimming
      const manualRaw = String(order.TrackingID ?? "").trim();
      const manualTracking = manualRaw.toUpperCase().replace(/\s+/g, "");

      // Step 2: Resolve tracking number - use manual if valid, else generate or skip
      let trackingNumber: string;
      const resolvedShipmentType = resolveShipmentType(order, opts.shipmentType, opts.shipmentMode);
      if (!resolvedShipmentType || resolvedShipmentType === "COURIER") {
        throw new Error("Row shipment type is missing or unsupported for Pakistan Post generation.");
      }

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
        const expectedPrefix = getTrackingPrefix(resolvedShipmentType);
        if (!trackingNumber.startsWith(expectedPrefix)) {
          throw new Error(`Tracking prefix mismatch: expected ${expectedPrefix} for shipment ${resolvedShipmentType}, got ${trackingNumber}`);
        }
      } else {
        // Manual mode but no ID provided and auto is disabled - skip this row
        throw new Error("No tracking ID provided in manual barcode mode");
      }

            // Step 3: Final validation
            // For system-generated IDs, apply strict format validation.
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
      const rowMessage = `Row ${idx + 2}: ${message}`;
      console.error(`[BarcodeValidation] ${rowMessage}`);
      rowErrors.push(rowMessage);
      return null as any;
    }
  }).filter((o) => o !== null);

  if (opts.strictValidation && rowErrors.length > 0) {
    throw new Error(`Label row validation failed. ${rowErrors.slice(0, 50).join(" ")}`);
  }

  return prepared;
}