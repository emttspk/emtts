import fs from "node:fs";

const API = process.env.API_BASE_URL || "https://api.epost.pk";
const EMAIL = process.env.ADMIN_EMAIL || "nazimsaeed@gmail.com";
const PASSWORD = process.env.ADMIN_PASSWORD || "Lahore!23";

async function call(path, init = {}, token = "") {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const login = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok || !login.body?.token) {
    throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }

  const token = login.body.token;
  const plansRes = await call("/api/admin/plans", {}, token);
  const trail = (plansRes.body?.plans || []).find((p) => String(p.name || "").toLowerCase() === "trail");

  const output = { trailPlan: trail || null, deleteAttempt: null };
  if (trail?.id) {
    output.deleteAttempt = await call(`/api/admin/plans/${trail.id}`, { method: "DELETE", body: JSON.stringify({}) }, token);
  }

  fs.writeFileSync("temp-delete-flow-verification.json", JSON.stringify(output, null, 2));
  console.log("Report written: temp-delete-flow-verification.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
