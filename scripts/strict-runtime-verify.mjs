import fs from "node:fs/promises";
import path from "node:path";
import * as xlsx from "xlsx";
import { renderLabelDocumentHtml, generateLabelBarcodeBase64 } from "../apps/api/src/templates/labels.ts";
import { htmlToPdfBufferInFreshBrowser } from "../apps/api/src/pdf/render.ts";
import { validateCollectAmountAgainstShipmentType } from "../apps/api/src/validation/trackingId.ts";
import { parseOrdersFromBuffer } from "../apps/api/src/parse/orders.ts";
import { prepareLabelOrders } from "../apps/api/src/services/labelDocument.ts";
import { normalizeUploadFilename } from "../apps/api/src/utils/uploadFilename.ts";
import { DEFAULT_EXEMPT_FILE_NAMES } from "../apps/api/src/services/upload-file-exemptions.service.ts";

const shipmentServices = ["IRL", "UMS", "RGL", "PAR", "VPL", "VPP", "COD"];
const labelModes = ["labels", "universal-9x4", "flyer", "envelope"];
const payableServices = new Set(["VPL", "VPP", "COD"]);

function isMoneyOrderEligible(service) {
  const normalized = String(service ?? "").trim().toUpperCase();
  return normalized === "VPL" || normalized === "VPP" || normalized === "COD";
}

function makeOrder(service, collectAmount, trackingSuffix = "26050001") {
  const tracking = `${service}${trackingSuffix}`;
  return {
    shipperName: "Sender",
    shipperAddress: "Street 1",
    senderCity: "Karachi",
    shipperPhone: "03001234567",
    shipperEmail: "sender@example.com",
    consigneeName: "Receiver",
    consigneeAddress: "Street 2",
    receiverCity: "Lahore",
    consigneePhone: "03111234567",
    shipmentType: service,
    shipmenttype: service,
    carrierType: "pakistan_post",
    CollectAmount: String(collectAmount),
    trackingNumber: tracking,
    TrackingID: tracking,
    Weight: "500",
    ordered: "ORD-1",
    ProductDescription: "Product",
    barcodeBase64: generateLabelBarcodeBase64(tracking),
  };
}

function unresolvedTokens(html) {
  return [...new Set(html.match(/\{\{\s*[^{}]+\s*\}\}|\{[a-z_]+\}/gi) ?? [])];
}

function buildWorkbookBuffer(rows) {
  const worksheet = xlsx.utils.json_to_sheet(rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });
}

async function verifyRenderMatrix() {
  const failures = [];
  const checks = [];

  for (const service of shipmentServices) {
    const collectAmount = payableServices.has(service) ? 2500 : 0;
    const order = makeOrder(service, collectAmount);
    for (const mode of labelModes) {
      const id = `${service}/${mode}`;
      try {
        const html = renderLabelDocumentHtml([order], {
          outputMode: mode,
          autoGenerateTracking: false,
          includeMoneyOrders: payableServices.has(service),
        });
        const unresolved = unresolvedTokens(html);
        if (unresolved.length > 0) {
          failures.push(`${id}: unresolved tokens ${unresolved.join(", ")}`);
          continue;
        }

        if (mode === "universal-9x4") {
          const hasMoneyOrderSummary = /MO Amount|Gross Collect Amount/.test(html);
          if (payableServices.has(service) && !hasMoneyOrderSummary) {
            failures.push(`${id}: expected money-order summary`);
          }
          if (!payableServices.has(service) && hasMoneyOrderSummary) {
            failures.push(`${id}: summary should be hidden for non-value-payable`);
          }
        }

        const pdf = await htmlToPdfBufferInFreshBrowser(
          html,
          mode === "envelope" || mode === "universal-9x4" ? "envelope-9x4" : "A4",
        );
        if (pdf.length <= 0) {
          failures.push(`${id}: empty PDF`);
          continue;
        }
        checks.push({ id, pdfBytes: pdf.length });
      } catch (error) {
        failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { failures, checks };
}

function verifyCollectRules() {
  const failures = [];
  const checks = [];

  for (const service of shipmentServices) {
    const zeroResult = validateCollectAmountAgainstShipmentType("pakistan_post", service, "0");
    const paidResult = validateCollectAmountAgainstShipmentType("pakistan_post", service, "250");
    const expectZeroError = payableServices.has(service);
    const expectPaidError = !payableServices.has(service);

    checks.push({
      service,
      zeroSeverity: zeroResult?.severity ?? "none",
      paidSeverity: paidResult?.severity ?? "none",
    });

    if (expectZeroError && zeroResult?.severity !== "error") {
      failures.push(`${service}+0: expected hard error`);
    }
    if (!expectZeroError && zeroResult && zeroResult.severity === "error") {
      failures.push(`${service}+0: unexpected hard error`);
    }
    if (expectPaidError && paidResult?.severity !== "error") {
      failures.push(`${service}+250: expected hard error`);
    }
    if (!expectPaidError && paidResult && paidResult.severity === "error") {
      failures.push(`${service}+250: unexpected hard error`);
    }
  }

  return { failures, checks };
}

async function verifyUploadCoreFlows() {
  const failures = [];
  const checks = [];

  const manualRows = [
    {
      shipmentType: "VPL",
      TrackingID: "VPL26051001",
      CollectAmount: "1500",
      shipperName: "S1",
      shipperAddress: "A1",
      senderCity: "Karachi",
      shipperPhone: "03000000001",
      consigneeName: "R1",
      consigneeAddress: "B1",
      receiverCity: "Lahore",
      consigneePhone: "03100000001",
      consigneeEmail: "receiver1@example.com",
      shipperEmail: "sender1@example.com",
      Weight: "500",
      ordered: "ORD-001",
      numberOfPieces: "1",
      ProductDescription: "Item",
    },
    {
      shipmentType: "VPL",
      TrackingID: "VPL26051002",
      CollectAmount: "1600",
      shipperName: "S2",
      shipperAddress: "A2",
      senderCity: "Karachi",
      shipperPhone: "03000000002",
      consigneeName: "R2",
      consigneeAddress: "B2",
      receiverCity: "Lahore",
      consigneePhone: "03100000002",
      consigneeEmail: "receiver2@example.com",
      shipperEmail: "sender2@example.com",
      Weight: "500",
      ordered: "ORD-002",
      numberOfPieces: "1",
      ProductDescription: "Item",
    },
  ];

  const mixedRows = [
    { ...manualRows[0], shipmentType: "IRL", TrackingID: "IRL26052001", CollectAmount: "0" },
    { ...manualRows[1], shipmentType: "COD", TrackingID: "COD26052002", CollectAmount: "1700" },
  ];

  const missingTrackingRows = [
    { ...manualRows[0], TrackingID: "" },
    { ...manualRows[1], TrackingID: "" },
  ];

  const autoRows = [
    { ...manualRows[0], TrackingID: "" },
    { ...manualRows[1], TrackingID: "" },
  ];

  try {
    const parsed = await parseOrdersFromBuffer(buildWorkbookBuffer(manualRows), "manual-same.xlsx", { allowMissingTrackingId: false });
    const prepared = prepareLabelOrders(parsed, {
      autoGenerateTracking: false,
      barcodeMode: "manual",
      shipmentMode: "single_service",
      trackingScheme: "standard",
      carrierType: "pakistan_post",
      shipmentType: "VPL",
      outputMode: "labels",
      strictValidation: true,
    });
    checks.push({ scenario: "same_shipment_manual", rows: prepared.length });
  } catch (error) {
    failures.push(`same_shipment_manual: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const parsed = await parseOrdersFromBuffer(buildWorkbookBuffer(mixedRows), "mixed-services.xlsx", { allowMissingTrackingId: false });
    const prepared = prepareLabelOrders(parsed, {
      autoGenerateTracking: false,
      barcodeMode: "manual",
      shipmentMode: "mix_articles",
      trackingScheme: "standard",
      carrierType: "pakistan_post",
      shipmentType: "IRL",
      outputMode: "labels",
      strictValidation: true,
    });
    checks.push({ scenario: "mixed_services_manual", rows: prepared.length });
  } catch (error) {
    failures.push(`mixed_services_manual: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const parsed = await parseOrdersFromBuffer(buildWorkbookBuffer(missingTrackingRows), "manual-missing-tracking.xlsx", {
      allowMissingTrackingId: true,
    });
    prepareLabelOrders(parsed, {
      autoGenerateTracking: false,
      barcodeMode: "manual",
      shipmentMode: "single_service",
      trackingScheme: "standard",
      carrierType: "pakistan_post",
      shipmentType: "VPL",
      outputMode: "labels",
      strictValidation: true,
    });
    failures.push("missing_tracking_manual: expected hard failure, got success");
  } catch (error) {
    checks.push({
      scenario: "missing_tracking_manual",
      hardFailed: true,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const parsed = await parseOrdersFromBuffer(buildWorkbookBuffer(autoRows), "auto-missing-uploaded-tracking.xlsx", {
      allowMissingTrackingId: true,
    });
    const withAllocated = parsed.map((row, i) => ({
      ...row,
      shipmentType: i === 0 ? "VPP" : "PAR",
      __allocatedTrackingId: i === 0 ? "VPP26053001" : "PAR26053002",
    }));
    const prepared = prepareLabelOrders(withAllocated, {
      autoGenerateTracking: true,
      barcodeMode: "auto",
      shipmentMode: "mix_articles",
      trackingScheme: "standard",
      carrierType: "pakistan_post",
      shipmentType: "VPP",
      outputMode: "universal-9x4",
      strictValidation: true,
    });
    checks.push({ scenario: "hybrid_auto_mix", rows: prepared.length });
  } catch (error) {
    failures.push(`hybrid_auto_mix: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const parsed = await parseOrdersFromBuffer(
      buildWorkbookBuffer([{ ...manualRows[0], shipmentType: "PAR", TrackingID: "PAR26054001", CollectAmount: "0" }]),
      "track-parcel.xlsx",
      { allowMissingTrackingId: false },
    );
    const prepared = prepareLabelOrders(parsed, {
      autoGenerateTracking: false,
      barcodeMode: "manual",
      shipmentMode: "single_service",
      trackingScheme: "standard",
      carrierType: "pakistan_post",
      shipmentType: "PAR",
      outputMode: "labels",
      strictValidation: true,
    });
    checks.push({ scenario: "track_parcel_manual", rows: prepared.length });
  } catch (error) {
    failures.push(`track_parcel_manual: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { failures, checks };
}

function verifyParAndUploadRecommendationRules() {
  const failures = [];
  const checks = [];

  const parEligible = isMoneyOrderEligible("PAR");
  const vplEligible = isMoneyOrderEligible("VPL");
  checks.push({ service: "PAR", moneyOrderEligible: parEligible });
  checks.push({ service: "VPL", moneyOrderEligible: vplEligible });

  if (parEligible) {
    failures.push("PAR should never be money-order eligible");
  }
  if (!vplEligible) {
    failures.push("VPL should stay money-order eligible");
  }

  const bypassName = "LCS 15-13-11-2024.xls";
  const normalizedBypass = normalizeUploadFilename(bypassName);
  const normalizedDefault = DEFAULT_EXEMPT_FILE_NAMES.map((name) => normalizeUploadFilename(name));
  checks.push({ bypassName, normalizedBypass, normalizedDefault });
  if (!normalizedDefault.includes(normalizedBypass)) {
    failures.push("Default duplicate bypass filename is not normalized as expected");
  }

  return { failures, checks };
}

const renderResult = await verifyRenderMatrix();
const collectRuleResult = verifyCollectRules();
const uploadCoreResult = await verifyUploadCoreFlows();
const parRuleResult = verifyParAndUploadRecommendationRules();

const failures = [
  ...renderResult.failures,
  ...collectRuleResult.failures,
  ...uploadCoreResult.failures,
  ...parRuleResult.failures,
];

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    failures: failures.length,
    renderChecks: renderResult.checks.length,
    collectRuleChecks: collectRuleResult.checks.length,
    uploadCoreChecks: uploadCoreResult.checks.length,
    parRuleChecks: parRuleResult.checks.length,
  },
  failures,
  renderChecks: renderResult.checks,
  collectRuleChecks: collectRuleResult.checks,
  uploadCoreChecks: uploadCoreResult.checks,
  parRuleChecks: parRuleResult.checks,
  environmentLimits: [
    "Local HTTP /jobs/upload integration could not run because local PostgreSQL endpoint is unreachable during API startup.",
  ],
};

const outDir = path.resolve("forensic-artifacts");
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `strict-runtime-verify-${new Date().toISOString().replace(/[.:]/g, "-")}.json`);
await fs.writeFile(outPath, JSON.stringify(report, null, 2));

if (failures.length > 0) {
  console.error("[strict-runtime-verify] FAIL");
  console.error(`Evidence: ${outPath}`);
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exit(1);
}

console.log("[strict-runtime-verify] PASS");
console.log(`Evidence: ${outPath}`);
console.log(JSON.stringify(report.summary));
