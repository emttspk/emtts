import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const API = "https://api.epost.pk";
const EMAIL = "nazimsaeed@gmail.com";
const PASSWORD = "Lahore!23";

function log(step, value) {
  console.log(`${step}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function api(pathname, init = {}, token = "") {
  const headers = new Headers(init.headers || {});
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${API}${pathname}`, { ...init, headers });
  const body = await parseJsonSafe(res);
  return { res, body };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const summary = {
    login: null,
    meBefore: null,
    cnicCleared: null,
    uploadWithoutCnic: null,
    cnicSaved: null,
    uploadWithCnic: null,
    jobStatus: null,
    restored: null,
    errors: [],
  };

  let token = "";
  let originalCnic = null;
  let csvPath = "";

  try {
    const login = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });

    summary.login = { status: login.res.status, ok: login.res.ok };
    if (!login.res.ok) {
      throw new Error(`Login failed: ${JSON.stringify(login.body)}`);
    }

    token = String(login.body?.token || "").trim();
    if (!token) throw new Error("Login succeeded but token missing");

    const meBefore = await api("/api/me", {}, token);
    summary.meBefore = {
      status: meBefore.res.status,
      cnic: meBefore.body?.user?.cnic ?? null,
      userId: meBefore.body?.user?.id ?? null,
    };
    if (!meBefore.res.ok) {
      throw new Error(`GET /api/me failed: ${JSON.stringify(meBefore.body)}`);
    }

    originalCnic = meBefore.body?.user?.cnic ?? null;

    const clear = await api(
      "/api/me",
      {
        method: "PATCH",
        body: JSON.stringify({ cnic: null }),
      },
      token,
    );
    summary.cnicCleared = {
      status: clear.res.status,
      cnic: clear.body?.user?.cnic ?? null,
      ok: clear.res.ok,
    };
    if (!clear.res.ok) {
      throw new Error(`PATCH /api/me clear cnic failed: ${JSON.stringify(clear.body)}`);
    }

    const csv = [
      "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
      "Nazim Traders,03001234567,1 Mall Road,nazim@example.com,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,2200,CNIC-SMOKE-001,Books,1.0,VPL,1,VPL260399991",
    ].join("\n");

    csvPath = path.join(os.tmpdir(), `cnic-smoke-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, csv, "utf8");

    const fileBuffer = fs.readFileSync(csvPath);
    const formNoCnic = new FormData();
    formNoCnic.append("file", new Blob([fileBuffer]), path.basename(csvPath));
    formNoCnic.append("generateMoneyOrder", "true");
    formNoCnic.append("autoGenerateTracking", "false");
    formNoCnic.append("trackAfterGenerate", "false");
    formNoCnic.append("carrierType", "pakistan_post");
    formNoCnic.append("shipmentType", "VPL");

    const noCnicUpload = await api(
      "/api/jobs/upload",
      {
        method: "POST",
        body: formNoCnic,
      },
      token,
    );

    const noCnicMessage = String(noCnicUpload.body?.message || noCnicUpload.body?.error || "");
    summary.uploadWithoutCnic = {
      status: noCnicUpload.res.status,
      ok: noCnicUpload.res.ok,
      message: noCnicMessage,
      cnicBlocked: noCnicUpload.res.status === 400 && /CNIC is required/i.test(noCnicMessage),
    };

    if (!summary.uploadWithoutCnic.cnicBlocked) {
      throw new Error(`Expected CNIC blocking error, got: ${JSON.stringify(noCnicUpload.body)}`);
    }

    const setCnic = await api(
      "/api/me",
      {
        method: "PATCH",
        body: JSON.stringify({ cnic: "35202-1234567-1" }),
      },
      token,
    );
    summary.cnicSaved = {
      status: setCnic.res.status,
      ok: setCnic.res.ok,
      cnic: setCnic.body?.user?.cnic ?? null,
    };
    if (!setCnic.res.ok) {
      throw new Error(`PATCH /api/me set cnic failed: ${JSON.stringify(setCnic.body)}`);
    }

    const formWithCnic = new FormData();
    formWithCnic.append("file", new Blob([fileBuffer]), path.basename(csvPath));
    formWithCnic.append("generateMoneyOrder", "true");
    formWithCnic.append("autoGenerateTracking", "false");
    formWithCnic.append("trackAfterGenerate", "false");
    formWithCnic.append("carrierType", "pakistan_post");
    formWithCnic.append("shipmentType", "VPL");

    const withCnicUpload = await api(
      "/api/jobs/upload",
      {
        method: "POST",
        body: formWithCnic,
      },
      token,
    );

    summary.uploadWithCnic = {
      status: withCnicUpload.res.status,
      ok: withCnicUpload.res.ok,
      jobId: withCnicUpload.body?.jobId ?? null,
      recordCount: withCnicUpload.body?.recordCount ?? null,
      message: withCnicUpload.body?.message ?? null,
    };

    if (!withCnicUpload.res.ok || !withCnicUpload.body?.jobId) {
      throw new Error(`Expected successful upload with CNIC, got: ${JSON.stringify(withCnicUpload.body)}`);
    }

    const jobId = String(withCnicUpload.body.jobId);
    let lastStatus = "UNKNOWN";
    for (let i = 0; i < 40; i += 1) {
      const jobRes = await api(`/api/jobs/${jobId}`, {}, token);
      const st = String(jobRes.body?.job?.status || "UNKNOWN").toUpperCase();
      lastStatus = st;
      if (st === "COMPLETED" || st === "FAILED") break;
      await sleep(2000);
    }
    summary.jobStatus = { jobId, finalStatus: lastStatus };

    log("CNIC_SMOKE_RESULT", summary);
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
    log("CNIC_SMOKE_RESULT", summary);
    process.exitCode = 1;
  } finally {
    try {
      if (csvPath && fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    } catch {}

    if (token) {
      try {
        const restore = await api(
          "/api/me",
          {
            method: "PATCH",
            body: JSON.stringify({ cnic: originalCnic }),
          },
          token,
        );
        summary.restored = {
          status: restore.res.status,
          ok: restore.res.ok,
          cnic: restore.body?.user?.cnic ?? originalCnic ?? null,
        };
        log("CNIC_SMOKE_RESTORE", summary.restored);
      } catch (restoreError) {
        log("CNIC_SMOKE_RESTORE", {
          ok: false,
          message: restoreError instanceof Error ? restoreError.message : String(restoreError),
        });
      }
    }
  }
}

await run();
