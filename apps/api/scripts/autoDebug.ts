import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import xlsx from "xlsx";

type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | string;

type LoginResponse = {
  token?: string;
};

type UploadResponse = {
  jobId?: string;
  success?: boolean;
  message?: string;
  error?: string;
};

type JobResponse = {
  success?: boolean;
  job?: {
    id?: string;
    status?: JobStatus;
    error?: string | null;
    labelsPdfPath?: string | null;
  };
};

class DebugError extends Error {
  public readonly code: "API_CRASH" | "WORKER_NOT_PROCESSING" | "PUPPETEER_FAILURE" | "GENERIC";

  constructor(code: "API_CRASH" | "WORKER_NOT_PROCESSING" | "PUPPETEER_FAILURE" | "GENERIC", message: string) {
    super(message);
    this.name = "DebugError";
    this.code = code;
  }
}

const API_BASE_URL = String(process.env.API_BASE_URL ?? "").trim();
console.log("DEBUG API URL:", API_BASE_URL);
const EMAIL = String(process.env.DEBUG_EMAIL ?? process.env.SMOKE_EMAIL ?? "").trim();
const PASSWORD = String(process.env.DEBUG_PASSWORD ?? process.env.SMOKE_PASSWORD ?? "").trim();

const MAX_CYCLES = Number(process.env.AUTO_DEBUG_MAX_CYCLES ?? 5);
const POLL_INTERVAL_MS = Number(process.env.AUTO_DEBUG_POLL_INTERVAL_MS ?? 3000);
const QUEUED_STUCK_MS = Number(process.env.AUTO_DEBUG_QUEUED_STUCK_MS ?? 20000);
const PROCESSING_STUCK_MS = Number(process.env.AUTO_DEBUG_PROCESSING_STUCK_MS ?? 90000);
const CYCLE_RETRY_DELAY_MS = Number(process.env.AUTO_DEBUG_RETRY_DELAY_MS ?? 5000);

const TIMEOUTS = {
  apiHealthMs: Number(process.env.AUTO_DEBUG_API_HEALTH_TIMEOUT_MS ?? 8000),
  loginMs: Number(process.env.AUTO_DEBUG_LOGIN_TIMEOUT_MS ?? 12000),
  uploadMs: Number(process.env.AUTO_DEBUG_UPLOAD_TIMEOUT_MS ?? 20000),
  jobPollMs: Number(process.env.AUTO_DEBUG_JOB_POLL_TIMEOUT_MS ?? 10000),
  downloadMs: Number(process.env.AUTO_DEBUG_DOWNLOAD_TIMEOUT_MS ?? 15000),
} as const;

function log(message: string) {
  const stamp = new Date().toISOString();
  console.log(`[AUTO-DEBUG ${stamp}] ${message}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withStepTimeout<T>(stepName: string, ms: number, operation: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new DebugError("API_CRASH", `${stepName} timed out after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DebugError("API_CRASH", `API request failed for ${url}: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonSafe(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function assertConfig() {
  if (!API_BASE_URL) {
    throw new Error("Missing API_BASE_URL");
  }
  if (!EMAIL || !PASSWORD) {
    throw new Error("Missing DEBUG_EMAIL/DEBUG_PASSWORD (or SMOKE_EMAIL/SMOKE_PASSWORD)");
  }
}

function buildTrackingId() {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const seq = String(Math.floor(1000 + Math.random() * 8999));
  return `VPL${year}${month}${seq}`;
}

async function createTestExcel(cycle: number): Promise<string> {
  const filePath = path.join(os.tmpdir(), `auto-debug-${Date.now()}-${cycle}.xlsx`);
  const row = {
    shipperName: "Auto Debug Shipper",
    shipperPhone: "03001234567",
    shipperAddress: "1 Mall Road",
    shipperEmail: "ops@example.com",
    senderCity: "Lahore",
    consigneeName: "Debug Receiver",
    consigneeEmail: "receiver@example.com",
    consigneePhone: "03111222333",
    consigneeAddress: "House 10 Street 5",
    receiverCity: "Lahore",
    CollectAmount: "2000",
    ordered: `AUTO-${Date.now()}`,
    ProductDescription: "Diagnostic Parcel",
    Weight: "1",
    shipmenttype: "VPL",
    numberOfPieces: "1",
    TrackingID: buildTrackingId(),
  };

  const worksheet = xlsx.utils.json_to_sheet([row]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  xlsx.writeFile(workbook, filePath);
  return filePath;
}

async function ensureApiHealth() {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/health`, { method: "GET" }, TIMEOUTS.apiHealthMs);
  if (!response.ok) {
    throw new DebugError("API_CRASH", `Health check failed (${response.status} ${response.statusText})`);
  }
}

async function login(): Promise<string> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    },
    TIMEOUTS.loginMs,
  );

  const body = (await parseJsonSafe(response)) as LoginResponse | null;
  if (!response.ok) {
    const message = (body as any)?.message ?? (body as any)?.error ?? `${response.status} ${response.statusText}`;
    throw new DebugError("API_CRASH", `Login failed: ${String(message)}`);
  }

  const token = String(body?.token ?? "").trim();
  if (!token) {
    throw new DebugError("API_CRASH", "Login succeeded but token missing");
  }

  log("STEP 1: LOGIN OK");
  return token;
}

async function uploadTestFile(token: string, excelPath: string): Promise<string> {
  const fileBuffer = await fs.readFile(excelPath);
  const form = new FormData();
  const blob = new Blob([fileBuffer]);

  form.append("file", blob, path.basename(excelPath));
  form.append("generateMoneyOrder", "false");
  form.append("autoGenerateTracking", "false");
  form.append("trackAfterGenerate", "false");
  form.append("carrierType", "pakistan_post");
  form.append("shipmentType", "VPL");

  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
    TIMEOUTS.uploadMs,
  );

  const body = (await parseJsonSafe(response)) as UploadResponse | null;
  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `${response.status} ${response.statusText}`;
    throw new DebugError("GENERIC", `Upload failed: ${String(message)}`);
  }

  log("STEP 2: UPLOAD OK");

  const jobId = String(body?.jobId ?? "").trim();
  if (!jobId) {
    throw new DebugError("GENERIC", "Upload response missing jobId");
  }

  log(`STEP 3: JOB CREATED | ${jobId}`);
  return jobId;
}

async function getJob(token: string, jobId: string): Promise<JobResponse["job"]> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/jobs/${jobId}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
    TIMEOUTS.jobPollMs,
  );

  const body = (await parseJsonSafe(response)) as JobResponse | null;
  if (!response.ok) {
    const message = (body as any)?.message ?? (body as any)?.error ?? `${response.status} ${response.statusText}`;
    throw new DebugError("API_CRASH", `Job status fetch failed: ${String(message)}`);
  }

  return body?.job ?? null;
}

async function waitForJobLifecycle(token: string, jobId: string) {
  const observed = new Set<string>();
  const startedAt = Date.now();
  let queuedSince: number | null = null;
  let processingSince: number | null = null;
  let previousStatus = "";

  while (true) {
    const job = await withStepTimeout("STATUS POLL", TIMEOUTS.jobPollMs + 2000, async () => getJob(token, jobId));
    const status = String(job?.status ?? "UNKNOWN").toUpperCase();
    const errorMessage = String(job?.error ?? "").trim();

    observed.add(status);
    if (status !== previousStatus) {
      log(`STEP 4: STATUS UPDATE | ${status}`);
      previousStatus = status;
    }

    if (status === "QUEUED") {
      if (!queuedSince) queuedSince = Date.now();
      if (Date.now() - queuedSince > QUEUED_STUCK_MS) {
        throw new DebugError(
          "WORKER_NOT_PROCESSING",
          `Worker not processing | jobId=${jobId} queuedForMs=${Date.now() - queuedSince}`,
        );
      }
    }

    if (status === "PROCESSING") {
      if (!processingSince) processingSince = Date.now();
      if (Date.now() - processingSince > PROCESSING_STUCK_MS) {
        const msg = errorMessage || "Job remains PROCESSING without generating PDF";
        throw new DebugError("PUPPETEER_FAILURE", `Puppeteer failure | ${msg}`);
      }
    }

    if (status === "FAILED") {
      const combined = errorMessage || "Job marked FAILED";
      if (/puppeteer|chromium|pdf|browser|timeout/i.test(combined)) {
        throw new DebugError("PUPPETEER_FAILURE", `Puppeteer failure | ${combined}`);
      }
      throw new DebugError("GENERIC", `Job failed | ${combined}`);
    }

    if (status === "COMPLETED") {
      return {
        observed,
        job,
      };
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed > PROCESSING_STUCK_MS + QUEUED_STUCK_MS + 30000) {
      if (observed.has("PROCESSING")) {
        throw new DebugError("PUPPETEER_FAILURE", "Puppeteer failure | job timed out in PROCESSING");
      }
      throw new DebugError("WORKER_NOT_PROCESSING", "Worker not processing | job never moved to COMPLETED");
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

async function verifyPdf(token: string, jobId: string) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/jobs/${jobId}/download/labels`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
    TIMEOUTS.downloadMs,
  );

  if (!response.ok) {
    const body = await parseJsonSafe(response);
    const message = (body as any)?.message ?? (body as any)?.error ?? `${response.status} ${response.statusText}`;
    throw new DebugError("PUPPETEER_FAILURE", `Puppeteer failure | PDF not generated: ${String(message)}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100) {
    throw new DebugError("PUPPETEER_FAILURE", `Puppeteer failure | PDF invalid, size=${bytes.length} bytes`);
  }

  log(`STEP 5: PDF GENERATED | ${bytes.length} bytes`);
}

async function runSingleCycle(cycle: number) {
  log(`================ CYCLE ${cycle}/${MAX_CYCLES} START ================`);

  await withStepTimeout("API HEALTH", TIMEOUTS.apiHealthMs + 2000, ensureApiHealth);
  const token = await withStepTimeout("LOGIN", TIMEOUTS.loginMs + 2000, login);

  const excelPath = await createTestExcel(cycle);
  try {
    const jobId = await withStepTimeout("UPLOAD", TIMEOUTS.uploadMs + 2000, async () => uploadTestFile(token, excelPath));
    const lifecycle = await waitForJobLifecycle(token, jobId);

    if (!lifecycle.observed.has("QUEUED") || !lifecycle.observed.has("PROCESSING") || !lifecycle.observed.has("COMPLETED")) {
      throw new DebugError(
        "GENERIC",
        `Lifecycle incomplete | observed=${Array.from(lifecycle.observed).join(" -> ")}`,
      );
    }

    await withStepTimeout("PDF VERIFY", TIMEOUTS.downloadMs + 2000, async () => verifyPdf(token, jobId));
    log(`CYCLE ${cycle}: SUCCESS`);
  } finally {
    await fs.unlink(excelPath).catch(() => {});
  }
}

function printClassifiedFailure(error: unknown, cycle: number) {
  if (error instanceof DebugError) {
    if (error.code === "WORKER_NOT_PROCESSING") {
      log("Worker not processing");
      log(`[CYCLE ${cycle}] ${error.message}`);
      return;
    }
    if (error.code === "PUPPETEER_FAILURE") {
      log("Puppeteer failure");
      log(`[CYCLE ${cycle}] ${error.message}`);
      return;
    }
    if (error.code === "API_CRASH") {
      log("API crash");
      log(`[CYCLE ${cycle}] ${error.message}`);
      return;
    }
    log(`[CYCLE ${cycle}] ${error.message}`);
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  log(`[CYCLE ${cycle}] Unexpected failure: ${message}`);
}

async function main() {
  assertConfig();

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle += 1) {
    try {
      await runSingleCycle(cycle);
      log("AUTO DEBUG COMPLETE: PASS");
      process.exitCode = 0;
      return;
    } catch (error) {
      printClassifiedFailure(error, cycle);
      if (cycle < MAX_CYCLES) {
        log(`Retrying in ${CYCLE_RETRY_DELAY_MS}ms...`);
        await sleep(CYCLE_RETRY_DELAY_MS);
      }
    }
  }

  log("AUTO DEBUG COMPLETE: FAIL");
  process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log(`Fatal error: ${message}`);
  process.exit(1);
});
