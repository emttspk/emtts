import fs from "node:fs";

const API = process.env.API_BASE_URL || "https://api.epost.pk";
const EMAIL = process.env.ADMIN_EMAIL || "nazimsaeed@gmail.com";
const PASSWORD = process.env.ADMIN_PASSWORD || "Lahore!23";

const CANONICAL = new Set(["Free Plan", "Standard Plan", "Business Plan"]);

async function call(path, init = {}, token = "") {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json");
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

function shapePlan(plan) {
  return {
    id: plan.id,
    name: plan.name,
    isSuspended: Boolean(plan.isSuspended),
    priceCents: plan.priceCents,
    monthlyLabelLimit: plan.monthlyLabelLimit,
    monthlyTrackingLimit: plan.monthlyTrackingLimit,
  };
}

async function main() {
  const report = {
    api: API,
    login: null,
    actions: [],
    beforeAdminPlans: [],
    afterAdminPlans: [],
    publicPlans: [],
    errors: [],
  };

  const login = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  report.login = { ok: login.ok, status: login.status };
  if (!login.ok || !login.body?.token) {
    report.errors.push({ stage: "login_failed", login });
    fs.writeFileSync("temp-live-canonical-plan-cleanup-report.json", JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const token = login.body.token;
  const plansRes = await call("/api/admin/plans", {}, token);
  if (!plansRes.ok) {
    report.errors.push({ stage: "admin_plans_fetch_failed", plansRes });
    fs.writeFileSync("temp-live-canonical-plan-cleanup-report.json", JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const plans = Array.isArray(plansRes.body?.plans) ? plansRes.body.plans : [];
  report.beforeAdminPlans = plans.map(shapePlan);

  const byName = new Map();
  for (const plan of plans) {
    const name = String(plan.name || "");
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(plan);
  }

  const keepIds = new Set();
  for (const canonicalName of CANONICAL) {
    const matches = byName.get(canonicalName) || [];
    if (matches.length === 0) {
      report.errors.push({ stage: "missing_canonical", canonicalName });
      continue;
    }
    const preferred = matches.find((p) => !p.isSuspended) || matches[0];
    keepIds.add(preferred.id);

    if (preferred.isSuspended) {
      const unsuspend = await call(`/api/admin/plans/${preferred.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ isSuspended: false }),
      }, token);
      report.actions.push({ action: "unsuspend_canonical", planId: preferred.id, status: unsuspend.status, ok: unsuspend.ok });
    }

    for (const duplicate of matches) {
      if (duplicate.id === preferred.id) continue;
      const suspend = await call(`/api/admin/plans/${duplicate.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ isSuspended: true }),
      }, token);
      report.actions.push({ action: "suspend_duplicate", planId: duplicate.id, status: suspend.status, ok: suspend.ok });

      const renamed = await call(`/api/admin/plans/${duplicate.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: `Legacy ${canonicalName} ${String(duplicate.id).slice(0, 6)}`, isSuspended: true }),
      }, token);
      report.actions.push({ action: "rename_duplicate", planId: duplicate.id, status: renamed.status, ok: renamed.ok });
    }
  }

  for (const plan of plans) {
    const name = String(plan.name || "");
    if (keepIds.has(plan.id)) continue;
    if (CANONICAL.has(name)) continue;

    const suspend = await call(`/api/admin/plans/${plan.id}/suspend`, {
      method: "POST",
      body: JSON.stringify({ isSuspended: true }),
    }, token);
    report.actions.push({ action: "suspend_non_canonical", planId: plan.id, name, status: suspend.status, ok: suspend.ok });

    const legacyName = name.startsWith("Legacy ") ? name : `Legacy ${name}`;
    const renamed = await call(`/api/admin/plans/${plan.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: legacyName, isSuspended: true }),
    }, token);
    report.actions.push({ action: "rename_non_canonical", planId: plan.id, status: renamed.status, ok: renamed.ok, newName: legacyName });
  }

  const afterAdmin = await call("/api/admin/plans", {}, token);
  report.afterAdminPlans = afterAdmin.ok ? (afterAdmin.body.plans || []).map(shapePlan) : [{ fetchError: afterAdmin.status }];

  const publicPlans = await call("/api/plans");
  report.publicPlans = publicPlans.ok ? (publicPlans.body.plans || []).map(shapePlan) : [{ fetchError: publicPlans.status }];

  fs.writeFileSync("temp-live-canonical-plan-cleanup-report.json", JSON.stringify(report, null, 2));

  if (!publicPlans.ok) {
    process.exit(1);
  }

  const publicNames = new Set((publicPlans.body?.plans || []).map((p) => String(p.name || "")));
  const hasOnlyCanonical = [...publicNames].every((name) => CANONICAL.has(name));
  const hasAllCanonical = [...CANONICAL].every((name) => publicNames.has(name));

  if (!hasOnlyCanonical || !hasAllCanonical) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
