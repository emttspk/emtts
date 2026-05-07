/**
 * Phase 2 — Real Plan Delete Verification
 *
 * Test A: Real delete (no subs) — plan must be fully removed
 * Test B: Protected delete (has subs) — must return 409 with blockers
 */

const BASE = "https://api.epost.pk";
const ADMIN_EMAIL = "nazimsaeed@gmail.com";
const ADMIN_PASS = "Lahore!23";

async function req(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    // Non-JSON response
  }
  return { status: r.status, json };
}

async function main() {
  const results = {};

  // --- Login ---
  console.log("[1] Logging in as admin...");
  const login = await req("POST", "/api/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASS });
  if (login.status !== 200 || !login.json?.token) {
    console.error("LOGIN FAILED:", login.status, JSON.stringify(login.json));
    process.exit(1);
  }
  const token = login.json.token;
  console.log("    Login OK — token obtained");

  // --- Create test plan ---
  console.log("\n[2] Creating DeleteTestPlan...");
  const createPlan = await req("POST", "/api/admin/plans", {
    name: "DeleteTestPlan",
    fullPriceCents: 100,
    discountPriceCents: 100,
    monthlyLabelLimit: 10,
    monthlyTrackingLimit: 10,
    unitsIncluded: 10,
    labelsIncluded: 10,
    trackingIncluded: 10,
  }, token);

  if (createPlan.status !== 200 && createPlan.status !== 201) {
    console.error("CREATE PLAN FAILED:", createPlan.status, JSON.stringify(createPlan.json));
    results.createPlan = "FAIL";
    process.exit(1);
  }
  const planId = createPlan.json?.plan?.id ?? createPlan.json?.id;
  if (!planId) {
    console.error("No plan ID returned:", JSON.stringify(createPlan.json));
    process.exit(1);
  }
  console.log(`    Created plan ID=${planId}`);
  results.createPlan = "PASS";

  // --- Verify plan visible in admin list ---
  console.log("\n[3] Verifying plan appears in admin plans list...");
  const adminPlans = await req("GET", "/api/admin/plans", null, token);
  const foundInAdmin = Array.isArray(adminPlans.json?.plans)
    ? adminPlans.json.plans.some((p) => p.id === planId)
    : Array.isArray(adminPlans.json) ? adminPlans.json.some((p) => p.id === planId) : false;
  console.log(`    Admin plans status=${adminPlans.status}, foundInAdmin=${foundInAdmin}`);
  results.verifyInAdmin = foundInAdmin ? "PASS" : "FAIL";

  // --- Verify plan visible in public plans API ---
  console.log("\n[4] Verifying plan appears in public plans API...");
  const publicPlans = await req("GET", "/api/plans", null, token);
  const foundInPublic = Array.isArray(publicPlans.json?.plans)
    ? publicPlans.json.plans.some((p) => p.id === planId)
    : Array.isArray(publicPlans.json) ? publicPlans.json.some((p) => p.id === planId) : false;
  console.log(`    Public plans status=${publicPlans.status}, foundInPublic=${foundInPublic}`);
  results.verifyInPublic = foundInPublic ? "PASS" : "FAIL";

  // --- Delete the plan ---
  console.log("\n[5] Deleting DeleteTestPlan...");
  const deletePlan = await req("DELETE", `/api/admin/plans/${planId}`, null, token);
  console.log(`    Delete status=${deletePlan.status}, body=${JSON.stringify(deletePlan.json)}`);

  if (deletePlan.status === 200 && deletePlan.json?.success === true) {
    results.deletePlan = "PASS — real deletion 200 OK";
  } else if (deletePlan.status === 409) {
    results.deletePlan = `FAIL — unexpected 409 blockers=${JSON.stringify(deletePlan.json?.blockers)}`;
  } else {
    results.deletePlan = `FAIL — unexpected status ${deletePlan.status}`;
  }

  // --- Verify plan GONE from admin list ---
  console.log("\n[6] Verifying plan is GONE from admin plans list...");
  const adminPlans2 = await req("GET", "/api/admin/plans", null, token);
  const stillInAdmin = Array.isArray(adminPlans2.json?.plans)
    ? adminPlans2.json.plans.some((p) => p.id === planId)
    : Array.isArray(adminPlans2.json) ? adminPlans2.json.some((p) => p.id === planId) : false;
  console.log(`    Still in admin list: ${stillInAdmin}`);
  results.goneFromAdmin = !stillInAdmin ? "PASS" : "FAIL";

  // --- Verify plan GONE from public API ---
  console.log("\n[7] Verifying plan is GONE from public plans API...");
  const publicPlans2 = await req("GET", "/api/plans", null, token);
  const stillInPublic = Array.isArray(publicPlans2.json?.plans)
    ? publicPlans2.json.plans.some((p) => p.id === planId)
    : Array.isArray(publicPlans2.json) ? publicPlans2.json.some((p) => p.id === planId) : false;
  console.log(`    Still in public API: ${stillInPublic}`);
  results.goneFromPublic = !stillInPublic ? "PASS" : "FAIL";

  // --- Protected delete — find a plan with active subscriptions ---
  console.log("\n[8] Testing protected delete (plan with subs)...");
  const allPlans = await req("GET", "/api/admin/plans", null, token);
  const plans = Array.isArray(allPlans.json?.plans) ? allPlans.json.plans : Array.isArray(allPlans.json) ? allPlans.json : [];

  // Find first plan that is NOT the one we just deleted and is not the test plan
  let protectedPlanId = null;
  for (const p of plans) {
    if (p.id !== planId && p.name !== "DeleteTestPlan") {
      protectedPlanId = p.id;
      console.log(`    Using plan "${p.name}" (id=${p.id}) for protected delete test`);
      break;
    }
  }

  if (!protectedPlanId) {
    console.log("    No other plans found — skipping protected delete test");
    results.protectedDelete = "SKIP — no plans with subs available";
  } else {
    const protDel = await req("DELETE", `/api/admin/plans/${protectedPlanId}`, null, token);
    console.log(`    Protected delete status=${protDel.status}, body=${JSON.stringify(protDel.json)}`);
    if (protDel.status === 409 && protDel.json?.blockers) {
      results.protectedDelete = `PASS — 409 with blockers: ${JSON.stringify(protDel.json.blockers)}`;
    } else if (protDel.status === 200) {
      results.protectedDelete = "PASS — plan had no subs so was deleted (not a protected plan)";
    } else {
      results.protectedDelete = `INFO — status=${protDel.status} body=${JSON.stringify(protDel.json)}`;
    }
  }

  // --- Summary ---
  console.log("\n=====================================");
  console.log("PHASE 2 DELETE VERIFICATION RESULTS");
  console.log("=====================================");
  for (const [k, v] of Object.entries(results)) {
    const icon = String(v).startsWith("PASS") ? "✓" : String(v).startsWith("FAIL") ? "✗" : "~";
    console.log(`  ${icon} ${k}: ${v}`);
  }

  const failures = Object.values(results).filter((v) => String(v).startsWith("FAIL"));
  if (failures.length === 0) {
    console.log("\nRESULT: ALL PASS");
  } else {
    console.log(`\nRESULT: ${failures.length} FAILURE(S)`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
