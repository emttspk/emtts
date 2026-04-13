import fs from "node:fs";
import { envelopeHtml } from "./apps/api/src/templates/labels.ts";

function makeOrder(index) {
  const i = index + 1;
  return {
    shipperName: `Sender ${i}`,
    shipperAddress: `Street ${i}`,
    senderCity: `City ${i}`,
    shipperPhone: `03000000${String(i).padStart(3, "0")}`,
    consigneeName: `Receiver ${i}`,
    consigneeAddress: `Address ${i}`,
    receiverCity: `Town ${i}`,
    consigneePhone: `03110000${String(i).padStart(3, "0")}`,
    shipmentType: i % 2 === 0 ? "COD" : "VPL",
    CollectAmount: String(1000 + i),
    trackingNumber: `TRK${String(i).padStart(6, "0")}`,
    barcodeBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2L0X8AAAAASUVORK5CYII=",
    ordered: `ORDER-${i}`,
    ProductDescription: `Item ${i}`,
  };
}

const orders = Array.from({ length: 3 }, (_, index) => makeOrder(index));
const html = envelopeHtml(orders, { autoGenerateTracking: false, includeMoneyOrders: true });
const outputPath = "storage/outputs/envelope-preview-three-records.html";
fs.writeFileSync(outputPath, html, "utf8");

console.log(JSON.stringify({
  outputPath,
  labels: (html.match(/class=\"label-container\"/g) ?? []).length,
  tracking: Array.from(html.matchAll(/class=\"header-tracking\">([^<]*)</g)).map((match) => match[1]),
  amountBlocks: (html.match(/class=\"amount /g) ?? []).length,
  amountRows: (html.match(/class=\"amount-row\"/g) ?? []).length,
  envelopeSize: /@page\s*\{[^}]*size\s*:\s*9in\s+4in;[^}]*margin\s*:\s*0/i.test(html),
  balancedMargins: /\.label-safe-area\s*\{[^}]*width\s*:\s*210mm;[^}]*height\s*:\s*83mm;/i.test(html),
  centeredInnerLabel: /\.label-card\s*\{[^}]*width\s*:\s*100%;[^}]*height\s*:\s*100%;/i.test(html),
  marketingFooter: /Print Labels, Money Order &amp; Track Parcels at/i.test(html),
  printBreaks: /@media\s+print[\s\S]*\.label-container\s*\{[\s\S]*page-break-after\s*:\s*always[\s\S]*break-after\s*:\s*page/i.test(html),
}, null, 2));
