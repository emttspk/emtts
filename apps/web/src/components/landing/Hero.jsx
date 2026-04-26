import { useEffect, useState } from "react";
import { CheckCircle2, PackageCheck, Route, Truck, Play, ArrowRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "./Button";
import LabelPreviewCard from "../previews/LabelPreviewCard";
import MoneyOrderPreviewCard from "../previews/MoneyOrderPreviewCard";
import TrackingPreviewCard from "../previews/TrackingPreviewCard";

const trustPoints = ["No Credit Card", "Free Forever", "Setup in Minutes"];

const recentShipments = [
  { tracking: "VPL26030700", route: "Lahore -> Karachi", status: "In Transit" },
  { tracking: "VPP26030621", route: "Islamabad -> Multan", status: "Delivered" },
  { tracking: "PAR26030590", route: "Faisalabad -> Quetta", status: "In Transit" },
  { tracking: "RGL26030441", route: "Rawalpindi -> Peshawar", status: "Delayed" },
];

const partners = ["Pakistan Post", "Leopards", "TCS", "M&P", "PostEx"];

const trustMetrics = [
  { value: "1M+", label: "Labels Printed" },
  { value: "500K+", label: "Deliveries" },
  { value: "PKR 20M+", label: "Money Orders" },
  { value: "99.8%", label: "Success Rate" },
];

const landmarks = [
  { name: "Minar-e-Pakistan", svg: "M60,20 L70,50 L50,50 Z M65,30 L75,40 L55,40 Z" },
  { name: "Faisal Mosque", svg: "M50,60 L60,20 L70,60 Z M55,55 L65,25 L55,25 M65,55 L75,25 L65,25" },
  { name: "Badshahi Mosque", svg: "M40,60 L60,15 L80,60 Z M45,60 L55,20 L65,60 Z" },
  { name: "Hiran Minar", svg: "M55,15 L65,50 L45,50 Z M60,25 L68,40 L52,40 Z" },
  { name: "Mazar-e-Quaid", svg: "M50,25 L70,60 M70,25 L50,60 M50,42 L70,42 M60,25 L60,60" },
];

export default function Hero() {
  const [activeLandmark, setActiveLandmark] = useState(0);
  const [trackingId, setTrackingId] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveLandmark((prev) => (prev + 1) % landmarks.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const handleTrackingSubmit = (e) => {
    e.preventDefault();
    if (trackingId.trim()) {
      navigate(`/tracking?id=${encodeURIComponent(trackingId)}`);
    }
  };

  return (
    <section className="relative overflow-hidden pt-12 md:pt-14 lg:pt-16">
      <div className="pointer-events-none absolute inset-0 bg-white" />
      
      {/* Rotating Pakistan Landmarks Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {landmarks.map((landmark, idx) => (
          <div
            key={landmark.name}
            className="absolute inset-0 transition-opacity duration-1000"
            style={{
              opacity: idx === activeLandmark ? 0.06 : 0,
            }}
          >
            <svg
              viewBox="0 0 120 80"
              className="h-full w-full object-cover"
              preserveAspectRatio="xMidYMid slice"
            >
              <path d={landmark.svg} fill="none" stroke="#0B6B3A" strokeWidth="2" opacity="0.7" />
            </svg>
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(11,107,58,0.12),transparent_38%),radial-gradient(circle_at_88%_8%,rgba(16,185,129,0.15),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 bg-hero-grid bg-[size:28px_28px] opacity-18" />
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="pointer-events-none absolute right-[-7rem] top-[-3rem] h-[26rem] w-[26rem] rounded-full bg-brand/18 blur-3xl" />
      <div className="pointer-events-none absolute left-1/3 -bottom-32 h-96 w-80 rounded-full bg-emerald-200/12 blur-3xl" />

      <div className="ui-page relative">
        <div className="grid items-center gap-10 pb-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:pb-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Pakistan Post Official Partner
            </div>

            <h1 className="mt-7 font-display text-[42px] font-extrabold leading-[0.96] tracking-[-0.05em] text-brand-ink sm:text-[56px] lg:text-[72px]">
              Ship Anywhere in Pakistan.
              <span className="mt-2 block text-emerald-600">Track Every Step.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 md:text-lg">
              Generate Pakistan Post labels, create Money Orders, and track shipments in real-time - all in one place.
            </p>

            {/* Tracking Search Box */}
            <form onSubmit={handleTrackingSubmit} className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:max-w-xs">
                <input
                  type="text"
                  placeholder="Enter Tracking ID (VPL/RGL/IRL)"
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-4 text-sm font-medium text-slate-900 placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all duration-200"
                />
              </div>
              <button
                type="submit"
                className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Search className="h-4 w-4" />
                Track Now
              </button>
            </form>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button to="/register" className="w-full flex items-center justify-center gap-2 sm:w-auto">
                Create Free Account
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button href="#workflow" variant="secondary" className="w-full flex items-center justify-center gap-2 sm:w-auto">
                <Play className="h-3.5 w-3.5" />
                Watch Live Demo
              </Button>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-200">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-3">Trusted by bulk dispatchers</div>
              <p className="text-sm text-slate-600 mb-4">
                Government-backed delivery system with official Pakistan Post integration.
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {trustPoints.map((point) => (
                  <span key={point} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {point}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="relative lg:min-h-[42rem]">
            <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/60 p-2 shadow-[0_32px_96px_rgba(0,0,0,0.08)] backdrop-blur-xl md:p-3 animate-float">
              <div className="rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-white/95 to-slate-50/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between pb-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Operations Dashboard</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">Shipment Overview</div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 animate-pulse-soft">
                    <PackageCheck className="h-3.5 w-3.5" /> Live
                  </div>
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-2">Recent Shipments</div>
                    <div className="mt-2 space-y-2">
                      {recentShipments.map((shipment, idx) => (
                        <div
                          key={shipment.tracking}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2.5 py-2 hover:shadow-md transition-all duration-200 hover:scale-102"
                          style={{
                            animationDelay: `${idx * 0.15}s`,
                          }}
                        >
                          <div>
                            <div className="font-mono text-[11px] font-semibold text-slate-900">{shipment.tracking}</div>
                            <div className="text-[10px] text-slate-500">{shipment.route}</div>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{shipment.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-2">
                      <Route className="h-3.5 w-3.5 text-brand" /> Pakistan Route Map
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                      <svg viewBox="0 0 300 120" className="h-28 w-full">
                        {/* Simplified Pakistan map route */}
                        <path d="M40 100 Q90 40, 200 80" stroke="#dcfce7" strokeWidth="10" fill="none" />
                        <path
                          d="M40 100 Q90 40, 180 85"
                          stroke="#0b6b3a"
                          strokeWidth="8"
                          fill="none"
                          strokeLinecap="round"
                          className="animate-tracking-pulse"
                        />
                        <circle cx="40" cy="100" r="6" fill="#0b6b3a" />
                        <circle cx="180" cy="85" r="5" fill="#22c55e" className="animate-pulse" />
                        <circle cx="200" cy="80" r="6" fill="#94a3b8" />

                        {/* City markers */}
                        <text x="35" y="115" fontSize="10" fill="#0f172a" fontWeight="bold">
                          Lahore
                        </text>
                        <text x="170" y="105" fontSize="10" fill="#0f172a" fontWeight="bold">
                          Karachi
                        </text>
                      </svg>

                      <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                        <span>Dispatch Hub</span>
                        <span>Delivery Center</span>
                      </div>

                      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold text-amber-700">
                        <Truck className="h-3.5 w-3.5 animate-pulse" /> 2,971 parcels moving now
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Product Cards with Animations */}
            <div className="pointer-events-none absolute -right-2 top-0 hidden w-56 lg:block animate-float" style={{ animationDelay: "0.2s" }}>
              <LabelPreviewCard className="bg-white/98 shadow-[0_24px_64px_rgba(15,23,42,0.18)] backdrop-blur-md border border-white/80 hover:shadow-[0_32px_80px_rgba(15,23,42,0.22)] transition-all duration-300" />
            </div>
            <div className="pointer-events-none absolute -left-6 top-[40%] hidden w-56 lg:block animate-float" style={{ animationDelay: "0.4s" }}>
              <MoneyOrderPreviewCard className="bg-white/98 shadow-[0_24px_64px_rgba(15,23,42,0.18)] backdrop-blur-md border border-white/80 hover:shadow-[0_32px_80px_rgba(15,23,42,0.22)] transition-all duration-300" />
            </div>
            <div className="pointer-events-none absolute -bottom-12 right-12 hidden w-64 lg:block animate-float" style={{ animationDelay: "0.6s" }}>
              <TrackingPreviewCard compact className="bg-white/98 shadow-[0_24px_64px_rgba(15,23,42,0.18)] backdrop-blur-md border border-white/80 hover:shadow-[0_32px_80px_rgba(15,23,42,0.22)] transition-all duration-300" />
            </div>

            {/* Mobile Responsive Cards */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:hidden">
              <div className="animate-float" style={{ animationDelay: "0.2s" }}>
                <LabelPreviewCard className="bg-white/98 shadow-sm hover:shadow-md transition-all" />
              </div>
              <div className="animate-float" style={{ animationDelay: "0.4s" }}>
                <MoneyOrderPreviewCard className="bg-white/98 shadow-sm hover:shadow-md transition-all" />
              </div>
              <div className="sm:col-span-2 animate-float" style={{ animationDelay: "0.6s" }}>
                <TrackingPreviewCard compact className="bg-white/98 shadow-sm hover:shadow-md transition-all" />
              </div>
            </div>
          </div>
        </div>

        {/* Trust Bar */}
        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-card backdrop-blur md:p-6">
          <div className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 md:text-sm mb-4">
            Trusted by thousands across Pakistan
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 md:gap-3">
            {partners.map((partner, idx) => (
              <div
                key={partner}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.1em] text-slate-600 hover:shadow-md hover:bg-white transition-all duration-200 animate-fade md:text-[11px]"
                style={{
                  animationDelay: `${idx * 0.1}s`,
                }}
              >
                {partner}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
