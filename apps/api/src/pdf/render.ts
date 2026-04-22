import puppeteer, { type Browser } from "puppeteer";

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
      "--single-process",
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
      void format;
      return await page.pdf({
        format: "A4",
        printBackground: true,
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
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.body.innerHTML.length);
      void format;
      return await page.pdf({
        format: "A4",
        printBackground: true,
      });
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
