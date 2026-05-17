import { universal9x4Html, LabelOrder } from "../src/templates/labels.js";
import { launchPuppeteerBrowser, applyUniversal9x4MeasurementGuard } from "../src/pdf/render.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const mockOrders: LabelOrder[] = [
    {
      shipperName: "VERY LONG SENDER NAME THAT MIGHT CAUSE ISSUES IN THE INLINE BLOCK WHICH SHOULD BE ELLIPSIZED",
      shipperPhone: "0300-1234567",
      shipperAddress: "123 Sender Street, Sector X, Phase Y, Very Long Address Line to test overflow in the sender block even if it is inline",
      shipperEmail: "sender@example.com",
      senderCity: "ISLAMABAD",
      consigneeName: "RECIPIENT WITH A VERY LONG NAME TO TEST THE TO-NAME SHRINKING LOGIC",
      consigneeEmail: "recipient@example.com",
      consigneePhone: "0321-7654321",
      consigneeAddress: "House 456, Street 789, Block Z, Sector F-11/3, Near Some Landmark, Very Long Address Line 1, Very Long Address Line 2, Very Long Address Line 3 to definitely trigger shrinking",
      receiverCity: "KARACHI",
      CollectAmount: "1500",
      ordered: "ORD-12345",
      ProductDescription: "A VERY DETAILED PRODUCT DESCRIPTION TO SEE IF IT COLLIDES WITH THE PROMO BOX OR OTHER ELEMENTS ON THE RIGHT SIDE",
      Weight: "500g",
      shipmenttype: "VPL",
      numberOfPieces: "1",
      TrackingID: "VPL12345678",
    },
    {
        shipperName: "Sender 2",
        shipperPhone: "0300-2222222",
        shipperAddress: "Address 2",
        shipperEmail: "s2@ex.com",
        senderCity: "LAHORE",
        consigneeName: "Recipient 2",
        consigneeEmail: "r2@ex.com",
        consigneePhone: "0321-2222222",
        consigneeAddress: "Small Address",
        receiverCity: "QUETTA",
        CollectAmount: "500",
        ordered: "ORD-67890",
        ProductDescription: "Small Description",
        Weight: "100g",
        shipmenttype: "COD",
        numberOfPieces: "1",
        TrackingID: "COD87654321",
      }
  ];

  console.log("Generating HTML...");
  const html = universal9x4Html(mockOrders);

  console.log("Launching browser...");
  const browser = await launchPuppeteerBrowser();
  const page = await browser.newPage();

  page.on("console", (msg) => {
    console.log("BROWSER LOG:", msg.text());
  });

  console.log("Setting content...");
  await page.setViewport({ width: 864, height: 384, deviceScaleFactor: 2 }); // 9in * 96dpi = 864, 4in * 96dpi = 384
  await page.setContent(html, { waitUntil: "networkidle0" });

  console.log("Applying Measurement Guard...");
  try {
    await applyUniversal9x4MeasurementGuard(page);
    console.log("Guard applied successfully.");
  } catch (e) {
    console.error("Guard failed (as expected if overflow):", e.message);
  }

  const outputDir = path.join(process.cwd(), "storage", "repro_9x4");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log("Capturing screenshots...");
  const pages = await page.$$(".universal-page");
  for (let i = 0; i < pages.length; i++) {
    const screenshotPath = path.join(outputDir, `page_${i + 1}.png`);
    await pages[i].screenshot({ path: screenshotPath });
    console.log(`Saved screenshot: ${screenshotPath}`);
  }

  console.log("Generating PDF...");
  const pdfPath = path.join(outputDir, "output.pdf");
  const pdfBuffer = await page.pdf({
    width: "9in",
    height: "4in",
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 }
  });
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log(`Saved PDF: ${pdfPath}`);

  await browser.close();
  console.log("Done.");
}

run().catch(console.error);
