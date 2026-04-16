import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { asAppRole, signAccessToken } from "../auth/jwt.js";

export const authRouter = Router();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

authRouter.post("/register", async (req, res) => {
  const body = z
    .object({
      email: z.string().trim().email(),
      password: z.string().min(8).max(200),
      companyName: z.string().max(120).nullable().optional(),
      address: z.string().max(300).nullable().optional(),
      contactNumber: z.string().max(30).nullable().optional(),
      originCity: z.string().max(80).nullable().optional(),
    })
    .parse(req.body);

  const email = normalizeEmail(body.email);
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
    const starterPlan =
      (await prisma.plan.findFirst({ where: { name: "Free Plan" } })) ??
      (await prisma.plan.create({ data: { name: "Free Plan", priceCents: 0, monthlyLabelLimit: 250, monthlyTrackingLimit: 250 } }));
    const now = new Date();
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + 15);
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: starterPlan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });
  } catch (err) {
    console.log("Failed to create subscription (database may not be ready):", err instanceof Error ? err.message : err);
  }

  const token = signAccessToken({ sub: user.id, role: asAppRole(user.role) });
  return res.json({ user, token });
});

authRouter.post("/login", async (req, res) => {
  const body = z
    .object({
      email: z.string().trim().email(),
      password: z.string().min(1),
    })
    .parse(req.body);

  const email = normalizeEmail(body.email);
  console.log(`[AUTH] Login attempt for email: ${email}`);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`[AUTH] Login failed: User not found for email: ${email}`);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (user.suspended) {
    console.log(`[AUTH] Login failed: Suspended account for email: ${email}`);
    return res.status(403).json({ error: "Account disabled" });
  }

  console.log(`[AUTH] User found for email: ${email}. Verifying password...`);
  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    console.log(`[AUTH] Login failed: Invalid password for email: ${email}`);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  console.log(`[AUTH] Login successful for email: ${email}`);
  const token = signAccessToken({ sub: user.id, role: asAppRole(user.role) });
  return res.json({
    user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
    token,
  });
});
