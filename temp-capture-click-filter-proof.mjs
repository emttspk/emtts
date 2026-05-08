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

  const cases = [
    { label: "Delivered", status: "DELIVERED" },
    { label: "Pending", status: "PENDING" },
    { label: "Returned", status: "RETURNED" },
    { label: "Complaint Watch", status: "COMPLAINT_WATCH" },
    { label: "Total Complaints", status: "COMPLAINT_TOTAL" },
    { label: "Active Complaints", status: "COMPLAINT_ACTIVE" },
    { label: "Closed Complaints", status: "COMPLAINT_CLOSED" },
    { label: "Reopened Complaints", status: "COMPLAINT_REOPENED" },
    { label: "In Process Complaints", status: "COMPLAINT_IN_PROCESS" },
  ];

  const proof = {
    generatedAt: new Date().toISOString(),
    filterRouting: {},
  };

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, role }) => {
    localStorage.setItem("labelgen_token", token);
    localStorage.setItem("labelgen_role", role);
    localStorage.setItem("labelgen_refresh_token", "");
  }, session);

  for (const item of cases) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await new Promise((resolve) => setTimeout(resolve, 8000));

    const clicked = await clickButtonByText(page, item.label);
    if (!clicked) throw new Error(`${item.label} button click failed`);

    await page.waitForFunction(() => window.location.pathname.includes("tracking-workspace"), { timeout: 120000 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const url = page.url();
    const hasExpectedStatusQuery = new RegExp(`status=${item.status}`, "i").test(url);
    proof.filterRouting[item.status] = { label: item.label, clicked, url, hasExpectedStatusQuery };

    if (item.status === "RETURNED") {
      await page.screenshot({ path: "temp-ui-shots/filter-returned-proof.png", fullPage: true });
    }
    if (item.status === "COMPLAINT_WATCH") {
      await page.screenshot({ path: "temp-ui-shots/filter-complaint-watch-proof.png", fullPage: true });
    }
  }

  await fs.writeFile("temp-click-filter-proof.json", JSON.stringify(proof, null, 2), "utf8");
  await browser.close();
  console.log("CLICK_FILTER_PROOF_OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
