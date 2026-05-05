import { Router } from "express";
import { getOrCreateBillingSettings } from "../services/billing-settings.service.js";

export const billingSettingsRouter = Router();

billingSettingsRouter.get("/", async (_req, res) => {
  const settings = await getOrCreateBillingSettings();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const version = settings.updatedAt.toISOString();
  res.json({
    settings: {
      jazzcashNumber: settings.jazzcashNumber,
      jazzcashTitle: settings.jazzcashTitle,
      jazzcashQrUrl: settings.jazzcashQrPath ? "/api/manual-payments/wallet-qr/jazzcash" : null,
      jazzcashQrVersion: settings.jazzcashQrPath ? version : null,
      easypaisaNumber: settings.easypaisaNumber,
      easypaisaTitle: settings.easypaisaTitle,
      easypaisaQrUrl: settings.easypaisaQrPath ? "/api/manual-payments/wallet-qr/easypaisa" : null,
      easypaisaQrVersion: settings.easypaisaQrPath ? version : null,
      standardPrice: settings.standardPrice,
      businessPrice: settings.businessPrice,
    },
  });
});
