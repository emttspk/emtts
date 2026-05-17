import puppeteer, { type Browser, type Page } from "puppeteer";
import { ENVELOPE_DEFAULT_SIZE } from "../lib/printBranding.js";

async function waitForPdfFonts(page: Page) {
  await page.evaluate(async () => {
    if (!("fonts" in document)) return;
    await document.fonts.ready;
    await Promise.all(Array.from(document.fonts).map(async (font) => {
      try {
        await font.load();
      } catch {
        // Ignore individual font load failures so the render can surface the real issue.
      }
    }));
  });
}

export async function applyUniversal9x4MeasurementGuard(page: Page) {
  const report = (await page.evaluate(`(() => {
    const PAGE_HEIGHT_LIMIT = 384;
    const labels = Array.from(document.querySelectorAll(".universal-page .label"));
    if (labels.length === 0) {
      return {
        applied: false,
        pages: [],
        maxConsumed: 0,
        minSafeSpace: PAGE_HEIGHT_LIMIT,
        maxOverlap: 0,
      };
    }

    function toNum(value) {
      const parsed = parseFloat(String(value ?? "0"));
      return isFinite(parsed) ? parsed : 0;
    }

    function outerHeight(el) {
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.height + toNum(style.marginTop) + toNum(style.marginBottom);
    }

    function adjustStylePx(el, cssProp, delta, min) {
      if (!el) return;
      const computed = getComputedStyle(el);
      const current = toNum(computed.getPropertyValue(cssProp));
      if (!isFinite(current) || current <= 0) return;
      const next = Math.max(min, Number((current + delta).toFixed(2)));
      if (next < current) {
        el.style.setProperty(cssProp, next + "px");
      }
    }

    const pageReports = labels.map((label, index) => {
      const header = label.querySelector(".header");
      const body = label.querySelector(".body");
      const footer = label.querySelector(".footer");
      const leftCol = label.querySelector(".left-column");
      const toBox = label.querySelector(".left-column .box:first-child");
      const fromBox = label.querySelector(".left-column .box:nth-child(2)");
      const promoBox = label.querySelector(".promo-box");
      const fromInline = label.querySelector(".from-inline");
      const toName = label.querySelector(".to-name");
      const toAddress = label.querySelector(".to-address");
      const toCity = label.querySelector(".to-city");
      const toPhone = label.querySelector(".to-phone");
      const promoContent = label.querySelector(".promo-content");
      const promoWebsite = label.querySelector(".promo-website");

      if (fromInline) {
        fromInline.style.whiteSpace = "nowrap";
        fromInline.style.overflow = "hidden";
        fromInline.style.textOverflow = "ellipsis";
        fromInline.style.display = "block";
      }

      function measure() {
        const labelRect = label.getBoundingClientRect();
        const headerRect = header ? header.getBoundingClientRect() : null;
        const bodyRect = body ? body.getBoundingClientRect() : null;
        const footerRect = footer ? footer.getBoundingClientRect() : null;
        
        const bodyScrollHeight = body ? body.scrollHeight : 0;
        const bodyOffsetHeight = body ? body.offsetHeight : 0;
        const internalOverflow = Math.max(0, bodyScrollHeight - bodyOffsetHeight);

        const consumed = outerHeight(header) + bodyScrollHeight + outerHeight(footer);
        const safeSpace = Number((PAGE_HEIGHT_LIMIT - consumed).toFixed(2));
        
        let maxBoxOverlap = 0;
        const boxes = Array.from(label.querySelectorAll(".box"));
        boxes.forEach(box => {
            const boxOverflow = box.scrollHeight - box.offsetHeight;
            if (boxOverflow > 1) maxBoxOverlap = Math.max(maxBoxOverlap, boxOverflow);
        });

        console.log("[Guard Page " + index + "] Consumed: " + consumed + ", InternalOverflow: " + internalOverflow + ", MaxBoxOverlap: " + maxBoxOverlap);

        return {
          pageIndex: index,
          pageHeight: Number(labelRect.height.toFixed(2)),
          headerHeight: Number((headerRect ? headerRect.height : 0).toFixed(2)),
          bodyHeight: Number((bodyRect ? bodyRect.height : 0).toFixed(2)),
          bodyScrollHeight: bodyScrollHeight,
          totalConsumed: Number(consumed.toFixed(2)),
          safeSpace: safeSpace,
          internalOverflow: Number(internalOverflow.toFixed(2)),
          maxBoxOverlap: Number(maxBoxOverlap.toFixed(2)),
        };
      }

      let metrics = measure();
      let passes = 0;

      while (
        passes < 25 && 
        (metrics.totalConsumed > PAGE_HEIGHT_LIMIT || 
         metrics.internalOverflow > 1 ||
         metrics.maxBoxOverlap > 1)
      ) {
        passes += 1;

        adjustStylePx(body, "gap", -1, 4);
        adjustStylePx(body, "padding-top", -1, 4);
        adjustStylePx(body, "padding-bottom", -1, 4);
        adjustStylePx(leftCol, "gap", -1, 4);
        
        // Shrink boxes and their internal tables
        const allBoxes = Array.from(label.querySelectorAll(".box"));
        allBoxes.forEach(box => {
            adjustStylePx(box, "padding", -1, 4);
            const tables = Array.from(box.querySelectorAll(".info-table td"));
            tables.forEach(td => adjustStylePx(td, "padding", -0.5, 3));
            tables.forEach(td => adjustStylePx(td, "font-size", -0.2, 10));
        });

        adjustStylePx(fromBox, "margin-top", -1, 0);
        
        // Shrink Left side fonts
        adjustStylePx(toName, "font-size", -0.5, 16);
        adjustStylePx(toAddress, "font-size", -0.3, 10);
        adjustStylePx(toCity, "font-size", -0.3, 10);
        adjustStylePx(toPhone, "font-size", -0.3, 11);
        
        // Shrink Right side
        const amountBox = label.querySelector(".amount-box");
        adjustStylePx(amountBox, "padding", -1, 4);
        const amountRows = Array.from(label.querySelectorAll(".amount-row"));
        amountRows.forEach(row => adjustStylePx(row, "font-size", -0.2, 11));

        adjustStylePx(promoBox, "padding-top", -1, 4);
        adjustStylePx(promoBox, "padding-bottom", -1, 4);
        adjustStylePx(promoBox, "font-size", -0.5, 9);
        adjustStylePx(promoWebsite, "font-size", -0.5, 10);
        adjustStylePx(promoContent, "gap", -0.5, 0);

        if (passes > 5) {
          adjustStylePx(footer, "height", -1, 30);
          adjustStylePx(footer, "font-size", -0.2, 8);
          adjustStylePx(header, "height", -1, 44);
          const vplAmount = label.querySelector(".vpl-amount");
          adjustStylePx(vplAmount, "font-size", -0.5, 14);
        }

        metrics = measure();
      }

      return Object.assign({}, metrics, { passes: passes });
    });

    const maxConsumed = pageReports.reduce((max, row) => Math.max(max, row.totalConsumed), 0);
    const minSafeSpace = pageReports.reduce((min, row) => Math.min(min, row.safeSpace), PAGE_HEIGHT_LIMIT);
    const maxOverlap = pageReports.reduce((max, row) => Math.max(max, row.internalOverflow, row.maxBoxOverlap), 0);

    return {
      applied: true,
      pages: pageReports,
      maxConsumed: Number(maxConsumed.toFixed(2)),
      minSafeSpace: Number(minSafeSpace.toFixed(2)),
      maxOverlap: Number(maxOverlap.toFixed(2)),
    };
  })()`) as any);

  if (report.applied) {
    const hasOverflow = report.pages.some(
      (pageReport: { totalConsumed: number; pageHeight: number; internalOverflow: number; maxBoxOverlap: number }) => (
        pageReport.totalConsumed > 384.5
        || pageReport.pageHeight > 384.5
        || pageReport.internalOverflow > 1.5
        || pageReport.maxBoxOverlap > 1.5
      ),
    );
    if (hasOverflow) {
      throw new Error(`Universal 9x4 layout overflow detected after measurement guard: ${JSON.stringify(report.pages)}`);
    }
  }
}

export async function launchPuppeteerBrowser() {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  console.log(`Launching Puppeteer — executablePath: ${executablePath ?? "(puppeteer default)"}`);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  return browser;
}

export async function htmlToPdfBuffer(
  html: string,
  browser: Browser,
  format: "A4" | "4x6" | "envelope-9x4" = "A4",
) {
  const renderOnce = async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "networkidle0" });
      await waitForPdfFonts(page);
      if (format === "envelope-9x4") {
        await applyUniversal9x4MeasurementGuard(page);
      }
      const pdfOptions = format === "envelope-9x4"
        ? {
        width: `${ENVELOPE_DEFAULT_SIZE.widthInches}in`,
        height: `${ENVELOPE_DEFAULT_SIZE.heightInches}in`,
            printBackground: true,
            margin: {
              top: "0mm",
              bottom: "0mm",
              left: "0mm",
              right: "0mm",
            },
          }
        : {
            format: "A4" as const,
            printBackground: true,
            margin: {
              top: "0mm",
              bottom: "0mm",
              left: "0mm",
              right: "0mm",
            },
          };
      return await page.pdf({
        ...pdfOptions,
        pageRanges: "", // empty = all pages
        tagged: false, // disable tagging for smaller output
        outline: false, // disable outline/bookmarks
        printBackground: true,
        preferCSSPageSize: format === "A4",
      });
    } finally {
      await page.close();
    }
  };

  try {
    return await renderOnce();
  } catch (err: any) {
    console.error(`PDF render error (attempt 1): ${err.message}`);
    // Optional: retry logic
    return await renderOnce();
  }
}

export async function htmlToPdfBufferInFreshBrowser(
  html: string,
  format: "A4" | "4x6" | "envelope-9x4" = "A4",
) {
  const browser = await launchPuppeteerBrowser();
  try {
    return await htmlToPdfBuffer(html, browser, format);
  } finally {
    await browser.close();
  }
}
