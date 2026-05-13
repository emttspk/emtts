import fs from "node:fs/promises";
import path from "node:path";
import { premiumEnvelopeHtml, moneyOrderHtml } from "../../../apps/api/src/templates/labels.ts";
import { htmlToPdfBufferInFreshBrowser } from "../../../apps/api/src/pdf/render.ts";

const outDir = path.resolve("storage", "validation", "premium-pass-20260512");
await fs.mkdir(outDir, { recursive: true });

const envelopeOrder = {
  shipperName: "Muhammad Usman",
  shipperPhone: "03001234567",
  shipperAddress: "House 14, Street 8, Gulberg",
  shipperEmail: "usman@example.com",
  senderCity: "Lahore",
  consigneeName: "Ayesha Khan",
  consigneeEmail: "ayesha@example.com",
  consigneePhone: "03111222333",
  consigneeAddress: "Flat 6, Block C, Satellite Town",
  receiverCity: "Rawalpindi",
  CollectAmount: "18000",
  ordered: "ORD-9001",
  ProductDescription: "Premium documents",
  Weight: "0.75",
  shipmenttype: "VPL",
  numberOfPieces: "1",
  TrackingID: "VPL260512001",
  trackingNumber: "VPL260512001",
  carrierType: "courier",
  shipmentType: "COURIER",
  reference: "ePost Workspace",
  senderCnic: "35202-1234567-1"
};

const moneyOrders = [
  {
    shipperName: "Muhammad Usman",
    shipperPhone: "03001234567",
    shipperAddress: "House 14, Street 8, Gulberg, Lahore",
    shipperEmail: "usman@example.com",
    senderCity: "Lahore",
    consigneeName: "Ayesha Khan",
    consigneeEmail: "ayesha@example.com",
    consigneePhone: "03111222333",
    consigneeAddress: "Flat 6, Block C, Satellite Town, Rawalpindi",
    receiverCity: "Rawalpindi",
    CollectAmount: "18000",
    ordered: "ORD-9001",
    ProductDescription: "Premium documents",
    Weight: "0.75",
    shipmenttype: "VPL",
    numberOfPieces: "1",
    TrackingID: "VPL260512001",
    amount: "17900",
    amountRs: 17900,
    mo_number: "MOS260512001",
    senderCnic: "35202-1234567-1",
    issueDate: "12-05-2026"
  },
  {
    shipperName: "Sana Ahmed",
    shipperPhone: "03007654321",
    shipperAddress: "Plot 22, Sector G-11, Islamabad",
    shipperEmail: "sana@example.com",
    senderCity: "Islamabad",
    consigneeName: "Bilal Hussain",
    consigneeEmail: "bilal@example.com",
    consigneePhone: "03219876543",
    consigneeAddress: "House 19, Main Boulevard, Faisalabad",
    receiverCity: "Faisalabad",
    CollectAmount: "9500",
    ordered: "ORD-9002",
    ProductDescription: "Medicines",
    Weight: "1.10",
    shipmenttype: "VPL",
    numberOfPieces: "1",
    TrackingID: "VPL260512002",
    amount: "9425",
    amountRs: 9425,
    mo_number: "MOS260512002",
    senderCnic: "61101-7654321-0",
    issueDate: "12-05-2026"
  }
];

const envelopeHtml = premiumEnvelopeHtml([envelopeOrder], { autoGenerateTracking: false, includeMoneyOrders: true });
const moneyHtml = moneyOrderHtml(moneyOrders);

const envelopePdf = await htmlToPdfBufferInFreshBrowser(envelopeHtml, "envelope-9x4");
const moneyPdf = await htmlToPdfBufferInFreshBrowser(moneyHtml, "A4");

await Promise.all([
  fs.writeFile(path.join(outDir, "premium-envelope.html"), envelopeHtml, "utf8"),
  fs.writeFile(path.join(outDir, "premium-envelope.pdf"), envelopePdf),
  fs.writeFile(path.join(outDir, "money-order-benchmark.html"), moneyHtml, "utf8"),
  fs.writeFile(path.join(outDir, "money-order-benchmark.pdf"), moneyPdf),
]);

console.log(JSON.stringify({
  outDir,
  premiumEnvelopeHtmlBytes: Buffer.byteLength(envelopeHtml),
  premiumEnvelopePdfBytes: envelopePdf.length,
  moneyOrderHtmlBytes: Buffer.byteLength(moneyHtml),
  moneyOrderPdfBytes: moneyPdf.length,
}, null, 2));
