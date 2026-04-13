import { type LabelOrder, type LabelPrintMode, generateLabelBarcodeBase64 } from "../templates/labels.js";
import { buildTrackingId, validateTrackingId } from "../validation/trackingId.js";

type TrackingScheme = "standard" | "rl" | "ums";
type CarrierType = "pakistan_post" | "courier";
type ShipmentType = "RL" | "UMS" | "VPL" | "VPP" | "PAR" | "COD" | "COURIER" | null;

const KNOWN_SHIPMENT_TYPES = new Set(["RL", "UMS", "VPL", "VPP", "PAR", "COD", "COURIER"]);

function resolveShipmentType(order: Record<string, unknown>, fallback: ShipmentType): string | undefined {
  const rowShipmentType = String(order.shipmentType ?? order.shipmenttype ?? "").trim().toUpperCase();
  // Only accept known shipment type values from the row; unrecognized values (e.g. "DOCUMENTS")
  // must NOT override the job-level selection — they silently break badge text and calculation rendering.
  if (rowShipmentType && KNOWN_SHIPMENT_TYPES.has(rowShipmentType)) {
    return rowShipmentType;
  }
  return fallback ?? undefined;
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

  return orders.map((order) => {
    const manualTracking = String(order.TrackingID ?? "").trim();
    const trackingNumber = manualTracking || (opts.autoGenerateTracking ? buildTrackingId(serial++) : "");
    const validated = validateTrackingId(trackingNumber);
    if (!validated.ok) {
      throw new Error(`Invalid trackingId for barcode generation: ${validated.reason}`);
    }

    const trackingId = validated.value;
    return {
      ...(order as LabelOrder),
      barcodeMode: opts.barcodeMode,
      TrackingID: trackingId,
      trackingNumber: trackingId,
      barcodeValue: trackingId,
      barcodeBase64: generateLabelBarcodeBase64(trackingId),
      skipGlobalBarcode: opts.outputMode === "envelope",
      carrierType: opts.carrierType,
      shipmentType: resolveShipmentType(order, opts.shipmentType),
    };
  });
}