import { CheckCircle2, MapPin, PackageCheck, Route } from "lucide-react";
import Button from "./Button";

const highlights = ["Pakistan Post Ready", "Real Label + MO Output", "Live Tracking Surface"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 md:pt-28">
      <div className="pointer-events-none absolute inset-0 bg-white" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(11,107,58,0.09),transparent_35%),radial-gradient(circle_at_88%_18%,rgba(16,185,129,0.16),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-0 bg-hero-grid bg-[size:28px_28px] opacity-25" />
      <div className="pointer-events-none absolute right-[-12rem] top-[-5rem] h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(11,107,58,0.22),rgba(16,185,129,0.08),transparent_72%)] blur-2xl" />
      <div className="ui-page relative">
        <div className="grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
          <div>
            <div className="ui-kicker">
              <CheckCircle2 className="h-4 w-4" /> EPOS.PK Premium Platform
            </div>
            <h1 className="mt-7 max-w-2xl font-display text-[34px] font-extrabold leading-[0.94] tracking-[-0.06em] text-brand-ink sm:text-5xl md:text-[52px] lg:text-[68px]">
              One Premium Surface
              <br />
              for Labels, MO,
              <br />
              and Tracking.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 md:text-[21px] md:leading-9">
              Built for Pakistan Post operations teams: generate labels, issue money orders, and track shipments in one clean, high-speed workflow.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button to="/register">Create Free Account</Button>
              <Button href="#workflow" variant="secondary">View Product Showcase</Button>
            </div>

            <div className="mt-8 flex flex-wrap gap-2.5">
              {highlights.map((label) => (
                <span key={label} className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="relative min-h-[32rem] pb-2 sm:min-h-[36rem] lg:min-h-[41rem]">
            <div className="pointer-events-none absolute -left-10 top-8 h-28 w-28 rounded-full bg-emerald-300/35 blur-2xl" />
            <div className="pointer-events-none absolute right-4 top-0 h-40 w-40 rounded-full bg-brand/25 blur-3xl" />

            <div className="absolute left-0 right-0 top-8 z-10 mx-auto w-full max-w-[42rem] rounded-[34px] border border-white/80 bg-white p-2 shadow-[0_32px_80px_rgba(2,44,34,0.16)]">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-2">
                <img src="/media/dashboard-preview.png" alt="Dashboard preview" className="h-[15rem] w-full rounded-[20px] object-cover sm:h-[18rem] md:h-[20rem] lg:h-[22rem]" />
              </div>
            </div>

            <div className="absolute left-2 top-2 z-20 w-[46%] max-w-[14rem] animate-float rounded-3xl border border-white/80 bg-white p-2 shadow-2xl sm:left-6">
              <img src="/media/label-preview.png" alt="Label preview" className="h-28 w-full rounded-2xl object-cover sm:h-32" />
              <div className="px-2 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Label Preview</div>
            </div>

            <div className="absolute right-2 top-16 z-30 w-[43%] max-w-[13rem] animate-float rounded-3xl border border-white/80 bg-white p-2 shadow-2xl [animation-delay:0.4s] sm:right-6">
              <img src="/media/money-order-preview.png" alt="Money order preview" className="h-24 w-full rounded-2xl object-cover sm:h-28" />
              <div className="px-2 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Money Order</div>
            </div>

            <div className="absolute bottom-24 left-3 z-30 w-[52%] max-w-[16rem] animate-float rounded-3xl border border-white/80 bg-white p-3 shadow-2xl [animation-delay:0.2s] sm:left-8">
              <div className="mb-2 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-brand-ink"><Route className="h-3.5 w-3.5 text-brand" /> Tracking</div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">In Transit</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">VPL26030700</div>
              <div className="mt-1 text-[11px] text-slate-600">Lahore to Karachi</div>
              <svg viewBox="0 0 160 42" className="mt-2 h-8 w-full">
                <path d="M8 32 C30 5, 85 46, 152 10" stroke="#bbf7d0" strokeWidth="5" fill="none" />
                <path d="M8 32 C30 5, 85 46, 112 23" stroke="#0b6b3a" strokeWidth="5" fill="none" strokeLinecap="round" />
                <circle cx="8" cy="32" r="4" fill="#0b6b3a" />
                <circle cx="112" cy="23" r="4" fill="#22c55e" />
                <circle cx="152" cy="10" r="4" fill="#94a3b8" />
              </svg>
              <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-slate-500">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Lahore</span>
                <span>Karachi</span>
              </div>
            </div>

            <div className="absolute bottom-4 right-3 z-20 w-[42%] max-w-[13rem] animate-float rounded-3xl border border-white/80 bg-white p-3 shadow-2xl [animation-delay:0.65s] sm:right-8">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-brand-ink"><PackageCheck className="h-3.5 w-3.5 text-brand" /> Shipment</div>
              <div className="mt-2 text-[11px] font-semibold text-slate-900">COD77102033</div>
              <div className="mt-1 text-[11px] text-slate-600">Payment verified</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-2 w-3/4 rounded-full bg-gradient-to-r from-brand to-emerald-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
