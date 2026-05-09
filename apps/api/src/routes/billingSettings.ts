import { Router } from "express";
import fs from "node:fs";
import { getOrCreateBillingSettings } from "../services/billing-settings.service.js";
import { resolveStoredPath } from "../storage/paths.js";

export const billingSettingsRouter = Router();

function buildAbsoluteApiUrl(req: any, relativePath: string) {
  const xfProto = String(req.header("x-forwarded-proto") ?? "").split(",")[0].trim();
  const proto = xfProto || req.protocol || "https";
  const host = String(req.header("x-forwarded-host") ?? req.get("host") ?? "").trim();
  if (!host) return relativePath;
  return `${proto}://${host}${relativePath}`;
}

billingSettingsRouter.get("/", async (req, res) => {
  const settings = await getOrCreateBillingSettings();
  const jazzcashQrExists = Boolean(settings.jazzcashQrPath && fs.existsSync(resolveStoredPath(settings.jazzcashQrPath)));
  const easypaisaQrExists = Boolean(settings.easypaisaQrPath && fs.existsSync(resolveStoredPath(settings.easypaisaQrPath)));
  const bankQrExists = Boolean(settings.bankQrPath && fs.existsSync(resolveStoredPath(settings.bankQrPath)));
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const version = settings.updatedAt.toISOString();
  res.json({
    settings: {
      jazzcashNumber: settings.jazzcashNumber,
      jazzcashTitle: settings.jazzcashTitle,
      jazzcashQrUrl: jazzcashQrExists ? buildAbsoluteApiUrl(req, "/api/manual-payments/wallet-qr/jazzcash") : null,
      jazzcashQrVersion: jazzcashQrExists ? version : null,
      easypaisaNumber: settings.easypaisaNumber,
      easypaisaTitle: settings.easypaisaTitle,
      easypaisaQrUrl: easypaisaQrExists ? buildAbsoluteApiUrl(req, "/api/manual-payments/wallet-qr/easypaisa") : null,
      easypaisaQrVersion: easypaisaQrExists ? version : null,
      bankName: settings.bankName,
      bankTitle: settings.bankTitle,
      bankAccountNumber: settings.bankAccountNumber,
      bankIban: settings.bankIban,
      bankQrUrl: bankQrExists ? buildAbsoluteApiUrl(req, "/api/manual-payments/wallet-qr/bank-transfer") : null,
      bankQrVersion: bankQrExists ? version : null,
      standardPrice: settings.standardPrice,
      businessPrice: settings.businessPrice,
    },
  });
});
