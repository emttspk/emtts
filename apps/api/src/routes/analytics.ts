import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { verifyAccessToken } from "../auth/jwt.js";
import { isAccessJwtRevoked } from "../auth/security.js";

export const analyticsRouter = Router();

const eventInputSchema = z.object({
  eventName: z.string().trim().min(1).max(80),
  sessionId: z.string().trim().min(1).max(80),
  path: z.string().trim().max(240).optional().nullable(),
  landingPath: z.string().trim().max(240).optional().nullable(),
  utmSource: z.string().trim().max(120).optional().nullable(),
  utmMedium: z.string().trim().max(120).optional().nullable(),
  utmCampaign: z.string().trim().max(120).optional().nullable(),
  referrer: z.string().trim().max(240).optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  planName: z.string().trim().max(120).optional().nullable(),
  method: z.string().trim().max(120).optional().nullable(),
  status: z.string().trim().max(120).optional().nullable(),
  feature: z.string().trim().max(120).optional().nullable(),
  amountCents: z.number().int().min(0).optional().nullable(),
  valueCents: z.number().int().min(0).optional().nullable(),
  count: z.number().int().min(0).optional().nullable(),
  currency: z.string().trim().max(12).optional().nullable(),
});

function resolveOptionalUser(req: AuthedRequest) {
  const header = req.header("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const queryToken = typeof req.query?.token === "string" ? req.query.token : null;
  const token = bearer ?? queryToken;
  if (!token) return null;
  try {
    if (isAccessJwtRevoked(token)) return null;
    const claims = verifyAccessToken(token);
    return claims.sub;
  } catch {
    return null;
  }
}

function toInt(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : null;
}

function ratio(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

analyticsRouter.post("/collect", async (req: AuthedRequest, res) => {
  const parsed = eventInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid analytics event payload" });
  }

  const payload = parsed.data;
  const userId = resolveOptionalUser(req);

  try {
    await prisma.analyticsEvent.create({
      data: {
        sessionId: payload.sessionId,
        userId,
        eventName: payload.eventName,
        path: payload.path ?? null,
        landingPath: payload.landingPath ?? null,
        source: payload.source ?? null,
        utmSource: payload.utmSource ?? null,
        utmMedium: payload.utmMedium ?? null,
        utmCampaign: payload.utmCampaign ?? null,
        referrer: payload.referrer ?? null,
        planName: payload.planName ?? null,
        method: payload.method ?? null,
        status: payload.status ?? null,
        feature: payload.feature ?? null,
        amountCents: toInt(payload.amountCents),
        valueCents: toInt(payload.valueCents),
        count: toInt(payload.count),
        currency: payload.currency ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record analytics event";
    return res.status(500).json({ success: false, message });
  }

  return res.json({ success: true });
});

analyticsRouter.get("/report", requireAuth, requireAdmin, async (_req, res) => {
  const [summaryRows, sourceRows, campaignRows, landingRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      registrations: number;
      logins: number;
      firstLabels: number;
      purchases: number;
      pageViews: number;
    }>>`
      SELECT
        COUNT(*) FILTER (WHERE "eventName" = 'registration_complete')::int AS registrations,
        COUNT(*) FILTER (WHERE "eventName" = 'login')::int AS logins,
        COUNT(*) FILTER (WHERE "eventName" = 'first_label_generated')::int AS firstLabels,
        COUNT(*) FILTER (WHERE "eventName" = 'purchase')::int AS purchases,
        COUNT(*) FILTER (WHERE "eventName" = 'page_view')::int AS pageViews
      FROM "AnalyticsEvent"
    `,
    prisma.$queryRaw<Array<{
      source: string;
      medium: string;
      registrations: number;
      logins: number;
      firstLabels: number;
      purchases: number;
      sessions: number;
    }>>`
      SELECT
        COALESCE(NULLIF("utmSource", ''), 'direct') AS source,
        COALESCE(NULLIF("utmMedium", ''), 'direct') AS medium,
        COUNT(DISTINCT CASE WHEN "eventName" = 'registration_complete' THEN "sessionId" END)::int AS registrations,
        COUNT(DISTINCT CASE WHEN "eventName" = 'login' THEN "sessionId" END)::int AS logins,
        COUNT(DISTINCT CASE WHEN "eventName" = 'first_label_generated' THEN "sessionId" END)::int AS firstLabels,
        COUNT(DISTINCT CASE WHEN "eventName" = 'purchase' THEN "sessionId" END)::int AS purchases,
        COUNT(DISTINCT "sessionId")::int AS sessions
      FROM "AnalyticsEvent"
      GROUP BY 1, 2
      ORDER BY purchases DESC, registrations DESC, sessions DESC
      LIMIT 10
    `,
    prisma.$queryRaw<Array<{
      campaign: string;
      source: string;
      registrations: number;
      logins: number;
      firstLabels: number;
      purchases: number;
      sessions: number;
    }>>`
      SELECT
        COALESCE(NULLIF("utmCampaign", ''), 'organic') AS campaign,
        COALESCE(NULLIF("utmSource", ''), 'direct') AS source,
        COUNT(DISTINCT CASE WHEN "eventName" = 'registration_complete' THEN "sessionId" END)::int AS registrations,
        COUNT(DISTINCT CASE WHEN "eventName" = 'login' THEN "sessionId" END)::int AS logins,
        COUNT(DISTINCT CASE WHEN "eventName" = 'first_label_generated' THEN "sessionId" END)::int AS firstLabels,
        COUNT(DISTINCT CASE WHEN "eventName" = 'purchase' THEN "sessionId" END)::int AS purchases,
        COUNT(DISTINCT "sessionId")::int AS sessions
      FROM "AnalyticsEvent"
      GROUP BY 1, 2
      ORDER BY purchases DESC, registrations DESC, sessions DESC
      LIMIT 10
    `,
    prisma.$queryRaw<Array<{
      landingPath: string;
      sessions: number;
      registrations: number;
      logins: number;
      firstLabels: number;
      purchases: number;
    }>>`
      SELECT
        COALESCE(NULLIF("landingPath", ''), '/') AS "landingPath",
        COUNT(DISTINCT "sessionId")::int AS sessions,
        COUNT(DISTINCT CASE WHEN "eventName" = 'registration_complete' THEN "sessionId" END)::int AS registrations,
        COUNT(DISTINCT CASE WHEN "eventName" = 'login' THEN "sessionId" END)::int AS logins,
        COUNT(DISTINCT CASE WHEN "eventName" = 'first_label_generated' THEN "sessionId" END)::int AS firstLabels,
        COUNT(DISTINCT CASE WHEN "eventName" = 'purchase' THEN "sessionId" END)::int AS purchases
      FROM "AnalyticsEvent"
      GROUP BY 1
      ORDER BY sessions DESC, registrations DESC, purchases DESC
      LIMIT 10
    `,
  ]);

  const summary = summaryRows[0] ?? { registrations: 0, logins: 0, firstLabels: 0, purchases: 0, pageViews: 0 };
  const registrations = Number(summary.registrations ?? 0);
  const logins = Number(summary.logins ?? 0);
  const firstLabels = Number(summary.firstLabels ?? 0);
  const purchases = Number(summary.purchases ?? 0);

  return res.json({
    summary: {
      registrations,
      logins,
      firstLabels,
      purchases,
      pageViews: Number(summary.pageViews ?? 0),
      conversionRates: {
        registrationToLogin: ratio(logins, registrations),
        loginToFirstLabel: ratio(firstLabels, logins),
        firstLabelToPurchase: ratio(purchases, firstLabels),
        registrationToPurchase: ratio(purchases, registrations),
      },
    },
    sourcePerformance: sourceRows.map((row) => ({
      source: row.source,
      medium: row.medium,
      sessions: Number(row.sessions ?? 0),
      registrations: Number(row.registrations ?? 0),
      logins: Number(row.logins ?? 0),
      firstLabels: Number(row.firstLabels ?? 0),
      purchases: Number(row.purchases ?? 0),
      registrationToPurchase: ratio(Number(row.purchases ?? 0), Number(row.registrations ?? 0)),
    })),
    campaignPerformance: campaignRows.map((row) => ({
      campaign: row.campaign,
      source: row.source,
      sessions: Number(row.sessions ?? 0),
      registrations: Number(row.registrations ?? 0),
      logins: Number(row.logins ?? 0),
      firstLabels: Number(row.firstLabels ?? 0),
      purchases: Number(row.purchases ?? 0),
      registrationToPurchase: ratio(Number(row.purchases ?? 0), Number(row.registrations ?? 0)),
    })),
    topLandingPages: landingRows.map((row) => ({
      landingPath: row.landingPath,
      sessions: Number(row.sessions ?? 0),
      registrations: Number(row.registrations ?? 0),
      logins: Number(row.logins ?? 0),
      firstLabels: Number(row.firstLabels ?? 0),
      purchases: Number(row.purchases ?? 0),
      registrationToPurchase: ratio(Number(row.purchases ?? 0), Number(row.registrations ?? 0)),
    })),
    updatedAt: new Date().toISOString(),
  });
});
