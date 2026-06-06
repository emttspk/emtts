const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Please wait 10 to 15 minutes before trying again.";

function asErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : "";
  }
  return "";
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

export function getFriendlyFirebaseAuthMessage(error: unknown, fallback: string): string {
  const code = asErrorCode(error).toLowerCase();
  const message = asErrorMessage(error).toLowerCase();

  if (code.includes("too-many-requests") || message.includes("auth/too-many-requests")) {
    return TOO_MANY_ATTEMPTS_MESSAGE;
  }

  return fallback;
}

export function isFirebaseTooManyRequests(error: unknown): boolean {
  const code = asErrorCode(error).toLowerCase();
  const message = asErrorMessage(error).toLowerCase();
  return code.includes("too-many-requests") || message.includes("auth/too-many-requests");
}

export function shouldThrottle(lastActionAt: number, debounceMs: number, now = Date.now()): boolean {
  return lastActionAt > 0 && now - lastActionAt < debounceMs;
}

export function getCooldownRemainingSeconds(cooldownUntil: number, now = Date.now()): number {
  if (cooldownUntil <= now) return 0;
  return Math.ceil((cooldownUntil - now) / 1000);
}

export function shouldUseRedirectAuthFlow(): boolean {
  if (typeof window === "undefined") return false;
  const mobileQuery = window.matchMedia?.("(max-width: 767px), (pointer: coarse)");
  if (mobileQuery?.matches) return true;
  return /Android|iPhone|iPad|iPod|Mobi/i.test(window.navigator.userAgent);
}

export { TOO_MANY_ATTEMPTS_MESSAGE };
