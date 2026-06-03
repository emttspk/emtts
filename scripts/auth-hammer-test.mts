import {
  getCooldownRemainingSeconds,
  getFriendlyFirebaseAuthMessage,
  shouldThrottle,
  TOO_MANY_ATTEMPTS_MESSAGE,
} from "../apps/web/src/lib/firebaseAuthGuards.ts";

type VerifyFlowState = {
  lastContinueAt: number;
  lastResendAt: number;
  resendCooldownUntil: number;
  continueBlocked: number;
  continueAccepted: number;
  resendBlocked: number;
  resendSent: number;
  failedAuthAttempts: number;
};

const VERIFY_ACTION_DEBOUNCE_MS = 1200;
const RESEND_COOLDOWN_MS = 60_000;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function newState(): VerifyFlowState {
  return {
    lastContinueAt: 0,
    lastResendAt: 0,
    resendCooldownUntil: 0,
    continueBlocked: 0,
    continueAccepted: 0,
    resendBlocked: 0,
    resendSent: 0,
    failedAuthAttempts: 0,
  };
}

function attemptContinue(state: VerifyFlowState, now: number) {
  if (shouldThrottle(state.lastContinueAt, VERIFY_ACTION_DEBOUNCE_MS, now)) {
    state.continueBlocked += 1;
    return false;
  }
  state.lastContinueAt = now;
  state.continueAccepted += 1;
  return true;
}

function attemptResend(state: VerifyFlowState, now: number) {
  if (state.resendCooldownUntil > now) {
    state.resendBlocked += 1;
    return false;
  }
  if (shouldThrottle(state.lastResendAt, VERIFY_ACTION_DEBOUNCE_MS, now)) {
    state.resendBlocked += 1;
    return false;
  }

  state.lastResendAt = now;
  state.resendCooldownUntil = now + RESEND_COOLDOWN_MS;
  state.resendSent += 1;
  return true;
}

function runUserSimulation(userId: number) {
  const state = newState();
  const start = 1_000_000 + userId * 10_000;

  // Rapid continue clicks (10 attempts within 1 second)
  for (let i = 0; i < 10; i += 1) {
    attemptContinue(state, start + i * 100);
  }

  // Rapid resend clicks (10 attempts within 1 second)
  for (let i = 0; i < 10; i += 1) {
    attemptResend(state, start + 2_000 + i * 100);
  }

  // Retry resend after cooldown window
  attemptResend(state, start + 2_000 + RESEND_COOLDOWN_MS + 500);

  // Simulate mixed auth attempts for failure/success pressure.
  let lastSubmitAt = 0;
  for (let i = 0; i < 24; i += 1) {
    const now = start + 120_000 + i * 120;
    if (shouldThrottle(lastSubmitAt, VERIFY_ACTION_DEBOUNCE_MS, now)) {
      continue;
    }
    lastSubmitAt = now;
    // One out of three attempts fails.
    if (i % 3 === 0) {
      state.failedAuthAttempts += 1;
    }
  }

  return state;
}

function runMobileReloadSimulation() {
  // Simulate 25 mobile reloads where local component state is rebuilt each time.
  let stableReloads = 0;
  for (let i = 0; i < 25; i += 1) {
    const state = newState();
    const acceptedFirst = attemptContinue(state, 1000 + i * 2000);
    const blockedSecond = !attemptContinue(state, 1001 + i * 2000);
    if (acceptedFirst && blockedSecond) {
      stableReloads += 1;
    }
  }
  return stableReloads;
}

function runScenario(userCount: number) {
  const users = Array.from({ length: userCount }, (_, i) => runUserSimulation(i + 1));
  const totals = users.reduce(
    (acc, user) => {
      acc.continueBlocked += user.continueBlocked;
      acc.continueAccepted += user.continueAccepted;
      acc.resendBlocked += user.resendBlocked;
      acc.resendSent += user.resendSent;
      acc.failedAuthAttempts += user.failedAuthAttempts;
      return acc;
    },
    { continueBlocked: 0, continueAccepted: 0, resendBlocked: 0, resendSent: 0, failedAuthAttempts: 0 },
  );

  const duplicateSuppressionRate = totals.resendBlocked / Math.max(1, totals.resendBlocked + totals.resendSent);
  const cooldownEffectiveness = totals.resendBlocked / Math.max(1, userCount * 10);

  return {
    usersSimulated: userCount,
    totals,
    duplicateSuppressionRate,
    cooldownEffectiveness,
  };
}

function main() {
  const memoryStart = process.memoryUsage().heapUsed;

  const scenarios = [100, 500, 1000].map((size) => runScenario(size));
  const stableReloads = runMobileReloadSimulation();
  const memoryEnd = process.memoryUsage().heapUsed;
  const memoryGrowthMb = Number(((memoryEnd - memoryStart) / (1024 * 1024)).toFixed(2));

  const tooManyMessage = getFriendlyFirebaseAuthMessage({ code: "auth/too-many-requests" }, "fallback");
  const countdown = getCooldownRemainingSeconds(Date.now() + 45_000, Date.now());

  assert(tooManyMessage === TOO_MANY_ATTEMPTS_MESSAGE, "too-many-requests message was not normalized");
  for (const scenario of scenarios) {
    assert(
      scenario.totals.resendSent === scenario.usersSimulated * 2,
      `Expected each user to send exactly 2 allowed resends for ${scenario.usersSimulated} users`,
    );
    assert(
      scenario.totals.resendBlocked >= scenario.usersSimulated * 8,
      `Expected blocked resend attempts for ${scenario.usersSimulated} users`,
    );
    assert(
      scenario.totals.continueBlocked >= scenario.usersSimulated * 8,
      `Expected blocked continue attempts for ${scenario.usersSimulated} users`,
    );
    assert(
      scenario.totals.failedAuthAttempts > 0,
      `Expected failed auth attempts to be present for ${scenario.usersSimulated} users`,
    );
    assert(
      scenario.cooldownEffectiveness >= 0.8,
      `Expected cooldown effectiveness >= 0.8 for ${scenario.usersSimulated} users`,
    );
  }
  assert(stableReloads === 25, "Expected mobile reload simulation to remain stable");
  assert(countdown >= 44 && countdown <= 45, "Cooldown countdown helper returned unexpected value");
  assert(memoryGrowthMb < 20, `Unexpected memory growth under mock load: ${memoryGrowthMb} MB`);

  console.log("[AUTH HAMMER] PASS");
  console.log(
    JSON.stringify(
      {
        scenarios,
        mobileReloads: stableReloads,
        memoryGrowthMb,
      },
      null,
      2,
    ),
  );
}

main();
