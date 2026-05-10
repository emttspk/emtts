import { type LabelOrder, type LabelPrintMode, generateLabelBarcodeBase64 } from "../templates/labels.js";
import { buildTrackingId, validateTrackingId, validateUploadedTrackingId } from "../validation/trackingId.js";

type TrackingScheme = "standard" | "rl" | "ums";
type CarrierType = "pakistan_post" | "courier";
type ShipmentType = "RGL" | "IRL" | "UMS" | "VPL" | "VPP" | "PAR" | "COD" | "COURIER" | "RL" | null;

const KNOWN_SHIPMENT_TYPES = new Set(["RGL", "IRL", "UMS", "VPL", "VPP", "PAR", "COD", "COURIER", "RL"]);

function resolveShipmentType(order: Record<string, unknown>, fallback: ShipmentType): string | undefined {
  const rowShipmentTypeRaw = String(order.shipmentType ?? order.shipmenttype ?? "").trim().toUpperCase();
  const rowShipmentType = rowShipmentTypeRaw === "RL" ? "RGL" : rowShipmentTypeRaw;
  const fallbackNormalized = String(fallback ?? "").trim().toUpperCase();
  const fallbackValue = fallbackNormalized === "RL" ? "RGL" : fallbackNormalized;
  // Only accept known shipment type values from the row; unrecognized values (e.g. "DOCUMENTS")
  // must NOT override the job-level selection — they silently break badge text and calculation rendering.
  if (rowShipmentType && KNOWN_SHIPMENT_TYPES.has(rowShipmentType)) {
    return rowShipmentType;
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
  let serial = 1;
  const skipRows: number[] = [];

  return orders.map((order, idx) => {
    try {
      // Step 1: Extract and normalize manual tracking ID with safe trimming
      const manualRaw = String(order.TrackingID ?? "").trim();
      const manualTracking = manualRaw.toUpperCase().replace(/\s+/g, "");

      // Step 2: Resolve tracking number - use manual if valid, else generate or skip
      let trackingNumber: string;
      const resolvedShipmentType = resolveShipmentType(order, opts.shipmentType);

      if (manualTracking) {
        // Manual mode: uploaded tracking ID — accept any non-empty format
        const validated = validateUploadedTrackingId(manualTracking);
        if (!validated.ok) {
          throw new Error(`Invalid tracking ID in row: ${(validated as any).reason}`);
        }
        trackingNumber = validated.value;
      } else if (opts.autoGenerateTracking) {
        // Auto mode: generate new ID with correct prefix for shipment type
        trackingNumber = buildTrackingId(serial++, new Date(), resolvedShipmentType);
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
      if (opts.autoGenerateTracking && !String(order.TrackingID ?? "").trim()) {
        // Generated ID — strict validation
        const validated = validateTrackingId(trackingNumber);
        if (!validated.ok) {
          throw new Error(`Failed validation: ${(validated as any).reason}`);
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