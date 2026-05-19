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
  const report = await page.evaluate(() => {
    // .label is 384px total (9in×4in), minus 24px padding (top+bottom) and 2px border (top+bottom) = 358px actual content area
    const PAGE_HEIGHT_LIMIT = 358;
    const labels = Array.from(document.querySelectorAll(".universal-page .label"));
    if (labels.length === 0) {
      return {
        applied: false,
        pages: [],
      };
    }

    const toNum = (value: string | null | undefined) => {
      const parsed = Number.parseFloat(String(value ?? "0"));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const outerHeight = (el: Element | null) => {
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.height + toNum(style.marginTop) + toNum(style.marginBottom);
    };

    const adjustStylePx = (el: HTMLElement | null, cssProp: string, delta: number, min: number) => {
      if (!el) return;
      const computed = getComputedStyle(el);
      const current = toNum(computed.getPropertyValue(cssProp));
      if (!Number.isFinite(current) || current <= 0) return;
      const next = Math.max(min, Number((current + delta).toFixed(2)));
      if (next < current) {
        el.style.setProperty(cssProp, `${next}px`);
      }
    };

    return {
      applied: true,
      pages: labels.map((label, index) => {
        const header = label.querySelector(".header");
        const body = label.querySelector(".body") as HTMLElement | null;
        const footer = label.querySelector(".footer") as HTMLElement | null;
        const toBox = label.querySelector(".left-column .box:first-child");
        const fromBox = label.querySelector(".left-column .box:nth-child(2)") as HTMLElement | null;
        const promoBox = label.querySelector(".promo-box") as HTMLElement | null;
        const fromInline = label.querySelector(".from-inline") as HTMLElement | null;
        const toName = label.querySelector(".to-name") as HTMLElement | null;
        const toAddress = label.querySelector(".to-address") as HTMLElement | null;
        const toCity = label.querySelector(".to-city") as HTMLElement | null;
        const toPhone = label.querySelector(".to-phone") as HTMLElement | null;
        const promoContent = label.querySelector(".promo-content") as HTMLElement | null;
        const promoWebsite = label.querySelector(".promo-website") as HTMLElement | null;

        if (fromInline) {
          fromInline.style.whiteSpace = "nowrap";
          fromInline.style.overflow = "hidden";
          fromInline.style.textOverflow = "ellipsis";
          fromInline.style.display = "block";
        }

        const measure = () => {
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
          };
        };

        let metrics = measure();
        let passes = 0;

        while (
          passes < 8
          && (
            metrics.totalConsumed > PAGE_HEIGHT_LIMIT
            || metrics.pageHeight > PAGE_HEIGHT_LIMIT + 0.25
            || metrics.fromFooterOverlap > 0
            || metrics.promoFooterOverlap > 0
            || metrics.bodyFooterOverlap > 0
          )
        ) {
          passes += 1;
          adjustStylePx(body, "padding-top", -1, 6);
          adjustStylePx(body, "padding-bottom", -1, 6);
          adjustStylePx(fromBox, "padding-top", -1, 6);
          adjustStylePx(fromBox, "padding-bottom", -1, 6);
          adjustStylePx(promoBox, "padding-top", -0.8, 5);
          adjustStylePx(promoBox, "padding-bottom", -0.8, 5);
          adjustStylePx(promoBox, "font-size", -0.35, 10);
          adjustStylePx(promoWebsite, "font-size", -0.35, 11.5);
          adjustStylePx(footer, "height", -1, 34);
          adjustStylePx(footer, "font-size", -0.2, 8.5);
          adjustStylePx(toName, "font-size", -0.4, 20);
          adjustStylePx(toAddress, "font-size", -0.2, 12);
          adjustStylePx(toCity, "font-size", -0.2, 12);
          adjustStylePx(toPhone, "font-size", -0.2, 13);
          adjustStylePx(promoContent, "gap", -0.4, 1);
          metrics = measure();
        }

        return {
          ...metrics,
          passes,
        };
      }),
    };
  });

  if (report.applied) {
    const hasOverflow = report.pages.some(
      (pageReport: { totalConsumed: number; pageHeight: number; fromFooterOverlap: number; promoFooterOverlap: number; bodyFooterOverlap: number }) => (
        pageReport.totalConsumed > 384
        || pageReport.pageHeight > 384.25
        || pageReport.fromFooterOverlap > 0
        || pageReport.promoFooterOverlap > 0
        || pageReport.bodyFooterOverlap > 0
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
