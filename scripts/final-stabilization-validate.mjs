#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "apps", "api", "dist");
const OUT_DIR = path.join(ROOT, "test-results", "final-stabilization");

function toFileHref(filePath) {
  return pathToFileURL(filePath).href;
}

function fail(message) {
  throw new Error(message);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function assertNoPlaceholderLeakage(html, label) {
  const unresolved = html.match(/\{\{[^}]+\}\}|\{[a-z_]+\}/g) || [];
  if (unresolved.length) {
    fail(`[${label}] Placeholder leakage detected: ${unresolved.slice(0, 10).join(", ")}`);
  }
}

function assertNoEmptyBottomFields(html, label) {
  const emptyBottomSummary = (html.match(/<div class="field en" style="left:15\.56mm;top:174\.79mm;width:67\.18mm;font-size:1\.83mm;line-height:1\.12;white-space:normal;">\s*<\/div>/g) || []).length;
  const emptyBottomTracking = (html.match(/<div class="field mono en" style="left:15\.56mm;top:198\.83mm;width:63\.64mm;font-size:2\.22mm;">\s*<\/div>/g) || []).length;
  if (emptyBottomSummary > 0 || emptyBottomTracking > 0) {
    fail(`[${label}] Bottom leakage detected (summary=${emptyBottomSummary}, tracking=${emptyBottomTracking})`);
  }
}

function buildMoOrder(index) {
  const seq = String(index + 1).padStart(6, "0");
  const mo = `MOS24${seq}`;
  return {
    mo_number: mo,
    mo_barcodeBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    barcodeValue: `VPL2407${String(100000 + index)}`,
    trackingNumber: `VPL2407${String(100000 + index)}`,
    issueDate: "20-05-2026",
    amountRs: 5000 + index * 100,
    amount: String(5000 + index * 100),
    CollectAmount: 5000 + index * 100,
    shipmentType: "VPP",
    consigneeName: `Consignee ${index + 1}`,
    consigneeAddress: `Street ${index + 1}\nArea ${index + 1}\nCity`,
    consigneePhone: `0300123${String(100 + index).padStart(3, "0")}`,
    senderName: `Sender ${index + 1}`,
    senderAddress: `Sender Street ${index + 1}\nSender Area`,
    senderPhone: `0311123${String(200 + index).padStart(3, "0")}`,
  };
}

function buildUniversalOrder(type, index) {
  const tracking = `${type}2407${String(200000 + index)}`;
  const consigneeName = `${type} Receiver ${index + 1}`;
  const consigneeAddress = `House ${index + 1}, Block A, Lahore`;
  const consigneePhone = `0300999${String(300 + index).padStart(3, "0")}`;
  const senderName = `${type} Sender ${index + 1}`;
  const senderAddress = `Office ${index + 1}, Karachi`;
  const senderPhone = `0311999${String(400 + index).padStart(3, "0")}`;
  return {
    TrackingID: tracking,
    trackingNumber: tracking,
    consigneeName,
    consigneeAddress,
    consigneePhone,
    ConsigneeName: consigneeName,
    ConsigneeAddress: consigneeAddress,
    ConsigneeCellNo: consigneePhone,
    senderName,
    senderAddress,
    senderPhone,
    SenderName: senderName,
    SenderAddress: senderAddress,
    SenderCellNo: senderPhone,
    ProductDetail: "Clothing",
    ProductDescription: "Clothing",
    CollectAmount: 8500 + index * 250,
    shipmentType: type,
    shipmenttype: type,
    carrierType: "pakistan_post",
    barcodeMode: "auto",
    city: "Lahore",
    origin: "Karachi",
  };
}

async function run() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const labels = await import(toFileHref(path.join(DIST, "templates", "labels.js")));
  const render = await import(toFileHref(path.join(DIST, "pdf", "render.js")));

  const { moneyOrderHtml, universal9x4Html } = labels;
  const { launchPuppeteerBrowser, htmlToPdfBuffer } = render;

  if (typeof moneyOrderHtml !== "function") fail("moneyOrderHtml export not available");
  if (typeof universal9x4Html !== "function") fail("universal9x4Html export not available");

  const scenarios = [
    {
      key: "mo-4",
      title: "4-record Money Order",
      html: moneyOrderHtml(Array.from({ length: 4 }, (_, i) => buildMoOrder(i))),
      requiredTokens: ["Consignee 1", "Consignee 4", "VPL2407100000", "VPL2407100003", "Sender 1", "Sender 4"],
    },
    {
      key: "mo-10",
      title: "10-record Money Order",
      html: moneyOrderHtml(Array.from({ length: 10 }, (_, i) => buildMoOrder(i))),
      requiredTokens: ["Consignee 1", "Consignee 10", "VPL2407100000", "VPL2407100009", "Sender 1", "Sender 10"],
    },
    {
      key: "universal-vpp",
      title: "Universal VPP",
      html: universal9x4Html(Array.from({ length: 2 }, (_, i) => buildUniversalOrder("VPP", i))),
      requiredTokens: ["VPP2407200000", "VPP2407200001", "VPP Receiver 1", "VPP Receiver 2"],
    },
    {
      key: "universal-cod",
      title: "Universal COD",
      html: universal9x4Html(Array.from({ length: 2 }, (_, i) => buildUniversalOrder("COD", i))),
      requiredTokens: ["COD2407200000", "COD2407200001", "COD Receiver 1", "COD Receiver 2"],
    },
  ];

  const browser = await launchPuppeteerBrowser();
  const report = {
    generatedAt: new Date().toISOString(),
    outDir: OUT_DIR,
    scenarios: [],
  };

  try {
    for (const scenario of scenarios) {
      const html = String(scenario.html || "");
      if (!html.trim()) fail(`[${scenario.title}] Empty HTML`);

      assertNoPlaceholderLeakage(html, scenario.title);
      if (scenario.key.startsWith("mo-")) {
        assertNoEmptyBottomFields(html, scenario.title);
      }

      const missing = scenario.requiredTokens.filter((token) => !html.includes(token));
      if (missing.length) {
        fail(`[${scenario.title}] Missing required populated fields: ${missing.join(", ")}`);
      }

      if (scenario.key.startsWith("mo-")) {
        const trackA = "VPL2407100000";
        const trackB = scenario.key === "mo-4" ? "VPL2407100003" : "VPL2407100009";
        const countA = countOccurrences(html, trackA);
        const countB = countOccurrences(html, trackB);
        if (countA < 2 || countB < 2) {
          fail(`[${scenario.title}] Back overlay may be incomplete (tracking counts too low: ${trackA}=${countA}, ${trackB}=${countB})`);
        }
      }

      const htmlPath = path.join(OUT_DIR, `${scenario.key}.html`);
      const pdfPath = path.join(OUT_DIR, `${scenario.key}.pdf`);
      await fs.writeFile(htmlPath, html, "utf8");

      const pdf = await htmlToPdfBuffer(html, browser, "A4");
      if (!pdf?.length) fail(`[${scenario.title}] Generated empty PDF`);
      await fs.writeFile(pdfPath, pdf);

      report.scenarios.push({
        key: scenario.key,
        title: scenario.title,
        htmlPath,
        pdfPath,
        pdfBytes: pdf.length,
        missingRequiredTokens: missing,
      });
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(OUT_DIR, "validation-report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`REPORT_PATH=${reportPath}`);
  for (const scenario of report.scenarios) {
    console.log(`PDF_${scenario.key.toUpperCase()}=${scenario.pdfPath}`);
    console.log(`PDF_${scenario.key.toUpperCase()}_BYTES=${scenario.pdfBytes}`);
  }
}

run().catch((error) => {
  const msg = error instanceof Error ? error.stack || error.message : String(error);
  console.error(msg);
  process.exit(1);
});
