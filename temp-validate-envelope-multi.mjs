import puppeteer from "puppeteer";

import { envelopeHtml } from "./apps/api/src/templates/labels.ts";

const MM_PER_PX = 25.4 / 96;
const MM_TOLERANCE = 0.2;

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

function nearlyEqualMm(a, b, tolerance = MM_TOLERANCE) {
  return Math.abs(a - b) <= tolerance;
}

function buildStructuralChecks(html, orders) {
  const count = orders.length;
  const labelCount = (html.match(/class="label-container"/g) ?? []).length;
  const barcodeCount = (html.match(/alt="Barcode"/g) ?? []).length;
  const trackingValues = orders.map((order) => order.trackingNumber).filter((tracking) => html.includes(tracking));
  const amountRowMatches = Array.from(html.matchAll(/<div class="amount-row(?![^"]*is-hidden)[^"]*">[\s\S]*?<span class="amount-label">([^<]*)<\/span>[\s\S]*?<span class="amount-value">([^<]*)<\/span>[\s\S]*?<\/div>/g));
  const expectedAmountRows = orders.reduce((sum, order) => sum + (order.shipmentType === "COD" ? 0 : 3), 0);

  return {
    labelCount,
    barcodeCount,
    uniqueTrackingCount: new Set(trackingValues).size,
    safeAreaDefined: /\.label-safe-area\s*\{[\s\S]*width:\s*210mm;[\s\S]*height:\s*83mm;/i.test(html),
    pageSizeDefined: /@page\s*\{[^}]*size\s*:\s*9in\s+4in;[^}]*margin\s*:\s*0;/i.test(html),
    fixedInchLayout: /html, body\s*\{[\s\S]*width:\s*9in;[\s\S]*min-width:\s*9in;/i.test(html),
    printKeepsCenteredLayout: /@media\s+print[\s\S]*\.label-safe-area\s*\{[\s\S]*margin:\s*0;/i.test(html),
    noPrintMarginReset: !/@media\s+print[\s\S]*\.label-card\s*\{[\s\S]*margin\s*:\s*0(?:\s*!important)?\s*;/i.test(html),
    noAbsoluteShift: !/position\s*:\s*absolute|position\s*:\s*fixed|translateX\s*\(|zoom\s*:/i.test(html),
    noLeftOffsets: !/margin-left\s*:\s*(?!auto)[^;]+;|left\s*:\s*[^;]+;|padding-left\s*:\s*(?!0(?:mm|px|pt|pc|in|cm|rem|em)?\b)[^;]+;/i.test(html),
    trackingInsideBarcodeUnit: /<div class="header-barcode">[\s\S]*?<img class="barcode"[\s\S]*?<div class="header-identifiers">[\s\S]*?<div class="header-id-line">[^<]*<\/div>/i.test(html),
    noTrackingDuplication: !/class="tracking"|class="env-tracking"|class="header-tracking"/i.test(html),
    amountRowsStructured: amountRowMatches.length === expectedAmountRows,
    noPxLayoutPositioning: !/\b(left|right|top|bottom|margin|padding|width|height|min-width|min-height|max-width|max-height|gap):\s*[^;]*px\b/i.test(html),
    marketingFooterPresent: /Print Labels, Money Order &amp; Track Parcels at/i.test(html),
    amountColumnsAligned:
      /\.amount-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[\s\S]*\}/i.test(html)
      && /\.amount-label\s*\{[\s\S]*text-align:\s*left;/i.test(html)
      && /\.amount-value\s*\{[\s\S]*text-align:\s*right;/i.test(html),
  };
}

async function inspectGeometry(browser, html, orders) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");

    return await page.evaluate((expectedShipments, mmPerPx) => {
      const toMm = (value) => Number((value * mmPerPx).toFixed(2));
      const containers = Array.from(document.querySelectorAll(".label-container"));
      const reports = containers.map((container, index) => {
        const safeArea = container.querySelector(".label-safe-area");
        const card = container.querySelector(".label-card");
        const barcodeWrap = container.querySelector(".header-barcode");
        const barcode = container.querySelector(".barcode");
        const tracking = container.querySelector(".header-id-line");
        const rows = Array.from(container.querySelectorAll(".amount-row:not(.is-hidden)"));

        const containerRect = container.getBoundingClientRect();
        const safeRect = safeArea.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const barcodeRect = barcode.getBoundingClientRect();
        const trackingRect = tracking.getBoundingClientRect();

        return {
          index,
          leftGapMm: toMm(safeRect.left - containerRect.left),
          rightGapMm: toMm(containerRect.right - safeRect.right),
          topGapMm: toMm(safeRect.top - containerRect.top),
          bottomGapMm: toMm(containerRect.bottom - safeRect.bottom),
          safeWidthMm: toMm(safeRect.width),
          safeHeightMm: toMm(safeRect.height),
          cardLeftInsetMm: toMm(cardRect.left - safeRect.left),
          cardRightInsetMm: toMm(safeRect.right - cardRect.right),
          cardTopInsetMm: toMm(cardRect.top - safeRect.top),
          cardBottomInsetMm: toMm(safeRect.bottom - cardRect.bottom),
          cardWithinSafeArea:
            cardRect.left >= safeRect.left - 0.5
            && cardRect.top >= safeRect.top - 0.5
            && cardRect.right <= safeRect.right + 0.5
            && cardRect.bottom <= safeRect.bottom + 0.5,
          noOverflow:
            safeArea.scrollWidth <= safeArea.clientWidth
            && safeArea.scrollHeight <= safeArea.clientHeight
            && card.scrollWidth <= card.clientWidth
            && card.scrollHeight <= card.clientHeight,
          noShiftTransforms:
            getComputedStyle(container).transform === "none"
            && getComputedStyle(safeArea).transform === "none"
            && getComputedStyle(card).transform === "none",
          noShiftPositioning:
            getComputedStyle(container).position !== "absolute"
            && getComputedStyle(safeArea).position !== "absolute"
            && getComputedStyle(card).position !== "absolute",
          barcodeTopSectionValid: barcodeWrap.contains(barcode) && barcodeWrap.contains(tracking),
          trackingBelowBarcode: trackingRect.top >= barcodeRect.bottom - 1,
          trackingInsideBarcodeBlock: barcodeWrap.contains(tracking),
          amountLabels: rows.map((row) => row.querySelector(".amount-label")?.textContent?.trim() ?? ""),
          amountValues: rows.map((row) => row.querySelector(".amount-value")?.textContent?.trim() ?? ""),
          amountAligned: rows.every((row) => {
            const label = row.querySelector(".amount-label");
            const value = row.querySelector(".amount-value");
            return getComputedStyle(label).textAlign === "left" && getComputedStyle(value).textAlign === "right";
          }),
          marketingFooterPresent: container.querySelector(".marketing-footer") !== null,
          shipmentType: expectedShipments[index],
        };
      });

      return {
        bodyWidthMm: toMm(document.body.getBoundingClientRect().width),
        bodyHeightMm: toMm(containers[0]?.getBoundingClientRect().height ?? 0),
        bodyMarginLeft: getComputedStyle(document.body).marginLeft,
        bodyMarginRight: getComputedStyle(document.body).marginRight,
        zoom: getComputedStyle(document.body).zoom,
        reports,
      };
    }, orders.map((order) => order.shipmentType), MM_PER_PX);
  } finally {
    await page.close();
  }
}

async function verify(browser, count) {
  const orders = Array.from({ length: count }, (_, index) => makeOrder(index));
  const html = envelopeHtml(orders, { autoGenerateTracking: false, includeMoneyOrders: true });
  const structure = buildStructuralChecks(html, orders);
  const geometry = await inspectGeometry(browser, html, orders);

  const labels = geometry.reports.map((report) => ({
    index: report.index + 1,
    leftMarginMm: report.leftGapMm,
    rightMarginMm: report.rightGapMm,
    topMarginMm: report.topGapMm,
    bottomMarginMm: report.bottomGapMm,
    safeWidthMm: report.safeWidthMm,
    safeHeightMm: report.safeHeightMm,
    cardLeftInsetMm: report.cardLeftInsetMm,
    cardRightInsetMm: report.cardRightInsetMm,
    cardTopInsetMm: report.cardTopInsetMm,
    cardBottomInsetMm: report.cardBottomInsetMm,
    equalMargins:
      nearlyEqualMm(report.leftGapMm, report.rightGapMm)
      && nearlyEqualMm(report.leftGapMm, report.topGapMm)
      && nearlyEqualMm(report.leftGapMm, report.bottomGapMm)
      && nearlyEqualMm(report.leftGapMm, 9.3)
      && nearlyEqualMm(report.safeWidthMm, 210)
      && nearlyEqualMm(report.safeHeightMm, 83),
    centeredWithinPage:
      nearlyEqualMm(report.leftGapMm, report.rightGapMm)
      && nearlyEqualMm(report.topGapMm, report.bottomGapMm),
    cardWithinSafeArea: report.cardWithinSafeArea,
    noOverflow: report.noOverflow,
    noShiftTransforms: report.noShiftTransforms,
    noShiftPositioning: report.noShiftPositioning,
    barcodeTopSectionValid: report.barcodeTopSectionValid,
    trackingBelowBarcode: report.trackingBelowBarcode,
    trackingInsideBarcodeBlock: report.trackingInsideBarcodeBlock,
    amountAligned: report.amountAligned,
    marketingFooterPresent: report.marketingFooterPresent,
    amountLabelsCorrect:
      report.shipmentType === "COD"
        ? report.amountLabels.length === 0
        : report.amountLabels.length === 3
          && report.amountLabels[0] === "Money Order"
          && report.amountLabels[1] === "MO Commission"
          && report.amountLabels[2] === "VPL Amount",
    amountValuesPresent:
      report.shipmentType === "COD"
        ? report.amountValues.length === 0
        : report.amountValues.length === 3 && report.amountValues.every((value) => /^Rs\.\s+/.test(value)),
  }));

  const pass =
    structure.labelCount === count
    && structure.barcodeCount === count
    && structure.uniqueTrackingCount === count
    && structure.safeAreaDefined
    && structure.pageSizeDefined
    && structure.fixedInchLayout
    && structure.printKeepsCenteredLayout
    && structure.noPrintMarginReset
    && structure.noAbsoluteShift
    && structure.noLeftOffsets
    && structure.trackingInsideBarcodeUnit
    && structure.noTrackingDuplication
    && structure.noPxLayoutPositioning
    && structure.marketingFooterPresent
    && structure.amountColumnsAligned
    && nearlyEqualMm(geometry.bodyWidthMm, 228.6)
    && nearlyEqualMm(geometry.bodyHeightMm, 101.6)
    && (geometry.zoom === "1" || geometry.zoom === "normal")
    && labels.every((label) =>
      Object.entries(label).every(([key, value]) => key === "index" || key.endsWith("Mm") || value === true),
    );

  return {
    inputRecords: count,
    structure,
    geometry: {
      bodyWidthMm: geometry.bodyWidthMm,
      bodyHeightMm: geometry.bodyHeightMm,
      bodyMarginLeft: geometry.bodyMarginLeft,
      bodyMarginRight: geometry.bodyMarginRight,
    },
    labels,
    pass,
  };
}

const browser = await puppeteer.launch({ headless: true });

try {
  const checks = [];
  for (const count of [1, 5, 10]) {
    checks.push(await verify(browser, count));
  }

  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
