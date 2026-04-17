import puppeteer, { type Browser } from "puppeteer";

export async function launchPuppeteerBrowser() {
  const bundledExecutablePath = puppeteer.executablePath();
  console.log(`[Puppeteer] Using bundled Chromium: ${bundledExecutablePath}`);
  const browser = await puppeteer.launch({
    executablePath: bundledExecutablePath,
    headless: "new" as any,
    timeout: Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS ?? 30_000),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });
  return browser;
}

export async function htmlToPdfBuffer(
  html: string,
  browser: Browser,
  format: "A4" | "4x6" | "envelope-9x4" = "A4",
) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    format: format === "A4" ? "A4" : undefined,
    width: format === "4x6" ? "4in" : format === "envelope-9x4" ? "9in" : undefined,
    height: format === "4x6" ? "6in" : format === "envelope-9x4" ? "4in" : undefined,
    printBackground: true,
    preferCSSPageSize: format === "A4",
  });
  await page.close();
  return pdf;
}
