import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Clock, MapPin, MessageSquare, RefreshCw, Search, Truck } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import type { TrackingLifecycle } from "../lib/types";
import {
  buildTrackingWhatsAppShareUrl,
  getStatusDisplayColor,
  getStatusIconName,
  resolveTrackingPresentation,
} from "../lib/trackingData";

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  "";

function resolveApiBase() {
  if (typeof window === "undefined") return API_BASE;
  const host = window.location.hostname;
  const local = /^(localhost|127\.0\.0\.1)$/i.test(host);
  if (!API_BASE) return local ? "http://127.0.0.1:3000" : "";
  const envLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE);
  if (!local && envLocal) return "";
  return API_BASE;
}

type TrackingEvent = {
  date: string;
  time: string;
  location: string;
  description: string;
};

type TrackingResult = {
  success: boolean;
  degraded?: boolean;
  warning?: string;
  tracking_number: string;
  status: string;
  current_status: string;
  booking_office?: string | null;
  delivery_office?: string | null;
  consignee_name?: string | null;
  consignee_address?: string | null;
  origin?: string | null;
  destination?: string | null;
  current_location?: string | null;
  estimated_delivery?: string | null;
  delivery_progress?: number;
  lifecycle?: TrackingLifecycle | null;
  history?: TrackingEvent[];
  events: TrackingEvent[];
  meta?: Record<string, unknown> | null;
  error?: string;
};

type TrackingCollectionResponse = {
  success: boolean;
  count: number;
  results: TrackingResult[];
};

function normalizeTrackingIds(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).slice(0, 5);
}

function statusColor(status: string) {
  return getStatusDisplayColor(status);
}

function statusIcon(status: string) {
  const name = getStatusIconName(status);
  if (name === "check_circle") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (name === "alert_circle") return <AlertCircle className="h-5 w-5 text-red-500" />;
  if (name === "truck") return <Truck className="h-5 w-5 text-purple-500" />;
  if (name === "map_pin") return <MapPin className="h-5 w-5 text-sky-500" />;
  return <Clock className="h-5 w-5 text-amber-500" />;
}

function TrackingResultCard({ result }: { result: TrackingResult }) {
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const presentation = resolveTrackingPresentation(result.status, result.history ?? result.events ?? [], result.delivery_progress, result.lifecycle);
  // Ascending chronology: oldest at top, latest at bottom
  const timeline = presentation.timeline;
  const progress = presentation.progress;
  const activeStage = presentation.activeStage;
  const currentLocation = result.current_location || presentation.latestEvent?.location || "-";
  const showMoSection = presentation.showMoneyOrderPanel;
  const moNumber = presentation.moneyOrderNumber;
  const moStatusLabel = presentation.moneyOrderStatusLabel;
  const whatsappShareUrl = buildTrackingWhatsAppShareUrl({
    trackingNumber: result.tracking_number,
    displayStatus: presentation.displayStatus,
    origin: result.origin || result.booking_office,
    destination: result.destination || result.delivery_office,
    currentLocation,
    latestEvent: presentation.latestEvent,
    phone: waPhone,
  });

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Tracking Result</h2>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-600">Tracking ID: {result.tracking_number}</p>
          {result.consignee_name ? (
            <p className="mt-2 text-sm text-slate-500">
              Consignee: <span className="font-semibold text-slate-700">{result.consignee_name}</span>
            </p>
          ) : null}
          {result.consignee_address ? <p className="mt-1 text-xs text-slate-500">{result.consignee_address}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setWaPhone(""); setWaModalOpen(true); }}
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            <MessageSquare className="h-4 w-4" />
            WhatsApp
          </button>
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${statusColor(presentation.displayStatus)}`}>
            {statusIcon(presentation.displayStatus)}
            {presentation.displayStatus}
          </div>
        </div>
      </div>

      {showMoSection ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 flex flex-wrap items-center gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">Value Payable</div>
          {moNumber ? (
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              MO # {moNumber}
            </span>
          ) : null}
          {moStatusLabel ? (
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              moStatusLabel.includes("Settled")
                ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                : "border-amber-300 bg-amber-100 text-amber-800"
            }`}>
              {moStatusLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {result.degraded ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="mb-1 inline h-4 w-4" /> {result.warning ?? "Tracking service temporarily unavailable."}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Origin</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{result.origin || result.booking_office || "-"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Destination</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{result.destination || result.delivery_office || "-"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Current Location</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{currentLocation}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Latest Event</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{presentation.latestEvent?.description || "-"}</div>
          {presentation.latestEvent?.location ? <div className="mt-1 text-xs text-slate-500">{presentation.latestEvent.location}</div> : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Estimated Delivery</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{result.estimated_delivery || "-"}</div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery Progress</div>
          <div className="text-sm font-semibold text-slate-700">{progress}%</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-[linear-gradient(135deg,#0f172a,#0b6b3a)]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">History</div>
        {timeline.length > 0 ? (
          <div className="grid gap-4 p-4 lg:grid-cols-[200px_1fr]">
            <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Shipment Stages</div>
              <ol className="relative mt-3 space-y-2.5">
                {presentation.stageLabels.map((stage, idx) => {
                  const isDone = idx <= activeStage;
                  return (
                    <li key={`${result.tracking_number}-${stage}`} className="relative pl-6 text-xs font-semibold text-slate-600">
                      {idx < presentation.stageLabels.length - 1 ? (
                        <span className={`absolute left-[8px] top-4 h-7 w-[2px] ${idx < activeStage ? "bg-emerald-400" : "bg-slate-300"}`} />
                      ) : null}
                      <span className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border ${isDone ? "border-emerald-500 bg-emerald-500 animate-pulse" : "border-slate-300 bg-white"}`} />
                      <span className={`${isDone ? "text-slate-800" : "text-slate-500"}`}>{stage}</span>
                    </li>
                  );
                })}
              </ol>
            </aside>

            <ol className="relative space-y-3">
              <li aria-hidden="true" className="pointer-events-none absolute bottom-1 top-1 left-[7px] w-[2px] list-none bg-gradient-to-b from-emerald-400 to-emerald-200" />
              {timeline.map((event, index) => {
                return (
                  <li
                    key={`${result.tracking_number}-${event.date}-${event.time}-${index}`}
                    className="relative translate-y-0 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 opacity-100 transition-all duration-500"
                    style={{ transitionDelay: `${Math.min(index * 60, 320)}ms` }}
                  >
                    <span className="absolute left-[-1px] top-4 h-4 w-4 rounded-full border-2 border-emerald-500 bg-white shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                    <div className="ml-5 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-800">{event.description || "-"}</div>
                      <div className="text-xs text-slate-400">{[event.date, event.time].filter(Boolean).join(" ") || "-"}</div>
                    </div>
                    <div className="ml-5 mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" />
                      <span>{event.location || "-"}</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">{event.stageLabel}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div className="px-4 py-5 text-sm text-slate-500">No tracking history recorded yet for this shipment.</div>
        )}
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => { setWaPhone(""); setWaModalOpen(true); }}
          className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          <MessageSquare className="h-4 w-4" />
          Share via WhatsApp
        </button>
      </div>
      {waModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <MessageSquare className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="font-bold text-slate-900">Send Tracking via WhatsApp</div>
                <div className="mt-0.5 text-xs text-slate-500">Tracking ID: {result.tracking_number}</div>
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="wa-phone" className="block text-sm font-medium text-slate-700">
                WhatsApp Number <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="wa-phone"
                type="tel"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="e.g. 03001234567 or +923001234567"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
              <p className="mt-1 text-xs text-slate-400">Leave blank to let the recipient choose their number on WhatsApp.</p>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <a
                href={whatsappShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setWaModalOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700"
              >
                <MessageSquare className="h-4 w-4" />
                {waPhone.replace(/\D/g, "").length >= 7 ? `Send to ${waPhone}` : "Share on WhatsApp"}
              </a>
              <button
                type="button"
                onClick={() => setWaModalOpen(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function PublicTracking() {
  const { trackingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const idsParam = searchParams.get("ids");
  const idParam = searchParams.get("id");
  const initialValue = idsParam || trackingId || idParam || "";
  const [input, setInput] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TrackingResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const requestedIds = useMemo(() => {
    if (trackingId) return normalizeTrackingIds(trackingId);
    if (idsParam) return normalizeTrackingIds(idsParam);
    if (idParam) return normalizeTrackingIds(idParam);
    return [];
  }, [idParam, idsParam, trackingId]);

  useEffect(() => {
    setInput(initialValue);
  }, [initialValue]);

  useEffect(() => {
    setActiveCardIndex(0);
  }, [requestedIds.join(",")]);

  useEffect(() => {
    if (requestedIds.length === 0) {
      setResults([]);
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const base = resolveApiBase();
        const url = `${base}/api/tracking/public?ids=${encodeURIComponent(requestedIds.join(","))}`;
        const res = await fetch(url, { signal: controller.signal });
        const body = (await res.json().catch(() => ({}))) as Partial<TrackingCollectionResponse> & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`);
        if (!body.success || !Array.isArray(body.results)) throw new Error("Tracking failed");
        if (!active) return;
        setResults(body.results);
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
        setError(err instanceof Error ? err.message : "Tracking failed. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [requestedIds]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    const ids = normalizeTrackingIds(value);
    if (ids.length === 0) return;
    if (value.split(",").map((entry) => entry.trim()).filter(Boolean).length > 5) {
      setError("Maximum 5 tracking IDs allowed");
      return;
    }
    setError(null);
    if (ids.length === 1) {
      navigate(`/tracking?ids=${encodeURIComponent(ids[0])}`);
      return;
    }
    navigate(`/tracking?ids=${encodeURIComponent(ids.join(","))}`);
  }

  const safeActiveIndex = Math.max(0, Math.min(activeCardIndex, Math.max(0, results.length - 1)));
  const hasMultiple = results.length > 1;
  const activeResult = results[safeActiveIndex] ?? null;

  return (
    <div className="min-h-screen bg-[#f7fbf8] text-slate-900">
      <Navbar />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="rounded-[28px] border border-emerald-100 bg-white/95 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.10)]">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Parcel Tracking</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Track Your Shipment</h1>
          <p className="mt-1 text-sm text-slate-500">Enter one tracking ID or up to 5 comma-separated IDs to view parcel movement without login.</p>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="e.g. VPL26030700 or VPL26030700,PK123,PK456"
              className="h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Tracking..." : "Track"}
            </button>
          </form>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mb-1 inline h-4 w-4" /> {error}
          </div>
        ) : null}

        {requestedIds.length > 1 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <span className="font-semibold">Tracking IDs:</span> {requestedIds.join(", ")}
          </div>
        ) : null}

        {results.length > 0 ? (
          <div className="mt-6 space-y-5">
            {hasMultiple ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-700">
                    Card {safeActiveIndex + 1} of {results.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveCardIndex((prev) => Math.max(0, prev - 1))}
                      disabled={safeActiveIndex === 0}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Previous tracking card"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveCardIndex((prev) => Math.min(results.length - 1, prev + 1))}
                      disabled={safeActiveIndex >= results.length - 1}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Next tracking card"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="relative min-h-[520px]">
                  {results.map((result, index) => {
                    const isActive = index === safeActiveIndex;
                    return (
                      <div
                        key={result.tracking_number}
                        className={`transition-all duration-500 ${isActive ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0"}`}
                        style={{ transform: isActive ? "rotateY(0deg)" : "rotateY(90deg)", transformOrigin: "center" }}
                      >
                        <TrackingResultCard result={result} />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {results.map((result, index) => (
                    <button
                      key={`${result.tracking_number}-dot`}
                      type="button"
                      onClick={() => setActiveCardIndex(index)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${index === safeActiveIndex ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      {result.tracking_number}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeResult ? <TrackingResultCard key={activeResult.tracking_number} result={activeResult} /> : null
            )}

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex-1 text-sm text-slate-600">Need to file a complaint or manage your dispatches?</div>
              <a
                href="/register"
                className="inline-flex items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
              >
                Create Free Account <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
