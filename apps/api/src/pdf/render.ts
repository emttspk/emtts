import puppeteer, { type Browser } from "puppeteer";
import { ENVELOPE_DEFAULT_SIZE } from "../lib/printBranding.js";

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
      await page.evaluate(() => document.body.innerHTML.length);
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
