import { Router } from "express";
import { getOrCreateBillingSettings } from "../services/billing-settings.service.js";

export const billingSettingsRouter = Router();

billingSettingsRouter.get("/", async (_req, res) => {
  const settings = await getOrCreateBillingSettings();
  res.json({
    settings: {
      jazzcashNumber: settings.jazzcashNumber,
      jazzcashTitle: settings.jazzcashTitle,
      jazzcashQrUrl: settings.jazzcashQrPath ? "/api/manual-payments/wallet-qr/jazzcash" : null,
      easypaisaNumber: settings.easypaisaNumber,
      easypaisaTitle: settings.easypaisaTitle,
      easypaisaQrUrl: settings.easypaisaQrPath ? "/api/manual-payments/wallet-qr/easypaisa" : null,
      standardPrice: settings.standardPrice,
      businessPrice: settings.businessPrice,
    },
  });
});
