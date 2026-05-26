import { moneyOrderBreakdown, shouldApplyPakistanPostValuePayableRules } from "../validation/trackingId.js";

type TrackingMasterOrder = {
  trackingNumber?: unknown;
  carrierType?: unknown;
  shipmentType?: unknown;
  shipmenttype?: unknown;
  CollectAmount?: unknown;
  amount?: unknown;
  moneyOrderNumbers?: unknown;
  consigneeName?: unknown;
  consigneePhone?: unknown;
  receiverCity?: unknown;
  ProductDescription?: unknown;
  Weight?: unknown;
};

export type ResolveOrderShipmentType = (
  order: { shipmentType?: unknown; shipmenttype?: unknown },
  fallback?: unknown,
) => string | null;

function normalizeAmount(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function buildTrackingMasterFileName(jobId: string) {
  return `${jobId}-tracking-master.xlsx`;
}

export function buildTrackingMasterRows(
  jobId: string,
  labelOrdersForRender: TrackingMasterOrder[],
  defaultShipmentType: string | null,
  resolveOrderShipmentType: ResolveOrderShipmentType,
): Array<Record<string, string | number>> {
  const generatedDate = new Date().toISOString().slice(0, 10);

  return labelOrdersForRender.map((order) => {
    const shipmentType = resolveOrderShipmentType(order, defaultShipmentType) ?? "";
    const collectAmount = normalizeAmount((order as any).CollectAmount ?? (order as any).amount ?? 0);
    const mosNumbers = Array.isArray((order as any).moneyOrderNumbers)
      ? ((order as any).moneyOrderNumbers as unknown[])
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];
    const mosNumberCell = mosNumbers.join(", ");
    const valuePayable = shouldApplyPakistanPostValuePayableRules(order.carrierType, shipmentType) && collectAmount > 0;
    const breakdown = valuePayable ? moneyOrderBreakdown(collectAmount, shipmentType) : [];
    const moAmount = breakdown.reduce((sum, line) => sum + Number(line.moAmount ?? 0), 0);
    const moCommission = breakdown.reduce((sum, line) => sum + Number(line.commission ?? 0), 0);
    const grossAmount = breakdown.reduce((sum, line) => sum + Number(line.grossAmount ?? 0), 0);

    return {
      "Batch ID": jobId,
      "Generated Date": generatedDate,
      "Tracking ID": normalizeText(order.trackingNumber),
      "MOS Number": mosNumberCell,
      "Shipment Type": shipmentType,
      "Receiver Name": normalizeText((order as any).consigneeName),
      "Receiver Phone": normalizeText((order as any).consigneePhone),
      "Receiver City": normalizeText((order as any).receiverCity),
      Product: normalizeText((order as any).ProductDescription),
      Weight: normalizeText((order as any).Weight),
      "Collect Amount": collectAmount,
      "MO Amount": valuePayable ? moAmount : 0,
      "MO Commission": valuePayable ? moCommission : 0,
      "Gross Amount": valuePayable ? grossAmount : collectAmount,
      "Current Status": "BOOKED",
      "Complaint Status": "NOT_RAISED",
      "Settlement Status": "PENDING",
    };
  });
}

export function buildFilteredTrackingMasterRows(
  jobId: string,
  labelOrdersForRender: TrackingMasterOrder[],
  defaultShipmentType: string | null,
  resolveOrderShipmentType: ResolveOrderShipmentType,
): Array<Record<string, string | number>> {
  return buildTrackingMasterRows(jobId, labelOrdersForRender, defaultShipmentType, resolveOrderShipmentType)
    .filter((row) => String(row["Tracking ID"] ?? "").trim().length > 0);
}
