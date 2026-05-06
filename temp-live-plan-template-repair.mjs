import fs from "node:fs";

const API = process.env.API_BASE_URL || "https://api.epost.pk";
const EMAIL = process.env.ADMIN_EMAIL || "nazimsaeed@gmail.com";
const PASSWORD = process.env.ADMIN_PASSWORD || "Lahore!23";

const canonicalByName = {
  "Free Plan": {
    name: "Free Plan",
    fullPriceCents: 0,
    discountPriceCents: 0,
    unitsIncluded: 250,
    labelsIncluded: 250,
    trackingIncluded: 250,
    moneyOrdersIncluded: 250,
    complaintsIncluded: 5,
    dailyComplaintLimit: 1,
    monthlyComplaintLimit: 5,
    monthlyLabelLimit: 250,
    monthlyTrackingLimit: 250,
    isSuspended: false,
  },
  "Standard Plan": {
    name: "Standard Plan",
    fullPriceCents: 99900,
    discountPriceCents: 99900,
    unitsIncluded: 1000,
    labelsIncluded: 1000,
    trackingIncluded: 1000,
    moneyOrdersIncluded: 1000,
    complaintsIncluded: 150,
    dailyComplaintLimit: 5,
    monthlyComplaintLimit: 150,
    monthlyLabelLimit: 1000,
    monthlyTrackingLimit: 1000,
    isSuspended: false,
  },
  "Business Plan": {
    name: "Business Plan",
    fullPriceCents: 250000,
    discountPriceCents: 250000,
    unitsIncluded: 3000,
    labelsIncluded: 3000,
    trackingIncluded: 3000,
    moneyOrdersIncluded: 3000,
    complaintsIncluded: 300,
    dailyComplaintLimit: 10,
    monthlyComplaintLimit: 300,
    monthlyLabelLimit: 3000,
    monthlyTrackingLimit: 3000,
    isSuspended: false,
  },
};

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

function pluckPlan(plan) {
  return {
    id: plan.id,
    name: plan.name,
    priceCents: plan.priceCents,
    fullPriceCents: plan.fullPriceCents,
    discountPriceCents: plan.discountPriceCents,
    unitsIncluded: plan.unitsIncluded,
    labelsIncluded: plan.labelsIncluded,
    trackingIncluded: plan.trackingIncluded,
    moneyOrdersIncluded: plan.moneyOrdersIncluded,
    complaintsIncluded: plan.complaintsIncluded,
    dailyComplaintLimit: plan.dailyComplaintLimit,
    monthlyComplaintLimit: plan.monthlyComplaintLimit,
    monthlyLabelLimit: plan.monthlyLabelLimit,
    monthlyTrackingLimit: plan.monthlyTrackingLimit,
    isSuspended: plan.isSuspended,
  };
}

async function main() {
  const report = {
    api: API,
    login: null,
    beforeAdminPlans: null,
    repairPayloads: [],
    repairResponses: [],
    afterAdminPlans: null,
    publicPlansAfterRepair: null,
    testDeleteFlow: null,
    protectedDeleteFlow: null,
    templateFlow: null,
    errors: [],
  };

  const login = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  report.login = { ok: login.ok, status: login.status };
  if (!login.ok || !login.body?.token) {
    report.errors.push({ stage: "login", login });
    fs.writeFileSync("temp-live-plan-template-repair-report.json", JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const token = login.body.token;

  const before = await call("/api/admin/plans", {}, token);
  report.beforeAdminPlans = before.ok ? (before.body.plans || []).map(pluckPlan) : before;

  const byName = new Map((before.body.plans || []).map((p) => [String(p.name || ""), p]));

  for (const [name, payload] of Object.entries(canonicalByName)) {
    const existing = byName.get(name);
    if (!existing) {
      report.errors.push({ stage: "repair_missing_plan", name });
      continue;
    }
    report.repairPayloads.push({ planId: existing.id, payload });
    const updated = await call(`/api/admin/plans/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }, token);
    report.repairResponses.push({ planId: existing.id, status: updated.status, ok: updated.ok, plan: updated.body?.plan ? pluckPlan(updated.body.plan) : updated.body });
  }

  const after = await call("/api/admin/plans", {}, token);
  report.afterAdminPlans = after.ok ? (after.body.plans || []).map(pluckPlan) : after;

  const publicPlans = await call("/api/plans");
  report.publicPlansAfterRepair = publicPlans.ok ? (publicPlans.body.plans || []).map(pluckPlan) : publicPlans;

  const testPlanPayload = {
    name: `Copilot Test Plan ${Date.now()}`,
    fullPriceCents: 123400,
    discountPriceCents: 120000,
    unitsIncluded: 321,
    labelsIncluded: 320,
    trackingIncluded: 310,
    moneyOrdersIncluded: 300,
    complaintsIncluded: 25,
    dailyComplaintLimit: 2,
    monthlyComplaintLimit: 20,
    monthlyLabelLimit: 320,
    monthlyTrackingLimit: 310,
    isSuspended: false,
  };

  const created = await call("/api/admin/plans", {
    method: "POST",
    body: JSON.stringify(testPlanPayload),
  }, token);

  const editPayload = {
    ...testPlanPayload,
    name: `${testPlanPayload.name} Edited`,
    fullPriceCents: 140000,
    discountPriceCents: 130000,
    unitsIncluded: 555,
    labelsIncluded: 500,
    trackingIncluded: 450,
    moneyOrdersIncluded: 430,
    complaintsIncluded: 40,
    dailyComplaintLimit: 4,
    monthlyComplaintLimit: 35,
    monthlyLabelLimit: 500,
    monthlyTrackingLimit: 450,
    isSuspended: true,
  };

  let edited = null;
  let suspendOff = null;
  let deleted = null;
  let presentAfterDelete = null;

  if (created.ok && created.body?.plan?.id) {
    const createdId = created.body.plan.id;
    edited = await call(`/api/admin/plans/${createdId}`, {
      method: "PUT",
      body: JSON.stringify(editPayload),
    }, token);

    suspendOff = await call(`/api/admin/plans/${createdId}/suspend`, {
      method: "POST",
      body: JSON.stringify({ isSuspended: false }),
    }, token);

    deleted = await call(`/api/admin/plans/${createdId}`, { method: "DELETE", body: JSON.stringify({}) }, token);
    const plansAfterDelete = await call("/api/admin/plans", {}, token);
    presentAfterDelete = Boolean((plansAfterDelete.body?.plans || []).find((p) => p.id === createdId));
  }

  report.testDeleteFlow = {
    createRequestPayload: testPlanPayload,
    createResponse: created.ok ? pluckPlan(created.body.plan) : created,
    editRequestPayload: editPayload,
    editResponse: edited?.ok ? pluckPlan(edited.body.plan) : edited,
    suspendUnsuspendResponse: suspendOff,
    deleteResponse: deleted,
    existsAfterDelete: presentAfterDelete,
  };

  const usersRes = await call("/api/admin/users", {}, token);
  const activePlanIds = new Set(
    (usersRes.body?.users || [])
      .map((u) => u?.subscription?.plan?.id)
      .filter(Boolean),
  );
  const protectedCandidate = (after.body?.plans || []).find((p) => activePlanIds.has(p.id));
  if (protectedCandidate) {
    const protectedDelete = await call(`/api/admin/plans/${protectedCandidate.id}`, { method: "DELETE", body: JSON.stringify({}) }, token);
    report.protectedDeleteFlow = {
      plan: pluckPlan(protectedCandidate),
      response: protectedDelete,
    };
  }

  const templates = await call("/api/admin/templates", {}, token);
  let templateFlow = { listStatus: templates.status };
  if (templates.ok && Array.isArray(templates.body?.templates) && templates.body.templates.length > 0) {
    const selected = templates.body.templates[0];
    const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0QAAAABJRU5ErkJggg==";
    const blob = new Blob([Buffer.from(tinyPngBase64, "base64")], { type: "image/png" });
    const form = new FormData();
    form.append("file", blob, "tiny-template.png");
    const uploadRes = await fetch(`${API}/api/admin/templates/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    const uploadBody = await uploadRes.json().catch(() => ({}));

    const saveRes = await call(`/api/admin/templates/${selected.id}`, {
      method: "PUT",
      body: JSON.stringify({ backgroundUrl: uploadBody.backgroundUrl || selected.backgroundUrl }),
    }, token);

    const activateRes = await call(`/api/admin/templates/${selected.id}/activate`, {
      method: "POST",
      body: JSON.stringify({}),
    }, token);

    const refreshed = await call("/api/admin/templates", {}, token);
    const activeAfterRefresh = (refreshed.body?.templates || []).find((t) => t.isActive);

    templateFlow = {
      listStatus: templates.status,
      uploadStatus: uploadRes.status,
      uploadBody,
      saveStatus: saveRes.status,
      activateStatus: activateRes.status,
      activeTemplateIdAfterRefresh: activeAfterRefresh?.id || null,
      selectedTemplateId: selected.id,
      persistedAfterRefresh: activeAfterRefresh?.id === selected.id,
      templateCount: (refreshed.body?.templates || []).length,
    };
  }

  report.templateFlow = templateFlow;

  fs.writeFileSync("temp-live-plan-template-repair-report.json", JSON.stringify(report, null, 2));
  console.log("Report written: temp-live-plan-template-repair-report.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
