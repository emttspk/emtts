import type { OrderRecord } from "../parse/orders.js";
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import JsBarcode from "jsbarcode";
import {
  buildMoneyOrderNumber,
  buildTrackingId,
  moneyOrderBreakdown,
  reverseMoneyOrderFromGross,
  shouldApplyPakistanPostValuePayableRules,
  shouldShowValuePayableAmount,
  validateMoneyOrderNumber,
} from "../validation/trackingId.js";

export type LabelOrder = OrderRecord & {
  barcodeMode?: "manual" | "auto";
  barcodeValue?: string;
  trackingNumber?: string;
  barcodeBase64?: string;
  skipGlobalBarcode?: boolean;
  carrierType?: "pakistan_post" | "courier";
  shipmentType?: string;
  weight?: string;
  reference?: string;
  moneyOrderNumbers?: string[];
};

export type LabelPrintMode = "labels" | "envelope" | "flyer";

function escapeHtml(input: unknown) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toNum(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveMoneyOrderCommission(order: Record<string, unknown>) {
  return toNum(
    order.mo_commission ??
      order.moCommission ??
      order.commission ??
      order.MOCommission ??
      order.Commission ??
      0,
  );
}

function deriveNetCommissionFromGross(grossAmount: number, shipmentType: unknown) {
  const normalizedShipment = String(shipmentType ?? "").trim().toUpperCase();
  const gross = Math.max(0, Math.floor(grossAmount));
  
  // COD: no commission — collect amount is the MO amount directly
  if (normalizedShipment === "COD") {
    return { netAmount: gross, commission: 0 };
  }

  // VPL/VPP: Calculate commission based on GROSS amount, then derive net
  if (normalizedShipment === "VPL" || normalizedShipment === "VPP") {
    const commission = gross > 10_000 ? 100 : 75;
    return { netAmount: Math.max(0, gross - commission), commission };
  }

  // ENVELOPE: Calculate commission based on gross, then derive net
  if (normalizedShipment === "ENVELOPE") {
    const commission = gross > 10_000 ? 100 : 75;
    return { netAmount: Math.max(0, gross - commission), commission };
  }

  // All other types (parcel, document, etc.) - no commission
  return { netAmount: gross, commission: 0 };
}

function formatWeightInGrams(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const normalized = raw.toLowerCase().replace(/,/g, "");
  const numeric = Number.parseFloat(normalized.replace(/[^\d.]+/g, ""));
  if (!Number.isFinite(numeric)) return escapeHtml(raw);

  if (normalized.includes("kg")) return `${Math.round(numeric * 1000)} g`;
  return `${Math.round(numeric)} g`;
}

function formatIssueDate(value = new Date()) {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = String(value.getFullYear());
  return `${day}-${month}-${year}`;
}

function toDisplayDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return formatIssueDate();

  const ddmmyyyy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    return `${String(Number(ddmmyyyy[1])).padStart(2, "0")}-${String(Number(ddmmyyyy[2])).padStart(2, "0")}-${ddmmyyyy[3]}`;
  }

  const ddmmyy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (ddmmyy) {
    const year = Number(ddmmyy[3]) >= 70 ? `19${ddmmyy[3]}` : `20${ddmmyy[3]}`;
    return `${String(Number(ddmmyy[1])).padStart(2, "0")}-${String(Number(ddmmyy[2])).padStart(2, "0")}-${year}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${String(Number(iso[3])).padStart(2, "0")}-${String(Number(iso[2])).padStart(2, "0")}-${iso[1]}`;
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${String(Number(slash[1])).padStart(2, "0")}-${String(Number(slash[2])).padStart(2, "0")}-${slash[3]}`;
  }

  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) return formatIssueDate(parsed);
  return formatIssueDate();
}

function resolveDispatchDate(value: unknown) {
  return toDisplayDate(value ?? new Date());
}

function resolveMoneyOrderSenderFields(order: OrderRecord) {
  const baseSenderName = String((order as any)?.senderName ?? order.shipperName ?? "").trim() || "-";
  const senderAddress = normalizeAddressLines((order as any)?.senderAddress ?? order.shipperAddress ?? "") || "-";
  const senderPhone = String((order as any)?.senderPhone ?? order.shipperPhone ?? "").trim() || "-";
  const senderCnic = String((order as any)?.senderCnic ?? (order as any)?.shipperCnic ?? (order as any)?.cnic ?? "").trim() || "-";
  const senderName = baseSenderName !== "-" ? `${baseSenderName} (${senderCnic !== "-" ? senderCnic : "N/A"})` : baseSenderName;
  return { senderName, senderAddress, senderPhone, senderCnic };
}

function amountToWords(value: number) {
  const n = Math.max(0, Math.floor(value));
  if (n === 0) return "Zero";

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const underThousand = (num: number) => {
    const parts: string[] = [];
    const hundreds = Math.floor(num / 100);
    const rest = num % 100;
    if (hundreds > 0) parts.push(`${ones[hundreds]} Hundred`);
    if (rest >= 10 && rest < 20) {
      parts.push(teens[rest - 10]);
    } else {
      const ten = Math.floor(rest / 10);
      const one = rest % 10;
      if (ten > 0) parts.push(tens[ten]);
      if (one > 0) parts.push(ones[one]);
    }
    return parts.join(" ").trim();
  };

  const chunks: Array<[number, string]> = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1000, "Thousand"],
  ];

  let remaining = n;
  const parts: string[] = [];
  for (const [divisor, label] of chunks) {
    const chunk = Math.floor(remaining / divisor);
    if (chunk > 0) {
      parts.push(`${underThousand(chunk)} ${label}`.trim());
      remaining %= divisor;
    }
  }
  if (remaining > 0) parts.push(underThousand(remaining));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function expectedAmountWords(value: number) {
  return `${amountToWords(value)} Only`;
}

function strictMoneyOrderNumber(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const validated = validateMoneyOrderNumber(raw);
  if (validated.ok) return validated.value;

  const suffixStripped = raw.replace(/-S\d+$/i, "");
  const isCod = suffixStripped.startsWith("UMO");
  const knownPrefix = isCod ? "UMO" : "MOS";
  const digits = (suffixStripped.startsWith("MOS") || suffixStripped.startsWith("UMO"))
    ? suffixStripped.slice(3).replace(/\D/g, "")
    : suffixStripped.replace(/\D/g, "");
  if (digits.length < 8) return "-";

  const mm = digits.length >= 8 ? digits.slice(-8, -6) : "00";
  const seq = digits.slice(-6);
  const normalizedMonth = /^(0[1-9]|1[0-2])$/.test(mm) ? mm : String(new Date().getMonth() + 1).padStart(2, "0");
  const coerced = `${knownPrefix}${normalizedMonth}${seq}`;
  return validateMoneyOrderNumber(coerced).ok ? coerced : "-";
}

function resolveTracking(o: LabelOrder, autoGenerateTracking: boolean) {
  const precomputed = String(o.trackingNumber ?? o.TrackingID ?? "").trim();
  if (precomputed) return precomputed;
  const existing = String(o.TrackingID ?? "").trim();
  if (existing) return existing;
  return autoGenerateTracking ? "" : "";
}

function resolveOrderShipmentType(order: Pick<LabelOrder, "shipmentType" | "shipmenttype">) {
  return String(order.shipmentType ?? order.shipmenttype ?? "PAR").trim().toUpperCase() || "PAR";
}

function displayShipmentType(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "RL") return "RGL";
  return normalized || "PAR";
}

function normalizeAddressLines(value: unknown) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function compactInlineParts(parts: unknown[]) {
  return parts
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

type LabelAmountSummary = {
  carrierType: "pakistan_post" | "courier";
  shipmentType: string;
  appliesPakistanPostRules: boolean;
  grossAmount: number;
  moAmount: number;
  commission: number;
  showCalculation: boolean;
};

function isUploadedLabelRow(order: Record<string, unknown>) {
  const mode = String(order.barcodeMode ?? order.barcode_mode ?? "").trim().toLowerCase();
  return mode === "manual";
}

function getLabelAmountSummary(order: Pick<LabelOrder, "carrierType" | "shipmentType" | "shipmenttype" | "CollectAmount" | "barcodeMode">): LabelAmountSummary {
  const carrierType = order.carrierType === "courier" ? "courier" : "pakistan_post";
  const shipmentType = resolveOrderShipmentType(order);
  const collectAmount = toNum(order.CollectAmount);
  const appliesPakistanPostRules = shouldApplyPakistanPostValuePayableRules(carrierType, shipmentType) && collectAmount > 0;
  if (!appliesPakistanPostRules) {
    return {
      carrierType,
      shipmentType,
      appliesPakistanPostRules,
      grossAmount: collectAmount,
      moAmount: 0,
      commission: 0,
      showCalculation: false,
    };
  }

  if (shipmentType === "COD") {
    return {
      carrierType,
      shipmentType,
      appliesPakistanPostRules,
      grossAmount: collectAmount,
      moAmount: collectAmount,
      commission: 0,
      showCalculation: true,
    };
  }

  const uploadedGrossMode = isUploadedLabelRow(order as Record<string, unknown>) && (shipmentType === "VPL" || shipmentType === "VPP");
  if (uploadedGrossMode) {
    const reversed = reverseMoneyOrderFromGross(collectAmount, shipmentType);
    return {
      carrierType,
      shipmentType,
      appliesPakistanPostRules,
      grossAmount: reversed.grossAmount,
      moAmount: reversed.moAmount,
      commission: reversed.commission,
      showCalculation: true,
    };
  }

  const { netAmount, commission } = deriveNetCommissionFromGross(collectAmount, shipmentType);
  const grossAmount = netAmount + commission;
  return {
    carrierType,
    shipmentType,
    appliesPakistanPostRules,
    grossAmount,
    moAmount: netAmount,
    commission,
    showCalculation: shipmentType === "VPL" || shipmentType === "VPP" || shipmentType === "COD",
  };
}

function resolveMoneyOrderAmount(order: Pick<LabelOrder, "CollectAmount" | "shipmentType" | "shipmenttype" | "barcodeMode"> & Record<string, unknown>) {
  // Always derive net MO amount via getLabelAmountSummary (which correctly handles
  // uploaded-gross vs normal orders and VPL/VPP commission deduction).
  // Do NOT use the DB-stored amountRs as the primary source — it may have been stored
  // as the gross collect amount (bug present in pre-fix records).
  const summary = getLabelAmountSummary(
    order as Pick<LabelOrder, "carrierType" | "shipmentType" | "shipmenttype" | "CollectAmount" | "barcodeMode">,
  );
  if (summary.appliesPakistanPostRules && summary.moAmount > 0) {
    return summary.moAmount;
  }

  // Fallback: use the explicit DB-stored amount only for non-Pakistani-Post orders
  const explicitMoAmount = toNum(order.amountRs ?? order.amount ?? 0);
  if (explicitMoAmount > 0) {
    return explicitMoAmount;
  }

  return toNum(
    order.CollectAmount ?? order.collect_amount ?? order.collected_amount ?? order.collectAmount ?? 0,
  );
}

function renderBoxAmountBlock(summary: LabelAmountSummary) {
  if (!summary.appliesPakistanPostRules) {
    return "";
  }

  const formatRs = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
  return `
    <div class="money">
      <div class="money-row"><span class="money-label">MO Amount</span><span class="money-value">Rs. ${escapeHtml(formatRs(summary.moAmount))}</span></div>
      <div class="money-row"><span class="money-label">MO Commission</span><span class="money-value">Rs. ${escapeHtml(formatRs(summary.commission))}</span></div>
      <div class="money-row"><span class="money-label">Gross Collect Amount</span><span class="money-value">Rs. ${escapeHtml(formatRs(summary.grossAmount))}</span></div>
    </div>
  `;
}

function loadHtmlTemplate(candidates: string[], notFoundMessage: string) {
  const templatePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!templatePath) {
    throw new Error(notFoundMessage);
  }
  const template = fs.readFileSync(templatePath, "utf8");
  const bodyOpen = template.search(/<body[^>]*>/i);
  const bodyClose = template.search(/<\/body>/i);
  if (bodyOpen < 0 || bodyClose < 0 || bodyClose <= bodyOpen) {
    throw new Error(`${notFoundMessage} (invalid body tag)`);
  }
  const openTagEnd = template.indexOf(">", bodyOpen);
  if (openTagEnd < 0) {
    throw new Error(`${notFoundMessage} (malformed body tag)`);
  }
  return {
    head: template.slice(0, openTagEnd + 1),
    body: template.slice(openTagEnd + 1, bodyClose).trim(),
    tail: template.slice(bodyClose),
  };
}

function loadBoxTemplate() {
  return loadHtmlTemplate(
    [
      path.resolve(process.cwd(), "apps", "api", "src", "templates", "label-box-a4.html"),
      path.resolve(process.cwd(), "src", "templates", "label-box-a4.html"),
    ],
    "Box shipment template not found: label-box-a4.html",
  );
}

export function generateLabelBarcodeBase64(text: string) {
  try {
    const value = String(text ?? "").trim();
    if (!value || value === "-") return "";
    const canvas = createCanvas(520, 140);
    JsBarcode(canvas, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 84,
      width: 2,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

export function labelsHtml(orders: LabelOrder[], opts?: { autoGenerateTracking?: boolean; includeMoneyOrders?: boolean }) {
  const autoGenerateTracking = opts?.autoGenerateTracking === true;
  const template = loadBoxTemplate();

  const renderSingleLabel = (o: LabelOrder) => {
    const carrier = o.carrierType === "courier" ? "Courier" : "Pakistan Post";
    const shipmentType = resolveOrderShipmentType(o);
    const shipmentLabel = displayShipmentType(shipmentType);
    const amountSummary = getLabelAmountSummary(o);

    const tracking = resolveTracking(o, autoGenerateTracking);
    const barcodeImg = o.skipGlobalBarcode
      ? ""
      : o.barcodeBase64
        ? `<img src="${o.barcodeBase64}" class="barcode-image" alt="Barcode" />`
        : `<div class="barcode-fallback">${escapeHtml(tracking || "NO TRACKING")}</div>`;

    const senderName = String(o.shipperName ?? "").trim();
    const senderAddress = normalizeAddressLines(o.shipperAddress);
    const senderCity = String(o.senderCity ?? "").trim();

    const receiverName = String(o.consigneeName ?? "");
    const receiverAddress = normalizeAddressLines(o.consigneeAddress);
    const receiverCity = String(o.receiverCity ?? "");
    const receiverPhone = String(o.consigneePhone ?? "");

    const weight = formatWeightInGrams(o.Weight);
    const orderId = String((o as any).ordered ?? "").trim();
    const product = String(o.ProductDescription ?? "");

    const formatRs = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
    const prefixBadgeText = amountSummary.showCalculation
      ? `${shipmentLabel} | Rs. ${formatRs(amountSummary.moAmount)}`
      : amountSummary.appliesPakistanPostRules
        ? `${shipmentLabel} | Rs. ${formatRs(amountSummary.grossAmount)}`
        : shipmentLabel;
    const dispatchDateLine = `Dispatch Date: ${resolveDispatchDate((o as any)?.issueDate)}`;
    const trackingLine = tracking || "-";

    return `
      <div class="label-core">
        <div class="topbar">
          <div class="topbar-left">
            <div class="carrier">${escapeHtml(carrier)}</div>
            <div class="dispatch-date">${escapeHtml(dispatchDateLine)}</div>
          </div>
          <div class="prefix-badge">${escapeHtml(prefixBadgeText)}</div>
        </div>

        <div class="barcode-wrap">
          ${barcodeImg}
          <div class="tracking-line">${escapeHtml(trackingLine)}</div>
        </div>

        <div class="blocks">
          <div class="block to-block">
            <div class="k">TO:</div>
            <div class="v strong receiver-name">${escapeHtml(receiverName)}</div>
            <div class="v address">${escapeHtml(receiverAddress)}</div>
            <div class="v">${escapeHtml(receiverCity)}</div>
            <div class="v">${escapeHtml(receiverPhone)}</div>
          </div>

          <div class="block from-block">
            <div class="k">FROM:</div>
            <div class="v strong from-name">${escapeHtml(senderName || "-")}</div>
            <div class="v address">${escapeHtml(senderAddress || "-")}</div>
            <div class="v">${escapeHtml(senderCity || "-")}</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-card weight-card">
            <div class="info-label">Weight</div>
            <div class="info-value mono">${escapeHtml(weight || "0 g")}</div>
          </div>
          <div class="info-card order-card">
            <div class="info-label">Order</div>
            <div class="info-value mono product-value">${escapeHtml(orderId || "-")}</div>
          </div>
          <div class="info-card product-card">
            <div class="info-label">Product</div>
            <div class="info-value mono product-value">${escapeHtml(product)}</div>
          </div>
        </div>

        ${renderBoxAmountBlock(amountSummary)}

        <div class="footer">
          <div class="footer-strong">Free Bulk Dispatch &amp; Tracking</div>
          <div class="footer-link">www.epost.pk</div>
        </div>
      </div>
    `;
  };

  const emptyLabel = () => `<div class="label label-empty"></div>`;

  const renderLabelSlot = (o: LabelOrder | null) => {
    if (!o) return emptyLabel();
    return `<div class="label"><div class="label-fit">${renderSingleLabel(o)}</div></div>`;
  };

  const pages: string[] = [];
  const labelsPerPage = 4;
  for (let i = 0; i < orders.length; i += labelsPerPage) {
    const pageData: Array<LabelOrder | null> = orders.slice(i, i + labelsPerPage);
    while (pageData.length < labelsPerPage) pageData.push(null);
    pages.push(`<div class="page">${pageData.map((item) => renderLabelSlot(item)).join("")}</div>`);
  }

  return `${template.head}${pages.join("")}${template.tail}`;
}

export function boxPreviewHtml(opts?: {
  carrierType?: "pakistan_post" | "courier";
  shipmentType?: string;
  includeMoneyOrders?: boolean;
}) {
  return previewLabelHtml({ ...opts, outputMode: "labels" });
}

export function renderLabelDocumentHtml(
  orders: LabelOrder[],
  opts?: { autoGenerateTracking?: boolean; includeMoneyOrders?: boolean; outputMode?: LabelPrintMode },
) {
  const outputMode = opts?.outputMode ?? "labels";
  if (outputMode === "envelope") {
    return envelopeHtml(orders, opts);
  }
  if (outputMode === "flyer") {
    return flyerHtml(orders, opts);
  }
  return labelsHtml(orders, opts);
}

export function previewLabelHtml(opts?: {
  carrierType?: "pakistan_post" | "courier";
  shipmentType?: string;
  includeMoneyOrders?: boolean;
  outputMode?: LabelPrintMode;
}) {
  const carrierType = opts?.carrierType === "courier" ? "courier" : "pakistan_post";
  const shipmentType = String(opts?.shipmentType ?? "VPL").trim().toUpperCase() || "VPL";
  const includeMoneyOrders = opts?.includeMoneyOrders === true;
  const outputMode = opts?.outputMode ?? "labels";
  const sampleCount = outputMode === "flyer" ? 8 : outputMode === "envelope" ? 2 : 4;
  const sampleOrders = Array.from({ length: sampleCount }, (_, index) => {
    const trackingNumber = buildTrackingId(index + 1, new Date());
    const grossAmount = 500 + index * 125;
    const moneyOrderNumbers = includeMoneyOrders && shouldShowValuePayableAmount(shipmentType)
      ? moneyOrderBreakdown(grossAmount, shipmentType).map((_, moIndex) => buildMoneyOrderNumber(index + moIndex + 1, new Date()))
      : [];
    return {
      shipperName: `Sender ${index + 1}`,
      shipperEmail: `sender${index + 1}@example.com`,
      shipperAddress: `Street ${index + 1}, Example Market`,
      senderCity: `City ${index + 1}`,
      shipperPhone: `0300000${String(index + 1).padStart(4, "0")}`,
      consigneeName: `Receiver ${index + 1}`,
      consigneeEmail: `receiver${index + 1}@example.com`,
      consigneeAddress: `House ${index + 10}, Block ${index + 1}`,
      receiverCity: `Town ${index + 1}`,
      consigneePhone: `0311000${String(index + 1).padStart(4, "0")}`,
      shipmentType,
      shipmenttype: shipmentType,
      carrierType,
      CollectAmount: String(grossAmount),
      trackingNumber,
      TrackingID: trackingNumber,
      barcodeBase64: generateLabelBarcodeBase64(trackingNumber),
      moneyOrderNumbers,
      ordered: `ORDER-${index + 1}`,
      ProductDescription: `Product ${index + 1}`,
      Weight: `${index + 1} kg`,
      numberOfPieces: "1",
    } satisfies LabelOrder;
  });

  return renderLabelDocumentHtml(sampleOrders, {
    autoGenerateTracking: false,
    includeMoneyOrders: includeMoneyOrders && shouldShowValuePayableAmount(shipmentType),
    outputMode,
  });
}

export function flyerHtml(orders: LabelOrder[], opts?: { autoGenerateTracking?: boolean; includeMoneyOrders?: boolean }) {
  const autoGenerateTracking = opts?.autoGenerateTracking === true;

  const renderFlyerLabel = (o: LabelOrder) => {
    const carrier = o.carrierType === "courier" ? "Courier" : "Pakistan Post";
    const shipmentType = resolveOrderShipmentType(o);
    const shipmentLabel = displayShipmentType(shipmentType);
    const amountSummary = getLabelAmountSummary(o);
    const tracking = resolveTracking(o, autoGenerateTracking);
    const barcodeImg = o.skipGlobalBarcode
      ? ""
      : o.barcodeBase64
        ? `<img src="${o.barcodeBase64}" class="fl-barcode-image" alt="Barcode" />`
        : `<div class="fl-barcode-fallback">${escapeHtml(tracking || "NO TRACKING")}</div>`;

    const receiverName = String(o.consigneeName ?? "");
    const receiverAddress = normalizeAddressLines(o.consigneeAddress);
    const receiverCity = String(o.receiverCity ?? "");
    const receiverPhone = String(o.consigneePhone ?? "");
    const senderName = String(o.shipperName ?? "");
    const senderCity = String(o.senderCity ?? "");
    const weight = formatWeightInGrams(o.Weight);
    const dispatchDateLine = `Dispatch Date: ${resolveDispatchDate((o as any)?.issueDate)}`;
    const prefixBadgeText = amountSummary.appliesPakistanPostRules ? `${shipmentLabel} Rs.${amountSummary.moAmount}` : shipmentLabel;
    const formatRs = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
    const amountMarkup = amountSummary.appliesPakistanPostRules
      ? `<div class="fl-amount-box"><div class="fl-amount-row"><span>MO Amount</span><span>Rs.${escapeHtml(formatRs(amountSummary.moAmount))}</span></div></div>`
      : "";

    return `
      <div class="fl-label">
        <div class="fl-top">
          <div class="fl-carrier-stack">
            <div class="fl-carrier">${escapeHtml(carrier)}</div>
            <div class="fl-dispatch-date">${escapeHtml(dispatchDateLine)}</div>
          </div>
          <div class="fl-badge">${escapeHtml(prefixBadgeText)}</div>
        </div>
        <div class="fl-barcode-wrap">
          ${barcodeImg}
          <div class="fl-tracking">${escapeHtml(tracking)}</div>
        </div>
        ${amountMarkup}
        <div class="fl-to">
          <span class="fl-k">TO:</span>
          <span class="fl-name">${escapeHtml(receiverName)}</span>
          <div class="fl-addr">${escapeHtml(receiverAddress)}</div>
          <div class="fl-city-phone">${escapeHtml([receiverCity, receiverPhone].filter(Boolean).join(" · "))}</div>
        </div>
        <div class="fl-from">
          <span class="fl-k">FROM:</span>
          <span class="fl-from-name">${escapeHtml(senderName)}</span>
          ${senderCity ? `<span class="fl-from-city">${escapeHtml(senderCity)}</span>` : ""}
          ${weight ? `<span class="fl-weight">${escapeHtml(weight)}</span>` : ""}
        </div>
      </div>`;
  };

  const emptySlot = () => `<div class="fl-label fl-label-empty"></div>`;
  const renderSlot = (o: LabelOrder | null) => (o ? renderFlyerLabel(o) : emptySlot());

  const pages: string[] = [];
  const labelsPerPage = 8;
  for (let i = 0; i < orders.length; i += labelsPerPage) {
    const pageData: Array<LabelOrder | null> = orders.slice(i, i + labelsPerPage);
    while (pageData.length < labelsPerPage) pageData.push(null);
    pages.push(`<div class="fl-page">${pageData.map(renderSlot).join("")}</div>`);
  }

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 3mm; }
        html, body { margin: 0; padding: 0; color: #000; font-family: Arial, sans-serif; }
        .fl-page {
          width: 204mm;
          height: 291mm;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          grid-template-rows: repeat(4, 1fr);
          gap: 3mm;
          box-sizing: border-box;
          page-break-after: always;
        }
        .fl-page:last-child { page-break-after: auto; }
        .fl-label {
          width: 100%;
          height: 100%;
          border: 0.5mm solid #000;
          box-sizing: border-box;
          padding: 2mm;
          display: grid;
          grid-template-rows: auto auto 1fr auto;
          gap: 1.2mm;
          overflow: hidden;
        }
        .fl-label-empty { background: #fff; border: 0.3mm dashed #ccc; }
        .fl-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 0.3mm solid #000; padding-bottom: 0.8mm; }
        .fl-carrier-stack { display: grid; gap: 0.25mm; min-width: 0; }
        .fl-carrier { font-weight: 900; font-size: 3.5mm; text-transform: uppercase; letter-spacing: 0.12mm; }
        .fl-dispatch-date { font-size: 2.1mm; font-weight: 700; line-height: 1.05; }
        .fl-badge { border: 0.3mm solid #000; padding: 0.6mm 1.2mm; font-weight: 900; font-size: 3mm; white-space: nowrap; }
        .fl-barcode-wrap { display: grid; justify-items: center; gap: 0.5mm; }
        .fl-barcode-image { width: 88mm; height: 9mm; object-fit: contain; display: block; }
        .fl-barcode-fallback { width: 88mm; height: 9mm; border: 0.3mm dashed #000; display: grid; place-items: center; font-weight: 900; font-size: 2.5mm; }
        .fl-tracking { font-family: "Courier New", Courier, monospace; font-weight: 900; letter-spacing: 0.24mm; font-size: 2.4mm; text-align: center; }
        .fl-amount-box { border: 0.25mm solid #000; padding: 0.8mm 1.2mm; display: grid; gap: 0.5mm; }
        .fl-amount-row { display: flex; justify-content: space-between; gap: 2mm; font-size: 2.3mm; font-weight: 900; }
        .fl-to { display: grid; gap: 0.5mm; overflow: hidden; }
        .fl-k { font-weight: 900; font-size: 2.5mm; letter-spacing: 0.3mm; }
        .fl-name { font-weight: 900; font-size: 3.2mm; }
        .fl-addr { font-size: 2.6mm; line-height: 1.15; white-space: pre-line; overflow: hidden; }
        .fl-city-phone { font-size: 2.5mm; color: #222; }
        .fl-from { display: flex; flex-wrap: wrap; align-items: center; gap: 1mm; border-top: 0.3mm solid #000; padding-top: 0.8mm; font-size: 2.4mm; }
        .fl-from-name { font-weight: 700; }
        .fl-from-city { color: #444; }
        .fl-weight { border: 0.25mm solid #000; padding: 0.3mm 0.8mm; font-family: "Courier New", Courier, monospace; font-size: 2.3mm; font-weight: 700; }
      </style>
    </head>
    <body>${pages.join("")}</body>
  </html>`;
}

export function envelopeHtml(orders: LabelOrder[], opts?: { autoGenerateTracking?: boolean; includeMoneyOrders?: boolean }) {
  const autoGenerateTracking = opts?.autoGenerateTracking === true;

  const loadEnvelopeTemplate = () => {
    return loadHtmlTemplate(
      [
        path.resolve(process.cwd(), "apps", "api", "src", "templates", "label-envelope-9x4.html"),
        path.resolve(process.cwd(), "apps", "api", "src", "templates", "label-envelope.html"),
        path.resolve(process.cwd(), "src", "templates", "label-envelope-9x4.html"),
        path.resolve(process.cwd(), "src", "templates", "label-envelope.html"),
      ],
      "Envelope template not found: label-envelope.html",
    );
  };

  const renderEnvelopePage = (templateBody: string, o: LabelOrder) => {
    const amountSummary = getLabelAmountSummary(o);
    const shipmentType = amountSummary.shipmentType;
    const shipmentLabel = displayShipmentType(shipmentType);
    const tracking = resolveTracking(o, autoGenerateTracking);

    const senderName = String(o.shipperName ?? "");
    const senderAddress = compactInlineParts([normalizeAddressLines(o.shipperAddress), String(o.senderCity ?? "")]).join("\n");
    const senderPhone = String(o.shipperPhone ?? "");

    const receiverName = String(o.consigneeName ?? "");
    const receiverAddress = compactInlineParts([normalizeAddressLines(o.consigneeAddress), String(o.receiverCity ?? "")]).join("\n");
    const receiverPhone = String(o.consigneePhone ?? "");

    const formatRs = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
    const senderInline = [
      senderName.trim(),
      compactInlineParts([normalizeAddressLines(o.shipperAddress).replace(/\n+/g, ", "), String(o.senderCity ?? ""), senderPhone]).join(", "),
    ]
      .filter(Boolean)
      .join(", ");
    const senderContact = "";
    const orderId = String((o as any).ordered ?? "").trim();
    const productDetails = String((o as any).ProductDescription ?? "").trim();

    const calcDisplay = amountSummary.showCalculation ? "" : "is-hidden";
    const amountPrimaryLabel = "Money Order";
    const amountPrimaryValue = amountSummary.showCalculation ? `${formatRs(amountSummary.moAmount)}` : "";
    const amountPrimaryClass = amountSummary.showCalculation ? "" : "is-hidden";
    const amountSecondaryLabel = "MO Commission";
    const amountSecondaryValue = amountSummary.showCalculation ? `${formatRs(amountSummary.commission)}` : "";
    const amountSecondaryClass = amountSummary.showCalculation ? "" : "is-hidden";
    const amountTotalLabel = "MO Amount";
    const amountTotalValue = amountSummary.showCalculation ? `${formatRs(amountSummary.moAmount)}` : "";
    const amountTotalClass = amountSummary.showCalculation ? "" : "is-hidden";

    const prefixText = amountSummary.showCalculation
      ? `${shipmentLabel} | Rs. ${formatRs(amountSummary.moAmount)}`
      : shipmentLabel;

    const barcodeBase64 = String(o.barcodeBase64 ?? "").trim();
    const barcodePayload = barcodeBase64.replace(/^data:image\/png;base64,/, "");

    const valueMap: Record<string, string> = {
      "{prefix}": escapeHtml(prefixText),
      "{tracking_id}": escapeHtml(tracking),
      "{mos_numbers}": "",
      "{mos_class}": "is-hidden",
      "{receiver_name}": escapeHtml(receiverName),
      "{receiver_address}": escapeHtml(receiverAddress),
      "{receiver_contact}": escapeHtml(receiverPhone),
      "{sender_name}": escapeHtml(senderName),
      "{sender_inline}": escapeHtml(senderInline),
      "{sender_contact}": escapeHtml(senderContact),
      "{sender_contact_class}": senderContact ? "" : "is-hidden",
      "{sender_address}": escapeHtml(senderAddress),
      "{gross_amount}": escapeHtml(formatRs(amountSummary.moAmount)),
      "{mo_commission}": escapeHtml(formatRs(amountSummary.commission)),
      "{total_amount}": escapeHtml(formatRs(amountSummary.grossAmount)),
      "{amount_primary_label}": escapeHtml(amountPrimaryLabel),
      "{amount_primary_value}": escapeHtml(amountPrimaryValue),
      "{amount_primary_class}": amountPrimaryClass,
      "{amount_secondary_label}": escapeHtml(amountSecondaryLabel),
      "{amount_secondary_value}": escapeHtml(amountSecondaryValue),
      "{amount_secondary_class}": amountSecondaryClass,
      "{amount_total_label}": escapeHtml(amountTotalLabel),
      "{amount_total_value}": escapeHtml(amountTotalValue),
      "{amount_total_class}": amountTotalClass,
      "{calc_class}": calcDisplay,
      "{order_id}": escapeHtml(orderId),
      "{order_class}": orderId ? "" : "is-hidden",
      "{product_details}": escapeHtml(productDetails),
      "{product_class}": productDetails ? "" : "is-hidden",
      "{dispatch_date}": escapeHtml(`Dispatch Date: ${resolveDispatchDate((o as any)?.issueDate)}`),
      "{{barcode}}": escapeHtml(barcodePayload),
    };

    const rendered = Object.entries(valueMap).reduce((html, [token, value]) => html.split(token).join(value), templateBody);
    return rendered.replace(/\{[a-z_]+\}/g, "");
  };

  const template = loadEnvelopeTemplate();
  const pages = orders.map((order) => renderEnvelopePage(template.body, order)).join("");
  return `${template.head}${pages}${template.tail}`;
}

export function moneyOrderHtml(
  orders: OrderRecord[],
  opts?: { backgrounds?: { frontDataUrl?: string; backDataUrl?: string } },
) {
  void opts;
  return moneyOrderHtmlFromBenchmark(orders, resolveStaticMoFrontDataUrl());
}

let benchmarkMoHtmlCache: string | null = null;
let staticMoFrontDataUrlCache: string | null | undefined;

function resolveStaticMoFrontDataUrl() {
  if (staticMoFrontDataUrlCache !== undefined) {
    return staticMoFrontDataUrlCache ?? undefined;
  }

  const candidates = [
    path.resolve(process.cwd(), "MO", "MO F.png"),
    path.resolve(process.cwd(), "apps", "api", "templates", "MO F.png"),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const buf = fs.readFileSync(candidate);
      staticMoFrontDataUrlCache = `data:image/png;base64,${buf.toString("base64")}`;
      console.log("[MO_STATIC_FRONT_IMAGE]", candidate);
      return staticMoFrontDataUrlCache;
    } catch {
      // Continue trying fallbacks.
    }
  }

  staticMoFrontDataUrlCache = null;
  console.warn("[MO_STATIC_FRONT_IMAGE] Missing static front image: MO F.png");
  return undefined;
}

function resolveBenchmarkMoTemplatePath() {
  const candidates = [
    // Primary: committed templates directory — always present in the deployed container
    path.resolve(process.cwd(), "apps", "api", "templates", "mo-sample-two-records.html"),
    // Fallback A: root-level templates dir (some Railway service layouts)
    path.resolve(process.cwd(), "templates", "mo-sample-two-records.html"),
    // Fallback B: co-located with dist artefacts
    path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "templates", "mo-sample-two-records.html"),
    // Legacy paths (runtime-generated, not in git — kept for local dev)
    path.resolve(process.cwd(), "storage", "outputs", "mo-sample-two-records.html"),
    path.resolve(process.cwd(), "apps", "api", "storage", "outputs", "mo-sample-two-records.html"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        console.log("[MO_TEMPLATE_RESOLVED]", p);
        return p;
      }
    } catch {
      // skip inaccessible paths
    }
  }
  console.error("Benchmark template not found: mo-sample-two-records.html — checked paths:", candidates);
  return null;
}

function loadBenchmarkMoHtml() {
  if (benchmarkMoHtmlCache) return benchmarkMoHtmlCache;
  const inputPath = resolveBenchmarkMoTemplatePath();
  if (!inputPath) {
    // Do NOT cache the failure — let the next call retry the file system.
    // Throw so the worker knows this is a hard failure, not an empty PDF issue.
    throw new Error("BENCHMARK_TEMPLATE_MISSING: mo-sample-two-records.html not found. Ensure apps/api/templates/ is committed and deployed.");
  }
  benchmarkMoHtmlCache = fs.readFileSync(inputPath, "utf8");
  return benchmarkMoHtmlCache;
}

function splitBenchmarkSheets(htmlBody: string) {
  const marker = '<div class="sheet">';
  const positions: number[] = [];
  let offset = 0;
  while (true) {
    const idx = htmlBody.indexOf(marker, offset);
    if (idx === -1) break;
    positions.push(idx);
    offset = idx + marker.length;
  }

  if (positions.length !== 2) {
    console.warn("Pagination mismatch detected:", positions.length);
  }

  if (positions.length === 0) {
    return [htmlBody.trim(), ""] as const;
  }

  if (positions.length === 1) {
    return [htmlBody.slice(positions[0]).trim(), ""] as const;
  }

  const first = htmlBody.slice(positions[0], positions[1]).trim();
  const second = htmlBody.slice(positions[1], positions[2] ?? htmlBody.length).trim();
  return [first, second] as const;
}

function applyFrontBackgroundToBenchmarkHtml(htmlBody: string, frontDataUrl?: string) {
  if (!frontDataUrl) return htmlBody;

  const safeUrl = String(frontDataUrl).replace(/'/g, "%27");
  let out = htmlBody;
  const bgPattern = /(<div class="bg" style="background-image:url\(')([^']*)('\)"><\/div>)/g;

  out = replaceNth(out, bgPattern, 0, (_m, p1, _old, p3) => `${p1}${safeUrl}${p3}`);
  out = replaceNth(out, bgPattern, 1, (_m, p1, _old, p3) => `${p1}${safeUrl}${p3}`);

  return out;
}

function compactHtmlFragment(fragment: string) {
  return String(fragment ?? "")
    .replace(/>\s+</g, "><")
    .trim();
}

function replaceNth(
  input: string,
  regex: RegExp,
  occurrence: number,
  replacer: (match: string, ...args: string[]) => string,
) {
  let seen = 0;
  return input.replace(regex, (...args) => {
    const match = args[0] as string;
    const groups = args.slice(1, -2) as string[];
    if (seen++ === occurrence) {
      return replacer(match, ...groups);
    }
    return match;
  });
}

function splitMoNumber(baseMo: string, index: number) {
  const normalized = strictMoneyOrderNumber(baseMo);
  if (normalized === "-") return "-";
  if (index <= 0) return normalized;

  const prefix = normalized.slice(0, 5);
  const suffix = Number.parseInt(normalized.slice(-6), 10);
  if (!Number.isFinite(suffix)) return normalized;
  const next = ((suffix - 1 + index) % 999_999) + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

function generateMoBarcodeBase64(moNumber: string) {
  try {
    const value = strictMoneyOrderNumber(moNumber);
    if (!value || value === "-") return "";
    const canvas = createCanvas(308, 90);
    JsBarcode(canvas, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 56,
      width: 2,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function expandBenchmarkOrders(orders: OrderRecord[]): OrderRecord[] {
  const expanded: OrderRecord[] = [];
  const usedMoNumbers = new Set<string>();
  for (const order of orders) {
    const explicitMoNumber = strictMoneyOrderNumber((order as any)?.mo_number);
    const explicitMoAmount = toNum((order as any)?.amountRs ?? (order as any)?.amount ?? 0);
    if (explicitMoNumber !== "-" && explicitMoAmount > 0) {
      expanded.push({
        ...(order as any),
        mo_number: explicitMoNumber,
        mo_barcodeBase64: generateMoBarcodeBase64(explicitMoNumber),
        amount: String(explicitMoAmount),
        amountRs: explicitMoAmount,
        amountWords: expectedAmountWords(explicitMoAmount),
      });
      continue;
    }

    const moAmount = toNum((order as any)?.CollectAmount ?? (order as any)?.amount ?? (order as any)?.amountRs ?? 0);
    const lines = moneyOrderBreakdown(moAmount, (order as any)?.shipmentType ?? (order as any)?.shipmenttype);

    if (lines.length <= 1) {
      const resolvedMoAmount = lines[0]?.moAmount ?? moAmount;
      const resolvedMoNumber = strictMoneyOrderNumber((order as any)?.mo_number);
      expanded.push({
        ...(order as any),
        mo_number: resolvedMoNumber !== "-" ? resolvedMoNumber : (order as any)?.mo_number,
        mo_barcodeBase64: resolvedMoNumber !== "-" ? generateMoBarcodeBase64(resolvedMoNumber) : "",
        amount: String(resolvedMoAmount),
        amountRs: resolvedMoAmount,
        amountWords: expectedAmountWords(resolvedMoAmount),
      });
      continue;
    }

    const baseMo = String((order as any)?.mo_number ?? "-").trim().toUpperCase() || "-";
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      let splitMo = splitMoNumber(baseMo, i);
      if (splitMo !== "-") {
        let attempts = 0;
        while (usedMoNumbers.has(splitMo) && attempts < 9_999) {
          splitMo = splitMoNumber(splitMo, 1);
          attempts += 1;
        }
        usedMoNumbers.add(splitMo);
      }
      const moBarcodeValue = splitMo;
      expanded.push({
        ...(order as any),
        mo_number: splitMo,
        mo_barcodeBase64: generateMoBarcodeBase64(moBarcodeValue),
        amountRs: line.moAmount,
        amountWords: expectedAmountWords(line.moAmount),
      });
    }
  }
  return expanded;
}

function clearBenchmarkSlot(htmlBody: string, slotIndex: number) {
  let out = htmlBody;
  const transparent = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

  out = replaceNth(
    out,
    /(<img class="barcode" src=")([^"]*)(" alt="MO Barcode" style=")([^"]*)(" \/>)/g,
    slotIndex,
    (_m, p1, _src, p3, style, p5) => `${p1}${transparent}${p3}${style};visibility:hidden${p5}`,
  );

  const slotTextPatterns = [
    /(<div class="field mono en" style="left:9\.10mm;top:80\.33mm;width:41\.01mm;font-size:3\.28mm;text-align:center;">)([^<]*)(<\/div>)/g,
    /(<div class="field mono en" style="left:57\.43mm;top:39\.03mm;width:28\.29mm;font-size:3\.73mm;">)([^<]*)(<\/div>)/g,
    /(<div class="field urdu" style="left:40\.13mm;top:162\.57mm;width:28\.99mm;font-size:\.16mm;"><span class="en" style="display:inline-block;font-size:3\.25mm;">)([^<]*)(<\/span><\/div>)/g,
    /(<div class="field urdu" style="left:72\.73mm;top:140\.37mm;width:44\.55mm;font-size:2\.16mm;>\s*<span class="en" style="display:inline-block;font-size:5\.37mm;">)([^<]*)(<\/span><\/div>)/g,
    /(<div class="field mono en" style="left:28\.5mm;top:52\.45mm;width:39\.60mm;text-align:center;font-size:8\.53mm;font-weight:900;">)([^<]*)(<\/div>)/g,
    /(<div class="field urdu" style="left:90\.27mm;top:48\.04mm;width:45\.26mm;font-size:2\.10mm;"><span class="mono en" style="display:inline-block;font-size:4\.28mm;">)([^<]*)(<\/span><\/div>)/g,
    /(<div class="field regular en" style="left:91\.69mm;top:55\.33mm;width:43\.84mm;font-size:2\.89mm;white-space:normal;line-height:2\.06;">)([^<]*)(<\/div>)/g,
    /(<div class="field strong en" style="left:14\.56mm;top:93\.39mm;width:65\.06mm;font-size:2\.58mm;">)([^<]*)(<\/div>)/g,
    /(<div class="field regular en" style="left:14\.56mm;top:96\.86mm;width:65\.06mm;font-size:2\.13mm;white-space:normal;line-height:1\.06;">)([^<]*)(<\/div>)/g,
    /(<div class="field mono en" style="left:97\.56mm;top:100\.27mm;width:65\.06mm;font-size:2\.13mm;">)([^<]*)(<\/div>)/g,
    /(<div class="field strong en" style="left:47\.56mm;top:105\.69mm;width:65\.06mm;font-size:4\.(?:58|95)mm(?:;line-height:1\.08)?;">)([^<]*)(<\/div>)/g,
    /(<div class="field regular en" style="left:[0-9.]+mm;top:112\.15mm;width:65\.06mm;font-size:3\.(?:13|35)mm;white-space:normal;line-height:1\.(?:06|12);">)([^<]*)(<\/div>)/g,
    /(<div class="field mono en" style="left:82\.56mm;top:116\.57mm;width:65\.06mm;font-size:4\.(?:13|35)mm(?:;line-height:1\.06)?;">)([^<]*)(<\/div>)/g,
    /(<div class="field mono en" style="left:15\.56mm;top:198\.83mm;width:63\.64mm;font-size:2\.22mm;">)([^<]*)(<\/div>)/g,
  ];

  for (const pattern of slotTextPatterns) {
    out = replaceNth(out, pattern, slotIndex, (_m, p1, _old, p3) => `${p1}${p3}`);
  }

  out = replaceNth(
    out,
    /(<div class="field en" style="left:15\.56mm;top:174\.79mm;width:67\.18mm;font-size:1\.83mm;line-height:1\.12;white-space:normal;">)([\s\S]*?)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${p3}`,
  );

  return out;
}

function fillBenchmarkSlot(htmlBody: string, slotIndex: number, order?: OrderRecord) {
  if (!order) return clearBenchmarkSlot(htmlBody, slotIndex);

  const moNumber = strictMoneyOrderNumber((order as any)?.mo_number);
  const generatedTrackingId = String((order as any)?.barcodeValue ?? "").trim();
  const tracking = String((order as any)?.trackingNumber ?? (order as any)?.TrackingID ?? generatedTrackingId).trim() || "-";
  const amountMo = resolveMoneyOrderAmount(order as any);
  const amountDisplay = `${amountMo.toFixed(2)}`;
  const issueDate = toDisplayDate((order as any)?.issueDate ?? "");
  const dispatchDate = issueDate;
  const providedAmountWords = String((order as any)?.amountWords ?? "").trim();
  const expectedWords = expectedAmountWords(amountMo);
  if (providedAmountWords && providedAmountWords !== expectedWords) {
    console.error(`[MO_WORDS_MISMATCH] mo=${moNumber} amount=${amountMo} provided="${providedAmountWords}" expected="${expectedWords}"`);
  }
  const amountWords = expectedWords;
  const consigneeName = String((order as any)?.consigneeName ?? "-").trim() || "-";
  const consigneeAddress = normalizeAddressLines((order as any)?.consigneeAddress ?? "-") || "-";
  const consigneePhone = String((order as any)?.consigneePhone ?? "-").trim() || "-";
  const { senderName: shipperName, senderAddress: shipperAddress, senderPhone: shipperPhone, senderCnic: shipperCnic } = resolveMoneyOrderSenderFields(order);
  const moBarcode = String((order as any)?.mo_barcodeBase64 ?? "").trim();

  let out = htmlBody;

  // MO barcode image src
  out = replaceNth(
    out,
    /(<img class="barcode" src=")([^"]*)(" alt="MO Barcode" style="[^"]*" \/>)/g,
    slotIndex,
    (_m, p1, oldSrc, p3) => `${p1}${escapeHtml(moBarcode || oldSrc)}${p3}`,
  );

  // Text below barcode (MOS)
  out = replaceNth(
    out,
    /(<div class="field mono en" style="left:9\.10mm;top:80\.33mm;width:41\.01mm;font-size:3\.28mm;text-align:center;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(moNumber)}${p3}`,
  );

  // MO number field
  out = replaceNth(
    out,
    /(<div class="field mono en" style="left:57\.43mm;top:39\.03mm;width:28\.29mm;font-size:3\.73mm;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(moNumber)}${p3}`,
  );

  // Date
  out = replaceNth(
    out,
    /(<div class="field urdu" style="left:40\.13mm;top:162\.57mm;width:28\.99mm;font-size:\.16mm;"><span class="en" style="display:inline-block;font-size:3\.25mm;">)([^<]*)(<\/span><\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(issueDate)}${p3}`,
  );

  // Amount inline
  out = replaceNth(
    out,
    /(<div class="field urdu" style="left:72\.73mm;top:140\.37mm;width:44\.55mm;font-size:2\.16mm;">\s*<span class="en" style="display:inline-block;font-size:5\.37mm;">)([^<]*)(<\/span><\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(amountDisplay)}${p3}`,
  );

  // Amount box
  out = replaceNth(
    out,
    /(<div class="field mono en" style="left:28\.5mm;top:52\.45mm;width:39\.60mm;text-align:center;font-size:8\.53mm;font-weight:900;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(amountDisplay)}${p3}`,
  );

  // VP tracking
  out = replaceNth(
    out,
    /(<div class="field urdu" style="left:90\.27mm;top:48\.04mm;width:45\.26mm;font-size:2\.10mm;"><span class="mono en" style="display:inline-block;font-size:4\.28mm;">)([^<]*)(<\/span><\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(tracking)}${p3}`,
  );

  // Amount words
  out = replaceNth(
    out,
    /(<div class="field regular en" style="left:91\.69mm;top:55\.33mm;width:43\.84mm;font-size:2\.89mm;white-space:normal;line-height:2\.06;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(amountWords)}${p3}`,
  );

  // Receiver fields
  out = replaceNth(
    out,
    /(<div class="field strong en" style="left:14\.56mm;top:93\.39mm;width:65\.06mm;font-size:2\.58mm;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(consigneeName)}${p3}`,
  );
  out = replaceNth(
    out,
    /(<div class="field regular en" style="left:14\.56mm;top:96\.86mm;width:65\.06mm;font-size:2\.13mm;white-space:normal;line-height:1\.06;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(consigneeAddress)}${p3}`,
  );
  out = replaceNth(
    out,
    /(<div class="field mono en" style="left:97\.56mm;top:100\.27mm;width:65\.06mm;font-size:2\.13mm;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(consigneePhone)}${p3}`,
  );

  // Sender fields
  out = replaceNth(
    out,
    /(<div class="field strong en" style="left:47\.56mm;top:105\.69mm;width:65\.06mm;font-size:4\.(?:58|95)mm(?:;line-height:1\.08)?;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(shipperName)}${p3}`,
  );
  out = replaceNth(
    out,
    /(<div class="field regular en" style="left:[0-9.]+mm;top:112\.15mm;width:65\.06mm;font-size:3\.(?:13|35)mm;white-space:normal;line-height:1\.(?:06|12);">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(shipperAddress)}${p3}`,
  );
  out = replaceNth(
    out,
    /(<div class="field mono en" style="left:82\.56mm;top:116\.57mm;width:65\.06mm;font-size:4\.(?:13|35)mm(?:;line-height:1\.06)?;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(shipperPhone)}${p3}`,
  );

  // Bottom summary block (receiver + MOS + amount)
  out = replaceNth(
    out,
    /(<div class="field en" style="left:15\.56mm;top:174\.79mm;width:67\.18mm;font-size:1\.83mm;line-height:1\.12;white-space:normal;">)([\s\S]*?)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) =>
      `${p1}\n      ${escapeHtml(consigneeName)} | ${escapeHtml(consigneePhone)}<br/>\n      ${escapeHtml(consigneeAddress)}<br/>\n      MO: ${escapeHtml(moNumber)} | ${escapeHtml(amountDisplay)}\n    ${p3}`,
  );

  // Bottom tracking line
  out = replaceNth(
    out,
    /(<div class="field mono en" style="left:15\.56mm;top:198\.83mm;width:63\.64mm;font-size:2\.22mm;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) =>
      `${p1}${escapeHtml(tracking)}${p3}` +
      `<div class="field en" style="left:84.00mm;top:202.20mm;width:49.00mm;text-align:center;font-weight:900;font-size:2.45mm;line-height:1.1;">Free Bulk Dispatch &amp; Tracking</div>` +
      `<div class="field en" style="left:84.00mm;top:205.00mm;width:49.00mm;text-align:center;font-weight:700;font-size:2.2mm;line-height:1.1;">www.epost.pk</div>`,
  );

  return out;
}

function moneyOrderHtmlFromBenchmark(orders: OrderRecord[], frontBackgroundDataUrl?: string) {
  const expandedOrders = expandBenchmarkOrders(orders);
  const benchmarkHtml = loadBenchmarkMoHtml();
  const bodyMatch = benchmarkHtml.match(/([\s\S]*?<body>)([\s\S]*)(<\/body>[\s\S]*)/i);
  if (!bodyMatch) return benchmarkHtml;

  const head = bodyMatch[1];
  const benchmarkBody = applyFrontBackgroundToBenchmarkHtml(bodyMatch[2].trim(), frontBackgroundDataUrl);
  const tail = bodyMatch[3];
  const headWithPrintGuard = head.replace(
    /<\/head>/i,
    "<style>body{font-size:0;line-height:0}.sheet{font-size:0;line-height:0}.page{page-break-after:always}.page:last-child{page-break-after:auto}</style></head>",
  );
  const [frontSheetTemplate, backSheetTemplate] = splitBenchmarkSheets(benchmarkBody);

  if (expandedOrders.length === 0) {
    return `${headWithPrintGuard}${tail}`;
  }

  const chunks: string[] = [];
  for (let i = 0; i < expandedOrders.length; i += 2) {
    const o1 = expandedOrders[i];
    const o2 = expandedOrders[i + 1];
    let frontSheet = frontSheetTemplate;
    frontSheet = fillBenchmarkSlot(frontSheet, 0, o1);
    frontSheet = fillBenchmarkSlot(frontSheet, 1, o2);
    frontSheet = compactHtmlFragment(frontSheet);

    let backSheet = backSheetTemplate;
    backSheet = fillBenchmarkSlot(backSheet, 0, o1);
    backSheet = fillBenchmarkSlot(backSheet, 1, o2);
    backSheet = compactHtmlFragment(backSheet);

    const pages: string[] = [];
    const frontHTML = frontSheet;
    const backHTML = backSheet;

    pages.push(`<div class="page">${frontHTML}</div>`);
    pages.push(`<div class="page">${backHTML}</div>`);

    if (!backHTML || backHTML.trim() === "") {
      console.error("BACK PAGE EMPTY - FIX DATA BINDING");
    }

    if (pages.length !== 2) {
      console.warn("Pagination mismatch detected:", pages.length);
    }
    chunks.push(pages.join(""));
  }

  return `${headWithPrintGuard}${chunks.join("")}${tail}`;
}

function moneyOrderDuplexHtml(orders: OrderRecord[], bg: { frontBg?: string; backBg?: string }) {
  // Each half: 148.5mm (W) × 210mm (H) — portrait, fills one side of A4 landscape
  const renderHalf = (o: OrderRecord, side: "front" | "back") => {
    const bgUrl = side === "front" ? bg.frontBg : bg.backBg;
    return compactHtmlFragment(`<div class="half ${side}"><div class="bg" style="${bgUrl ? `background-image:url('${bgUrl}')` : ""}"></div><div class="overlay">${side === "front" ? frontFields(o) : backFields(o)}</div></div>`);
  };

  const blankHalf = () => `<div class="half"></div>`;

  const sheets: string[] = [];
  for (let i = 0; i < orders.length; i += 2) {
    const pair = orders.slice(i, i + 2);
    const o1 = pair[0]!;
    const o2 = pair[1];

    // Page 1 — FRONT: left = Order N front, right = Order N+1 front
    sheets.push(compactHtmlFragment(`<div class="sheet">${renderHalf(o1, "front")}${o2 ? renderHalf(o2, "front") : blankHalf()}</div>`));

    // Page 2 — BACK: left = Order N back, right = Order N+1 back (duplex short-edge flip)
    sheets.push(compactHtmlFragment(`<div class="sheet">${renderHalf(o1, "back")}${o2 ? renderHalf(o2, "back") : blankHalf()}</div>`));
  }

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4 landscape; margin: 0; }
        html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; font-size: 0; line-height: 0; }

        /* A4 landscape: 297mm × 210mm — two portrait halves side by side */
        .sheet {
          width: 297mm;
          height: 210mm;
          display: flex;
          flex-direction: row;
          page-break-after: always;
          overflow: hidden;
          font-size: 0;
          line-height: 0;
        }
        .sheet:last-child { page-break-after: auto; }

        /* Each half is a portrait MO: 148.5mm × 210mm */
        .half {
          width: 148.5mm;
          height: 210mm;
          position: relative;
          background: #fff;
          overflow: hidden;
          flex-shrink: 0;
        }

        /* Duplex correction scoped only to back half wrapper (short-edge flip) */
        .half.back {
          transform: rotate(180deg);
          transform-origin: center center;
        }

        /* Background fills the entire portrait half */
        .bg {
          position: absolute;
          inset: 0;
          z-index: 1;
          background-repeat: no-repeat;
          background-position: center center;
          background-size: 100% 100%;
          transform: none;
        }

        /* Overlay anchored to top-left of the half */
        .overlay {
          position: absolute;
          inset: 0;
          z-index: 2;
        }

        .field {
          position: absolute;
          z-index: 5;
          line-height: 1;
          white-space: nowrap;
          overflow: hidden;
        }
        .mono   { font-family: "Courier New", Courier, monospace; letter-spacing: 0.18mm; font-weight: 700; }
        .regular { font-weight: 500; }
        .strong  { font-weight: 700; }
        .urdu { direction: rtl; text-align: right; font-weight: 700; }
        .en { direction: ltr; text-align: left; }
        .barcode { position: absolute; z-index: 5; object-fit: contain; }
      </style>
    </head>
    <body>${sheets.join("")}</body>
  </html>`;
}

function frontFields(o: OrderRecord) {
  const moNumber = strictMoneyOrderNumber((o as any).mo_number);
  const generatedTrackingId = String((o as any).barcodeValue ?? "").trim();
  const tracking = String((o as any).trackingNumber ?? o.TrackingID ?? generatedTrackingId).trim() || "-";
  const amountRaw = resolveMoneyOrderAmount(o as any);
  const amountDisplay = Number.isFinite(amountRaw) ? amountRaw.toFixed(2) : "0.00";
  const showMoText = moNumber !== "-";
  const moBarcode = String((o as any).mo_barcodeBase64 ?? "").trim();
  const issueDate = String((o as any).issueDate ?? "").trim() || formatIssueDate();
  const amountWords = expectedAmountWords(amountRaw);
  const consigneeName = String((o as any).consigneeName ?? "").trim() || "-";
  const consigneeAddress = normalizeAddressLines((o as any).consigneeAddress ?? "") || "-";
  const consigneePhone = String((o as any).consigneePhone ?? "").trim() || "-";
  const { senderName: shipperName, senderAddress: shipperAddress, senderPhone: shipperPhone } = resolveMoneyOrderSenderFields(o);

  return [
    // MOS barcode area with locked final dimensions
    moBarcode
      ? `<img class="barcode" src="${moBarcode}" alt="MO Barcode" style="left:10.10mm;top:69mm;width:42.01mm;height:10.44mm;" />`
      : "",

    // Locked text block below MOS barcode
    showMoText
      ? `<div class="field mono en" style="left:9.10mm;top:80.33mm;width:41.01mm;font-size:3.28mm;text-align:center;">${escapeHtml(moNumber)}</div>`
      : "",

    // Locked MO number field next to M.O No.
    `<div class="field mono en" style="left:57.43mm;top:39.03mm;width:28.29mm;font-size:3.73mm;">${escapeHtml(moNumber)}</div>`,

    // Date inline after Urdu label (same line)
    `<div class="field urdu" style="left:40.13mm;top:162.57mm;width:28.99mm;font-size:.16mm;">(تاریخ) <span class="en" style="display:inline-block;font-size:3.25mm;">${escapeHtml(issueDate)}</span></div>`,

    // Amount inline after Urdu label (same line)
    `<div class="field urdu" style="left:72.73mm;top:140.37mm;width:44.55mm;font-size:2.16mm;">(روپیہ) <span class="en" style="display:inline-block;font-size:5.37mm;">${escapeHtml(amountDisplay)}</span></div>`,

    // Amount box: amount only, fixed decimal, bold, large
    `<div class="field mono en" style="left:28.5mm;top:52.45mm;width:39.60mm;text-align:center;font-size:8.53mm;font-weight:900;">${escapeHtml(amountDisplay)}</div>`,

    // VP article inline after Urdu label (same line) with tracking ID
    `<div class="field urdu" style="left:90.27mm;top:48.04mm;width:45.26mm;font-size:2.10mm;">(نمبر وی پی) <span class="mono en" style="display:inline-block;font-size:4.28mm;">${escapeHtml(tracking)}</span></div>`,

    // Amount in words aligned on words line
    `<div class="field regular en" style="left:91.69mm;top:55.33mm;width:43.84mm;font-size:2.89mm;white-space:normal;line-height:2.06;">${escapeHtml(amountWords)}</div>`,

    // Receiver block
    `<div class="field strong en" style="left:14.56mm;top:93.39mm;width:65.06mm;font-size:2.58mm;">${escapeHtml(consigneeName)}</div>`,
    `<div class="field regular en" style="left:14.56mm;top:96.86mm;width:65.06mm;font-size:2.13mm;white-space:normal;line-height:1.06;">${escapeHtml(consigneeAddress)}</div>`,
    `<div class="field mono en" style="left:97.56mm;top:100.27mm;width:65.06mm;font-size:2.13mm;">${escapeHtml(consigneePhone)}</div>`,

    // Sender block
    `<div class="field strong en" style="left:47.56mm;top:105.69mm;width:65.06mm;font-size:4.95mm;line-height:1.08;">${escapeHtml(shipperName)}</div>`,
    `<div class="field regular en" style="left:15.56mm;top:112.15mm;width:65.06mm;font-size:3.35mm;white-space:normal;line-height:1.12;">${escapeHtml(shipperAddress)}</div>`,
    `<div class="field mono en" style="left:82.56mm;top:116.57mm;width:65.06mm;font-size:4.35mm;line-height:1.06;">${escapeHtml(shipperPhone)}</div>`,

    // Sender block (second half)
    `<div class="field strong en" style="left:47.56mm;top:183.69mm;width:65.06mm;font-size:4.95mm;line-height:1.08;">${escapeHtml(shipperName)}</div>`,
    `<div class="field regular en" style="left:15.56mm;top:190.15mm;width:65.06mm;font-size:3.35mm;white-space:normal;line-height:1.12;">${escapeHtml(shipperAddress)}</div>`,
    `<div class="field mono en" style="left:82.56mm;top:194.57mm;width:65.06mm;font-size:4.35mm;line-height:1.06;">${escapeHtml(shipperPhone)}</div>`,

    // Bottom-left summary block (receiver detail + MO + amount)
    `<div class="field en" style="left:15.56mm;top:174.79mm;width:67.18mm;font-size:1.83mm;line-height:1.12;white-space:normal;">
      ${escapeHtml(consigneeName)} | ${escapeHtml(consigneePhone)}<br/>
      ${escapeHtml(consigneeAddress)}<br/>
      MOS: ${escapeHtml(moNumber)} | ${escapeHtml(amountDisplay)}
    </div>`,

    // Bottom-left tracking text only
    `<div class="field mono en" style="left:15.56mm;top:198.83mm;width:63.64mm;font-size:2.22mm;">${escapeHtml(tracking)}</div>`,
  ].join("");
}

function backFields(_o: OrderRecord) {
  // Back side contains only the background image; no data overlay required
  return "";
}
