import { randomBytes, randomUUID } from "node:crypto";
import type { Request } from "express";
import type { AppRole } from "./jwt.js";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const FAILED_ATTEMPT_LIMIT = 5;
const LOCKOUT_MS = 15 * 60_000;
const LOGIN_HISTORY_LIMIT = 30;
const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type RateLimitState = { count: number; windowStartMs: number };
type FailedAttemptState = { count: number; lockedUntilMs: number | null };
type LoginHistoryEntry = {
  at: string;
  email: string;
  method: "password" | "google" | "email_link" | "firebase_token";
  ip: string;
  device: string;
  success: boolean;
};
type RefreshTokenState = { userId: string; role: AppRole; expiresAtMs: number };

const rateLimitByIp = new Map<string, RateLimitState>();
const failedAttemptByIdentity = new Map<string, FailedAttemptState>();
const loginHistoryByUser = new Map<string, LoginHistoryEntry[]>();
const revokedAccessToken = new Map<string, number>();
const refreshTokens = new Map<string, RefreshTokenState>();

function nowMs() {
  return Date.now();
}

function identityKey(email: string, ip: string) {
  return `${email.toLowerCase()}|${ip}`;
}

function pruneExpiredRevocations() {
  const now = nowMs();
  for (const [token, expiresAt] of revokedAccessToken.entries()) {
    if (expiresAt <= now) {
      revokedAccessToken.delete(token);
    }
  }
}

function pruneExpiredRefreshTokens() {
  const now = nowMs();
  for (const [token, state] of refreshTokens.entries()) {
    if (state.expiresAtMs <= now) {
      refreshTokens.delete(token);
    }
  }
}

export function getClientIp(req: Request) {
  const forwarded = req.header("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || req.ip || req.socket.remoteAddress || "unknown";
}

export function getDeviceInfo(req: Request) {
  return String(req.header("user-agent") || "unknown").slice(0, 200);
}

export function auditAuthEvent(event: string, req: Request, details: Record<string, unknown> = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ip: getClientIp(req),
    device: getDeviceInfo(req),
    path: req.originalUrl,
    ...details,
  };
  console.info(`[AUTH_AUDIT] ${JSON.stringify(payload)}`);
}

export function checkAuthRateLimit(ip: string) {
  const now = nowMs();
  const state = rateLimitByIp.get(ip);
  if (!state || now - state.windowStartMs > RATE_LIMIT_WINDOW_MS) {
    rateLimitByIp.set(ip, { count: 1, windowStartMs: now });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (state.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(1000, RATE_LIMIT_WINDOW_MS - (now - state.windowStartMs));
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }

  state.count += 1;
  rateLimitByIp.set(ip, state);
  return { allowed: true, retryAfterSec: 0 };
}

export function getLockout(email: string, ip: string) {
  const key = identityKey(email, ip);
  const state = failedAttemptByIdentity.get(key);
  const now = nowMs();

  if (!state || !state.lockedUntilMs) {
    return { locked: false, remainingSeconds: 0 };
  }

  if (state.lockedUntilMs <= now) {
    failedAttemptByIdentity.delete(key);
    return { locked: false, remainingSeconds: 0 };
  }

  return {
    locked: true,
    remainingSeconds: Math.ceil((state.lockedUntilMs - now) / 1000),
  };
}

export function recordFailedAttempt(email: string, ip: string) {
  const key = identityKey(email, ip);
  const current = failedAttemptByIdentity.get(key) ?? { count: 0, lockedUntilMs: null };
  current.count += 1;

  if (current.count >= FAILED_ATTEMPT_LIMIT) {
    current.lockedUntilMs = nowMs() + LOCKOUT_MS;
  }

  failedAttemptByIdentity.set(key, current);

  return {
    count: current.count,
    locked: !!current.lockedUntilMs,
    remainingSeconds: current.lockedUntilMs ? Math.ceil((current.lockedUntilMs - nowMs()) / 1000) : 0,
  };
}

export function clearFailedAttempts(email: string, ip: string) {
  failedAttemptByIdentity.delete(identityKey(email, ip));
}

export function recordLoginHistory(
  userId: string,
  entry: Omit<LoginHistoryEntry, "at">,
) {
  const list = loginHistoryByUser.get(userId) ?? [];
  list.unshift({ at: new Date().toISOString(), ...entry });
  loginHistoryByUser.set(userId, list.slice(0, LOGIN_HISTORY_LIMIT));
}

export function getLoginHistory(userId: string) {
  return loginHistoryByUser.get(userId) ?? [];
}

export function revokeAccessJwt(token: string) {
  pruneExpiredRevocations();
  revokedAccessToken.set(token, nowMs() + ACCESS_TOKEN_TTL_MS);
}

export function isAccessJwtRevoked(token: string) {
  pruneExpiredRevocations();
  return revokedAccessToken.has(token);
}

export function issueRefreshToken(userId: string, role: AppRole) {
  pruneExpiredRefreshTokens();
  const token = `${randomUUID()}_${randomBytes(20).toString("hex")}`;
  refreshTokens.set(token, { userId, role, expiresAtMs: nowMs() + REFRESH_TOKEN_TTL_MS });
  return token;
}

export function rotateRefreshToken(token: string) {
  pruneExpiredRefreshTokens();
  const state = refreshTokens.get(token);
  if (!state) return null;

  refreshTokens.delete(token);
  const nextToken = issueRefreshToken(state.userId, state.role);
  return { userId: state.userId, role: state.role, refreshToken: nextToken };
}

export function revokeRefreshToken(token: string | null | undefined) {
  if (!token) return;
  refreshTokens.delete(token);
}
