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
  resendBlocked: number;
  resendSent: number;
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
    resendBlocked: 0,
    resendSent: 0,
  };
}

function attemptContinue(state: VerifyFlowState, now: number) {
  if (shouldThrottle(state.lastContinueAt, VERIFY_ACTION_DEBOUNCE_MS, now)) {
    state.continueBlocked += 1;
    return false;
  }
  state.lastContinueAt = now;
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

  return state;
}

function runLoginAttemptMix() {
  const result = {
    wrongCredentialAttempts: 0,
    correctCredentialAttempts: 0,
    throttled: 0,
  };

  let lastSubmitAt = 0;
  const start = 5_000_000;
  for (let i = 0; i < 30; i += 1) {
    const now = start + i * 150;
    if (shouldThrottle(lastSubmitAt, VERIFY_ACTION_DEBOUNCE_MS, now)) {
      result.throttled += 1;
      continue;
    }
    lastSubmitAt = now;
    if (i % 3 === 0) {
      result.wrongCredentialAttempts += 1;
    } else {
      result.correctCredentialAttempts += 1;
    }
  }

  return result;
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

function main() {
  const users = Array.from({ length: 50 }, (_, i) => runUserSimulation(i + 1));
  const totals = users.reduce(
    (acc, user) => {
      acc.continueBlocked += user.continueBlocked;
      acc.resendBlocked += user.resendBlocked;
      acc.resendSent += user.resendSent;
      return acc;
    },
    { continueBlocked: 0, resendBlocked: 0, resendSent: 0 },
  );

  const loginMix = runLoginAttemptMix();
  const stableReloads = runMobileReloadSimulation();

  const tooManyMessage = getFriendlyFirebaseAuthMessage({ code: "auth/too-many-requests" }, "fallback");
  const countdown = getCooldownRemainingSeconds(Date.now() + 45_000, Date.now());

  assert(tooManyMessage === TOO_MANY_ATTEMPTS_MESSAGE, "too-many-requests message was not normalized");
  assert(totals.resendSent === 100, "Expected each user to send exactly 2 allowed resends");
  assert(totals.resendBlocked >= 400, "Expected blocked resend attempts during cooldown/debounce");
  assert(totals.continueBlocked >= 400, "Expected blocked continue attempts during debounce");
  assert(loginMix.throttled > 0, "Expected login throttling to trigger");
  assert(stableReloads === 25, "Expected mobile reload simulation to remain stable");
  assert(countdown >= 44 && countdown <= 45, "Cooldown countdown helper returned unexpected value");

  console.log("[AUTH HAMMER] PASS");
  console.log(JSON.stringify({ usersSimulated: 50, totals, loginMix, mobileReloads: stableReloads }, null, 2));
}

main();
