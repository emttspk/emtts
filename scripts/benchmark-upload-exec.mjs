import fs from "node:fs/promises";
import path from "node:path";
import * as xlsx from "xlsx";
import { parseOrdersFromBuffer } from "../apps/api/src/parse/orders.ts";
import { prepareLabelOrders } from "../apps/api/src/services/labelDocument.ts";
import { renderLabelDocumentHtml, generateLabelBarcodeBase64 } from "../apps/api/src/templates/labels.ts";
import { htmlToPdfBufferInFreshBrowser } from "../apps/api/src/pdf/render.ts";

function buildWorkbookBuffer(rows) {
  const worksheet = xlsx.utils.json_to_sheet(rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });
}

function unresolvedTokens(html) {
  return [...new Set(html.match(/\{\{\s*[^{}]+\s*\}\}|\{[a-z_]+\}/gi) ?? [])];
}

function makeRow({ service, tracking, collectAmount, idx }) {
  return {
    shipmentType: service,
    TrackingID: tracking,
    CollectAmount: String(collectAmount),
    shipperName: `Sender ${idx}`,
    shipperAddress: `Street ${idx}`,
    senderCity: "Karachi",
    shipperPhone: `0300000000${idx}`,
    shipperEmail: `sender${idx}@example.com`,
    consigneeName: `Receiver ${idx}`,
    consigneeAddress: `House ${idx}`,
    receiverCity: "Lahore",
    consigneePhone: `0310000000${idx}`,
    consigneeEmail: `receiver${idx}@example.com`,
    Weight: "500",
    ordered: `ORD-${idx}`,
    numberOfPieces: "1",
    ProductDescription: "Item",
  };
}

async function runSingleScenario({ id, service, collectAmount, rows = 2, shipmentMode = "single_service" }) {
  const dataset = Array.from({ length: rows }).map((_, i) => {
    const n = i + 1;
    const tracking = `${service}2606${String(1000 + n).slice(-4)}`;
    return makeRow({ service, tracking, collectAmount, idx: n });
  });

  const parsed = await parseOrdersFromBuffer(buildWorkbookBuffer(dataset), `${id}.xlsx`, { allowMissingTrackingId: false });
  const prepared = prepareLabelOrders(parsed, {
    autoGenerateTracking: false,
    barcodeMode: "manual",
    shipmentMode,
    trackingScheme: "standard",
    carrierType: "pakistan_post",
    shipmentType: service,
    outputMode: "labels",
    strictValidation: true,
  });

  const html = renderLabelDocumentHtml(prepared, {
    outputMode: "labels",
    autoGenerateTracking: false,
    includeMoneyOrders: service === "VPL" || service === "VPP" || service === "COD",
  });
  const unresolved = unresolvedTokens(html);
  if (unresolved.length > 0) {
    throw new Error(`${id}: unresolved tokens ${unresolved.join(", ")}`);
  }

  const hasMoneyPanel = /MO Amount|Gross Collect Amount|MO Commission/.test(html);
  if (["IRL", "UMS", "RGL", "PAR"].includes(service) && hasMoneyPanel) {
    throw new Error(`${id}: money-order panel appeared for general shipment`);
  }
  if (["VPL", "VPP", "COD"].includes(service) && !hasMoneyPanel) {
    throw new Error(`${id}: money-order panel missing for value-payable shipment`);
  }

  const pdf = await htmlToPdfBufferInFreshBrowser(html, "A4");
  if (pdf.length <= 0) {
    throw new Error(`${id}: empty PDF`);
  }

  const outPdf = path.resolve("forensic-artifacts", `${id}.pdf`);
  await fs.writeFile(outPdf, pdf);

  return {
    scenario: id,
    ok: true,
    rows: prepared.length,
    pdfPath: outPdf,
    pdfBytes: pdf.length,
    hasMoneyPanel,
  };
}

async function runNegativeScenario({ id, service, collectAmount }) {
  const row = makeRow({ service, tracking: `${service}26069999`, collectAmount, idx: 1 });
  try {
    await parseOrdersFromBuffer(buildWorkbookBuffer([row]), `${id}.xlsx`, { allowMissingTrackingId: false });
    return { scenario: id, ok: false, error: "Expected validation failure but parser accepted row" };
  } catch (error) {
    return { scenario: id, ok: true, expectedFailure: true, message: error instanceof Error ? error.message : String(error) };
  }
}

const outputDir = path.resolve("forensic-artifacts");
await fs.mkdir(outputDir, { recursive: true });

const positives = [];
positives.push(await runSingleScenario({ id: "upload-irl", service: "IRL", collectAmount: 0 }));
positives.push(await runSingleScenario({ id: "upload-ums", service: "UMS", collectAmount: 0 }));
positives.push(await runSingleScenario({ id: "upload-rgl", service: "RGL", collectAmount: 0 }));
positives.push(await runSingleScenario({ id: "upload-par", service: "PAR", collectAmount: 0 }));
positives.push(await runSingleScenario({ id: "upload-vpl", service: "VPL", collectAmount: 1500 }));

const mixedRows = [
  makeRow({ service: "IRL", tracking: "IRL26061001", collectAmount: 0, idx: 1 }),
  makeRow({ service: "VPL", tracking: "VPL26061002", collectAmount: 2000, idx: 2 }),
  makeRow({ service: "PAR", tracking: "PAR26061003", collectAmount: 0, idx: 3 }),
];
const parsedMixed = await parseOrdersFromBuffer(buildWorkbookBuffer(mixedRows), "upload-mixed.xlsx", { allowMissingTrackingId: false });
const preparedMixed = prepareLabelOrders(parsedMixed, {
  autoGenerateTracking: false,
  barcodeMode: "manual",
  shipmentMode: "mix_articles",
  trackingScheme: "standard",
  carrierType: "pakistan_post",
  shipmentType: "IRL",
  outputMode: "labels",
  strictValidation: true,
});
const mixedHtml = renderLabelDocumentHtml(preparedMixed, {
  outputMode: "labels",
  autoGenerateTracking: false,
  includeMoneyOrders: true,
});
const mixedPdf = await htmlToPdfBufferInFreshBrowser(mixedHtml, "A4");
const mixedPdfPath = path.resolve("forensic-artifacts", "upload-mixed.pdf");
await fs.writeFile(mixedPdfPath, mixedPdf);
positives.push({
  scenario: "upload-mixed",
  ok: true,
  rows: preparedMixed.length,
  pdfPath: mixedPdfPath,
  pdfBytes: mixedPdf.length,
});

const negatives = [];
negatives.push(await runNegativeScenario({ id: "negative-irl-with-collect", service: "IRL", collectAmount: 100 }));
negatives.push(await runNegativeScenario({ id: "negative-vpl-zero", service: "VPL", collectAmount: 0 }));

const failed = positives.filter((item) => !item.ok).concat(negatives.filter((item) => !item.ok));
const report = {
  generatedAt: new Date().toISOString(),
  positiveScenarios: positives,
  negativeScenarios: negatives,
  failures: failed,
};

const reportPath = path.resolve("forensic-artifacts", `benchmark-upload-exec-${new Date().toISOString().replace(/[.:]/g, "-")}.json`);
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

if (failed.length > 0) {
  console.error("[benchmark-upload-exec] FAIL");
  console.error(`Report: ${reportPath}`);
  process.exit(1);
}

console.log("[benchmark-upload-exec] PASS");
console.log(`Report: ${reportPath}`);
