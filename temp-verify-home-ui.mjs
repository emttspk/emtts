import puppeteer from "puppeteer";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targetUrl = process.argv[2] ?? "http://127.0.0.1:5173/";

const browser = await puppeteer.launch({ headless: "new" });

try {
  const page = await browser.newPage();
  await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 30000 });

  const snapshot = await page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null;
    const texts = (selector) => Array.from(document.querySelectorAll(selector)).map((node) => node.textContent?.trim()).filter(Boolean);
    const images = Array.from(document.querySelectorAll("img")).map((img) => ({
      alt: img.getAttribute("alt"),
      src: img.getAttribute("src"),
    }));

    return {
      heroHeading: text("h1"),
      navbar: texts("header a"),
      showcaseTitles: texts("section#workflow .text-sm.font-semibold.uppercase"),
      activeBadge: texts("article .bg-emerald-50.text-emerald-700"),
      queuedBadges: texts("article .bg-slate-100.text-slate-500"),
      images,
      pageText: document.body.innerText,
    };
  });

  await delay(3600);

  const afterRotation = await page.evaluate(() => {
    const activeCardTitle = Array.from(document.querySelectorAll("article")).find((article) => article.innerText.includes("Active"))?.querySelector(".mt-1.text-sm.font-semibold.text-slate-900")?.textContent?.trim() ?? null;
    return { activeCardTitle };
  });

  console.log(JSON.stringify({ targetUrl, snapshot, afterRotation }, null, 2));
} finally {
  await browser.close();
}