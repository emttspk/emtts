import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, MapPin, Package, CheckCircle2, Clock, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
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
  events: TrackingEvent[];
  meta?: Record<string, unknown> | null;
  error?: string;
};

function statusColor(status: string) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("deliver")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s.includes("return")) return "bg-red-50 text-red-700 border-red-200";
  if (s.includes("transit") || s.includes("pending")) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-sky-50 text-sky-700 border-sky-200";
}

function statusIcon(status: string) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("deliver")) return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (s.includes("return")) return <AlertCircle className="h-5 w-5 text-red-500" />;
  return <Clock className="h-5 w-5 text-amber-500" />;
}

export default function PublicTracking() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(searchParams.get("id") ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doTrack(id: string) {
    const tn = id.trim().toUpperCase();
    if (!tn) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const base = resolveApiBase();
      const url = `${base}/api/tracking/public/${encodeURIComponent(tn)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((body.error as string | undefined) ?? `Server error ${res.status}`);
      }
      const data = (await res.json()) as TrackingResult;
      if (!data.success) throw new Error(data.error ?? "Tracking failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tracking failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setInput(id);
      void doTrack(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tn = input.trim();
    if (!tn) return;
    navigate(`/track?id=${encodeURIComponent(tn)}`, { replace: true });
    void doTrack(tn);
  }

  return (
    <div className="min-h-screen bg-[#f7fbf8] text-slate-900">
      <Navbar />
      <main className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6">
        {/* Search */}
        <div className="rounded-[28px] border border-emerald-100 bg-white/95 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.10)]">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Parcel Tracking</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Track Your Shipment</h1>
          <p className="mt-1 text-sm text-slate-500">Enter a VPL, RGL, IRL, or COD tracking number — no login required.</p>
          <form onSubmit={handleSubmit} className="mt-5 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. VPL26030700"
              className="h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Tracking…" : "Track"}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mb-1 inline h-4 w-4" /> {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Degraded warning */}
            {result.degraded && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircle className="mb-1 inline h-4 w-4" /> {result.warning ?? "Tracking service temporarily unavailable — showing cached data."}
              </div>
            )}

            {/* Status card */}
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-lg font-bold tracking-[0.08em] text-slate-900">{result.tracking_number}</div>
                  {result.consignee_name && (
                    <div className="mt-0.5 text-sm text-slate-500">Consignee: <span className="font-semibold text-slate-700">{result.consignee_name}</span></div>
                  )}
                  {result.consignee_address && (
                    <div className="mt-0.5 text-xs text-slate-500">{result.consignee_address}</div>
                  )}
                </div>
                <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${statusColor(result.status)}`}>
                  {statusIcon(result.status)}
                  {result.status}
                </div>
              </div>

              {(result.booking_office || result.delivery_office) && (
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  {result.booking_office && (
                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">From:</span> {result.booking_office}
                    </div>
                  )}
                  {result.delivery_office && (
                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                      <Package className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">To:</span> {result.delivery_office}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Events timeline */}
            {result.events.length > 0 && (
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                <div className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery History</div>
                <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                  {[...result.events].reverse().map((ev, idx) => (
                    <li key={idx} className="relative">
                      <span className="absolute -left-[22px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-800">{ev.description || "—"}</div>
                          <div className="text-xs text-slate-400">{ev.date} {ev.time}</div>
                        </div>
                        {ev.location && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="h-3 w-3" /> {ev.location}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {result.events.length === 0 && !result.degraded && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
                No tracking events recorded yet for <span className="font-semibold">{result.tracking_number}</span>.
              </div>
            )}

            {/* CTA */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex-1 text-sm text-slate-600">Need to file a complaint or manage your dispatches?</div>
              <a href="/register" className="inline-flex items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 transition-transform">
                Create Free Account <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
