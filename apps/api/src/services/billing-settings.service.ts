import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const BILLING_SETTINGS_ID = 1;

type DbClient = PrismaClient | Prisma.TransactionClient;

type BillingSettingsShape = {
  jazzcashNumber: string;
  jazzcashTitle: string;
  jazzcashQrPath: string | null;
  easypaisaNumber: string;
  easypaisaTitle: string;
  easypaisaQrPath: string | null;
  bankName: string | null;
  bankTitle: string | null;
  bankAccountNumber: string | null;
  bankIban: string | null;
  bankQrPath: string | null;
  standardPrice: number;
  businessPrice: number;
};

async function findPlanByName(client: DbClient, name: string) {
  return client.plan.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
}

async function deriveDefaultPrices(client: DbClient) {
  const [standard, business] = await Promise.all([
    findPlanByName(client, "Standard Plan"),
    findPlanByName(client, "Business Plan"),
  ]);

  return {
    standardPrice: standard?.priceCents ?? 99900,
    businessPrice: business?.priceCents ?? 250000,
  };
}

export async function getOrCreateBillingSettings(client: DbClient = prisma) {
  const existing = await client.billingSettings.findUnique({ where: { id: BILLING_SETTINGS_ID } });
  if (existing) return existing;

  const defaults = await deriveDefaultPrices(client);
  return client.billingSettings.create({
    data: {
      id: BILLING_SETTINGS_ID,
      jazzcashNumber: process.env.JAZZCASH_MERCHANT_ACCOUNT ?? "03xxxxxxxxx",
      jazzcashTitle: process.env.JAZZCASH_MERCHANT_NAME ?? "ePost Pakistan",
      jazzcashQrPath: null,
      easypaisaNumber: process.env.EASYPAISA_MERCHANT_ACCOUNT ?? "03xxxxxxxxx",
      easypaisaTitle: process.env.EASYPAISA_MERCHANT_NAME ?? "ePost Pakistan",
      easypaisaQrPath: null,
      bankName: null,
      bankTitle: null,
      bankAccountNumber: null,
      bankIban: null,
      bankQrPath: null,
      standardPrice: defaults.standardPrice,
      businessPrice: defaults.businessPrice,
    },
  });
}

export function resolveConfiguredPlanPrice(planName: string, fallbackPrice: number, settings: BillingSettingsShape) {
  const normalized = planName.trim().toLowerCase();
  if (normalized === "standard plan") return settings.standardPrice;
  if (normalized === "business plan") return settings.businessPrice;
  return fallbackPrice;
}

export async function syncConfiguredPlanPrices(settings: BillingSettingsShape, client: DbClient = prisma) {
  const [standard, business] = await Promise.all([
    findPlanByName(client, "Standard Plan"),
    findPlanByName(client, "Business Plan"),
  ]);

  if (standard) {
    await client.plan.update({ where: { id: standard.id }, data: { priceCents: settings.standardPrice } });
  }
  if (business) {
    await client.plan.update({ where: { id: business.id }, data: { priceCents: settings.businessPrice } });
  }
}
