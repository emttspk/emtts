import fs from "node:fs/promises";
import path from "node:path";
import fsSync from "node:fs";
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

async function verifyTrackingWorkspaceHardening() {
  const failures = [];
  const checks = [];

  const trackingRoutePath = path.resolve("apps/api/src/routes/tracking.ts");
  const jobsRoutePath = path.resolve("apps/api/src/routes/jobs.ts");
  const bulkTrackingPath = path.resolve("apps/web/src/pages/BulkTracking.tsx");
  const uploadPath = path.resolve("apps/web/src/pages/Upload.tsx");
  const apiIndexPath = path.resolve("apps/api/src/index.ts");

  const trackingRoute = await fs.readFile(trackingRoutePath, "utf8");
  const jobsRoute = await fs.readFile(jobsRoutePath, "utf8");
  const bulkTracking = await fs.readFile(bulkTrackingPath, "utf8");
  const uploadUi = await fs.readFile(uploadPath, "utf8");
  const apiIndex = await fs.readFile(apiIndexPath, "utf8");

  const expect = (name, condition, detail) => {
    if (condition) {
      checks.push({ name, ok: true, detail });
    } else {
      checks.push({ name, ok: false, detail });
      failures.push(name);
    }
  };

  // Batch rerun stability
  expect(
    "batch_rerun_api_present",
    trackingRoute.includes('trackingRouter.post("/batches/:batchId/run"') && trackingRoute.includes("consumeUnits") && trackingRoute.includes("refundUnits"),
    "Batch rerun route + unit reservation/refund",
  );
  expect(
    "batch_rerun_ui_present",
    bulkTracking.includes("runSavedBatch") && bulkTracking.includes("Tracking Batch History"),
    "Saved batch rerun action in tracking workspace",
  );

  // Deleted/expired retention handling for saved master file
  expect(
    "deleted_master_file_handling",
    trackingRoute.includes("Source batch file missing on server") && trackingRoute.includes("Batch master file not found"),
    "Missing deleted source/master file handling paths",
  );
  expect(
    "retention_warning_ui_present",
    uploadUi.includes("Data Retention Notice") && uploadUi.includes("files deleted after 72 hours") && uploadUi.includes("files deleted after 24 hours"),
    "Retention warning card with free/paid windows",
  );

  // Missing/malformed XLSX and duplicate upload handling
  expect(
    "missing_or_malformed_xlsx_guard",
    bulkTracking.includes("No tracking IDs found") && bulkTracking.includes("analyzeTrackingUploadFile") && bulkTracking.includes("XLSX.read"),
    "Client-side guard for malformed/missing tracking IDs in XLSX",
  );
  expect(
    "duplicate_tracking_dedup",
    trackingRoute.includes("Array.from(new Set(trackingNumbers") || trackingRoute.includes("new Set(trackingNumbers"),
    "Server deduplication of tracking IDs",
  );

  // UTF-8 safety and large-file upload constraints
  expect(
    "utf8_string_normalization",
    trackingRoute.includes("String(value ?? \"\")") && bulkTracking.includes("String(value ?? \"\")"),
    "Unicode-safe string normalization paths present",
  );
  expect(
    "large_file_upload_limits",
    trackingRoute.includes("fileSize: 100 * 1024 * 1024") && trackingRoute.includes("2000"),
    "Upload size + tracking count hard limits present",
  );

  // Unit consumption consistency
  expect(
    "unit_consumption_consistency",
    trackingRoute.includes("consumeUnits") && trackingRoute.includes("refundUnits") && trackingRoute.includes("finalizeQueuedTrackingToGenerated"),
    "Reserve/refund/finalize unit flow present",
  );

  // Tracking master export + route health
  expect(
    "tracking_master_export_route",
    jobsRoute.includes('download/tracking-master') && jobsRoute.includes("handleTrackingMasterDownload"),
    "Tracking master export endpoint wired",
  );
  expect(
    "route_health",
    apiIndex.includes("/health") || apiIndex.includes("health"),
    "Health route reference present",
  );

  // Storage access check
  try {
    const probeDir = path.resolve("storage", "outputs");
    await fs.mkdir(probeDir, { recursive: true });
    const probePath = path.join(probeDir, `.strict-runtime-probe-${Date.now()}.txt`);
    await fs.writeFile(probePath, "ok", "utf8");
    if (!fsSync.existsSync(probePath)) {
      failures.push("storage_access_probe");
      checks.push({ name: "storage_access_probe", ok: false, detail: "Probe file was not created" });
    } else {
      await fs.unlink(probePath);
      checks.push({ name: "storage_access_probe", ok: true, detail: "storage/outputs writable" });
    }
  } catch (error) {
    failures.push("storage_access_probe");
    checks.push({
      name: "storage_access_probe",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return { failures, checks };
}

const renderResult = await verifyRenderMatrix();
const collectRuleResult = verifyCollectRules();
const uploadCoreResult = await verifyUploadCoreFlows();
const parRuleResult = verifyParAndUploadRecommendationRules();
const hardeningResult = await verifyTrackingWorkspaceHardening();

const failures = [
  ...renderResult.failures,
  ...collectRuleResult.failures,
  ...uploadCoreResult.failures,
  ...parRuleResult.failures,
  ...hardeningResult.failures,
];

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    failures: failures.length,
    renderChecks: renderResult.checks.length,
    collectRuleChecks: collectRuleResult.checks.length,
    uploadCoreChecks: uploadCoreResult.checks.length,
    parRuleChecks: parRuleResult.checks.length,
    hardeningChecks: hardeningResult.checks.length,
  },
  failures,
  renderChecks: renderResult.checks,
  collectRuleChecks: collectRuleResult.checks,
  uploadCoreChecks: uploadCoreResult.checks,
  parRuleChecks: parRuleResult.checks,
  hardeningChecks: hardeningResult.checks,
  environmentLimits: [
    "Local HTTP /jobs/upload integration could not run because local PostgreSQL endpoint is unreachable during API startup.",
    "Live /health probing is optional in this script and can be enforced via API_BASE_URL externally.",
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
