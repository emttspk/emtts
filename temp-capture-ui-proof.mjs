import puppeteer from "puppeteer";

const BASE = "https://www.epost.pk";
const EMAIL = "nazimsaeed@gmail.com";
const PASSWORD = "Lahore!23";

async function main() {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 1600, height: 1100 });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[placeholder="username or you@company.com"]', EMAIL);
  await page.type('input[placeholder="********"]', PASSWORD);
  const loginButton = await page.waitForSelector("button", { visible: true });
  if (!loginButton) throw new Error("Login button not found");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find((button) => String(button.textContent || "").trim().toLowerCase() === "login");
      if (!target) throw new Error("Login button with expected label not found");
      target.click();
    }),
  ]);

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => {
    const text = String(document.body?.innerText ?? "");
    return text.includes("Current Package") && text.includes("Remaining Units") && text.includes("Shipment Status");
  }, { timeout: 120000 });
  await page.screenshot({ path: "temp-ui-shots/dashboard-postfix.png", fullPage: true });

  const shipmentStatusRect = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("div, h1, h2, h3, h4, h5, h6"));
    const match = nodes.find((node) => String(node.textContent || "").trim().toLowerCase() === "shipment status");
    if (!match) return null;
    let container = match.parentElement;
    while (container && container.parentElement) {
      if (container.className && String(container.className).includes("rounded")) break;
      container = container.parentElement;
    }
    const box = (container || match).getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(box.x)),
      y: Math.max(0, Math.floor(box.y)),
      width: Math.max(1, Math.floor(box.width)),
      height: Math.max(1, Math.floor(box.height)),
    };
  });
  if (shipmentStatusRect) {
    await page.screenshot({ path: "temp-ui-shots/shipment-status-postfix.png", clip: shipmentStatusRect });
  } else {
    await page.screenshot({ path: "temp-ui-shots/shipment-status-postfix.png", fullPage: true });
  }

  await page.goto(`${BASE}/tracking-workspace`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => {
    const text = String(document.body?.innerText ?? "");
    return text.includes("Tracking") && text.includes("Delivered") && text.includes("Pending") && text.includes("Complaints");
  }, { timeout: 120000 });
  await page.screenshot({ path: "temp-ui-shots/tracking-postfix.png", fullPage: true });

  await browser.close();
  console.log("UI_SCREENSHOTS_OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});