type AnalyticsValue = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsValue | null | undefined>;

const GA_MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();
const META_PIXEL_ID = String(import.meta.env.VITE_META_PIXEL_ID ?? "").trim();

const SAFE_PARAM_KEYS = new Set([
  "source",
  "plan_name",
  "row_count",
  "status",
  "feature",
  "method",
  "path",
  "count",
]);

let initialized = false;

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

export function initializeAnalytics() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

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

  if (window.gtag) {
    window.gtag("event", eventName, safeParams);
  }

  if (window.fbq) {
    window.fbq("trackCustom", eventName, safeParams);
  }
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
}

export function trackLeadStart(source: string) {
  trackEvent("lead_start", { source });
}

export function trackRegistrationComplete(method: string) {
  trackEvent("registration_complete", { method });
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

export function trackPaymentSuccess(planName: string) {
  trackEvent("payment_success", { plan_name: planName });
}
