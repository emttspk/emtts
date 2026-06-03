import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { asAppRole, signAccessToken } from "../auth/jwt.js";
import {
  generateFirebaseEmailSignInLink,
  generateFirebasePasswordResetLink,
  isFirebaseAuthConfigured,
  verifyFirebaseIdToken,
} from "../auth/firebaseAdmin.js";
import {
  auditAuthEvent,
  checkAuthRateLimit,
  clearFailedAttempts,
  getClientIp,
  getDeviceInfo,
  getLockout,
  getLoginHistory,
  getRequestSignalHashes,
  hashAccountSignal,
  issueRefreshToken,
  recordFailedAttempt,
  recordLoginHistory,
  revokeAccessJwt,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../auth/security.js";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config.js";

export const authRouter = Router();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function extractBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith("Bearer ")) return null;
  return authorizationHeader.slice("Bearer ".length).trim() || null;
}

async function shapeAuthResponse(user: { id: string; email: string; role: string; createdAt: Date }) {
  const role = asAppRole(user.role);
  return {
    user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
    token: signAccessToken({ sub: user.id, role }),
    refreshToken: await issueRefreshToken(user.id, role),
  };
}

function auditAuthMetric(req: Parameters<typeof auditAuthEvent>[1], metric: string, details: Record<string, unknown> = {}) {
  auditAuthEvent(`auth.metric.${metric}`, req, details);
}

function normalizeNullable(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isProfileComplete(input: {
  companyName: string | null;
  address: string | null;
  originCity: string | null;
  contactNumber: string | null;
}) {
  return !!(input.companyName && input.address && input.originCity && input.contactNumber);
}

function usernameFromEmail(email: string) {
  const localPart = email.split("@")[0] || "user";
  return localPart.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40) || `user_${Date.now()}`;
}

function uniqueConstraintMessage(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const message = err.message.toLowerCase();
  if (!message.includes("unique constraint")) return null;
  if (message.includes("email")) return "Email already registered";
  if (message.includes("contactnumber") || message.includes("contact_number")) return "Mobile number already registered";
  if (message.includes("cnic")) return "CNIC already registered";
  return "Duplicate value detected";
}

function immutableProfileMessage() {
  return "Contact number/CNIC cannot be changed after verification. Contact support/admin for correction.";
}

function nameContactPattern(companyName: string | null | undefined, contactNumber: string | null | undefined) {
  const company = String(companyName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const contact = String(contactNumber ?? "").replace(/\D/g, "");
  if (!company || !contact) return null;
  return `${company}|${contact}`;
}

async function persistAccountRiskSignals(input: {
  userId: string | null;
  source: string;
  planTier: "FREE" | "PAID" | "UNKNOWN";
  reqIpHash?: string | null;
  reqDeviceHash?: string | null;
  contactNumber?: string | null;
  cnic?: string | null;
  companyName?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const rows: Array<{
    userId: string | null;
    signalType: string;
    signalHash: string;
    source: string;
    planTier: string;
    metadataJson?: any;
  }> = [];

  if (input.reqIpHash) {
    rows.push({ userId: input.userId, signalType: "IP_HASH", signalHash: input.reqIpHash, source: input.source, planTier: input.planTier, metadataJson: input.metadata ?? undefined });
  }
  if (input.reqDeviceHash) {
    rows.push({ userId: input.userId, signalType: "DEVICE_HASH", signalHash: input.reqDeviceHash, source: input.source, planTier: input.planTier, metadataJson: input.metadata ?? undefined });
  }

  const normalizedContact = normalizeNullable(input.contactNumber);
  const normalizedCnic = normalizeNullable(input.cnic);
  const pattern = nameContactPattern(input.companyName, normalizedContact);

  if (normalizedContact) {
    rows.push({ userId: input.userId, signalType: "CONTACT_HASH", signalHash: hashAccountSignal(normalizedContact), source: input.source, planTier: input.planTier, metadataJson: input.metadata ?? undefined });
  }
  if (normalizedCnic) {
    rows.push({ userId: input.userId, signalType: "CNIC_HASH", signalHash: hashAccountSignal(normalizedCnic), source: input.source, planTier: input.planTier, metadataJson: input.metadata ?? undefined });
  }
  if (pattern) {
    rows.push({ userId: input.userId, signalType: "NAME_CONTACT_HASH", signalHash: hashAccountSignal(pattern), source: input.source, planTier: input.planTier, metadataJson: input.metadata ?? undefined });
  }

  if (!rows.length) return;

  try {
    await prisma.accountRiskSignal.createMany({
      data: rows,
    });
  } catch (error) {
    console.warn("Failed to persist account risk signals", error instanceof Error ? error.message : error);
  }
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
      username: z.string().trim().min(3).max(80).optional(),
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
  const profileInput = {
    companyName: normalizeNullable(body.companyName),
    address: normalizeNullable(body.address),
    originCity: normalizeNullable(body.originCity),
    contactNumber: normalizeNullable(body.contactNumber),
    cnic: normalizeNullable(body.cnic),
  };
  const onboardingComplete = isProfileComplete(profileInput);
  const username = normalizeNullable(body.username) ?? (onboardingComplete ? usernameFromEmail(email) : null);

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const ip = getClientIp(req);
  const device = getDeviceInfo(req);
  const { ipHash, deviceHash } = getRequestSignalHashes(req);
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
        username,
        email,
        passwordHash,
        role: "USER",
        onboardingComplete,
        companyName: profileInput.companyName,
        address: profileInput.address,
        contactNumber: profileInput.contactNumber,
        cnic: profileInput.cnic,
        originCity: profileInput.originCity,
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  } catch (err) {
    const duplicateMessage = uniqueConstraintMessage(err);
    if (duplicateMessage) {
      await persistAccountRiskSignals({
        userId: null,
        source: "REGISTER_DUPLICATE_ATTEMPT",
        planTier: "FREE",
        reqIpHash: ipHash,
        reqDeviceHash: deviceHash,
        companyName: profileInput.companyName,
        contactNumber: profileInput.contactNumber,
        cnic: profileInput.cnic,
        metadata: { email },
      });
      return res.status(409).json({ error: duplicateMessage });
    }
    console.error("Failed to create user:", err);
    return res.status(500).json({ error: "Failed to create account - database unavailable" });
  }

  // Try to create subscription, but don't fail if database is not ready
  try {
    await ensureStarterSubscription(user.id);
  } catch (err) {
    console.log("Failed to create subscription (database may not be ready):", err instanceof Error ? err.message : err);
  }

  await persistAccountRiskSignals({
    userId: user.id,
    source: "REGISTER",
    planTier: "FREE",
    reqIpHash: ipHash,
    reqDeviceHash: deviceHash,
    companyName: profileInput.companyName,
    contactNumber: profileInput.contactNumber,
    cnic: profileInput.cnic,
    metadata: { onboardingComplete },
  });

  recordLoginHistory(user.id, { email, method: "password", ip, device, success: true });
  auditAuthEvent("auth.register.success", req, { email, userId: user.id });
  return res.json({
    ...(await shapeAuthResponse(user)),
    onboardingRequired: !onboardingComplete,
  });
});

authRouter.post("/login", async (req, res) => {
  // Accept { identifier, password } (new) or legacy { email, password }
  const parsed = z
    .object({
      identifier: z.string().trim().min(1).optional(),
      email: z.string().trim().optional(),
      password: z.string().min(1),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "identifier and password are required" });
  }

  const rawIdentifier = (parsed.data.identifier ?? parsed.data.email ?? "").trim();
  if (!rawIdentifier) {
    return res.status(400).json({ error: "identifier and password are required" });
  }

  try {
    const isEmail = rawIdentifier.includes("@");
    const lookupKey = isEmail ? normalizeEmail(rawIdentifier) : rawIdentifier;
    const ip = getClientIp(req);
    const device = getDeviceInfo(req);
    const lockout = getLockout(lookupKey, ip);
    if (lockout.locked) {
      auditAuthEvent("auth.login.locked", req, { identifier: rawIdentifier, remainingSeconds: lockout.remainingSeconds });
      auditAuthMetric(req, "login_failure", { reason: "locked", identifier: rawIdentifier, remainingSeconds: lockout.remainingSeconds });
      return res.status(423).json({ error: `Account temporarily locked. Try again in ${lockout.remainingSeconds}s.` });
    }

    console.log(`[AUTH] Login attempt for identifier: ${rawIdentifier} (${isEmail ? "email" : "username"})`);
    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: lookupKey } })
      : await prisma.user.findFirst({ where: { username: rawIdentifier } });

    if (!user) {
      console.log(`[AUTH] Login failed: User not found for identifier: ${rawIdentifier}`);
      const failed = recordFailedAttempt(lookupKey, ip);
      auditAuthEvent("auth.login.user_missing", req, { identifier: rawIdentifier, failedCount: failed.count, locked: failed.locked });
      auditAuthMetric(req, "login_failure", { reason: "user_missing", identifier: rawIdentifier, failedCount: failed.count, locked: failed.locked });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.suspended) {
      console.log(`[AUTH] Login failed: Suspended account for identifier: ${rawIdentifier}`);
      auditAuthEvent("auth.login.suspended", req, { identifier: rawIdentifier, userId: user.id });
      auditAuthMetric(req, "login_failure", { reason: "suspended", identifier: rawIdentifier, userId: user.id });
      return res.status(403).json({ error: "Account disabled" });
    }

    console.log(`[AUTH] User found for identifier: ${rawIdentifier}. Verifying password...`);
    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      console.log(`[AUTH] Login failed: Invalid password for identifier: ${rawIdentifier}`);
      const failed = recordFailedAttempt(lookupKey, ip);
      auditAuthEvent("auth.login.password_invalid", req, { identifier: rawIdentifier, userId: user.id, failedCount: failed.count, locked: failed.locked });
      auditAuthMetric(req, "login_failure", {
        reason: "password_invalid",
        identifier: rawIdentifier,
        userId: user.id,
        failedCount: failed.count,
        locked: failed.locked,
      });
      recordLoginHistory(user.id, { email: user.email, method: "password", ip, device, success: false });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    clearFailedAttempts(lookupKey, ip);
    console.log(`[AUTH] Login successful for identifier: ${rawIdentifier}`);
    recordLoginHistory(user.id, { email: user.email, method: "password", ip, device, success: true });
    auditAuthEvent("auth.login.success", req, { identifier: rawIdentifier, userId: user.id });
    auditAuthMetric(req, "login_success", { method: "password", identifier: rawIdentifier, userId: user.id });
    return res.json(await shapeAuthResponse(user));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[AUTH] Login database error:", message);
    auditAuthMetric(req, "login_failure", { reason: "service_unavailable", identifier: rawIdentifier, message });
    return res.status(503).json({ error: "Login temporarily unavailable. Please try again." });
  }
});

authRouter.get("/check-username", async (req, res) => {
  const username = String(req.query.username ?? "").trim();
  if (username.length < 1) {
    return res.status(400).json({ error: "username is required" });
  }

  try {
    const existing = await prisma.user.findFirst({ where: { username } });
    if (!existing) {
      return res.json({ available: true });
    }
    const suggestions = [`${username}123`, `${username}_pk`, `official_${username}`];
    return res.json({ available: false, suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[AUTH] check-username error:", message);
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
});

authRouter.post("/forgot-username", async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  const email = normalizeEmail(parsed.data.email);
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { username: true } });
    auditAuthEvent("auth.forgot_username.requested", req, { email, userFound: !!user });
    // Return username directly (no mail system configured — safe for business app context)
    return res.json({
      success: true,
      message: user?.username
        ? `Your username is: ${user.username}`
        : "If this email is registered, your username has been retrieved.",
      username: user?.username ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[AUTH] forgot-username error:", message);
    return res.status(500).json({ error: "Failed to process request" });
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
      auditAuthMetric(req, "email_verification_failure", { email, provider, reason: "email_unverified" });
      auditAuthMetric(req, "login_failure", { method: "firebase", provider, email, reason: "email_unverified" });
      return res.status(403).json({ error: "Email is not verified" });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const randomPassword = `${randomUUID()}-${Date.now()}-firebase`;
      const passwordHash = await hashPassword(randomPassword);
      user = await prisma.user.create({
        data: {
          username: usernameFromEmail(email),
          email,
          passwordHash,
          role: "USER",
          onboardingComplete: false,
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
      auditAuthMetric(req, "login_failure", { method: "firebase", provider, email, reason: "suspended", userId: user.id });
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
    auditAuthMetric(req, "login_success", { method: isGoogle ? "google" : "firebase", provider, email, userId: user.id });
    if (!isGoogle) {
      auditAuthMetric(req, "email_verification_success", { email, provider, userId: user.id });
    }

    const onboardingRequired = !user.onboardingComplete;

    return res.json({
      ...(await shapeAuthResponse({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })),
      onboardingRequired,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditAuthEvent("auth.firebase.failure", req, { message });
    auditAuthMetric(req, "email_verification_failure", { reason: "token_verification_error", message });
    auditAuthMetric(req, "login_failure", { method: "firebase", reason: "token_verification_error", message });
    return res.status(401).json({ error: "Invalid Firebase token" });
  }
});

authRouter.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  if (!isFirebaseAuthConfigured()) {
    return res.status(503).json({ error: "Password reset is not configured" });
  }

  const email = normalizeEmail(parsed.data.email);
  const continueUrl = `${String(env.WEB_ORIGIN || "https://www.epost.pk").replace(/\/$/, "")}/login`;

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      await generateFirebasePasswordResetLink(email, continueUrl);
    }
    auditAuthEvent("auth.forgot_password.requested", req, { email, userFound: !!user });
    auditAuthMetric(req, "password_reset_request", { email, userFound: !!user });
    return res.json({ success: true, message: "If this account exists, a password reset email has been sent." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditAuthEvent("auth.forgot_password.failed", req, { email, message });
    auditAuthMetric(req, "password_reset_failure", { email, message });
    return res.status(500).json({ error: "Failed to process password reset" });
  }
});

authRouter.post("/email-otp/send", async (req, res) => {
  const parsed = z
    .object({
      email: z.string().trim().email(),
      continueUrl: z.string().trim().url().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  if (!isFirebaseAuthConfigured()) {
    return res.status(503).json({ error: "Email OTP is not configured" });
  }

  const email = normalizeEmail(parsed.data.email);
  const continueUrl = parsed.data.continueUrl ?? `${String(env.WEB_ORIGIN || "https://www.epost.pk").replace(/\/$/, "")}/email-otp-login`;

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      await generateFirebaseEmailSignInLink(email, continueUrl);
    }
    auditAuthEvent("auth.email_otp.send", req, { email, userFound: !!user });
    return res.json({ success: true, message: "If this account exists, an email OTP link has been sent." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditAuthEvent("auth.email_otp.send_failed", req, { email, message });
    return res.status(500).json({ error: "Failed to send email OTP" });
  }
});

authRouter.post("/email-otp/verify", async (req, res) => {
  const parsed = z.object({ idToken: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Firebase idToken is required" });
  }

  try {
    const decoded = await verifyFirebaseIdToken(parsed.data.idToken);
    const email = normalizeEmail(decoded.email || "");
    if (!email) {
      return res.status(400).json({ error: "Firebase token has no email" });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const randomPassword = `${randomUUID()}-${Date.now()}-email-link`;
      const passwordHash = await hashPassword(randomPassword);
      user = await prisma.user.create({
        data: {
          username: usernameFromEmail(email),
          email,
          passwordHash,
          role: "USER",
          onboardingComplete: false,
          companyName: (decoded.name as string | undefined) || null,
        },
      });
      try {
        await ensureStarterSubscription(user.id);
      } catch (err) {
        console.log("Failed to create starter subscription for email OTP user:", err instanceof Error ? err.message : err);
      }
    }

    if (user.suspended) {
      auditAuthEvent("auth.email_otp.suspended", req, { email, userId: user.id });
      return res.status(403).json({ error: "Account disabled" });
    }

    recordLoginHistory(user.id, {
      email,
      method: "email_link",
      ip: getClientIp(req),
      device: getDeviceInfo(req),
      success: true,
    });
    auditAuthEvent("auth.email_otp.verify_success", req, { email, userId: user.id });

    return res.json({
      ...(await shapeAuthResponse({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })),
      onboardingRequired: !user.onboardingComplete,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditAuthEvent("auth.email_otp.verify_failed", req, { message });
    return res.status(401).json({ error: "Invalid or expired email OTP token" });
  }
});

authRouter.post("/complete-profile", requireAuth, async (req, res) => {
  const body = z
    .object({
      companyName: z.string().trim().min(1).max(120),
      address: z.string().trim().min(1).max(300),
      originCity: z.string().trim().min(1).max(80),
      contactNumber: z.string().trim().min(1).max(30),
      cnic: z.string().trim().max(15).nullable().optional(),
    })
    .parse(req.body);

  try {
    const userId = String((req as any).user.id);
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, contactNumber: true, cnic: true, companyName: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    const nextContact = normalizeNullable(body.contactNumber);
    const nextCnic = normalizeNullable(body.cnic);
    const currentContact = normalizeNullable(existing.contactNumber);
    const currentCnic = normalizeNullable(existing.cnic);

    if ((currentContact && currentContact !== nextContact) || (currentCnic && currentCnic !== nextCnic)) {
      return res.status(409).json({ error: immutableProfileMessage() });
    }

    const activeSubscription = await prisma.subscription.findFirst({
      where: { userId: existing.id, status: "ACTIVE" },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
    const planTier: "FREE" | "PAID" | "UNKNOWN" = activeSubscription
      ? Number(activeSubscription.plan.priceCents ?? 0) > 0
        ? "PAID"
        : "FREE"
      : "UNKNOWN";

    const { ipHash, deviceHash } = getRequestSignalHashes(req);

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        companyName: body.companyName,
        address: body.address,
        originCity: body.originCity,
        contactNumber: nextContact,
        cnic: nextCnic,
        onboardingComplete: true,
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    await persistAccountRiskSignals({
      userId,
      source: "COMPLETE_PROFILE",
      planTier,
      reqIpHash: ipHash,
      reqDeviceHash: deviceHash,
      companyName: body.companyName,
      contactNumber: nextContact,
      cnic: nextCnic,
    });

    return res.json({
      ...(await shapeAuthResponse(user)),
      onboardingRequired: false,
    });
  } catch (err) {
    const duplicateMessage = uniqueConstraintMessage(err);
    if (duplicateMessage) {
      const { ipHash, deviceHash } = getRequestSignalHashes(req);
      await persistAccountRiskSignals({
        userId: String((req as any).user?.id ?? "") || null,
        source: "COMPLETE_PROFILE_DUPLICATE_ATTEMPT",
        planTier: "UNKNOWN",
        reqIpHash: ipHash,
        reqDeviceHash: deviceHash,
        companyName: body.companyName,
        contactNumber: body.contactNumber,
        cnic: body.cnic,
      });
      return res.status(409).json({ error: duplicateMessage });
    }
    return res.status(500).json({ error: "Failed to complete profile" });
  }
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "currentPassword and newPassword (min 8 chars) are required" });
  }

  const userId = (req as any).user.id as string;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      auditAuthEvent("auth.change_password.bad_current", req, { userId, email: user.email });
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    auditAuthEvent("auth.change_password.success", req, { userId, email: user.email });

    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditAuthEvent("auth.change_password.error", req, { userId, message });
    return res.status(500).json({ error: "Failed to update password" });
  }
});

authRouter.post("/refresh", async (req, res) => {
  const body = z.object({ refreshToken: z.string().min(10) }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  try {
    const rotated = await rotateRefreshToken(body.data.refreshToken);
    if (!rotated) {
      auditAuthMetric(req, "login_failure", { method: "refresh", reason: "invalid_refresh_token" });
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const token = signAccessToken({ sub: rotated.userId, role: rotated.role });
    return res.json({ token, refreshToken: rotated.refreshToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditAuthMetric(req, "login_failure", { method: "refresh", reason: "refresh_error", message });
    return res.status(500).json({ error: "Failed to refresh session" });
  }
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : null;
  try {
    await revokeRefreshToken(refreshToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditAuthEvent("auth.logout.refresh_revoke_failed", req, { message });
  }

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
