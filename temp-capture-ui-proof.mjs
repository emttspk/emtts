import puppeteer from "puppeteer";

const BASE = "https://www.epost.pk";
const API = "https://api.epost.pk";
const EMAIL = "nazimsaeed@gmail.com";
const PASSWORD = "Lahore!23";

async function loginByApi() {
  const r = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  });
  const body = await r.json();
  const token = body?.token ?? body?.accessToken ?? body?.data?.token ?? null;
  const role = body?.user?.role ?? body?.data?.user?.role ?? "ADMIN";
  if (!token) throw new Error("API login failed for screenshot capture");
  return { token, role };
}

async function main() {
  const session = await loginByApi();
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 1600, height: 1100 });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, role }) => {
    localStorage.setItem("labelgen_token", token);
    localStorage.setItem("labelgen_role", role);
    localStorage.setItem("labelgen_refresh_token", "");
  }, session);

  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await new Promise((resolve) => setTimeout(resolve, 15000));
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
    await page.screenshot({ path: "temp-ui-shots/complaint-lifecycle-cards-postfix.png", clip: shipmentStatusRect });
  } else {
    await page.screenshot({ path: "temp-ui-shots/shipment-status-postfix.png", fullPage: true });
    await page.screenshot({ path: "temp-ui-shots/complaint-lifecycle-cards-postfix.png", fullPage: true });
  }

  await page.goto(`${BASE}/tracking-workspace`, { waitUntil: "domcontentloaded" });
  await new Promise((resolve) => setTimeout(resolve, 15000));
  await page.screenshot({ path: "temp-ui-shots/tracking-postfix.png", fullPage: true });

  await browser.close();
  console.log("UI_SCREENSHOTS_OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});