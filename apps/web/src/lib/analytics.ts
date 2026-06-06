import { apiUrl } from "./api";
import { getToken } from "./auth";

type AnalyticsValue = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsValue | null | undefined>;

const GA_MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();
const META_PIXEL_ID = String(import.meta.env.VITE_META_PIXEL_ID ?? "").trim();

const SAFE_PARAM_KEYS = new Set([
  "source",
  "plan_name",
  "amount",
  "currency",
  "value",
  "row_count",
  "status",
  "feature",
  "method",
  "path",
  "count",
]);

let initialized = false;
const ONE_TIME_EVENT_PREFIX = "labelgen_analytics_once:";
const ANALYTICS_SESSION_KEY = "labelgen_analytics_session:v1";
const ANALYTICS_ATTRIBUTION_KEY = "labelgen_analytics_attribution:v1";
const INTERNAL_ANALYTICS_ENDPOINT = apiUrl("/api/analytics/collect");
let fallbackSessionId = "";
let fallbackAttributionSnapshot: AttributionContext | null = null;

type AttributionContext = {
  sessionId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  referrer: string;
  landingPath: string;
  capturedAt: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

function injectScript(id: string, src: string) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function sanitizeParams(params?: AnalyticsParams): Record<string, AnalyticsValue> {
  const safe: Record<string, AnalyticsValue> = {};
  if (!params) return safe;

  for (const [key, raw] of Object.entries(params)) {
    if (!SAFE_PARAM_KEYS.has(key)) continue;
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string") {
      const value = raw.trim();
      if (!value) continue;
      safe[key] = value.slice(0, 120);
      continue;
    }
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) continue;
      safe[key] = raw;
      continue;
    }
    if (typeof raw === "boolean") {
      safe[key] = raw;
    }
  }

  return safe;
}

function markOneTimeAccountEvent(eventKey: string, accountId: string): boolean {
  if (typeof window === "undefined") return false;
  const safeAccountId = String(accountId || "").trim();
  if (!safeAccountId) return false;
  const storageKey = `${ONE_TIME_EVENT_PREFIX}${eventKey}:${safeAccountId}`;
  if (window.localStorage.getItem(storageKey)) return false;
  window.localStorage.setItem(storageKey, "1");
  return true;
}

function getStorageSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY);
    if (existing) return existing;
    const sessionId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, sessionId);
    return sessionId;
  } catch {
    if (!fallbackSessionId) {
      fallbackSessionId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
    return fallbackSessionId;
  }
}

function getSessionStorageSnapshot(): AttributionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ANALYTICS_ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AttributionContext> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      sessionId: String(parsed.sessionId ?? "").trim(),
      utmSource: String(parsed.utmSource ?? "").trim(),
      utmMedium: String(parsed.utmMedium ?? "").trim(),
      utmCampaign: String(parsed.utmCampaign ?? "").trim(),
      referrer: String(parsed.referrer ?? "").trim(),
      landingPath: String(parsed.landingPath ?? "").trim(),
      capturedAt: String(parsed.capturedAt ?? "").trim(),
    };
  } catch {
    return fallbackAttributionSnapshot;
  }
}

function setSessionStorageSnapshot(snapshot: AttributionContext) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ANALYTICS_ATTRIBUTION_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures and continue with best-effort reporting.
  }
  fallbackAttributionSnapshot = snapshot;
}

function normalizeText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 120) : "";
}

function normalizeReferrer(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.slice(0, 240);
  } catch {
    return raw.slice(0, 240);
  }
}

function buildAttributionSnapshot(): AttributionContext {
  if (typeof window === "undefined") {
    return {
      sessionId: "",
      utmSource: "",
      utmMedium: "",
      utmCampaign: "",
      referrer: "",
      landingPath: "",
      capturedAt: new Date().toISOString(),
    };
  }

  const existing = getSessionStorageSnapshot();
  if (existing?.sessionId) return existing;

  const params = new URLSearchParams(window.location.search);
  const referrer = normalizeReferrer(document.referrer);
  const referrerHost = referrer ? (() => {
    try {
      return new URL(document.referrer).hostname.replace(/^www\./i, "");
    } catch {
      return "";
    }
  })() : "";
  const snapshot: AttributionContext = {
    sessionId: getStorageSessionId(),
    utmSource: normalizeText(params.get("utm_source")) || referrerHost || "direct",
    utmMedium: normalizeText(params.get("utm_medium")) || (referrerHost ? "referral" : "direct"),
    utmCampaign: normalizeText(params.get("utm_campaign")),
    referrer,
    landingPath: String(window.location.pathname || "/").slice(0, 240),
    capturedAt: new Date().toISOString(),
  };
  setSessionStorageSnapshot(snapshot);
  return snapshot;
}

function getAttributionSnapshot() {
  return buildAttributionSnapshot();
}

function toCents(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

function queueInternalAnalyticsEvent(eventName: string, params: AnalyticsParams, pagePath: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/admin")) return;

  const attribution = getAttributionSnapshot();
  const sanitizedPath = String(pagePath || "")
    .split("#")[0]
    .split("?")[0]
    .slice(0, 240);
  const payload = {
    eventName,
    sessionId: attribution.sessionId,
    path: sanitizedPath,
    landingPath: attribution.landingPath || sanitizedPath,
    utmSource: attribution.utmSource || null,
    utmMedium: attribution.utmMedium || null,
    utmCampaign: attribution.utmCampaign || null,
    referrer: attribution.referrer || null,
    source: typeof params.source === "string" ? params.source.slice(0, 120) : null,
    planName: typeof params.plan_name === "string" ? params.plan_name.slice(0, 120) : null,
    amountCents: toCents(params.amount ?? params.value),
    valueCents: toCents(params.value ?? params.amount),
    method: typeof params.method === "string" ? params.method.slice(0, 120) : null,
    status: typeof params.status === "string" ? params.status.slice(0, 120) : null,
    feature: typeof params.feature === "string" ? params.feature.slice(0, 120) : null,
    count: typeof params.count === "number" ? Math.max(0, Math.floor(params.count)) : null,
    currency: typeof params.currency === "string" ? params.currency.slice(0, 12).toUpperCase() : null,
  };

  const body = JSON.stringify(payload);
  try {
    const token = getToken();
    const headers = token ? { authorization: `Bearer ${token}` } : undefined;
    if (!token && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(
        INTERNAL_ANALYTICS_ENDPOINT,
        new Blob([body], { type: "application/json" }),
      );
      if (ok) return;
    }

    void fetch(INTERNAL_ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(headers ?? {}),
      },
      body,
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never block the UI on reporting.
  }
}

export function initializeAnalytics() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  getAttributionSnapshot();

  if (GA_MEASUREMENT_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer?.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
    injectScript("epost-ga4", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`);
  }

  if (META_PIXEL_ID) {
    window.fbq =
      window.fbq ||
      function fbq(...args: unknown[]) {
        (window.fbq as { queue?: unknown[] }).queue = (window.fbq as { queue?: unknown[] }).queue || [];
        (window.fbq as { queue?: unknown[] }).queue?.push(args);
      };
    window._fbq = window.fbq;
    (window.fbq as { loaded?: boolean; version?: string }).loaded = true;
    (window.fbq as { loaded?: boolean; version?: string }).version = "2.0";
    injectScript("epost-meta-pixel", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", META_PIXEL_ID);
  }
}

export function trackEvent(name: string, params?: AnalyticsParams) {
  if (typeof window === "undefined") return;
  const eventName = String(name || "").trim();
  if (!eventName) return;
  const safeParams = sanitizeParams(params);
  const pagePath = `${window.location.pathname}${window.location.search}`.slice(0, 240);

  if (window.gtag) {
    window.gtag("event", eventName, safeParams);
  }

  if (window.fbq) {
    window.fbq("trackCustom", eventName, safeParams);
  }

  queueInternalAnalyticsEvent(eventName, safeParams, pagePath);
}

export function trackPageView(path: string) {
  const safePath = String(path || "").slice(0, 240);
  const pageLocation = typeof window !== "undefined" ? window.location.href.slice(0, 240) : safePath;
  const pageTitle = typeof document !== "undefined" ? document.title.slice(0, 120) : "";
  if (window.gtag) {
    window.gtag("event", "page_view", {
      page_path: safePath,
      page_location: pageLocation,
      page_title: pageTitle,
    });
  }
  if (window.fbq) {
    window.fbq("track", "PageView");
  }
  queueInternalAnalyticsEvent("page_view", {}, safePath);
}

export function trackLeadStart(source: string) {
  trackEvent("lead_start", { source });
}

export function trackRegistrationComplete(method: string) {
  trackEvent("registration_complete", { method });
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", "CompleteRegistration");
  }
}

export function trackWhatsAppClick(source: string) {
  trackEvent("whatsapp_demo_click", { source });
}

export function trackTrackingSearch(count: number) {
  trackEvent("tracking_search", { count: Math.max(0, Math.min(5, Number(count) || 0)) });
}

export function trackLabelJobStart(rowCount: number) {
  trackEvent("label_generation_start", { count: Math.max(0, Number(rowCount) || 0) });
}

export function trackLabelJobSuccess(rowCount: number) {
  trackEvent("label_generation_success", { count: Math.max(0, Number(rowCount) || 0) });
}

export function trackFileUpload(source: string) {
  trackEvent("file_upload", { source, count: 1 });
}

export function trackPackageSelect(planName: string) {
  trackEvent("package_select", { plan_name: planName });
}

export function trackPaymentStart(planName: string) {
  trackEvent("payment_start", { plan_name: planName });
}

export function trackLogin(method: string) {
  trackEvent("login", { method });
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", "Login");
  }
}

export function trackPaymentSuccess(planName: string, amountCents: number, currency: string) {
  const safeAmountCents = Math.max(0, Number(amountCents) || 0);
  const safeCurrency = String(currency || "PKR").trim().toUpperCase() || "PKR";
  const amount = safeAmountCents / 100;
  trackEvent("payment_success", { plan_name: planName, amount, value: amount, currency: safeCurrency });
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", "Purchase", { plan_name: planName, value: amount, currency: safeCurrency });
  }
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", "purchase", { plan_name: planName, amount, value: amount, currency: safeCurrency });
  }
}

export function trackFirstLabelGenerated(accountId: string, rowCount: number) {
  if (!markOneTimeAccountEvent("first_label_generated", accountId)) return;
  trackEvent("first_label_generated", { count: Math.max(0, Number(rowCount) || 0) });
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("trackCustom", "FirstLabelGenerated", { count: Math.max(0, Number(rowCount) || 0) });
  }
}

export function trackSubscriptionUpgrade(accountId: string, planName: string, amountCents: number, currency: string) {
  if (!markOneTimeAccountEvent("subscription_upgrade", accountId)) return;
  const safeAmountCents = Math.max(0, Number(amountCents) || 0);
  const safeCurrency = String(currency || "PKR").trim().toUpperCase() || "PKR";
  const amount = safeAmountCents / 100;
  trackEvent("subscription_upgrade", { plan_name: planName, amount, value: amount, currency: safeCurrency });
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("trackCustom", "SubscriptionUpgrade", { plan_name: planName, value: amount, currency: safeCurrency });
  }
}

export function trackMoneyOrderGenerated(rowCount: number) {
  const safeCount = Math.max(0, Number(rowCount) || 0);
  trackEvent("money_order_generated", { count: safeCount });
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("trackCustom", "MoneyOrderGenerated", { count: safeCount });
  }
}

export function trackSupportTicketCreated() {
  trackEvent("support_ticket_created", { count: 1 });
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("trackCustom", "SupportTicketCreated", { count: 1 });
  }
}
