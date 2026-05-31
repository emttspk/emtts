import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { env } from "../config.js";
import {
  getAggregatorResultRoutePath,
  processAggregatorJazzcashCallback,
  renderAggregatorJazzcashRelay,
} from "../services/aggregatorPaymentGatewayService.js";
import { aggregatorGatewayJazzcashCallbackSchema } from "../utils/aggregatorBookingValidation.js";

export const aggregatorPaymentsRouter = Router();

function stripTrailingSlashes(value: string) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function getFrontendBase() {
  return stripTrailingSlashes(String(env.FRONTEND_URL ?? env.WEB_ORIGIN ?? ""));
}

function buildFrontendResultUrl(params: { orderRef: string; status: string; message?: string }) {
  const routePath = getAggregatorResultRoutePath();
  const frontendBase = getFrontendBase();
  const target = frontendBase ? `${frontendBase}${routePath}` : routePath;
  const url = new URL(target, frontendBase || "http://localhost");
  url.searchParams.set("orderRef", params.orderRef);
  url.searchParams.set("status", params.status);
  if (params.message) {
    url.searchParams.set("message", params.message.slice(0, 180));
  }
  return frontendBase ? url.toString() : `${url.pathname}${url.search}`;
}

aggregatorPaymentsRouter.get("/jazzcash/relay", async (req, res) => {
  try {
    const orderRef = String(req.query.orderRef ?? "").trim();
    const token = String(req.query.token ?? "").trim();
    const html = await renderAggregatorJazzcashRelay({ orderRef, token });
    return res.type("html").send(html);
  } catch (error) {
    const orderRef = String(req.query.orderRef ?? "unknown").trim() || "unknown";
    const redirectUrl = buildFrontendResultUrl({
      orderRef,
      status: "AGGREGATOR_GATEWAY_FAILED",
      message: error instanceof Error ? error.message : "Failed to load payment relay",
    });
    return res.redirect(302, redirectUrl);
  }
});

async function handleAggregatorJazzcashCallback(req: Request, res: Response) {
  try {
    const rawPayload = (req.method === "POST" ? req.body : req.query) as Record<string, unknown>;
    const payload = aggregatorGatewayJazzcashCallbackSchema.parse(rawPayload);
    const result = await processAggregatorJazzcashCallback(payload);

    if (req.method === "POST") {
      return res.status(200).json({
        success: true,
        acknowledged: true,
        duplicate: result.duplicate,
        orderRef: result.orderRef,
        status: result.status,
      });
    }

    return res.redirect(302, result.redirectUrl);
  } catch (error) {
    if (req.method === "POST") {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: "Invalid callback payload", details: error.errors });
      }
      return res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Callback processing failed" });
    }

    const orderRef = String(req.query.orderRef ?? req.query.pp_TxnRefNo ?? "unknown").trim() || "unknown";
    const redirectUrl = buildFrontendResultUrl({
      orderRef,
      status: "AGGREGATOR_GATEWAY_FAILED",
      message: error instanceof Error ? error.message : "Callback processing failed",
    });
    return res.redirect(302, redirectUrl);
  }
}

aggregatorPaymentsRouter.get("/jazzcash/callback", handleAggregatorJazzcashCallback);
aggregatorPaymentsRouter.post("/jazzcash/callback", handleAggregatorJazzcashCallback);

aggregatorPaymentsRouter.get("/jazzcash/result", (req, res) => {
  const orderRef = String(req.query.orderRef ?? req.query.pp_TxnRefNo ?? "unknown").trim() || "unknown";
  const status = String(req.query.status ?? "AGGREGATOR_GATEWAY_PENDING").trim() || "AGGREGATOR_GATEWAY_PENDING";
  const message = String(req.query.message ?? "").trim();
  const target = buildFrontendResultUrl({ orderRef, status, message: message || undefined });
  return res.redirect(302, target);
});
