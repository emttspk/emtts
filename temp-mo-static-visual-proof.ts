import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { moneyOrderHtml } from "./apps/api/src/templates/labels.ts";

async function main() {
  const outDir = path.resolve(process.cwd(), "forensic-artifacts");
  await fs.mkdir(outDir, { recursive: true });

  const orders = [
    {
      senderName: "Static Sender",
      sender_name: "Static Sender",
      sender_cnic: "3520212345671",
      senderAddress: "1 Static Road, Lahore",
      sender_address: "1 Static Road, Lahore",
      receiver_name: "Static Receiver",
      consignee_name: "Static Receiver",
      receiver_address: "House 10, Street 5, Lahore",
      consignee_address: "House 10, Street 5, Lahore",
      trackingNumber: "VPL260399992",
      trackingId: "VPL260399992",
      TrackingID: "VPL260399992",
      mo_number: "MOS24079998",
      moNumber: "MOS24079998",
      amount: "1500",
      amountRs: 1500,
      CollectAmount: 1500,
      amount_words: "One Thousand Five Hundred Rupees Only",
      issueDate: "2026-05-09",
      shipmentType: "VPL",
    },
  ] as any;

  const html = moneyOrderHtml(orders);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1.25 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    const screenshotPath = path.join(outDir, "mo-static-front-proof.png");
    const pdfPath = path.join(outDir, "mo-static-front-proof.pdf");

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.pdf({ path: pdfPath, format: "A4", landscape: true, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });

    console.log(JSON.stringify({ screenshotPath, pdfPath }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
