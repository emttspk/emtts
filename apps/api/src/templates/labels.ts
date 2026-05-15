import type { OrderRecord } from "../parse/orders.js";
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import JsBarcode from "jsbarcode";
import { getSharedPrintFooter, LABEL_STANDARD_CSS, PRINT_MARKETING_LINE, PRINTABLE_FOOTER_CLASS_NAME, PRINTABLE_FOOTER_CSS } from "../lib/printBranding.js";
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

export type LabelPrintMode = "labels" | "envelope" | "envelope-premium" | "flyer";

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
  const senderName = baseSenderName;
  return { senderName, senderAddress, senderPhone, senderCnic };
}

function formatMoneyOrderSenderLine(senderName: string, senderCnic: string) {
  if (senderCnic && senderCnic !== "-") {
    return `${senderName} | CNIC: ${senderCnic}`;
  }
  return senderName;
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

const ESCAPED_PRINT_MARKETING_LINE = escapeHtml(PRINT_MARKETING_LINE);
let pakistanPostLogoDataUrlCache: string | null | undefined;

function marketingFooterTextHtml() {
  return ESCAPED_PRINT_MARKETING_LINE;
}

function injectSharedPrintCss(head: string) {
  return head.replace(/<\/head>/i, `<style>${LABEL_STANDARD_CSS}${PRINTABLE_FOOTER_CSS}</style></head>`);
}

function resolvePakistanPostLogoDataUrl() {
  if (pakistanPostLogoDataUrlCache !== undefined) return pakistanPostLogoDataUrlCache ?? "";

  const candidates = [
    path.resolve(process.cwd(), "images", "logo.png"),
    path.resolve(process.cwd(), "apps", "web", "public", "assets", "pakistan-post-logo.png"),
  ];

  const logoPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!logoPath) {
    pakistanPostLogoDataUrlCache = null;
    return "";
  }

  const extension = path.extname(logoPath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : "image/png";
  const content = fs.readFileSync(logoPath);
  pakistanPostLogoDataUrlCache = `data:${mime};base64,${content.toString("base64")}`;
  return pakistanPostLogoDataUrlCache;
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
    templatePath,
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

function generatePremiumEnvelopeBarcodeBase64(text: string) {
  try {
    const value = String(text ?? "").trim();
    if (!value || value === "-") return "";
    const canvas = createCanvas(560, 100);
    JsBarcode(canvas, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 74,
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
  const logoSrc = resolvePakistanPostLogoDataUrl();

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
    const logoMarkup = logoSrc ? `<img src="${logoSrc}" class="pp-logo" alt="Pakistan Post" />` : `<div class="carrier">Pakistan Post</div>`;

    return `
      <div class="label-core">
        <div class="topbar">
          <div class="topbar-left">
            <div class="brand-row">
              ${logoMarkup}
              <div class="brand-copy">
                <div class="carrier">${escapeHtml(carrier)}</div>
                <div class="dispatch-date">${escapeHtml(dispatchDateLine)}</div>
              </div>
            </div>
          </div>
          <div class="prefix-badge">${escapeHtml(prefixBadgeText)}</div>
        </div>

        <div class="BarcodeBlock barcode-wrap">
          ${barcodeImg}
          <div class="tracking-line">${escapeHtml(trackingLine)}</div>
        </div>

        <div class="blocks">
          <div class="LabelWrapper AddressBlock block to-block">
            <div class="k">TO:</div>
            <div class="v strong receiver-name">${escapeHtml(receiverName)}</div>
            <div class="v address">${escapeHtml(receiverAddress)}</div>
            <div class="v">${escapeHtml(receiverCity)}</div>
            <div class="v">${escapeHtml(receiverPhone)}</div>
          </div>

          <div class="LabelWrapper AddressBlock block from-block">
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

        <div class="FooterBlock footer">
          <div class="footer-strong ${PRINTABLE_FOOTER_CLASS_NAME}">${marketingFooterTextHtml()}</div>
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
    pages.push(`<div class="PrintContainer LabelGrid page">${pageData.map((item) => renderLabelSlot(item)).join("")}</div>`);
  }

  return `${injectSharedPrintCss(template.head)}${pages.join("")}${template.tail}`;
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
  if (outputMode === "envelope-premium") {
    return premiumEnvelopeHtml(orders, opts);
  }
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
  const shipmentType = String(opts?.shipmentType ?? "PAR").trim().toUpperCase() || "PAR";
  const includeMoneyOrders = opts?.includeMoneyOrders === true;
  const outputMode = opts?.outputMode ?? "labels";
  const sampleCount = outputMode === "flyer" ? 8 : outputMode === "envelope" || outputMode === "envelope-premium" ? 2 : 4;
  const sampleOrders = Array.from({ length: sampleCount }, (_, index) => {
    const trackingNumber = buildTrackingId(index + 1, new Date(), shipmentType);
    const grossAmount = 500 + index * 125;
    const moneyOrderNumbers = includeMoneyOrders && shouldShowValuePayableAmount(shipmentType)
      ? moneyOrderBreakdown(grossAmount, shipmentType).map((_, moIndex) => buildMoneyOrderNumber(index + moIndex + 1, new Date(), shipmentType))
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
  const logoSrc = resolvePakistanPostLogoDataUrl();

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
    const { senderName, senderAddress, senderPhone } = resolveMoneyOrderSenderFields(o as unknown as OrderRecord);
    const senderCity = String(o.senderCity ?? "");
    const senderAddressInline = compactInlineParts([senderAddress.replace(/\n+/g, ", "), senderCity]).join(", ");
    const weight = formatWeightInGrams(o.Weight);
    const orderId = String((o as any).ordered ?? "").trim() || "-";
    const dispatchDateLine = `Dispatch Date: ${resolveDispatchDate((o as any)?.issueDate)}`;
    const prefixBadgeText = amountSummary.appliesPakistanPostRules ? `${shipmentLabel} Rs.${amountSummary.moAmount}` : shipmentLabel;
    const logoMarkup = logoSrc ? `<img src="${logoSrc}" class="fl-logo" alt="Pakistan Post" />` : `<div class="fl-carrier">${escapeHtml(carrier)}</div>`;
    const formatRs = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
    const amountMarkup = amountSummary.appliesPakistanPostRules
      ? `<div class="fl-bottom-grid">
          <div class="fl-card fl-amount-box">
          <div class="fl-amount-title">MONEY ORDER SUMMARY</div>
          <div class="fl-amount-row"><span>MO Amount</span><span>Rs.${escapeHtml(formatRs(amountSummary.moAmount))}</span></div>
          <div class="fl-amount-row"><span>MO Commission</span><span>Rs.${escapeHtml(formatRs(amountSummary.commission))}</span></div>
          <div class="fl-amount-row"><span>Gross Collect Amount</span><span>Rs.${escapeHtml(formatRs(amountSummary.grossAmount))}</span></div>
          </div>
          <div class="fl-card fl-product-box">
            <div class="fl-product-title">PRODUCT DETAILS</div>
            <div class="fl-product-row"><span>Weight</span><span>${escapeHtml(weight || "-")}</span></div>
            <div class="fl-product-row"><span>Order ID</span><span>${escapeHtml(orderId)}</span></div>
          </div>
        </div>`
      : "";

    return `
      <div class="fl-label">
        <div class="fl-top">
          <div class="fl-carrier-stack">
            <div class="fl-brand-row">
              ${logoMarkup}
              <div class="fl-brand-copy">
                <div class="fl-carrier">${escapeHtml(carrier)}</div>
                <div class="fl-dispatch-date">${escapeHtml(dispatchDateLine)}</div>
              </div>
            </div>
          </div>
          <div class="fl-badge">${escapeHtml(prefixBadgeText)}</div>
        </div>
        <div class="BarcodeBlock fl-barcode-wrap">
          ${barcodeImg}
          <div class="fl-tracking">${escapeHtml(tracking)}</div>
        </div>
        <div class="LabelWrapper AddressBlock fl-to">
          <span class="fl-k">TO:</span>
          <span class="fl-name">${escapeHtml(receiverName)}</span>
          <div class="fl-addr">${escapeHtml(receiverAddress || "-")}</div>
          <div class="fl-city-phone">${escapeHtml(receiverCity || "-")}</div>
          <div class="fl-city-phone">${escapeHtml(receiverPhone || "-")}</div>
        </div>
        ${amountMarkup}
        <div class="FooterBlock fl-from">
          <span class="fl-from-line">FROM: ${escapeHtml(compactInlineParts([senderName, senderAddressInline, senderPhone]).join(" | ") || "-")}</span>
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
        ${LABEL_STANDARD_CSS}${PRINTABLE_FOOTER_CSS}
        @page { size: A4; margin: 3mm; }
        :root {
          --a4-width: 210mm;
          --a4-height: 297mm;
          --page-margin: 3mm;
          --page-safe-width-trim: 3mm;
          --fl-col-gap: 3mm;
          --fl-row-gap: 3mm;
          --fl-page-width: calc(var(--a4-width) - (var(--page-margin) * 2) - var(--page-safe-width-trim));
          --fl-page-height: calc(var(--a4-height) - (var(--page-margin) * 2));
          --fl-label-width: calc((var(--fl-page-width) - var(--fl-col-gap)) / 2);
        }
        .fl-page {
          width: var(--fl-page-width);
          height: var(--fl-page-height);
          display: grid;
          grid-template-columns: repeat(2, minmax(0, var(--fl-label-width)));
          grid-template-rows: repeat(4, minmax(0, 1fr));
          column-gap: var(--fl-col-gap);
          row-gap: var(--fl-row-gap);
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
          grid-template-rows: auto auto 1fr auto auto;
          gap: 1.2mm;
          overflow: hidden;
        }
        .fl-label-empty { background: #fff; border: 0.3mm dashed #ccc; }
        .fl-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 0.3mm solid #000; padding-bottom: 0.8mm; min-width: 0; }
        .fl-carrier-stack { display: grid; gap: 0.25mm; min-width: 0; }
        .fl-brand-row { display: flex; align-items: center; gap: 1.2mm; min-width: 0; }
        .fl-brand-copy { display: grid; gap: 0.25mm; min-width: 0; }
        .fl-logo { width: 22mm; max-height: 8mm; object-fit: contain; }
        .fl-carrier { font-weight: 900; font-size: 3.5mm; text-transform: uppercase; letter-spacing: 0.12mm; }
        .fl-dispatch-date { font-size: 2.1mm; font-weight: 700; line-height: 1.05; }
        .fl-badge { border: 0.3mm solid #000; padding: 0.6mm 1.2mm; font-weight: 900; font-size: 3mm; white-space: nowrap; }
        .fl-barcode-wrap { display: grid; justify-items: center; gap: 0.5mm; }
        .fl-barcode-image { width: 100%; max-width: 88mm; height: 9mm; object-fit: contain; display: block; }
        .fl-barcode-fallback { width: 88mm; height: 9mm; border: 0.3mm dashed #000; display: grid; place-items: center; font-weight: 900; font-size: 2.5mm; }
        .fl-tracking { font-family: "Courier New", Courier, monospace; font-weight: 900; letter-spacing: 0.24mm; font-size: 2.4mm; text-align: center; }
        .fl-bottom-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1mm; align-items: stretch; }
        .fl-card { border: 0.35mm solid #000; padding: 0.9mm 1.2mm; display: grid; gap: 0.45mm; background: #fff; min-height: 15.5mm; align-content: start; }
        .fl-amount-box { display: grid; gap: 0.5mm; }
        .fl-amount-title { font-size: 2.2mm; font-weight: 900; letter-spacing: 0.2mm; border-bottom: 0.25mm solid #000; padding-bottom: 0.35mm; }
        .fl-amount-row { display: flex; justify-content: space-between; gap: 2mm; font-size: 2.25mm; font-weight: 800; }
        .fl-product-title { font-size: 2.2mm; font-weight: 900; letter-spacing: 0.2mm; border-bottom: 0.25mm solid #000; padding-bottom: 0.35mm; }
        .fl-product-row { display: flex; justify-content: space-between; gap: 2mm; font-size: 2.25mm; font-weight: 800; }
        .fl-to { display: grid; gap: 0.45mm; overflow: hidden; border: 0.3mm solid #000; padding: 0.95mm 1.2mm; }
        .fl-k { font-weight: 900; font-size: 2.5mm; letter-spacing: 0.3mm; }
        .fl-name { font-weight: 900; font-size: 3mm; }
        .fl-addr { font-size: 2.45mm; line-height: 1.15; white-space: pre-line; overflow: hidden; min-height: 6.1mm; }
        .fl-city-phone { font-size: 2.35mm; color: #111; font-weight: 700; }
        .fl-from { border-top: 0.3mm solid #000; padding-top: 0.8mm; font-size: 2.25mm; }
        .fl-from-line { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 800; }
      </style>
    </head>
    <body>${pages.join("")}</body>
  </html>`;
}

export function envelopeHtml(orders: LabelOrder[], opts?: { autoGenerateTracking?: boolean; includeMoneyOrders?: boolean }) {
  const autoGenerateTracking = opts?.autoGenerateTracking === true;
  const logoSrc = resolvePakistanPostLogoDataUrl();

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

    const senderFields = resolveMoneyOrderSenderFields(o as unknown as OrderRecord);
    const senderName = senderFields.senderName;
    const senderAddress = compactInlineParts([senderFields.senderAddress, String(o.senderCity ?? "")]).join("\n");
    const senderPhone = senderFields.senderPhone;

    const receiverName = String(o.consigneeName ?? "");
    const receiverAddress = compactInlineParts([normalizeAddressLines(o.consigneeAddress), String(o.receiverCity ?? "")]).join("\n");
    const receiverPhone = String(o.consigneePhone ?? "");

    const formatRs = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
    const senderInline = [
      senderName.trim(),
      compactInlineParts([senderAddress.replace(/\n+/g, ", ")]).join(", "),
    ]
      .filter(Boolean)
      .join(", ");
    const senderContact = senderPhone && senderPhone !== "-" ? `Phone: ${senderPhone}` : "";
    const orderId = String((o as any).ordered ?? "").trim();
    const orderSource = String(o.reference ?? (o as any)?.source ?? (o as any)?.Source ?? "ePost Workspace").trim() || "ePost Workspace";
    const productDetails = String((o as any).ProductDescription ?? "").trim();

    const calcDisplay = amountSummary.showCalculation ? "" : "is-hidden";
    const amountPrimaryLabel = "MO Amount";
    const amountPrimaryValue = amountSummary.showCalculation ? `${formatRs(amountSummary.moAmount)}` : "";
    const amountPrimaryClass = amountSummary.showCalculation ? "" : "is-hidden";
    const amountSecondaryLabel = "MO Commission";
    const amountSecondaryValue = amountSummary.showCalculation ? `${formatRs(amountSummary.commission)}` : "";
    const amountSecondaryClass = amountSummary.showCalculation ? "" : "is-hidden";
    const amountTotalLabel = "Gross Collect Amount";
    const amountTotalValue = amountSummary.showCalculation ? `${formatRs(amountSummary.grossAmount)}` : "";
    const amountTotalClass = amountSummary.showCalculation ? "" : "is-hidden";

    const headerRate = amountSummary.showCalculation
      ? `Rs. ${formatRs(amountSummary.moAmount)}`
      : amountSummary.grossAmount > 0
        ? `Rs. ${formatRs(amountSummary.grossAmount)}`
        : "Rs. 0";

    const barcodeBase64 = String(o.barcodeBase64 ?? "").trim();
    const barcodePayload = barcodeBase64.replace(/^data:image\/png;base64,/, "");

    const valueMap: Record<string, string> = {
      "{logo_src}": escapeHtml(logoSrc),
      "{shipment_label}": escapeHtml(shipmentLabel),
      "{header_rate}": escapeHtml(headerRate),
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
      "{gross_amount}": escapeHtml(formatRs(amountSummary.grossAmount)),
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
      "{order_source}": escapeHtml(orderSource),
      "{order_class}": orderId ? "" : "is-hidden",
      "{product_details}": escapeHtml(productDetails),
      "{product_class}": productDetails ? "" : "is-hidden",
      "{dispatch_date}": escapeHtml(`Dispatch Date: ${resolveDispatchDate((o as any)?.issueDate)}`),
      "{marketing_footer}": marketingFooterTextHtml(),
      "{{barcode}}": escapeHtml(barcodePayload),
    };

    const rendered = Object.entries(valueMap).reduce((html, [token, value]) => html.split(token).join(value), templateBody);
    return rendered.replace(/\{[a-z_]+\}/g, "");
  };

  const template = loadEnvelopeTemplate();
  const pages = orders.map((order) => renderEnvelopePage(template.body, order)).join("");
  return `${injectSharedPrintCss(template.head)}${pages}${template.tail}`;
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
let urduFontFaceCssCache: string | null | undefined;

function resolveUrduFontFaceCss() {
  if (urduFontFaceCssCache !== undefined) return urduFontFaceCssCache;

  const candidates = [
    {
      family: "Noto Nastaliq Urdu",
      format: "truetype",
      filePath: path.resolve(process.cwd(), "apps", "api", "templates", "fonts", "NotoNastaliqUrdu-Regular.ttf"),
    },
    {
      family: "Jameel Noori Nastaleeq",
      format: "truetype",
      filePath: path.resolve(process.cwd(), "apps", "api", "templates", "fonts", "JameelNooriNastaleeq.ttf"),
    },
    {
      family: "Noto Naskh Arabic",
      format: "truetype",
      filePath: path.resolve(process.cwd(), "apps", "api", "templates", "fonts", "NotoNaskhArabic-Regular.ttf"),
    },
    {
      family: "Noto Nastaliq Urdu",
      format: "truetype",
      filePath: path.resolve(process.cwd(), "templates", "fonts", "NotoNastaliqUrdu-Regular.ttf"),
    },
    {
      family: "Jameel Noori Nastaleeq",
      format: "truetype",
      filePath: path.resolve(process.cwd(), "templates", "fonts", "JameelNooriNastaleeq.ttf"),
    },
    {
      family: "Noto Naskh Arabic",
      format: "truetype",
      filePath: path.resolve(process.cwd(), "templates", "fonts", "NotoNaskhArabic-Regular.ttf"),
    },
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate.filePath)) continue;
      const fontBuffer = fs.readFileSync(candidate.filePath);
      const dataUrl = `data:font/ttf;base64,${fontBuffer.toString("base64")}`;
      urduFontFaceCssCache = `@font-face{font-family:\"${candidate.family}\";src:url('${dataUrl}') format('${candidate.format}');font-weight:400;font-style:normal;font-display:block;}@font-face{font-family:\"Money Order Urdu\";src:local('${candidate.family}'),url('${dataUrl}') format('${candidate.format}');font-weight:400;font-style:normal;font-display:block;}`;
      return urduFontFaceCssCache;
    } catch {
      // Try next path.
    }
  }

  throw new Error("URDU_FONT_MISSING: install a local Urdu font file in apps/api/templates/fonts before generating money-order PDFs.");
}

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
    /(<img class="barcode" src=")([^"]*)(" alt="MO Barcode" style="[^"]*" \/>)/g,
    slotIndex,
    (_m, p1, _src, p3) => `${p1}${transparent}${p3}`,
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
    /(<div class="field strong en" style="left:47\.56mm;top:105\.69mm;[^"]*">)([^<]*)(<\/div>)/g,
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

function moneyOrderHalfNoticeHtml() {
  return `<div class="mo-half-notice" lang="ur" dir="rtl" aria-hidden="true"><div class="mo-half-notice-line">منی آرڈر مینول بار کوڈ سٹیکر مت لگائیں۔</div><div class="mo-half-notice-line">صرف نیچے لکھا منی آرڈر نمبر ایشو کریں۔ شکریہ</div></div>`;
}

function fillBenchmarkSlot(htmlBody: string, slotIndex: number, order?: OrderRecord, includeUrduNotice = true) {
  if (!order) return clearBenchmarkSlot(htmlBody, slotIndex);

  const footerHtml = getSharedPrintFooter();
  const moNumber = strictMoneyOrderNumber((order as any)?.mo_number);
  const generatedTrackingId = String((order as any)?.barcodeValue ?? "").trim();
  const tracking = String((order as any)?.trackingNumber ?? (order as any)?.TrackingID ?? generatedTrackingId).trim() || "-";
  const amountMo = resolveMoneyOrderAmount(order as any);
  const amountDisplay = `${amountMo.toFixed(2)}`;
  // Always DD-MM-YYYY
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
  const {
    senderName: shipperName,
    senderAddress: shipperAddress,
    senderPhone: shipperPhone,
    senderCnic: shipperCnic,
  } = resolveMoneyOrderSenderFields(order);
  const senderLine = formatMoneyOrderSenderLine(shipperName, shipperCnic);
  const moBarcode = String((order as any)?.mo_barcodeBase64 ?? "").trim();

  let out = htmlBody;

  // MO barcode image src
  out = replaceNth(
    out,
    /(<img class="barcode" src=")([^"]*)(" alt="MO Barcode" style="[^"]*" \/>)/g,
    slotIndex,
    (_m, p1, oldSrc, p3) => `${p1}${escapeHtml(moBarcode || oldSrc)}${p3}`,
  );

  if (includeUrduNotice) {
    // Half-level Urdu notice, anchored inside each rendered money-order half.
    out = replaceNth(
      out,
      /(<div class="overlay">)/g,
      slotIndex,
      (_m, p1) => `${p1}${moneyOrderHalfNoticeHtml()}`,
    );
  }

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

  // Sender fields (top-right half)
  out = replaceNth(
    out,
    /<div class="field strong en" style="left:47\.56mm;top:105\.69mm;[^"]*">[^<]*<\/div>/g,
    slotIndex,
    () => `<div class="field strong en" style="left:47.56mm;top:105.69mm;width:86.06mm;font-size:4.25mm;white-space:normal;overflow:visible;text-align:left;">${escapeHtml(senderLine)}</div>`,
  );
  out = replaceNth(
    out,
    /<div class="field regular en" style="left:[0-9.]+mm;top:112\.15mm;width:65\.06mm;font-size:3\.(?:13|35)mm;white-space:normal;line-height:1\.(?:06|12);">[^<]*<\/div>/g,
    slotIndex,
    () => `<div class="field regular en" style="left:15.56mm;top:112.15mm;width:65.06mm;font-size:3.35mm;white-space:normal;line-height:1.12;text-align:left;">${escapeHtml(shipperAddress)}</div>`,
  );
  out = replaceNth(
    out,
    /<div class="field mono en" style="left:82\.56mm;top:116\.57mm;width:65\.06mm;font-size:4\.(?:13|35)mm(?:;line-height:1\.06)?;">[^<]*<\/div>/g,
    slotIndex,
    () => `<div class="field mono en" style="left:82.56mm;top:116.57mm;width:65.06mm;font-size:4.35mm;line-height:1.06;text-align:left;">${escapeHtml(shipperPhone)}</div>`,
  );
  // (No duplicate sender block injection here)

  // Bottom summary block (receiver + MOS + amount)
  out = replaceNth(
    out,
    /<div class="field en" style="left:15\.56mm;top:174\.79mm;width:67\.18mm;font-size:1\.83mm;line-height:1\.12;white-space:normal;">[\s\S]*?<\/div>/g,
    slotIndex,
    (_m: string) =>
      `<div class="field en" style="left:15.56mm;top:174.79mm;width:67.18mm;font-size:1.83mm;line-height:1.12;white-space:normal;">
      ${escapeHtml(consigneeName)} | ${escapeHtml(consigneePhone)}<br/>
      ${escapeHtml(consigneeAddress)}<br/>
      MO: ${escapeHtml(moNumber)} | ${escapeHtml(amountDisplay)}
      </div>`,
  );

  // Bottom tracking line
  out = replaceNth(
    out,
    /(<div class="field mono en" style="left:15\.56mm;top:198\.83mm;width:63\.64mm;font-size:2\.22mm;">)([^<]*)(<\/div>)/g,
    slotIndex,
    (_m, p1, _old, p3) => `${p1}${escapeHtml(tracking)}${p3}${includeUrduNotice ? footerHtml : ""}`
  );

  return out;
}

function moneyOrderHtmlFromBenchmark(orders: OrderRecord[], frontBackgroundDataUrl?: string) {
  const footerHtml = getSharedPrintFooter();
  const expandedOrders = expandBenchmarkOrders(orders);
  const benchmarkHtml = loadBenchmarkMoHtml();
  const bodyMatch = benchmarkHtml.match(/([\s\S]*?<body>)([\s\S]*)(<\/body>[\s\S]*)/i);
  if (!bodyMatch) return benchmarkHtml;

  const head = bodyMatch[1];
  const benchmarkBody = applyFrontBackgroundToBenchmarkHtml(bodyMatch[2].trim(), frontBackgroundDataUrl);
  const tail = bodyMatch[3];
  const headWithPrintGuard = head.replace(
    /<\/head>/i,
    `<meta charset="utf-8" /><style>${resolveUrduFontFaceCss()}${PRINTABLE_FOOTER_CSS}body{font-size:0;line-height:0}.sheet{font-size:0;line-height:0}.page{position:relative;page-break-after:always}.page:last-child{page-break-after:auto}.half{position:relative;}.page .${PRINTABLE_FOOTER_CLASS_NAME}, .half .${PRINTABLE_FOOTER_CLASS_NAME}{position:absolute;bottom:1.8mm;left:50%;transform:translateX(-50%);width:74%;text-align:center;font-size:9px;font-weight:600;line-height:1.1;box-sizing:border-box;white-space:normal;overflow-wrap:break-word;word-break:normal;z-index:10;}.mo-half-notice{position:absolute;left:50%;top:1.2mm;transform:translateX(-50%);z-index:20;background:#fff;padding-top:1.5mm;padding-right:1.35mm;padding-bottom:1mm;padding-left:1.35mm;max-width:68mm;max-height:14mm;font-size:13px;font-family:\"Noto Nastaliq Urdu\",\"Money Order Urdu\",\"Jameel Noori Nastaleeq\",\"Noto Naskh Arabic\",serif;font-weight:700;line-height:1.45;letter-spacing:normal;text-align:center;direction:rtl;unicode-bidi:isolate;white-space:normal;overflow:hidden;text-overflow:clip;font-feature-settings:'kern' 1,'liga' 1,'clig' 1,'calt' 1,'rlig' 1;text-rendering:geometricPrecision;-webkit-font-smoothing:antialiased}.mo-half-notice-line{display:block;white-space:nowrap}</style></head>`
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
    frontSheet = fillBenchmarkSlot(frontSheet, 0, o1, true);
    frontSheet = fillBenchmarkSlot(frontSheet, 1, o2, true);
    frontSheet = compactHtmlFragment(frontSheet);

    let backSheet = backSheetTemplate;
    backSheet = fillBenchmarkSlot(backSheet, 0, o1, false);
    backSheet = fillBenchmarkSlot(backSheet, 1, o2, false);
    backSheet = compactHtmlFragment(backSheet);

    const consigneeName: string = o1.consigneeName || "";
    const consigneePhone: string = o1.consigneePhone || "";
    const consigneeAddress: string = o1.consigneeAddress || "";
    const moNumber: string = o1.moNumber || "";
    const amountDisplay: string = o1.amountDisplay || "";

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
    // Insert unified footer at bottom of each half
    return compactHtmlFragment(`
      <div class="half ${side}">
        <div class="bg" style="${bgUrl ? `background-image:url('${bgUrl}')` : ""}"></div>
        <div class="overlay">${side === "front" ? frontFields(o) : backFields(o)}</div>
        <div class="${PRINTABLE_FOOTER_CLASS_NAME}">${PRINT_MARKETING_LINE}</div>
      </div>
    `);
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
          inset: 0 0 8mm 0;
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
        .half .${PRINTABLE_FOOTER_CLASS_NAME} { position: absolute; left: 50%; bottom: 1.8mm; transform: translateX(-50%); width: 74%; text-align: center; font-size: 9px; font-weight: 600; line-height: 1.1; z-index: 10; }
      </style>
    </head>
    <body>${sheets.join("")}</body>
  </html>`;
}

export function premiumEnvelopeHtml(orders: LabelOrder[], opts?: { autoGenerateTracking?: boolean; includeMoneyOrders?: boolean }) {
  const autoGenerateTracking = opts?.autoGenerateTracking === true;
  const logoSrc = resolvePakistanPostLogoDataUrl();
  const textMeasureCanvas = createCanvas(8, 8);
  const textMeasureCtx = textMeasureCanvas.getContext("2d");

  const loadPremiumEnvelopeTemplate = () => {
    return loadHtmlTemplate(
      [
        path.resolve(process.cwd(), "apps", "api", "src", "templates", "label-envelope-10-premium-9x4.html"),
        path.resolve(process.cwd(), "src", "templates", "label-envelope-10-premium-9x4.html"),
      ],
      "Envelope premium template not found: label-envelope-10-premium-9x4.html",
    );
  };

  const renderPremiumEnvelopePage = (templateBody: string, o: LabelOrder) => {
    const amountSummary = getLabelAmountSummary(o);
    const shipmentType = amountSummary.shipmentType;
    const shipmentLabel = displayShipmentType(shipmentType);
    const tracking = resolveTracking(o, autoGenerateTracking);

    const senderFields = resolveMoneyOrderSenderFields(o as unknown as OrderRecord);
    const senderName = senderFields.senderName;
    const senderAddress = normalizeAddressLines(senderFields.senderAddress);
    const senderCity = String(o.senderCity ?? "").trim();
    const senderPhone = senderFields.senderPhone;

    const customerName = String(o.consigneeName ?? "").trim() || "-";
    const customerAddress = normalizeAddressLines(o.consigneeAddress);
    const customerCity = String(o.receiverCity ?? "").trim();
    const customerPhone = String(o.consigneePhone ?? "").trim() || "-";

    const orderSource = String(o.reference ?? (o as any)?.source ?? (o as any)?.Source ?? "METAFORM").trim() || "METAFORM";
    const productDetails = String((o as any).ProductDescription ?? "").trim() || "-";
    const barcodeDataUrl = generatePremiumEnvelopeBarcodeBase64(tracking);

    const moneyOrderAmount = amountSummary.showCalculation ? amountSummary.moAmount : amountSummary.grossAmount;
    const commission = amountSummary.showCalculation ? amountSummary.commission : 0;
    const grossAmount = amountSummary.showCalculation ? amountSummary.grossAmount : amountSummary.grossAmount;
    const formatAmount = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

    const measureTextWidthPx = (text: string, fontPx: number, weight = 600) => {
      const value = String(text ?? "");
      textMeasureCtx.font = `${weight} ${fontPx}px Arial, Helvetica, sans-serif`;
      return textMeasureCtx.measureText(value).width;
    };

    const wrapLineCount = (text: string, maxWidthPx: number, fontPx: number, weight = 400) => {
      const normalized = String(text ?? "").replace(/\r/g, "").trim();
      if (!normalized || normalized === "-") return 1;
      const paragraphs = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
      if (paragraphs.length === 0) return 1;

      let totalLines = 0;
      for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
          totalLines += 1;
          continue;
        }

        let currentLine = "";
        for (const word of words) {
          const candidate = currentLine ? `${currentLine} ${word}` : word;
          if (measureTextWidthPx(candidate, fontPx, weight) <= maxWidthPx) {
            currentLine = candidate;
            continue;
          }

          if (currentLine) {
            totalLines += 1;
            currentLine = "";
          }

          if (measureTextWidthPx(word, fontPx, weight) <= maxWidthPx) {
            currentLine = word;
            continue;
          }

          let segment = "";
          for (const ch of word) {
            const next = `${segment}${ch}`;
            if (measureTextWidthPx(next, fontPx, weight) <= maxWidthPx) {
              segment = next;
            } else {
              totalLines += 1;
              segment = ch;
            }
          }
          currentLine = segment;
        }

        totalLines += currentLine ? 1 : 0;
      }

      return Math.max(1, totalLines);
    };

    // Tighter font scaling for premium envelope to avoid overflow/clipping
    const fitSingleLineFontPx = (
      text: string,
      maxWidthPx: number,
      basePx: number,
      minPx: number,
      weight = 700,
    ) => {
      const value = String(text ?? "").replace(/\s+/g, " ").trim();
      if (!value || value === "-") return basePx;
      for (let size = basePx; size >= minPx; size -= 1) {
        if (measureTextWidthPx(value, size, weight) <= maxWidthPx) {
          return size;
        }
      }
      return minPx;
    };

    const fitMultiLineFontPx = (
      text: string,
      maxWidthPx: number,
      maxLines: number,
      basePx: number,
      minPx: number,
      lineHeight: number,
      maxHeightPx: number,
      weight = 400,
    ) => {
      const value = String(text ?? "").trim();
      if (!value || value === "-") return basePx;
      for (let size = basePx; size >= minPx; size -= 1) {
        const lines = wrapLineCount(value, maxWidthPx, size, weight);
        const contentHeight = lines * size * lineHeight;
        if (lines <= maxLines && contentHeight <= maxHeightPx) {
          return size;
        }
      }
      return minPx;
    };

    // Reduce max font size and allow more shrink for long text
    const trackingFontPx = fitSingleLineFontPx(tracking, 286, 15, 8, 600);
    const customerNameFontPx = fitSingleLineFontPx(customerName, 470, 22, 9, 700);
    const customerAddressFontPx = fitMultiLineFontPx(customerAddress, 470, 2, 13, 8, 1.2, 38, 400);
    const customerCityFontPx = fitSingleLineFontPx(customerCity || "-", 470, 13, 8, 500);
    const senderNameFontPx = fitSingleLineFontPx(senderName || "-", 470, 13, 8, 700);
    const senderAddressFontPx = fitMultiLineFontPx(senderAddress || "-", 470, 2, 12, 8, 1.15, 28, 400);
    const senderCityFontPx = fitSingleLineFontPx(senderCity || "-", 470, 12, 8, 500);
    const productDetailsFontPx = fitMultiLineFontPx(productDetails, 190, 3, 12, 8, 1.2, 40, 400);

    const trackingStyle = `font-size:${trackingFontPx}px;line-height:1.08;white-space:nowrap;`;
    const customerNameStyle = `font-size:${customerNameFontPx}px;line-height:1.05;white-space:nowrap;`;
    const customerAddressStyle = `font-size:${customerAddressFontPx}px;line-height:1.2;white-space:pre-line;`;
    const customerCityStyle = `font-size:${customerCityFontPx}px;line-height:1.15;white-space:pre-line;`;
    const senderNameStyle = `font-size:${senderNameFontPx}px;line-height:1.15;white-space:nowrap;`;
    const senderAddressStyle = `font-size:${senderAddressFontPx}px;line-height:1.15;white-space:pre-line;`;
    const senderCityStyle = `font-size:${senderCityFontPx}px;line-height:1.15;white-space:pre-line;`;
    const productDetailsStyle = `font-size:${productDetailsFontPx}px;line-height:1.2;white-space:normal;`;

    const replacements: Record<string, string> = {
      "{{logo_src}}": escapeHtml(logoSrc),
      "{{barcode_data_url}}": escapeHtml(barcodeDataUrl),
      "{{tracking_no}}": escapeHtml(tracking),
      "{{tracking_style}}": trackingStyle,
      "{{shipment_label}}": escapeHtml(shipmentLabel),
      "{{amount}}": escapeHtml(formatAmount(moneyOrderAmount)),
      "{{commission}}": escapeHtml(formatAmount(commission)),
      "{{gross_amount}}": escapeHtml(formatAmount(grossAmount)),
      "{{customer_name}}": escapeHtml(customerName),
      "{{customer_name_style}}": customerNameStyle,
      "{{customer_address}}": escapeHtml(customerAddress),
      "{{customer_address_style}}": customerAddressStyle,
      "{{customer_city}}": escapeHtml(customerCity),
      "{{customer_city_style}}": customerCityStyle,
      "{{customer_phone}}": escapeHtml(customerPhone),
      "{{sender_name}}": escapeHtml(senderName || "-"),
      "{{sender_name_style}}": senderNameStyle,
      "{{sender_address}}": escapeHtml(senderAddress || "-"),
      "{{sender_address_style}}": senderAddressStyle,
      "{{sender_city}}": escapeHtml(senderCity || "-"),
      "{{sender_city_style}}": senderCityStyle,
      "{{sender_phone}}": escapeHtml(senderPhone || "-"),
      "{{order_source}}": escapeHtml(orderSource),
      "{{product_details}}": escapeHtml(productDetails),
      "{{product_details_style}}": productDetailsStyle,
    };

    return Object.entries(replacements).reduce(
      (html, [token, value]) => html.split(token).join(value),
      templateBody,
    );
  };

  const template = loadPremiumEnvelopeTemplate();
  console.log("[PREMIUM_TEMPLATE_RESOLVED]", template.templatePath);
  const pages = orders.map((order) => renderPremiumEnvelopePage(template.body, order)).join("");
  return `${injectSharedPrintCss(template.head)}${pages}${template.tail}`;
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
  const {
    senderName: shipperName,
    senderAddress: shipperAddress,
    senderPhone: shipperPhone,
    senderCnic: shipperCnic,
  } = resolveMoneyOrderSenderFields(o);
  const senderLine = formatMoneyOrderSenderLine(shipperName, shipperCnic);

  return [
    // MOS barcode area with locked final dimensions
    moBarcode
      ? `<img class="barcode" src="${moBarcode}" alt="MO Barcode" style="left:10.10mm;top:69mm;width:42.01mm;height:10.44mm;" />`
      : "",

    // Locked text block below MOS barcode
    showMoText
      ? `<div class="field mono en" style="left:9.10mm;top:80.33mm;width:41.01mm;font-size:3.28mm;text-align:left;">${escapeHtml(moNumber)}</div>`
      : "",

    // Locked MO number field next to M.O No.
    `<div class="field mono en" style="left:57.43mm;top:39.03mm;width:28.29mm;font-size:3.73mm;">${escapeHtml(moNumber)}</div>`,

    // Date inline after Urdu label (same line)
    `<div class="field urdu" style="left:40.13mm;top:162.57mm;width:28.99mm;font-size:\.16mm;">(تاریخ) <span class="en" style="display:inline-block;font-size:3.25mm;">${escapeHtml(issueDate)}</span></div>`,

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
    `<div class="field strong en" style="left:47.56mm;top:105.69mm;width:86.06mm;font-size:4.25mm;white-space:normal;overflow:visible;text-align:left;">${escapeHtml(senderLine)}</div>`,
    `<div class="field regular en" style="left:15.56mm;top:112.15mm;width:65.06mm;font-size:3.35mm;white-space:normal;line-height:1.12;text-align:left;">${escapeHtml(shipperAddress)}</div>`,
    `<div class="field mono en" style="left:82.56mm;top:116.57mm;width:65.06mm;font-size:4.35mm;line-height:1.06;text-align:left;">${escapeHtml(shipperPhone)}</div>`,

    // Sender block (second half)
    `<div class="field strong en" style="left:47.56mm;top:183.69mm;width:86.06mm;font-size:4.25mm;white-space:normal;overflow:visible;text-align:left;">${escapeHtml(senderLine)}</div>`,
    `<div class="field regular en" style="left:15.56mm;top:190.15mm;width:65.06mm;font-size:3.35mm;white-space:normal;line-height:1.12;text-align:left;">${escapeHtml(shipperAddress)}</div>`,
    `<div class="field mono en" style="left:82.56mm;top:194.57mm;width:65.06mm;font-size:4.35mm;line-height:1.06;text-align:left;">${escapeHtml(shipperPhone)}</div>`,

    // Bottom-left summary block (receiver detail + MO + amount)
    `<div class="field en" style="left:15.56mm;top:174.79mm;width:67.18mm;font-size:1.83mm;line-height:1.12;white-space:normal;">
      ${escapeHtml(consigneeName)} | ${escapeHtml(consigneePhone)}<br/>
      ${escapeHtml(consigneeAddress)}<br/>
      MO: ${escapeHtml(moNumber)} | ${escapeHtml(amountDisplay)}
    </div>`,

    // Bottom-left tracking text only
    `<div class="field mono en" style="left:15.56mm;top:198.83mm;width:63.64mm;font-size:2.22mm;">${escapeHtml(tracking)}</div>`,
  ].join("");
}

function backFields(_o: OrderRecord) {
  // Back side contains only the background image; no data overlay required
  return "";
}
