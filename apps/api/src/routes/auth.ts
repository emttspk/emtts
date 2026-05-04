import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { asAppRole, signAccessToken } from "../auth/jwt.js";
import { verifyFirebaseIdToken } from "../auth/firebaseAdmin.js";
import {
  auditAuthEvent,
  checkAuthRateLimit,
  clearFailedAttempts,
  getClientIp,
  getDeviceInfo,
  getLockout,
  getLoginHistory,
  issueRefreshToken,
  recordFailedAttempt,
  recordLoginHistory,
  revokeAccessJwt,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../auth/security.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function extractBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith("Bearer ")) return null;
  return authorizationHeader.slice("Bearer ".length).trim() || null;
}

function shapeAuthResponse(user: { id: string; email: string; role: string; createdAt: Date }) {
  const role = asAppRole(user.role);
  return {
    user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
    token: signAccessToken({ sub: user.id, role }),
    refreshToken: issueRefreshToken(user.id, role),
  };
}

async function ensureStarterSubscription(userId: string) {
  const starterPlan =
    (await prisma.plan.findFirst({ where: { name: "Free Plan" } })) ??
    (await prisma.plan.create({ data: { name: "Free Plan", priceCents: 0, monthlyLabelLimit: 250, monthlyTrackingLimit: 250 } }));
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 15);
  await prisma.subscription.create({
    data: {
      userId,
      planId: starterPlan.id,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: end,
    },
  });
}

authRouter.use((req, res, next) => {
  const ip = getClientIp(req);
  const rateLimit = checkAuthRateLimit(ip);
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSec));
    auditAuthEvent("auth.rate_limited", req, { retryAfterSec: rateLimit.retryAfterSec });
    return res.status(429).json({ error: "Too many authentication attempts. Try again shortly." });
  }
  return next();
});

authRouter.post("/register", async (req, res) => {
  const body = z
    .object({
      email: z.string().trim().email(),
      password: z.string().min(8).max(200),
      companyName: z.string().max(120).nullable().optional(),
      address: z.string().max(300).nullable().optional(),
      contactNumber: z.string().max(30).nullable().optional(),
      cnic: z.string().max(15).nullable().optional(),
      originCity: z.string().max(80).nullable().optional(),
    })
    .parse(req.body);

  const email = normalizeEmail(body.email);
  const ip = getClientIp(req);
  const device = getDeviceInfo(req);
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already registered" });
  } catch (err) {
    console.log("Database unavailable for user check, allowing registration:", err instanceof Error ? err.message : err);
  }

  const passwordHash = await hashPassword(body.password);
  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "USER",
        companyName: body.companyName,
        address: body.address,
        contactNumber: body.contactNumber,
        cnic: body.cnic,
        originCity: body.originCity,
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  } catch (err) {
    console.error("Failed to create user:", err);
    return res.status(500).json({ error: "Failed to create account - database unavailable" });
  }

  // Try to create subscription, but don't fail if database is not ready
  try {
    await ensureStarterSubscription(user.id);
  } catch (err) {
    console.log("Failed to create subscription (database may not be ready):", err instanceof Error ? err.message : err);
  }

  recordLoginHistory(user.id, { email, method: "password", ip, device, success: true });
  auditAuthEvent("auth.register.success", req, { email, userId: user.id });
  return res.json(shapeAuthResponse(user));
});

authRouter.post("/login", async (req, res) => {
  let body: { email: string; password: string };
  try {
    body = z
      .object({
        email: z.string().trim().email(),
        password: z.string().min(1),
      })
      .parse(req.body);
  } catch {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const email = normalizeEmail(body.email);
    const ip = getClientIp(req);
    const device = getDeviceInfo(req);
    const lockout = getLockout(email, ip);
    if (lockout.locked) {
      auditAuthEvent("auth.login.locked", req, { email, remainingSeconds: lockout.remainingSeconds });
      return res.status(423).json({ error: `Account temporarily locked. Try again in ${lockout.remainingSeconds}s.` });
    }

    console.log(`[AUTH] Login attempt for email: ${email}`);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`[AUTH] Login failed: User not found for email: ${email}`);
      const failed = recordFailedAttempt(email, ip);
      auditAuthEvent("auth.login.user_missing", req, { email, failedCount: failed.count, locked: failed.locked });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.suspended) {
      console.log(`[AUTH] Login failed: Suspended account for email: ${email}`);
      auditAuthEvent("auth.login.suspended", req, { email, userId: user.id });
      return res.status(403).json({ error: "Account disabled" });
    }

    console.log(`[AUTH] User found for email: ${email}. Verifying password...`);
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      console.log(`[AUTH] Login failed: Invalid password for email: ${email}`);
      const failed = recordFailedAttempt(email, ip);
      auditAuthEvent("auth.login.password_invalid", req, { email, userId: user.id, failedCount: failed.count, locked: failed.locked });
      recordLoginHistory(user.id, { email, method: "password", ip, device, success: false });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    clearFailedAttempts(email, ip);
    console.log(`[AUTH] Login successful for email: ${email}`);
    recordLoginHistory(user.id, { email, method: "password", ip, device, success: true });
    auditAuthEvent("auth.login.success", req, { email, userId: user.id });
    return res.json(shapeAuthResponse(user));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[AUTH] Login database error:", message);
    return res.status(503).json({ error: "Login temporarily unavailable. Please try again." });
  }
});

authRouter.post("/firebase-login", async (req, res) => {
  const body = z.object({ idToken: z.string().min(20) }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Firebase idToken is required" });
  }

  try {
    const decoded = await verifyFirebaseIdToken(body.data.idToken);
    const email = normalizeEmail(decoded.email || "");
    if (!email) {
      return res.status(400).json({ error: "Firebase token has no email" });
    }

    const provider = String((decoded.firebase as any)?.sign_in_provider || "firebase_token");
    const isGoogle = provider === "google.com";
    const emailVerified = !!decoded.email_verified;

    if (!isGoogle && !emailVerified) {
      auditAuthEvent("auth.firebase.unverified_email", req, { email, provider });
      return res.status(403).json({ error: "Email is not verified" });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const randomPassword = `${randomUUID()}-${Date.now()}-firebase`;
      const passwordHash = await hashPassword(randomPassword);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: "USER",
          companyName: (decoded.name as string | undefined) || null,
        },
      });
      try {
        await ensureStarterSubscription(user.id);
      } catch (err) {
        console.log("Failed to create starter subscription for firebase user:", err instanceof Error ? err.message : err);
      }
    }

    if (user.suspended) {
      auditAuthEvent("auth.firebase.suspended", req, { email, userId: user.id, provider });
      return res.status(403).json({ error: "Account disabled" });
    }

    recordLoginHistory(user.id, {
      email,
      method: isGoogle ? "google" : "firebase_token",
      ip: getClientIp(req),
      device: getDeviceInfo(req),
      success: true,
    });
    auditAuthEvent("auth.firebase.success", req, { email, userId: user.id, provider });

    return res.json(shapeAuthResponse({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditAuthEvent("auth.firebase.failure", req, { message });
    return res.status(401).json({ error: "Invalid Firebase token" });
  }
});

authRouter.post("/refresh", async (req, res) => {
  const body = z.object({ refreshToken: z.string().min(10) }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  const rotated = rotateRefreshToken(body.data.refreshToken);
  if (!rotated) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }

  const token = signAccessToken({ sub: rotated.userId, role: rotated.role });
  return res.json({ token, refreshToken: rotated.refreshToken });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : null;
  revokeRefreshToken(refreshToken);

  const accessToken = extractBearerToken(req.header("authorization"));
  if (accessToken) {
    revokeAccessJwt(accessToken);
  }

  auditAuthEvent("auth.logout", req, { userId: (req as any).user?.id ?? null });
  return res.json({ success: true });
});

authRouter.get("/login-history", requireAuth, async (req, res) => {
  const userId = (req as any).user?.id as string;
  return res.json({ history: getLoginHistory(userId) });
});
