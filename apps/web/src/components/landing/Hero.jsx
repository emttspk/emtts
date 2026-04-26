import { CheckCircle2, MapPin, PackageCheck } from "lucide-react";
import Button from "./Button";
import LabelPreviewCard from "../previews/LabelPreviewCard";
import MoneyOrderPreviewCard from "../previews/MoneyOrderPreviewCard";
import TrackingPreviewCard from "../previews/TrackingPreviewCard";

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
                <div className="h-[15rem] w-full rounded-[20px] border border-slate-200 bg-white p-4 sm:h-[18rem] md:h-[20rem] lg:h-[22rem]">
                  <div className="grid grid-cols-4 gap-2 text-[10px]">
                    {[
                      ["Labels", "12,840"],
                      ["Tracking", "8,420"],
                      ["Money Orders", "3,120"],
                      ["Complaints", "27"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                        <div className="text-slate-500">{label}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-900">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Dispatch Trend</div>
                      <div className="mt-2 grid grid-cols-7 items-end gap-1.5">
                        {[22, 38, 34, 48, 56, 52, 64].map((bar) => (
                          <div key={bar} className="h-16 rounded bg-white p-1 shadow-inner">
                            <div className="w-full rounded bg-gradient-to-t from-brand to-emerald-500" style={{ height: `${bar}%` }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Recent Activity</div>
                      <div className="mt-2 space-y-2">
                        {[
                          "Batch imported",
                          "Labels generated",
                          "Route updated",
                          "MO issued",
                        ].map((item) => (
                          <div key={item} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-700">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute left-2 top-2 z-20 w-[46%] max-w-[14rem] animate-float rounded-3xl border border-white/80 bg-white p-2 shadow-2xl sm:left-6">
              <LabelPreviewCard />
            </div>

            <div className="absolute right-2 top-16 z-30 w-[43%] max-w-[13rem] animate-float rounded-3xl border border-white/80 bg-white p-2 shadow-2xl [animation-delay:0.4s] sm:right-6">
              <MoneyOrderPreviewCard />
            </div>

            <div className="absolute bottom-24 left-3 z-30 w-[52%] max-w-[16rem] animate-float rounded-3xl border border-white/80 bg-white p-3 shadow-2xl [animation-delay:0.2s] sm:left-8">
              <TrackingPreviewCard compact />
            </div>

            <div className="absolute bottom-4 right-3 z-20 w-[42%] max-w-[13rem] animate-float rounded-3xl border border-white/80 bg-white p-3 shadow-2xl [animation-delay:0.65s] sm:right-8">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-brand-ink"><PackageCheck className="h-3.5 w-3.5 text-brand" /> Shipment</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-slate-500">Pending</div>
                  <div className="font-semibold text-slate-900">47</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-slate-500">Processed</div>
                  <div className="font-semibold text-slate-900">312</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-slate-500">MO Amount</div>
                  <div className="font-semibold text-slate-900">Rs. 8,450</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-slate-500">Pending Rs</div>
                  <div className="font-semibold text-slate-900">Rs. 1,120</div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Completed Deliveries</span>
                <span className="font-semibold text-emerald-700">265</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-2 w-[82%] rounded-full bg-gradient-to-r from-brand to-emerald-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
