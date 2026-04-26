import { BarChart3, CheckCircle2, CircleX, Clock3, PackageCheck, Route, Truck } from "lucide-react";
import Button from "./Button";
import LabelPreviewCard from "../previews/LabelPreviewCard";
import MoneyOrderPreviewCard from "../previews/MoneyOrderPreviewCard";
import TrackingPreviewCard from "../previews/TrackingPreviewCard";

const trustPoints = ["No Credit Card", "Free Forever", "Setup in Minutes"];

const stats = [
  { label: "Shipment Analytics", value: "12,840", icon: BarChart3, tone: "text-brand" },
  { label: "Delivered", value: "9,462", icon: CheckCircle2, tone: "text-emerald-600" },
  { label: "In Transit", value: "2,971", icon: Clock3, tone: "text-amber-600" },
  { label: "Failed", value: "407", icon: CircleX, tone: "text-rose-600" },
];

const recentShipments = [
  { tracking: "VPL26030700", route: "Lahore -> Karachi", status: "In Transit" },
  { tracking: "VPP26030621", route: "Islamabad -> Multan", status: "Delivered" },
  { tracking: "PAR26030590", route: "Faisalabad -> Quetta", status: "In Transit" },
  { tracking: "RGL26030441", route: "Rawalpindi -> Peshawar", status: "Delayed" },
];

const partners = ["Pakistan Post", "Leopards", "TCS", "M&P", "PostEx"];

const trustMetrics = [
  { value: "1M+", label: "Shipments" },
  { value: "500K+", label: "Users" },
  { value: "99.8%", label: "Success" },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 md:pt-28">
      <div className="pointer-events-none absolute inset-0 bg-white" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(11,107,58,0.11),transparent_37%),radial-gradient(circle_at_88%_8%,rgba(16,185,129,0.14),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-0 bg-hero-grid bg-[size:28px_28px] opacity-20" />
      <div className="pointer-events-none absolute -left-20 top-16 h-52 w-52 rounded-full bg-emerald-300/25 blur-3xl" />
      <div className="pointer-events-none absolute right-[-7rem] top-[-3rem] h-[24rem] w-[24rem] rounded-full bg-brand/20 blur-3xl" />

      <div className="ui-page relative">
        <div className="grid items-center gap-10 pb-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:pb-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Trusted Shipping Surface
            </div>

            <h1 className="mt-7 font-display text-[40px] font-extrabold leading-[0.95] tracking-[-0.05em] text-brand-ink sm:text-[52px] lg:text-[66px]">
              Ship Anywhere in Pakistan.
              <span className="mt-2 block text-emerald-600">Track Every Step.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 md:text-lg">
              Generate Pakistan Post labels, create Money Orders, and track shipments in real-time - all in one place.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button to="/register" className="w-full justify-center sm:w-auto">Create Free Account</Button>
              <Button href="#workflow" variant="secondary" className="w-full justify-center sm:w-auto">See How It Works</Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
              {trustPoints.map((point) => (
                <span key={point} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {point}
                </span>
              ))}
            </div>
          </div>

          <div className="relative lg:min-h-[38rem]">
            <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/55 p-2 shadow-glass backdrop-blur-xl md:p-3">
              <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-5">
                <div className="flex items-center justify-between pb-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Operations Dashboard</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">Shipment Command Center</div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                    <PackageCheck className="h-3.5 w-3.5" /> Live
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {stats.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                          <span>{item.label}</span>
                          <Icon className={`h-3.5 w-3.5 ${item.tone}`} />
                        </div>
                        <div className="mt-2 text-lg font-bold text-slate-900">{item.value}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Recent Shipments</div>
                    <div className="mt-2 space-y-2">
                      {recentShipments.map((shipment) => (
                        <div key={shipment.tracking} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2.5 py-2">
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
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                      <Route className="h-3.5 w-3.5 text-brand" /> Tracking Route Map
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                      <svg viewBox="0 0 300 112" className="h-24 w-full">
                        <path d="M14 88 C64 30, 138 102, 286 22" stroke="#dcfce7" strokeWidth="8" fill="none" />
                        <path d="M14 88 C64 30, 138 102, 208 58" stroke="#0b6b3a" strokeWidth="7" fill="none" strokeLinecap="round" />
                        <circle cx="14" cy="88" r="7" fill="#0b6b3a" />
                        <circle cx="208" cy="58" r="7" fill="#22c55e" />
                        <circle cx="286" cy="22" r="7" fill="#94a3b8" />
                      </svg>

                      <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                        <span>Lahore Dispatch</span>
                        <span>Karachi Delivery</span>
                      </div>

                      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold text-amber-700">
                        <Truck className="h-3.5 w-3.5" /> 2,971 parcels moving now
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute -right-1 -top-4 hidden w-52 lg:block">
              <LabelPreviewCard className="bg-white/95 shadow-[0_20px_45px_rgba(15,23,42,0.15)] backdrop-blur" />
            </div>
            <div className="pointer-events-none absolute -left-8 top-[36%] hidden w-52 lg:block">
              <MoneyOrderPreviewCard className="bg-white/95 shadow-[0_20px_45px_rgba(15,23,42,0.15)] backdrop-blur" />
            </div>
            <div className="pointer-events-none absolute -bottom-8 right-14 hidden w-64 lg:block">
              <TrackingPreviewCard compact className="bg-white/95 shadow-[0_20px_45px_rgba(15,23,42,0.16)] backdrop-blur" />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:hidden">
              <LabelPreviewCard className="bg-white/95" />
              <MoneyOrderPreviewCard className="bg-white/95" />
              <TrackingPreviewCard compact className="bg-white/95 sm:col-span-2" />
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-card backdrop-blur md:p-6">
          <div className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 md:text-sm">
            Trusted by thousands across Pakistan
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 md:gap-3">
            {partners.map((partner) => (
              <div key={partner} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.1em] text-slate-600 md:text-[11px]">
                {partner}
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 sm:grid-cols-3">
            {trustMetrics.map((metric) => (
              <div key={metric.label} className="text-center sm:text-left">
                <div className="text-2xl font-extrabold tracking-[-0.03em] text-brand-ink">{metric.value}</div>
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
