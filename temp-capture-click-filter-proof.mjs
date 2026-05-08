import puppeteer from "puppeteer";
import fs from "node:fs/promises";

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
  if (!token) throw new Error("API login failed for click-filter proof");
  return { token, role };
}

async function clickButtonByText(page, text) {
  return page.evaluate((label) => {
    const target = Array.from(document.querySelectorAll("button"))
      .find((el) => String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase().includes(label.toLowerCase()));
    if (!target) return false;
    target.click();
    return true;
  }, text);
}

async function main() {
  const session = await loginByApi();
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 1600, height: 1100 });

  const proof = {
    generatedAt: new Date().toISOString(),
    returnedClick: { clicked: false, url: "", hasExpectedStatusQuery: false },
    complaintWatchClick: { clicked: false, url: "", hasExpectedStatusQuery: false },
  };

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, role }) => {
    localStorage.setItem("labelgen_token", token);
    localStorage.setItem("labelgen_role", role);
    localStorage.setItem("labelgen_refresh_token", "");
  }, session);

  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await new Promise((resolve) => setTimeout(resolve, 15000));

  proof.returnedClick.clicked = await clickButtonByText(page, "Returned");
  if (!proof.returnedClick.clicked) throw new Error("Returned button click failed");
  await page.waitForFunction(() => window.location.pathname.includes("tracking-workspace"), { timeout: 120000 });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  proof.returnedClick.url = page.url();
  proof.returnedClick.hasExpectedStatusQuery = /status=RETURNED/i.test(proof.returnedClick.url);
  await page.screenshot({ path: "temp-ui-shots/filter-returned-proof.png", fullPage: true });

  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await new Promise((resolve) => setTimeout(resolve, 15000));

  proof.complaintWatchClick.clicked = await clickButtonByText(page, "Complaints Watch");
  if (!proof.complaintWatchClick.clicked) throw new Error("Complaints Watch button click failed");
  await page.waitForFunction(() => window.location.pathname.includes("tracking-workspace"), { timeout: 120000 });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  proof.complaintWatchClick.url = page.url();
  proof.complaintWatchClick.hasExpectedStatusQuery = /status=COMPLAINT_WATCH/i.test(proof.complaintWatchClick.url);
  await page.screenshot({ path: "temp-ui-shots/filter-complaint-watch-proof.png", fullPage: true });

  await fs.writeFile("temp-click-filter-proof.json", JSON.stringify(proof, null, 2), "utf8");
  await browser.close();
  console.log("CLICK_FILTER_PROOF_OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
