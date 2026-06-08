import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request } from "express";
import type { AppRole } from "./jwt.js";
import { prisma } from "../lib/prisma.js";
import { redis, redisEnabled } from "../lib/redis.js";

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

// In-memory fallback stores (used when Redis is unavailable)
const _memRateLimitByIp = new Map<string, RateLimitState>();
const _memFailedAttemptByIdentity = new Map<string, FailedAttemptState>();
const _memLoginHistoryByUser = new Map<string, LoginHistoryEntry[]>();

// JWT revocation is kept in-memory (short-lived, per-instance cache)
const revokedAccessToken = new Map<string, number>();

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

function refreshTokenSalt() {
  return String(process.env.JWT_SECRET ?? "labelgen-refresh-token-salt").trim();
}

function hashRefreshToken(token: string) {
  return createHash("sha256").update(`${refreshTokenSalt()}:${token}`).digest("hex");
}

export function getClientIp(req: Request) {
  const forwarded = String(req.header("x-forwarded-for") ?? "");
  const firstForwarded = forwarded.split(",")[0]?.trim();
  const realIp = String(req.header("x-real-ip") ?? "").trim();
  const directIp = String(req.ip ?? req.socket.remoteAddress ?? "").trim();
  const raw = firstForwarded || realIp || directIp || "unknown";
  return raw.replace(/^::ffff:/i, "").trim() || "unknown";
}

export function getDeviceInfo(req: Request) {
  return String(req.header("user-agent") || "unknown").slice(0, 200);
}

function normalizeSignalValue(value: string) {
  return value.trim().toLowerCase();
}

export function hashAccountSignal(value: string) {
  const normalized = normalizeSignalValue(value || "unknown");
  const salt = String(process.env.ACCOUNT_RISK_SIGNAL_SALT ?? "labelgen-account-risk-v1").trim();
  return createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
}

export function getRequestSignalHashes(req: Request) {
  const ip = getClientIp(req);
  const device = getDeviceInfo(req);
  return {
    ipHash: hashAccountSignal(ip),
    deviceHash: hashAccountSignal(device),
  };
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

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

function rateLimitRedisKey(ip: string): string {
  return `auth:ratelimit:${ip}`;
}

function failedAttemptRedisKey(identityKeyStr: string): string {
  return `auth:failed:${identityKeyStr}`;
}

function loginHistoryRedisKey(userId: string): string {
  return `auth:history:${userId}`;
}

// ---------------------------------------------------------------------------
// Redis-backed implementations
// ---------------------------------------------------------------------------

async function redisCheckRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const key = rateLimitRedisKey(ip);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, RATE_LIMIT_WINDOW_MS);
  }
  if (count > RATE_LIMIT_MAX_REQUESTS) {
    const ttlMs = await redis.pttl(key);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

async function redisGetLockout(identityKeyStr: string): Promise<{ locked: boolean; remainingSeconds: number }> {
  const key = failedAttemptRedisKey(identityKeyStr);
  const ttlMs = await redis.pttl(key);
  if (ttlMs <= 0) {
    await redis.del(key).catch(() => {});
    return { locked: false, remainingSeconds: 0 };
  }
  return { locked: true, remainingSeconds: Math.ceil(ttlMs / 1000) };
}

async function redisRecordFailedAttempt(identityKeyStr: string): Promise<{ count: number; locked: boolean; remainingSeconds: number }> {
  const key = failedAttemptRedisKey(identityKeyStr);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, LOCKOUT_MS);
  }
  const locked = count >= FAILED_ATTEMPT_LIMIT;
  if (locked) {
    await redis.pexpire(key, LOCKOUT_MS);
  }
  const ttlMs = await redis.pttl(key);
  return {
    count,
    locked,
    remainingSeconds: Math.max(0, Math.ceil(ttlMs / 1000)),
  };
}

async function redisClearFailedAttempts(identityKeyStr: string): Promise<void> {
  await redis.del(failedAttemptRedisKey(identityKeyStr));
}

async function redisRecordLoginHistory(userId: string, entry: Omit<LoginHistoryEntry, "at">): Promise<void> {
  const key = loginHistoryRedisKey(userId);
  const entryWithTimestamp = { at: new Date().toISOString(), ...entry };
  await redis.lpush(key, JSON.stringify(entryWithTimestamp));
  await redis.ltrim(key, 0, LOGIN_HISTORY_LIMIT - 1);
  await redis.expire(key, 30 * 24 * 60 * 60);
}

async function redisGetLoginHistory(userId: string): Promise<LoginHistoryEntry[]> {
  const key = loginHistoryRedisKey(userId);
  const entries = await redis.lrange(key, 0, LOGIN_HISTORY_LIMIT - 1);
  return entries
    .map((e) => {
      try {
        return JSON.parse(e) as LoginHistoryEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LoginHistoryEntry => e !== null);
}

// ---------------------------------------------------------------------------
// Public API — Redis primary, in-memory fallback
// ---------------------------------------------------------------------------

export async function checkAuthRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
  if (redisEnabled) return redisCheckRateLimit(ip);

  // In-memory fallback
  const now = nowMs();
  const state = _memRateLimitByIp.get(ip);
  if (!state || now - state.windowStartMs > RATE_LIMIT_WINDOW_MS) {
    _memRateLimitByIp.set(ip, { count: 1, windowStartMs: now });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (state.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(1000, RATE_LIMIT_WINDOW_MS - (now - state.windowStartMs));
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }

  state.count += 1;
  _memRateLimitByIp.set(ip, state);
  return { allowed: true, retryAfterSec: 0 };
}

export async function getLockout(email: string, ip: string): Promise<{ locked: boolean; remainingSeconds: number }> {
  const key = identityKey(email, ip);

  if (redisEnabled) return redisGetLockout(key);

  // In-memory fallback
  const state = _memFailedAttemptByIdentity.get(key);
  const now = nowMs();

  if (!state || !state.lockedUntilMs) {
    return { locked: false, remainingSeconds: 0 };
  }

  if (state.lockedUntilMs <= now) {
    _memFailedAttemptByIdentity.delete(key);
    return { locked: false, remainingSeconds: 0 };
  }

  return {
    locked: true,
    remainingSeconds: Math.ceil((state.lockedUntilMs - now) / 1000),
  };
}

export async function recordFailedAttempt(email: string, ip: string): Promise<{ count: number; locked: boolean; remainingSeconds: number }> {
  const key = identityKey(email, ip);

  if (redisEnabled) return redisRecordFailedAttempt(key);

  // In-memory fallback
  const current = _memFailedAttemptByIdentity.get(key) ?? { count: 0, lockedUntilMs: null };
  current.count += 1;

  if (current.count >= FAILED_ATTEMPT_LIMIT) {
    current.lockedUntilMs = nowMs() + LOCKOUT_MS;
  }

  _memFailedAttemptByIdentity.set(key, current);

  return {
    count: current.count,
    locked: !!current.lockedUntilMs,
    remainingSeconds: current.lockedUntilMs ? Math.ceil((current.lockedUntilMs - nowMs()) / 1000) : 0,
  };
}

export async function clearFailedAttempts(email: string, ip: string): Promise<void> {
  const key = identityKey(email, ip);

  if (redisEnabled) {
    await redisClearFailedAttempts(key);
    return;
  }

  // In-memory fallback
  _memFailedAttemptByIdentity.delete(key);
}

export async function recordLoginHistory(
  userId: string,
  entry: Omit<LoginHistoryEntry, "at">,
): Promise<void> {
  if (redisEnabled) {
    await redisRecordLoginHistory(userId, entry);
    return;
  }

  // In-memory fallback
  const list = _memLoginHistoryByUser.get(userId) ?? [];
  list.unshift({ at: new Date().toISOString(), ...entry });
  _memLoginHistoryByUser.set(userId, list.slice(0, LOGIN_HISTORY_LIMIT));
}

export async function getLoginHistory(userId: string): Promise<LoginHistoryEntry[]> {
  if (redisEnabled) return redisGetLoginHistory(userId);
  return _memLoginHistoryByUser.get(userId) ?? [];
}

export function revokeAccessJwt(token: string) {
  pruneExpiredRevocations();
  revokedAccessToken.set(token, nowMs() + ACCESS_TOKEN_TTL_MS);
}

export function isAccessJwtRevoked(token: string) {
  pruneExpiredRevocations();
  return revokedAccessToken.has(token);
}

export async function issueRefreshToken(userId: string, role: AppRole) {
  const token = `${randomUUID()}_${randomBytes(20).toString("hex")}`;
  const tokenHash = hashRefreshToken(token);
  const expiresAt = new Date(nowMs() + REFRESH_TOKEN_TTL_MS);
  await prisma.$executeRaw`
    INSERT INTO "AuthRefreshToken" ("id", "userId", "role", "tokenHash", "expiresAt")
    VALUES (${randomUUID()}, ${userId}, ${role}, ${tokenHash}, ${expiresAt})
  `;
  return token;
}

export async function rotateRefreshToken(token: string) {
  const now = new Date();
  const tokenHash = hashRefreshToken(token);

  const [state] = await prisma.$queryRaw<Array<{ userId: string; role: string }>>`
    SELECT "userId", "role"
    FROM "AuthRefreshToken"
    WHERE "tokenHash" = ${tokenHash}
      AND "revokedAt" IS NULL
      AND "expiresAt" > ${now}
    LIMIT 1
  `;

  if (!state) return null;

  const nextToken = `${randomUUID()}_${randomBytes(20).toString("hex")}`;
  const nextTokenHash = hashRefreshToken(nextToken);
  const expiresAt = new Date(nowMs() + REFRESH_TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "AuthRefreshToken"
      SET "revokedAt" = ${now}, "replacedByHash" = ${nextTokenHash}, "updatedAt" = NOW()
      WHERE "tokenHash" = ${tokenHash} AND "revokedAt" IS NULL
    `,
    prisma.$executeRaw`
      INSERT INTO "AuthRefreshToken" ("id", "userId", "role", "tokenHash", "expiresAt")
      VALUES (${randomUUID()}, ${state.userId}, ${String(state.role)}, ${nextTokenHash}, ${expiresAt})
    `,
  ]);

  return { userId: state.userId, role: String(state.role) as AppRole, refreshToken: nextToken };
}

export async function revokeRefreshToken(token: string | null | undefined) {
  if (!token) return;
  const tokenHash = hashRefreshToken(token);
  await prisma.$executeRaw`
    UPDATE "AuthRefreshToken"
    SET "revokedAt" = NOW(), "updatedAt" = NOW()
    WHERE "tokenHash" = ${tokenHash} AND "revokedAt" IS NULL
  `;
}
