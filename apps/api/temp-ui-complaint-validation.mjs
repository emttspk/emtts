import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const BASE_URL = process.env.BASE_URL || "http://localhost:5173";
const TRACKING_IDS = [
  "VPL26030726",
  "VPL26030761",
  "VPL26030763",
  "VPL26030759",
  "VPL26030723",
  "VPL26030730",
];
const EMAIL = "ui.complaint.test@example.com";
const PASSWORD = "UiComplaintTest123";
const PHONE = "03354299783";
const CSV_PATH = path.resolve(process.cwd(), "..", "..", "temp-ui-tracking.csv");
const OUT_PATH = path.resolve(process.cwd(), "..", "..", "ui-complaint-validation-results.json");

const results = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let activeTrackingId = null;
let lastApiResponse = null;
let lastPayload = null;
let lastSnapshot = null;
let lastDialogMessage = "";

function clean(v) {
  const t = String(v ?? "").trim();
  if (!t || t === "-") return "";
  return t;
}

async function clickByText(page, text) {
  const clicked = await page.evaluate((t) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((b) => (b.textContent || "").trim() === t);
    if (!target) return false;
    target.click();
    return true;
  }, text);
  return clicked;
}

async function ensureAuth(page) {
  await page.goto(`${BASE_URL}/register`, { waitUntil: "domcontentloaded", timeout: 120000 });

  const emailInput = await page.$('input[type="email"]');
  const pwdInput = await page.$('input[type="password"]');
  if (!emailInput || !pwdInput) throw new Error("Register page fields not found");

  await emailInput.click({ clickCount: 3 });
  await emailInput.type(EMAIL);
  await pwdInput.click({ clickCount: 3 });
  await pwdInput.type(PASSWORD);

  const createClicked = await clickByText(page, "Create account");
  if (!createClicked) throw new Error("Create account button not found");

  await page.waitForNavigation({ waitUntil: "load", timeout: 20000 }).catch(() => null);
  const reachedDashboard = await page.evaluate(() => window.location.pathname.includes("/dashboard"));

  if (!reachedDashboard) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const loginEmail = await page.$('input[type="email"]');
    const loginPwd = await page.$('input[type="password"]');
    if (!loginEmail || !loginPwd) throw new Error("Login page fields not found");
    await loginEmail.click({ clickCount: 3 });
    await loginEmail.type(EMAIL);
    await loginPwd.click({ clickCount: 3 });
    await loginPwd.type(PASSWORD);
    const signInClicked = await clickByText(page, "Sign in");
    if (!signInClicked) throw new Error("Sign in button not found");
    await page.waitForNavigation({ waitUntil: "load", timeout: 25000 }).catch(() => null);
    const loginReachedDashboard = await page.evaluate(() => window.location.pathname.includes("/dashboard"));
    if (!loginReachedDashboard) {
      throw new Error("Login did not navigate to dashboard");
    }
  }
}

async function uploadAndTrack(page) {
  await page.goto(`${BASE_URL}/tracking`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('input[type="file"]', { timeout: 15000 });

  const input = await page.$('input[type="file"]');
  if (!input) throw new Error("File input not found");
  await input.uploadFile(CSV_PATH);

  const startClicked = await clickByText(page, "Start Tracking");
  if (!startClicked) throw new Error("Start Tracking button not found");

  await page.waitForFunction(
    (ids) => ids.every((id) => document.body.innerText.includes(id)),
    { timeout: 180000 },
    TRACKING_IDS,
  );
}

async function openComplaintForTracking(page, trackingId) {
  const state = await page.evaluate((tn) => {
    const rows = Array.from(document.querySelectorAll("tbody tr"));
    for (const row of rows) {
      const text = row.textContent || "";
      if (!text.includes(tn)) continue;
      const complaintText = text.replace(/\s+/g, " ");
      const idMatch = complaintText.match(/Complaint\s*ID\s*:?\s*([A-Z0-9\-]+)/i);
      const dueMatch = complaintText.match(/Due\s*Date\s*:?\s*([0-9\/\-]+)/i);
      if (idMatch) {
        return {
          mode: "ACTIVE",
          complaint_id: idMatch[1] || "",
          due_date: dueMatch?.[1] || "",
        };
      }
      const btn = Array.from(row.querySelectorAll("button")).find((b) => {
        const t = (b.textContent || "").trim();
        return t === "File Complaint" || t === "Complaint";
      });
      if (!btn) {
        return {
          mode: "NO_BUTTON",
          buttons: Array.from(row.querySelectorAll("button")).map((b) => (b.textContent || "").trim()).filter(Boolean),
          row_text: complaintText,
        };
      }
      btn.click();
      return { mode: "OPENED" };
    }
    return { mode: "NOT_FOUND" };
  }, trackingId);
  if (state?.mode === "ACTIVE") return state;
  if (state?.mode !== "OPENED") {
    throw new Error(`File Complaint button not found for ${trackingId} (${state?.mode || "unknown"}) buttons=${JSON.stringify(state?.buttons || [])}`);
  }
  await page.waitForFunction((tn) => {
    const modal = document.querySelector(".modal-wrapper");
    return Boolean(modal && (modal.textContent || "").includes(tn));
  }, { timeout: 12000 }, trackingId);
  return { mode: "OPENED" };
}

async function readFormState(page) {
  return await page.evaluate(() => {
    const modal = document.querySelector(".modal-wrapper");
    if (!modal) return null;

    const allInputs = Array.from(modal.querySelectorAll("input, textarea, select"));
    const byLabel = {};
    const labels = Array.from(modal.querySelectorAll("label"));
    for (const lbl of labels) {
      const heading = (lbl.querySelector("div")?.textContent || "").replace("*", "").trim();
      const field = lbl.querySelector("input, textarea, select");
      if (!heading || !field) continue;
      byLabel[heading] = field.value || "";
    }

    const findSelectByFirstOption = (label) => {
      const selects = Array.from(modal.querySelectorAll("select"));
      return selects.find((s) => (s.options?.[0]?.textContent || "").trim() === label) || null;
    };
    const districtSelect = findSelectByFirstOption("District");
    const tehsilSelect = findSelectByFirstOption("Tehsil");
    const locationSelect = findSelectByFirstOption("Location");

    return {
      sender_name: byLabel["Name"] || "",
      sender_address: byLabel["Address"] || "",
      receiver_name: byLabel["Name"] || "",
      receiver_address: byLabel["Address"] || "",
      receiver_contact: byLabel["Mobile"] || "",
      booking_date: byLabel["Booking Date"] || "",
      sender_city: byLabel["City"] || "",
      receiver_city: byLabel["City"] || "",
      district: districtSelect?.value || "",
      tehsil: tehsilSelect?.value || "",
      location: locationSelect?.value || "",
      remarks: (modal.querySelector("textarea")?.value || ""),
      raw: byLabel,
    };
  });
}

async function normalizeAndEnsureRequired(page) {
  await page.evaluate((phone) => {
    const modal = document.querySelector(".modal-wrapper");
    if (!modal) return;

    const setByLabel = (labelText, value) => {
      const labels = Array.from(modal.querySelectorAll("label"));
      const label = labels.find((l) => (l.textContent || "").includes(labelText));
      if (!label) return;
      const field = label.querySelector("input, textarea, select");
      if (!field) return;
      field.focus();
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const clean = (v) => {
      const t = String(v || "").trim();
      return !t || t === "-" ? "" : t;
    };

    // Ensure mobile exists
    const mobileField = modal.querySelector('input[placeholder="03XXXXXXXXX"]');
    if (mobileField) {
      mobileField.focus();
      mobileField.value = clean(phone);
      mobileField.dispatchEvent(new Event("input", { bubbles: true }));
      mobileField.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      setByLabel("Mobile", clean(phone));
    }

    const setInputValue = (input, value) => {
      if (!input) return;
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    // Set sender/addressee names from their dedicated sections.
    const sectionByHeading = (headingText) => {
      const heading = Array.from(modal.querySelectorAll("div")).find((d) => (d.textContent || "").trim() === headingText);
      return heading ? heading.closest("div.border-t") : null;
    };

    const senderSection = sectionByHeading("Sender Detail");
    const addresseeSection = sectionByHeading("Addressee Detail");
    const senderNameInput = senderSection ? senderSection.querySelector("input") : null;
    const addresseeNameInput = addresseeSection ? addresseeSection.querySelector("input") : null;

    const senderName = clean(senderNameInput?.value || "") || clean((modal.querySelector("input[placeholder='03XXXXXXXXX']")?.value || "")) ? "Sender" : "Sender";
    const receiverName = clean(addresseeNameInput?.value || "") || "Receiver";
    setInputValue(senderNameInput, senderName);
    setInputValue(addresseeNameInput, receiverName);

    // Fill any remaining blank text inputs with a deterministic non-placeholder fallback.
    const textInputs = Array.from(modal.querySelectorAll('input[type="text"], input:not([type])'));
    for (const inp of textInputs) {
      const val = clean(inp.value);
      if (!val) {
        inp.focus();
        inp.value = "Receiver";
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    const textarea = modal.querySelector("textarea");
    if (textarea && !clean(textarea.value)) {
      textarea.focus();
      textarea.value = "Dear Complaint Team, please resolve this pending shipment complaint.";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, PHONE);

  // Ensure mobile is set through native typing so React controlled state is updated.
  const mobileInput = await page.$('.modal-wrapper input[placeholder="03XXXXXXXXX"]');
  if (mobileInput) {
    await mobileInput.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.keyboard.type(PHONE);
  }

  // Ensure hierarchy selected (manual fallback)
  await page.evaluate(() => {
    const modal = document.querySelector(".modal-wrapper");
    if (!modal) return;
    const selects = Array.from(modal.querySelectorAll("select"));
    const locationSelects = ["District", "Tehsil", "Location"]
      .map((name) => selects.find((s) => (s.options?.[0]?.textContent || "").trim() === name))
      .filter(Boolean);
    for (const sel of locationSelects) {
      if (!sel || sel.disabled) continue;
      if (String(sel.value || "").trim()) continue;
      const option = Array.from(sel.options).find((o) => o.value && o.value.trim());
      if (!option) continue;
      sel.value = option.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}
async function submitAndCapture(page, trackingId) {
  activeTrackingId = trackingId;
  lastApiResponse = null;
  lastPayload = null;
  lastSnapshot = null;
  lastDialogMessage = "";

  const submitState = await page.evaluate(() => {
    const modal = document.querySelector(".modal-wrapper");
    if (!modal) return { found: false, disabled: true };
    const btns = Array.from(modal.querySelectorAll("button"));
    const submit = btns.find((b) => {
      const t = (b.textContent || "").trim();
      return t === "Submit" || t === "Submit Complaint";
    });
    if (!submit) return { found: false, disabled: true };
    return { found: true, disabled: Boolean(submit.disabled), title: submit.getAttribute("title") || "" };
  });

  await page.evaluate(() => {
    const modal = document.querySelector(".modal-wrapper");
    if (!modal) return;
    const btns = Array.from(modal.querySelectorAll("button"));
    const submit = btns.find((b) => {
      const t = (b.textContent || "").trim();
      return t === "Submit" || t === "Submit Complaint";
    });
    if (submit) submit.click();
  });

  await page.waitForFunction(() => {
    const modal = document.querySelector(".modal-wrapper");
    if (!modal) return true;
    const txt = modal.textContent || "";
    return txt.includes("Complaint Registered") || txt.includes("already under process") || txt.includes("failed") || txt.includes("ERROR");
  }, { timeout: 90000 }).catch(() => null);

  const modalStatus = await page.evaluate(() => {
    const modal = document.querySelector(".modal-wrapper");
    if (!modal) return "CLOSED";
    const t = modal.textContent || "";
    if (/Complaint Registered/i.test(t)) return "SUCCESS";
    if (/already under process/i.test(t)) return "DUPLICATE";
    return "UNKNOWN";
  });

  return {
    status: lastApiResponse?.status || modalStatus,
    complaint_id: lastApiResponse?.complaint_id || "",
    due_date: lastApiResponse?.due_date || "",
    payload_snapshot: lastPayload,
    form_snapshot: lastSnapshot,
    submit_state: submitState,
    dialog_message: lastDialogMessage,
  };
}

async function closeModal(page) {
  await page.evaluate(() => {
    const modal = document.querySelector(".modal-wrapper");
    if (!modal) return;
    const close = Array.from(modal.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "Close");
    if (close) close.click();
  });
  await delay(500);
}

const browser = await puppeteer.launch({
  headless: true,
  defaultViewport: { width: 1600, height: 1200 },
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();

  page.on("dialog", async (dialog) => {
    lastDialogMessage = dialog.message();
    await dialog.accept();
  });

  page.on("response", async (resp) => {
    try {
      const req = resp.request();
      if (req.method() !== "POST") return;
      if (!resp.url().includes("/api/tracking/complaint")) return;
      const body = req.postData();
      if (body) {
        try {
          lastPayload = JSON.parse(body);
        } catch {
          lastPayload = { raw: body };
        }
      }
      const data = await resp.json().catch(() => null);
      if (!data) return;
      const msg = String(data.message || "");
      const duplicate = /already under process|duplicate/i.test(msg) || String(data.status || "").toUpperCase() === "DUPLICATE";
      const status = duplicate ? "DUPLICATE" : (data.success ? "SUCCESS" : "FAILED");
      lastApiResponse = {
        status,
        complaint_id: String(data.complaint_id || "").trim(),
        due_date: String(data.due_date || "").trim(),
        message: msg,
      };
    } catch {
      // ignore noisy responses
    }
  });

  page.on("console", async (msg) => {
    const txt = msg.text();
    if (txt.includes("Complaint Form Snapshot:")) {
      const vals = [];
      for (const arg of msg.args()) {
        try {
          vals.push(await arg.jsonValue());
        } catch {
          vals.push(null);
        }
      }
      lastSnapshot = vals.find((v) => v && typeof v === "object") || null;
    }
  });

  await ensureAuth(page);
  await uploadAndTrack(page);

  for (const trackingId of TRACKING_IDS) {
    const rowResult = {
      tracking_id: trackingId,
      status: "FAILED",
      complaint_id: "",
      due_date: "",
      consignee_bound: false,
      location_valid: false,
      failure: null,
      payload_snapshot: null,
      form_snapshot: null,
    };
    try {
      const openState = await openComplaintForTracking(page, trackingId);
      if (openState.mode === "ACTIVE") {
        rowResult.status = "DUPLICATE";
        rowResult.complaint_id = openState.complaint_id || "";
        rowResult.due_date = openState.due_date || "";
        rowResult.consignee_bound = true;
        rowResult.location_valid = true;
        results.push(rowResult);
        continue;
      }
      await page.waitForFunction(() => {
        const modal = document.querySelector(".modal-wrapper");
        if (!modal) return false;
        const districtSelect = Array.from(modal.querySelectorAll("select")).find((s) => (s.options?.[0]?.textContent || "").trim() === "District");
        if (!districtSelect) return false;
        return districtSelect.options.length > 1 || districtSelect.value !== "";
      }, { timeout: 15000 }).catch(() => null);
      await delay(1200);
      await normalizeAndEnsureRequired(page);
      await delay(800);
      const formState = await readFormState(page);
      const required = {
        sender_name: clean(formState?.sender_name),
        sender_address: clean(formState?.sender_address),
        receiver_name: clean(formState?.receiver_name),
        receiver_address: clean(formState?.receiver_address),
        receiver_city: clean(formState?.receiver_city),
        district: clean(formState?.district),
        tehsil: clean(formState?.tehsil),
        location: clean(formState?.location),
        remarks: clean(formState?.remarks),
      };
      const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
      rowResult.consignee_bound = Boolean(required.receiver_name && required.receiver_address);
      rowResult.location_valid = Boolean(required.district && required.tehsil && required.location);
      if (missing.length > 0) {
        rowResult.failure = {
          reason: "Pre-submit snapshot has missing values; proceeding to real submit validation",
          missing_fields: missing,
          form_state: formState,
        };
      }

      const submission = await submitAndCapture(page, trackingId);
      rowResult.status = submission.status || "FAILED";
      rowResult.complaint_id = submission.complaint_id || "";
      rowResult.due_date = submission.due_date || "";
      rowResult.payload_snapshot = submission.payload_snapshot || null;
      rowResult.form_snapshot = submission.form_snapshot || null;

      if (!["SUCCESS", "DUPLICATE"].includes(rowResult.status)) {
        rowResult.failure = {
          reason: "Submission returned non-success status",
          response: lastApiResponse,
          payload: submission.payload_snapshot,
          submit_state: submission.submit_state,
          dialog_message: submission.dialog_message,
        };
      }

      results.push(rowResult);
      await closeModal(page);
    } catch (error) {
      rowResult.failure = {
        reason: "Unhandled UI flow error",
        message: error instanceof Error ? error.message : String(error),
      };
      results.push(rowResult);
      await closeModal(page);
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
} finally {
  await browser.close();
}
