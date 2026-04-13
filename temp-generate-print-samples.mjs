import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { prepareLabelOrders } from "./apps/api/dist/services/labelDocument.js";
import { htmlToPdfBuffer } from "./apps/api/dist/pdf/render.js";
import { moneyOrderHtml, renderLabelDocumentHtml } from "./apps/api/dist/templates/labels.js";
import { buildMoneyOrderNumber, moneyOrderBreakdown } from "./apps/api/dist/validation/trackingId.js";

const OUTPUT_DIR = path.resolve("storage/outputs");

function makeOrder(overrides = {}) {
  return {
    shipperName: "Sender Benchmark",
    shipperPhone: "03119990001",
    shipperAddress: "Benchmark Road, Karachi",
    shipperEmail: "sender@example.com",
    senderCity: "Karachi",
    consigneeName: "Receiver Benchmark",
    consigneeEmail: "receiver@example.com",
    consigneePhone: "03009990001",
    consigneeAddress: "Benchmark Street, Lahore",
    receiverCity: "Lahore",
    CollectAmount: "0",
    ordered: "ORDER-001",
    ProductDescription: "Demo Product",
    Weight: "500",
    shipmenttype: "Parcel",
    numberOfPieces: "1",
    TrackingID: "",
    ...overrides,
  };
}

function enrichWithMoneyOrders(labelOrders) {
  let moneyOrderSequence = 1;
  const labelOrdersWithMos = labelOrders.map((order) => {
    const shipmentType = order.shipmentType ?? order.shipmenttype;
    const moneyOrderNumbers = moneyOrderBreakdown(Number(order.CollectAmount ?? 0), shipmentType).map(() =>
      buildMoneyOrderNumber(moneyOrderSequence++, new Date("2026-04-01")),
    );
    return {
      ...order,
      moneyOrderNumbers,
    };
  });

  const moneyOrderPrintOrders = labelOrdersWithMos.flatMap((order) => {
    const trackingNumber = String(order.trackingNumber ?? order.TrackingID ?? "").trim();
    const shipmentType = order.shipmentType ?? order.shipmenttype;
    return moneyOrderBreakdown(Number(order.CollectAmount ?? 0), shipmentType).map((line, index) => ({
      ...order,
      TrackingID: trackingNumber,
      trackingNumber,
      CollectAmount: String(line.total),
      amount: String(line.total),
      amountRs: line.moAmount,
      mo_number: order.moneyOrderNumbers[index],
      moneyOrderNumbers: [order.moneyOrderNumbers[index]],
      issueDate: "01-04-26",
    }));
  });

  return { labelOrdersWithMos, moneyOrderPrintOrders };
}

function buildScenario(baseOrders, opts) {
  const prepared = prepareLabelOrders(baseOrders, {
    autoGenerateTracking: opts.autoGenerateTracking,
    barcodeMode: opts.autoGenerateTracking ? "auto" : "manual",
    trackingScheme: "standard",
    carrierType: "pakistan_post",
    shipmentType: opts.shipmentType,
    outputMode: "labels",
  });
  const { labelOrdersWithMos, moneyOrderPrintOrders } = enrichWithMoneyOrders(prepared);

  return {
    labelHtml: renderLabelDocumentHtml(labelOrdersWithMos, {
      autoGenerateTracking: opts.autoGenerateTracking,
      includeMoneyOrders: opts.includeMoneyOrders,
      outputMode: "labels",
    }),
    moneyHtml: opts.includeMoneyOrders ? moneyOrderHtml(moneyOrderPrintOrders) : "",
  };
}

async function renderPdf(html, outPath, browser) {
  if (!html) {
    return 0;
  }
  const pdf = await htmlToPdfBuffer(html, browser);
  await fs.writeFile(outPath, Buffer.from(pdf));
  return Buffer.from(pdf).length;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const general = buildScenario([makeOrder({ TrackingID: "VPL04010001", CollectAmount: "0" })], {
    shipmentType: "PAR",
    autoGenerateTracking: false,
    includeMoneyOrders: false,
  });
  const vplLow = buildScenario([makeOrder({ TrackingID: "VPL04010002", CollectAmount: "1500" })], {
    shipmentType: "VPL",
    autoGenerateTracking: false,
    includeMoneyOrders: true,
  });
  const vplSplit = buildScenario([makeOrder({ TrackingID: "VPL04010003", CollectAmount: "45000" })], {
    shipmentType: "VPL",
    autoGenerateTracking: false,
    includeMoneyOrders: true,
  });
  const cod = buildScenario([makeOrder({ TrackingID: "VPL04010005", CollectAmount: "3200", shipmenttype: "COD" })], {
    shipmentType: "COD",
    autoGenerateTracking: false,
    includeMoneyOrders: true,
  });
  const multiLabel = buildScenario(
    Array.from({ length: 5 }, (_, index) =>
      makeOrder({
        TrackingID: `VPL0401${String(index + 10).padStart(4, "0")}`,
        ordered: `ORDER-${index + 1}`,
        CollectAmount: index === 2 ? "24000" : "0",
      }),
    ),
    {
      shipmentType: "PAR",
      autoGenerateTracking: false,
      includeMoneyOrders: false,
    },
  );

  const htmlFiles = [
    { name: "audit-general-shipment-a4.html", html: general.labelHtml },
    { name: "audit-vpl-under-limit-a4.html", html: vplLow.labelHtml },
    { name: "audit-vpl-under-limit-money-order.html", html: vplLow.moneyHtml },
    { name: "audit-vpl-over-limit-a4.html", html: vplSplit.labelHtml },
    { name: "audit-vpl-over-limit-money-order.html", html: vplSplit.moneyHtml },
    { name: "audit-cod-a4.html", html: cod.labelHtml },
    { name: "audit-cod-money-order.html", html: cod.moneyHtml },
    { name: "audit-multi-label-a4.html", html: multiLabel.labelHtml },
  ];

  await Promise.all(htmlFiles.map(({ name, html }) => fs.writeFile(path.join(OUTPUT_DIR, name), html, "utf8")));

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const pdfFiles = [];
    for (const { name, html } of htmlFiles) {
      const pdfName = name.replace(/\.html$/i, ".pdf");
      const bytes = await renderPdf(html, path.join(OUTPUT_DIR, pdfName), browser);
      pdfFiles.push({ name: pdfName, bytes });
    }
    console.log(JSON.stringify({ outputDir: OUTPUT_DIR, htmlFiles: htmlFiles.map(({ name }) => name), pdfFiles }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
