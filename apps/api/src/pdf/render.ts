import puppeteer, { type Browser, type Page } from "puppeteer";
import { ENVELOPE_DEFAULT_SIZE } from "../lib/printBranding.js";

type Universal9x4MeasurementReport = {
  applied: boolean;
  pages: Array<{
    totalConsumed: number;
    pageHeight: number;
    fromFooterOverlap: number;
    promoFooterOverlap: number;
    bodyFooterOverlap: number;
  }>;
};

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
  const report = await page.evaluate(String.raw`(() => {
    const PAGE_HEIGHT_LIMIT = 358;
    const labels = Array.from(document.querySelectorAll(".universal-page .label"));
    if (labels.length === 0) {
      return {
        applied: false,
        pages: [],
      };
    }

    const toNum = (value) => {
      const parsed = Number.parseFloat(String(value ?? "0"));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const outerHeight = (el) => {
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.height + toNum(style.marginTop) + toNum(style.marginBottom);
    };

    return {
      applied: true,
      pages: labels.map((label, index) => {
        const header = label.querySelector(".header");
        const body = label.querySelector(".body");
        const footer = label.querySelector(".footer");
        const toBox = label.querySelector(".left-column .box:first-child");
        const fromBox = label.querySelector(".left-column .box:nth-child(2)");
        const promoBox = label.querySelector(".promo-box");

        const labelRect = label.getBoundingClientRect();
        const headerRect = header?.getBoundingClientRect() ?? null;
        const bodyRect = body?.getBoundingClientRect() ?? null;
        const footerRect = footer?.getBoundingClientRect() ?? null;
        const toRect = toBox?.getBoundingClientRect() ?? null;
        const fromRect = fromBox?.getBoundingClientRect() ?? null;
        const promoRect = promoBox?.getBoundingClientRect() ?? null;

        const consumed = outerHeight(header) + outerHeight(body) + outerHeight(footer);
        const safeSpace = Number((PAGE_HEIGHT_LIMIT - consumed).toFixed(2));
        const fromFooterOverlap = fromRect && footerRect ? Math.max(0, fromRect.bottom - footerRect.top) : 0;
        const promoFooterOverlap = promoRect && footerRect ? Math.max(0, promoRect.bottom - footerRect.top) : 0;
        const bodyFooterOverlap = bodyRect && footerRect ? Math.max(0, bodyRect.bottom - footerRect.top) : 0;

        return {
          pageIndex: index,
          pageHeight: Number(labelRect.height.toFixed(2)),
          headerHeight: Number((headerRect?.height ?? 0).toFixed(2)),
          bodyHeight: Number((bodyRect?.height ?? 0).toFixed(2)),
          footerHeight: Number((footerRect?.height ?? 0).toFixed(2)),
          toHeight: Number((toRect?.height ?? 0).toFixed(2)),
          fromHeight: Number((fromRect?.height ?? 0).toFixed(2)),
          promoHeight: Number((promoRect?.height ?? 0).toFixed(2)),
          totalConsumed: Number(consumed.toFixed(2)),
          safeSpace,
          fromFooterOverlap: Number(fromFooterOverlap.toFixed(2)),
          promoFooterOverlap: Number(promoFooterOverlap.toFixed(2)),
          bodyFooterOverlap: Number(bodyFooterOverlap.toFixed(2)),
          passes: 0,
        };
      }),
    };
  })()`) as Universal9x4MeasurementReport;

  if (report.applied) {
    const PAGE_HEIGHT_LIMIT = 358;
    const OVERFLOW_TOLERANCE_PX = 0.5;
    const hasOverflow = report.pages.some(
      (pageReport: { totalConsumed: number; pageHeight: number; fromFooterOverlap: number; promoFooterOverlap: number; bodyFooterOverlap: number }) => (
        pageReport.totalConsumed > PAGE_HEIGHT_LIMIT + OVERFLOW_TOLERANCE_PX
        || pageReport.fromFooterOverlap > 0
        || pageReport.promoFooterOverlap > 0
        || pageReport.bodyFooterOverlap > 0
      ),
    );
    if (hasOverflow) {
      console.warn(`[Universal9x4MeasurementGuard] overflow-detected: ${JSON.stringify(report.pages)}`);
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "");
    if (!message.toLowerCase().includes("frame was detached")) {
      throw err;
    }
    console.warn("[PDF] Retrying render after detached frame...");
    return await renderOnce();
  }
}

export async function htmlToPdfBufferInFreshBrowser(
  html: string,
  format: "A4" | "4x6" | "envelope-9x4" = "A4",
) {
  const browser = await launchPuppeteerBrowser();
  try {
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
            landscape: false,
            preferCSSPageSize: false,
          }
        : {
            format: "A4" as const,
            landscape: true,
            preferCSSPageSize: true,
          };
      return await page.pdf({
        ...pdfOptions,
        printBackground: true,
        tagged: false,
        outline: false,
        margin: {
          top: "0mm",
          bottom: "0mm",
          left: "0mm",
          right: "0mm",
        },
      });
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
