import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "canvas";
import JsBarcode from "jsbarcode";
import puppeteer from "puppeteer";
import { moneyOrderHtml, labelsHtml } from "./apps/api/dist/templates/labels.js";

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

async function toDataUrl(absPath) {
  const buf = await fs.readFile(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function main() {
  const cwd = process.cwd();
  const outputsDir = path.join(cwd, "storage", "outputs");
  await fs.mkdir(outputsDir, { recursive: true });

  const frontBg = await toDataUrl(path.join(cwd, "MO", "MO Front.png"));
  const backBg = await toDataUrl(path.join(cwd, "MO", "MO Back.png"));

  const order = {
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
    barcodeBase64: code128DataUrl("VPL999000001"),
    carrierType: "pakistan_post",
    ProductDescription: "Benchmark Parcel",
    Weight: "500",
  };

  const moHtml = moneyOrderHtml([order], {
    backgrounds: { frontDataUrl: frontBg, backDataUrl: backBg },
    mode: "VPLVPP",
  });
  const labelHtml = labelsHtml([order], { autoGenerateTracking: false, includeMoneyOrders: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });
  try {
    const renderPdf = async (html) => {
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(0);
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 0 });
      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      });
      await page.close();
      return pdf;
    };

    const moPdf = await renderPdf(moHtml);
    const labelPdf = await renderPdf(labelHtml);

    const moHtmlPath = path.join(outputsDir, "mo-benchmark-check.html");
    const moPdfPath = path.join(outputsDir, "mo-benchmark-check.pdf");
    const labelHtmlPath = path.join(outputsDir, "label-benchmark-check.html");
    const labelPdfPath = path.join(outputsDir, "label-benchmark-check.pdf");

    await fs.writeFile(moHtmlPath, moHtml, "utf8");
    await fs.writeFile(moPdfPath, Buffer.from(moPdf));
    await fs.writeFile(labelHtmlPath, labelHtml, "utf8");
    await fs.writeFile(labelPdfPath, Buffer.from(labelPdf));

    console.log(JSON.stringify({ moHtmlPath, moPdfPath, labelHtmlPath, labelPdfPath }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
