import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "canvas";
import JsBarcode from "jsbarcode";
import puppeteer from "puppeteer";
import { moneyOrderHtml } from "./apps/api/dist/templates/labels.js";
import { htmlToPdfBuffer } from "./apps/api/dist/pdf/render.js";

function code128DataUrl(text) {
  const canvas = createCanvas(400, 120);
  JsBarcode(canvas, String(text || ""), {
    format: "CODE128",
    width: 2.5,
    height: 90,
    displayValue: false,
    margin: 0,
  });
  return canvas.toDataURL();
}

function collectStyledNodes(html) {
  const rows = [];
  const re = /(<img class="barcode"[^>]*style="([^"]*)"[^>]*>)|(<div class="field ([^"]*)"[^>]*style="([^"]*)"[^>]*>)/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (match[1]) {
      rows.push({ kind: "img.barcode", cls: "barcode", style: match[2] });
    } else {
      rows.push({ kind: "div.field", cls: match[4], style: match[5] });
    }
  }
  return rows;
}

function extractFieldStyle(html, value, occurrence = 0) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<div class=\"field ([^\"]*)\" style=\"([^\"]*)\">(?:<span[^>]*>)?${escaped}(?:<\\/span>)?<\\/div>`, "g");
  let index = 0;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (index === occurrence) {
      return { cls: match[1], style: match[2] };
    }
    index += 1;
  }
  return { cls: "NOT_FOUND", style: "NOT_FOUND" };
}

function extractFieldStyles(html, value) {
  const results = [];
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<div class=\"field ([^\"]*)\" style=\"([^\"]*)\">(?:<span[^>]*>)?${escaped}(?:<\\/span>)?<\\/div>`, "g");
  let match;
  while ((match = re.exec(html)) !== null) {
    results.push({ cls: match[1], style: match[2] });
  }
  return results;
}

async function main() {
  const cwd = process.cwd();
  const outputsDir = path.join(cwd, "storage", "outputs");
  const templatePath = path.join(cwd, "apps", "api", "storage", "outputs", "mo-sample-two-records.html");
  const htmlPath = path.join(outputsDir, "mo-aligned-output.html");
  const pdfPath = path.join(outputsDir, "mo-aligned-output.pdf");
  const reportPath = path.join(outputsDir, "mo-field-comparison-report.txt");

  await fs.mkdir(outputsDir, { recursive: true });

  const orders = [
    {
      TrackingID: "VPL123456789",
      trackingNumber: "VPL123456789",
      shipmentType: "VPL",
      CollectAmount: "850",
      consigneeName: "Receiver One",
      consigneeAddress: "Street 1, Lahore",
      consigneePhone: "03001234567",
      shipperName: "Sender One",
      shipperAddress: "Street A, Karachi",
      shipperPhone: "03111234567",
      mo_number: "MOS24070001",
      mo_barcodeBase64: code128DataUrl("MOS24070001"),
      issueDate: "07-03-24",
    },
    {
      TrackingID: "VPL123456790",
      trackingNumber: "VPL123456790",
      shipmentType: "VPL",
      CollectAmount: "1200",
      consigneeName: "Receiver Two",
      consigneeAddress: "Street 2, Rawalpindi",
      consigneePhone: "03007654321",
      shipperName: "Sender Two",
      shipperAddress: "Street B, Faisalabad",
      shipperPhone: "03211234567",
      mo_number: "MOS24070002",
      mo_barcodeBase64: code128DataUrl("MOS24070002"),
      issueDate: "07-03-24",
    },
  ];

  const html = moneyOrderHtml(orders, { mode: "COD" });
  await fs.writeFile(htmlPath, html, "utf8");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const pdfBuffer = await htmlToPdfBuffer(html, browser);
    await fs.writeFile(pdfPath, Buffer.from(pdfBuffer));
  } finally {
    await browser.close();
  }

  const templateHtml = await fs.readFile(templatePath, "utf8");
  const templateNodes = collectStyledNodes(templateHtml);
  const generatedNodes = collectStyledNodes(html);
  const nodeCount = Math.max(templateNodes.length, generatedNodes.length);
  const mismatches = [];

  for (let i = 0; i < nodeCount; i += 1) {
    const expected = templateNodes[i];
    const actual = generatedNodes[i];
    const match = !!expected && !!actual && expected.kind === actual.kind && expected.cls === actual.cls && expected.style === actual.style;
    if (!match) {
      mismatches.push({ index: i + 1, expected, actual });
    }
  }

  const mos24070001Styles = extractFieldStyles(html, "MOS24070001");
  const mos24070002Styles = extractFieldStyles(html, "MOS24070002");

  const keyChecks = [
    {
      label: "Slot 1 MOS Text",
      expectedStyle: "left:9.10mm;top:80.33mm;width:41.01mm;font-size:3.28mm;text-align:center;",
      actual: mos24070001Styles[0] ?? { cls: "NOT_FOUND", style: "NOT_FOUND" },
    },
    {
      label: "Slot 2 MOS Text",
      expectedStyle: "left:9.10mm;top:80.33mm;width:41.01mm;font-size:3.28mm;text-align:center;",
      actual: mos24070002Styles[0] ?? { cls: "NOT_FOUND", style: "NOT_FOUND" },
    },
    {
      label: "Slot 1 Date",
      expectedStyle: "left:40.13mm;top:162.57mm;width:28.99mm;font-size:.16mm;",
      actual: extractFieldStyle(html, "07-03-24", 0),
    },
    {
      label: "Slot 2 Date",
      expectedStyle: "left:40.13mm;top:162.57mm;width:28.99mm;font-size:.16mm;",
      actual: extractFieldStyle(html, "07-03-24", 1),
    },
    {
      label: "Slot 1 MO Number",
      expectedStyle: "left:57.43mm;top:39.03mm;width:28.29mm;font-size:3.73mm;",
      actual: mos24070001Styles[1] ?? { cls: "NOT_FOUND", style: "NOT_FOUND" },
    },
    {
      label: "Slot 2 MO Number",
      expectedStyle: "left:57.43mm;top:39.03mm;width:28.29mm;font-size:3.73mm;",
      actual: mos24070002Styles[1] ?? { cls: "NOT_FOUND", style: "NOT_FOUND" },
    },
    {
      label: "Slot 1 Tracking",
      expectedStyle: "left:90.27mm;top:48.04mm;width:45.26mm;font-size:2.10mm;",
      actual: extractFieldStyle(html, "VPL123456789", 0),
    },
    {
      label: "Slot 2 Tracking",
      expectedStyle: "left:90.27mm;top:48.04mm;width:45.26mm;font-size:2.10mm;",
      actual: extractFieldStyle(html, "VPL123456790", 0),
    },
  ].map((entry) => ({
    ...entry,
    match: entry.actual.style === entry.expectedStyle ? "YES" : "NO",
  }));

  const reportLines = [
    "Money Order Field Comparison Report",
    "",
    `Template: ${templatePath}`,
    `Generated HTML: ${htmlPath}`,
    `Generated PDF: ${pdfPath}`,
    "",
    `Total Template Styled Nodes: ${templateNodes.length}`,
    `Total Generated Styled Nodes: ${generatedNodes.length}`,
    `Full Styled Node Mismatches: ${mismatches.length}`,
    `Overall Status: ${mismatches.length === 0 && keyChecks.every((item) => item.match === "YES") ? "ALL MATCH" : "MISMATCHES FOUND"}`,
    "",
    "Key Field Checks:",
    ...keyChecks.map((item) => `${item.label}: ${item.match} | expected=${item.expectedStyle} | actual=${item.actual.style}`),
    "",
    "First Styled Node Mismatches:",
    ...(mismatches.length === 0
      ? ["None"]
      : mismatches.slice(0, 10).map((item) => `#${item.index} | expected=${item.expected?.kind ?? "MISSING"} ${item.expected?.cls ?? "MISSING"} ${item.expected?.style ?? "MISSING"} | actual=${item.actual?.kind ?? "MISSING"} ${item.actual?.cls ?? "MISSING"} ${item.actual?.style ?? "MISSING"}`)),
    "",
    "Note:",
    "The runtime template normalizes the malformed blank slot-2 date scaffold to the benchmark-valid date coordinates so slot 2 can be filled correctly.",
  ];

  await fs.writeFile(reportPath, `${reportLines.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({ htmlPath, pdfPath, reportPath, mismatchCount: mismatches.length, keyChecks }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});