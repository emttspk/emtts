function shouldApplyInquiryReconciliation(currentStatus, resolvedStatus) {
  if (currentStatus === "SUCCEEDED") return false;
  if (resolvedStatus === "SUCCEEDED") return true;
  if (currentStatus === "PENDING") return true;
  return false;
}

function shouldCreateSubscriptionForInquirySuccess(currentStatus, existingSubscriptionId, resolvedStatus) {
  return resolvedStatus === "SUCCEEDED" && currentStatus !== "SUCCEEDED" && !existingSubscriptionId;
}

const scenarios = [
  {
    name: "000 inquiry heals false failed",
    currentStatus: "FAILED",
    resolvedStatus: "SUCCEEDED",
    existingSubscriptionId: null,
    expectApply: true,
    expectCreateSubscription: true,
  },
  {
    name: "failed response remains failed",
    currentStatus: "FAILED",
    resolvedStatus: "FAILED",
    existingSubscriptionId: null,
    expectApply: false,
    expectCreateSubscription: false,
  },
  {
    name: "pending can be finalized failed",
    currentStatus: "PENDING",
    resolvedStatus: "FAILED",
    existingSubscriptionId: null,
    expectApply: true,
    expectCreateSubscription: false,
  },
  {
    name: "succeeded never double activates",
    currentStatus: "SUCCEEDED",
    resolvedStatus: "SUCCEEDED",
    existingSubscriptionId: "sub_1",
    expectApply: false,
    expectCreateSubscription: false,
  },
  {
    name: "inquiry success with existing subscription does not create again",
    currentStatus: "FAILED",
    resolvedStatus: "SUCCEEDED",
    existingSubscriptionId: "sub_1",
    expectApply: true,
    expectCreateSubscription: false,
  },
];

let hasFailure = false;

for (const scenario of scenarios) {
  const apply = shouldApplyInquiryReconciliation(scenario.currentStatus, scenario.resolvedStatus);
  const createSubscription = shouldCreateSubscriptionForInquirySuccess(
    scenario.currentStatus,
    scenario.existingSubscriptionId,
    scenario.resolvedStatus,
  );

  const applyPass = apply === scenario.expectApply;
  const createPass = createSubscription === scenario.expectCreateSubscription;

  console.log(`scenario: ${scenario.name}`);
  console.log(`  apply reconciliation => ${apply} (${applyPass ? "PASS" : "FAIL"})`);
  console.log(`  create subscription => ${createSubscription} (${createPass ? "PASS" : "FAIL"})`);

  if (!applyPass || !createPass) {
    hasFailure = true;
  }
}

if (hasFailure) {
  process.exit(1);
}
