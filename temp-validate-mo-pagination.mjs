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

function extractSheets(html) {
  const marker = '<div class="sheet">';
  const positions = [];
  let offset = 0;
  while (true) {
    const idx = html.indexOf(marker, offset);
    if (idx === -1) break;
    positions.push(idx);
    offset = idx + marker.length;
  }
  if (positions.length !== 2) {
    throw new Error(`INVALID PAGINATION: Extra or missing pages detected (html sheets=${positions.length})`);
  }
  return [html.slice(positions[0], positions[1]), html.slice(positions[1])];
}

function countPdfPages(pdfBuffer) {
  const raw = pdfBuffer.toString("latin1");
  const matches = raw.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

async function main() {
  const cwd = process.cwd();
  const outputsDir = path.join(cwd, "storage", "outputs");
  await fs.mkdir(outputsDir, { recursive: true });

  const orders = [
    {
      TrackingID: "VPL999000001",
      trackingNumber: "VPL999000001",
      shipmentType: "VPL",
      CollectAmount: "1500",
      consigneeName: "Receiver Benchmark",
      consigneeAddress: "Benchmark Street, Lahore",
      consigneePhone: "03009990001",
      shipperName: "Sender Benchmark",
      shipperAddress: "Benchmark Road, Karachi",
      shipperPhone: "03119990001",
      mo_number: "MOS24079999",
      mo_barcodeBase64: code128DataUrl("MOS24079999"),
      issueDate: "27-03-26",
    },
  ];

  const html = moneyOrderHtml(orders, { mode: "VPLVPP" });
  const htmlPath = path.join(outputsDir, "mo-pagination-check.html");
  const pdfPath = path.join(outputsDir, "mo-pagination-check.pdf");
  await fs.writeFile(htmlPath, html, "utf8");

  const [page1Html, page2Html] = extractSheets(html);
  if (!page1Html.includes("half front")) {
    throw new Error("Pagination invalid: Page 1 is not FRONT");
  }
  if (!page2Html.includes("half back")) {
    throw new Error("Pagination invalid: Page 2 is not BACK");
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let pageCount = 0;
  try {
    const pdf = await htmlToPdfBuffer(html, browser);
    const pdfBuffer = Buffer.from(pdf);
    await fs.writeFile(pdfPath, pdfBuffer);
    pageCount = countPdfPages(pdfBuffer);
    console.log("Total pages:", pageCount);
    if (pageCount !== 2) {
      throw new Error("INVALID PAGINATION: Extra or missing pages detected");
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({
    htmlPath,
    pdfPath,
    pageCount,
    page1: "FRONT",
    page2: "BACK",
    blankPageDetected: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
