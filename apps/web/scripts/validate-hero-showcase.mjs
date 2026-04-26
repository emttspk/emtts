import puppeteer from "puppeteer";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseUrl = process.env.VALIDATE_URL || "http://localhost:5174/";
const viewports = [
  { name: "mobile-320", width: 320, height: 740 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1024", width: 1024, height: 800 },
];

const browser = await puppeteer.launch({ headless: "new" });
const results = [];

for (const viewport of viewports) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message || String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push({ url: res.url(), status: res.status() });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 45000 });

  const capture = async () => page.evaluate(() => {
    const hero = document.querySelector("main section");
    const workflow = document.getElementById("workflow");
    const heroCardKeys = ["label", "money-order", "tracking", "summary"];
    const heroCards = heroCardKeys.map((key) => document.querySelector(`[data-hero-card="${key}"]`));
    const showcaseCards = ["label", "money", "tracking"].map((key) => document.querySelector(`[data-showcase-card="${key}"]`));
    const heading = hero?.querySelector("h1");
    const headingBottom = heading?.getBoundingClientRect().bottom || 0;
    const actionButtons = Array.from(hero?.querySelectorAll("a") || []).filter((node) => /Create Free Account|View Product Showcase/.test(node.textContent || ""));

    const heroMetrics = heroCards.map((node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return {
        top: rect.top,
        width: rect.width,
        opacity: style.opacity,
        transform: style.transform,
        text: (node.textContent || "").slice(0, 120),
      };
    });

    return {
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      authWordsDetected: /sign in|welcome back|password|email/i.test(`${hero?.innerText || ""}\n${workflow?.innerText || ""}`),
      imageCount: document.querySelectorAll("main section img, #workflow img").length,
      heroCardsFound: heroCards.every(Boolean),
      showcaseCardsFound: showcaseCards.every(Boolean),
      showcaseHasRequiredCards: showcaseCards.every((node, index) => {
        const expected = ["Label", "Money Order", "Tracking Dashboard"][index];
        return Boolean(node?.textContent?.includes(expected));
      }),
      heroMetrics,
      mobileStacked: window.innerWidth < 768 ? heroCards.every((node) => node && node.getBoundingClientRect().top > headingBottom) : null,
      buttonsFullWidth: window.innerWidth < 640 ? actionButtons.every((node) => node.getBoundingClientRect().width >= window.innerWidth - 48) : null,
      sectionFlags: {
        workflow: Boolean(workflow),
        trackingTypes: Boolean(document.getElementById("tracking-types")),
        pricing: Boolean(document.getElementById("pricing")),
      },
    };
  });

  const first = await capture();
  await delay(2200);
  const second = await capture();
  await delay(2200);
  const third = await capture();

  const opacitySeries = [first, second, third].map((entry) => entry.heroMetrics.map((metric) => metric?.opacity));
  const rotationChanged = JSON.stringify(opacitySeries[0]) !== JSON.stringify(opacitySeries[1]) || JSON.stringify(opacitySeries[1]) !== JSON.stringify(opacitySeries[2]);

  results.push({ viewport, first, second, third, rotationChanged, consoleErrors, pageErrors, failed });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
