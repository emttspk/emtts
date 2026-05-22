import fs from "node:fs/promises";
import path from "node:path";
import { renderLabelDocumentHtml, generateLabelBarcodeBase64 } from "../apps/api/src/templates/labels.ts";
import { htmlToPdfBufferInFreshBrowser } from "../apps/api/src/pdf/render.ts";

const rows = [
  {
    shipmentType: "VPL",
    tracking: "VPL26050088",
    collect: "550",
    weight: "100",
    consigneeName: "Muhammad Altaf Ibn Abdul Karim",
    consigneeAddress: "Near Government Sardar Niaz Muhammad High School, Batkanala, Post Office, Garhi Dupatta District And Tehsil Muzaffarabad Ajk",
    receiverCity: "Muzafrabad",
    consigneePhone: "03128828132",
  },
  {
    shipmentType: "VPL",
    tracking: "VPL26050089",
    collect: "550",
    weight: "100",
    consigneeName: "Nadeem Iqbal",
    consigneeAddress: "Dist Bahwalpur Ada Musafir Khana Shakeel Mobail Shop Ada Musafir Khana",
    receiverCity: "Bahawalpur",
    consigneePhone: "03016506537",
  },
  {
    shipmentType: "VPL",
    tracking: "VPL26050090",
    collect: "550",
    weight: "5000",
    consigneeName: "Hina Rasheed",
    consigneeAddress: "Renala Khurd Hameed Town Street No 5, House No 305 Postal Code 56130",
    receiverCity: "Renala",
    consigneePhone: "03475080692",
  },
  {
    shipmentType: "IRL",
    tracking: "IRL26050001",
    collect: "0",
    weight: "100",
    consigneeName: "Muhammad Atif Majeed",
    consigneeAddress: "Hazrat Usman Ghani Colony Lane 3 Gali 7 Near Chauhan House Karamabad Old Chakra Rawalpindi",
    receiverCity: "Rawalpindi",
    consigneePhone: "03310335002",
  },
  {
    shipmentType: "COD",
    tracking: "COD26050001",
    collect: "550",
    weight: "100",
    consigneeName: "Arooj Akhter D/O M Akhter",
    consigneeAddress: "Hno 226/A Street No 4 Shah Wali Ullah Nagar Near Syed Fabrics Raaes Tailor Orangi Town Karachi",
    receiverCity: "Karachi",
    consigneePhone: "03082953668",
  },
].map((row, idx) => ({
  shipperName: "Hoja Seeds",
  shipperAddress: "C/o Postmaster City Post office Sahiwal",
  senderCity: "Sahiwal",
  shipperPhone: "03000000000",
  shipperEmail: `sender${idx + 1}@example.com`,
  consigneeName: row.consigneeName,
  consigneeAddress: row.consigneeAddress,
  receiverCity: row.receiverCity,
  consigneePhone: row.consigneePhone,
  consigneeEmail: `receiver${idx + 1}@example.com`,
  shipmentType: row.shipmentType,
  shipmenttype: row.shipmentType,
  carrierType: "pakistan_post",
  CollectAmount: row.collect,
  trackingNumber: row.tracking,
  TrackingID: row.tracking,
  Weight: row.weight,
  ordered: "METAFORM",
  ProductDescription: "15 Packs Vegetables Seeds",
  barcodeBase64: generateLabelBarcodeBase64(row.tracking),
}));

const html = renderLabelDocumentHtml(rows, {
  outputMode: "labels",
  autoGenerateTracking: false,
  includeMoneyOrders: true,
});

const pdf = await htmlToPdfBufferInFreshBrowser(html, "A4");
const outPath = path.resolve("Label 22-05-2026 (4).pdf");
await fs.writeFile(outPath, pdf);

const htmlPath = path.resolve("forensic-artifacts", "Label-22-05-2026-(4)-restored.html");
await fs.mkdir(path.dirname(htmlPath), { recursive: true });
await fs.writeFile(htmlPath, html, "utf8");

console.log(`OUTPUT_PDF=${outPath}`);
console.log(`OUTPUT_PDF_BYTES=${pdf.length}`);
console.log(`OUTPUT_HTML=${htmlPath}`);
