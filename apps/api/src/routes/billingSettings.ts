import { Router } from "express";
import fs from "node:fs";
import { getOrCreateBillingSettings } from "../services/billing-settings.service.js";
import { resolveStoredPath } from "../storage/paths.js";

export const billingSettingsRouter = Router();

billingSettingsRouter.get("/", async (_req, res) => {
  const settings = await getOrCreateBillingSettings();
  const jazzcashQrExists = Boolean(settings.jazzcashQrPath && fs.existsSync(resolveStoredPath(settings.jazzcashQrPath)));
  const easypaisaQrExists = Boolean(settings.easypaisaQrPath && fs.existsSync(resolveStoredPath(settings.easypaisaQrPath)));
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const version = settings.updatedAt.toISOString();
  res.json({
    settings: {
      jazzcashNumber: settings.jazzcashNumber,
      jazzcashTitle: settings.jazzcashTitle,
      jazzcashQrUrl: jazzcashQrExists ? "/api/manual-payments/wallet-qr/jazzcash" : null,
      jazzcashQrVersion: jazzcashQrExists ? version : null,
      easypaisaNumber: settings.easypaisaNumber,
      easypaisaTitle: settings.easypaisaTitle,
      easypaisaQrUrl: easypaisaQrExists ? "/api/manual-payments/wallet-qr/easypaisa" : null,
      easypaisaQrVersion: easypaisaQrExists ? version : null,
      standardPrice: settings.standardPrice,
      businessPrice: settings.businessPrice,
    },
  });
});
