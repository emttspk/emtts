import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://api.epost.pk";
const email = `railway.cnic.${Date.now()}@example.com`;
const password = "SmokePass123!";
const trackingId = `VPL26${String(Math.floor(Math.random() * 900000) + 100000)}`;
const csvPath = path.join(os.tmpdir(), `railway-cnic-${Date.now()}.csv`);

const csv = [
  "shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,ConsigneeCity,CollectAmount,orderid,ProductDescription,Weight,shipment_type,numberOfPieces,TrackingID",
  `Acme Store,03001234567,1 Mall Road,ops@acme.example,Lahore,Ali Raza,ali@example.com,03111222333,House 10 Street 5,Lahore,20000,CNIC-${Date.now()},Books,1.0,VPL,1,${trackingId}`,
].join("\n");
fs.writeFileSync(csvPath, csv, "utf8");

async function j(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function retryGet(url, token, attempts = 6, waitMs = 2000) {
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const body = await j(res);
    if (res.ok) return { res, body };
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`Failed request after retries: ${url}`);
}

function out(label, value) {
  console.log(`${label}:`, value);
}

try {
  const regRes = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      companyName: "Smoke CNIC Co",
      address: "1 Mall Road",
      contactNumber: "03001234567",
      originCity: "Lahore",
    }),
  });
  out("registerStatus", regRes.status);

  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await j(loginRes);
  out("loginStatus", loginRes.status);
  if (!loginRes.ok) throw new Error(`login failed ${JSON.stringify(loginBody)}`);
  const token = String(loginBody.token || "");
  if (!token) throw new Error("missing token");

  const meBeforeRes = await fetch(`${API}/api/me`, { headers: { authorization: `Bearer ${token}` } });
  const meBefore = await j(meBeforeRes);
  out("meBeforeStatus", meBeforeRes.status);

  const profileRes = await fetch(`${API}/api/me`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ cnic: "3520212345671" }),
  });
  const profileBody = await j(profileRes);
  out("profileUpdateStatus", profileRes.status);
  if (!profileRes.ok) throw new Error(`profile update failed ${JSON.stringify(profileBody)}`);

  const plansRes = await fetch(`${API}/api/plans`);
  const plansBody = await j(plansRes);
  out("plansStatus", plansRes.status);
  const plans = Array.isArray(plansBody?.plans) ? plansBody.plans : [];

  const mePlanId = meBefore?.subscription?.plan?.id || null;
  const altPlan = plans.find((p) => p?.id && p.id !== mePlanId) || plans[0] || null;
  if (altPlan?.id) {
    const subRes = await fetch(`${API}/api/subscriptions/start`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ planId: altPlan.id }),
    });
    const subBody = await j(subRes);
    out("subscriptionStartStatus", subRes.status);
    if (!subRes.ok) throw new Error(`subscription update failed ${JSON.stringify(subBody)}`);
  }

  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(csvPath)]), path.basename(csvPath));
  form.append("generateMoneyOrder", "true");
  form.append("autoGenerateTracking", "false");
  form.append("trackAfterGenerate", "false");
  form.append("carrierType", "pakistan_post");
  form.append("shipmentType", "VPL");

  const uploadRes = await fetch(`${API}/api/jobs/upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadBody = await j(uploadRes);
  out("uploadStatus", uploadRes.status);
  if (!uploadRes.ok) throw new Error(`upload failed ${JSON.stringify(uploadBody)}`);
  const jobId = String(uploadBody.jobId || "");
  out("jobId", jobId);

  let job = null;
  for (let i = 0; i < 80; i += 1) {
    const statusRes = await fetch(`${API}/api/jobs/${jobId}`, { headers: { authorization: `Bearer ${token}` } });
    const statusBody = await j(statusRes);
    const status = String(statusBody?.job?.status || "UNKNOWN").toUpperCase();
    out("jobStatus", status);
    if (status === "COMPLETED") {
      job = statusBody.job;
      break;
    }
    if (status === "FAILED") throw new Error(`job failed ${statusBody?.job?.error || "unknown"}`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!job) throw new Error("job did not complete in time");

  const labels = await retryGet(`${API}/api/jobs/${jobId}/download/labels`, token, 8, 2000);
  out("labelsDownloadStatus", labels.res.status);

  const money = await retryGet(`${API}/api/jobs/${jobId}/download/money-orders`, token, 8, 2000);
  out("moneyOrdersDownloadStatus", money.res.status);

  const trackRes = await fetch(`${API}/api/tracking/track/${trackingId}`, { headers: { authorization: `Bearer ${token}` } });
  const trackBody = await j(trackRes);
  out("trackStatus", trackRes.status);

  const preRes = await fetch(`${API}/api/tracking/complaint/prefill/${trackingId}`, { headers: { authorization: `Bearer ${token}` } });
  const preBody = await j(preRes);
  out("prefillStatus", preRes.status);

  const complaintRes = await fetch(`${API}/api/tracking/complaint`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      tracking_number: trackingId,
      phone: "03001234567",
      complaint_text: "Parcel pending too long. Please investigate.",
      complaint_reason: "Pending Delivery",
      recipient_city_value: String(preBody?.prefill?.recipient_city || "Lahore"),
      recipient_district: String(preBody?.prefill?.district || "Lahore"),
      recipient_tehsil: String(preBody?.prefill?.tehsil || "Lahore City"),
      recipient_location: String(preBody?.prefill?.delivery_office || "GPO Lahore"),
    }),
  });
  const complaintBody = await j(complaintRes);
  out("complaintStatus", complaintRes.status);

  console.log(
    "SMOKE_CNIC_RESULT_JSON=" +
      JSON.stringify({
        register: regRes.status,
        login: loginRes.status,
        profileUpdate: profileRes.status,
        plans: plansRes.status,
        upload: uploadRes.status,
        labels: labels.res.status,
        moneyOrders: money.res.status,
        tracking: trackRes.status,
        complaint: complaintRes.status,
        complaintBody,
      }),
  );
} catch (error) {
  console.error("SMOKE_CNIC_FAILED", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  try {
    fs.unlinkSync(csvPath);
  } catch {
    // ignore
  }
}
