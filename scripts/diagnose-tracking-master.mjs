#!/usr/bin/env node

function parseArgs(argv) {
  const args = { jobId: "", apiBaseUrl: "", token: process.env.AUTH_TOKEN || "" };
  for (let i = 2; i < argv.length; i += 1) {
    const cur = argv[i];
    if (cur === "--job" || cur === "--job-id") {
      args.jobId = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (cur === "--api" || cur === "--api-base-url") {
      args.apiBaseUrl = String(argv[i + 1] || "").trim().replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if (cur === "--token") {
      args.token = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
  }
  return args;
}

async function requestJsonAware(url, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  const res = await fetch(url, { headers });
  const ctype = res.headers.get("content-type") || "";
  const cdisp = res.headers.get("content-disposition");
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  if (ctype.includes("application/json")) {
    try {
      json = JSON.parse(buf.toString("utf8"));
    } catch {
      json = { parseError: true, preview: buf.toString("utf8").slice(0, 300) };
    }
  }
  return {
    status: res.status,
    ok: res.ok,
    contentType: ctype,
    contentDisposition: cdisp,
    bytes: buf.length,
    isJson: ctype.includes("application/json"),
    json,
  };
}

async function main() {
  const { jobId, apiBaseUrl, token } = parseArgs(process.argv);
  if (!jobId || !apiBaseUrl) {
    console.error("Usage: node scripts/diagnose-tracking-master.mjs --job <JOB_ID> --api <API_BASE_URL> [--token <AUTH_TOKEN>]");
    process.exit(1);
  }

  const jobUrl = `${apiBaseUrl}/api/jobs/${encodeURIComponent(jobId)}`;
  const dlUrl = `${apiBaseUrl}/api/jobs/${encodeURIComponent(jobId)}/download/tracking-master`;

  console.log(`JOB_ID=${jobId}`);
  console.log(`API_BASE_URL=${apiBaseUrl}`);
  console.log(`AUTH_HEADER=${token ? "present" : "absent"}`);

  const jobRes = await requestJsonAware(jobUrl, token);
  console.log("--- JOB STATUS ENDPOINT ---");
  console.log(`status=${jobRes.status}`);
  console.log(`content_type=${jobRes.contentType || "(none)"}`);
  console.log(`bytes=${jobRes.bytes}`);
  if (jobRes.isJson) {
    const job = jobRes.json?.job;
    console.log(`job_exists=${Boolean(job)}`);
    console.log(`job_status=${job?.status ?? "(unknown)"}`);
    console.log(`trackingMasterPath=${job?.trackingMasterPath ?? "(null)"}`);
    console.log(`trackingMasterFileName=${job?.trackingMasterFileName ?? "(missing)"}`);
    if (!jobRes.ok) {
      console.log(`error_message=${jobRes.json?.message ?? jobRes.json?.error ?? "(none)"}`);
    }
  }

  const dlRes = await requestJsonAware(dlUrl, token);
  console.log("--- TRACKING MASTER DOWNLOAD ENDPOINT ---");
  console.log(`status=${dlRes.status}`);
  console.log(`content_type=${dlRes.contentType || "(none)"}`);
  console.log(`content_disposition=${dlRes.contentDisposition || "(none)"}`);
  console.log(`bytes=${dlRes.bytes}`);
  console.log(`is_json_error=${dlRes.isJson}`);
  if (dlRes.isJson) {
    console.log(`error_message=${dlRes.json?.message ?? dlRes.json?.error ?? "(none)"}`);
  }
}

main().catch((err) => {
  console.error("diagnose-tracking-master failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
