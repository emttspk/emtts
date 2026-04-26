import { useEffect, useState } from "react";
import { CheckCircle2, PackageCheck } from "lucide-react";
import Button from "./Button";
import LabelPreviewCard from "../previews/LabelPreviewCard";
import MoneyOrderPreviewCard from "../previews/MoneyOrderPreviewCard";
import TrackingPreviewCard from "../previews/TrackingPreviewCard";

const highlights = ["Pakistan Post Ready", "Real Label + MO Output", "Live Tracking Surface"];

const summaryItems = [
  ["Total Labels", "312"],
  ["Pending Tracking", "47"],
  ["Money Order Total", "Rs. 8,450"],
  ["Pending Amount", "Rs. 1,120"],
];

export default function Hero() {
  const [activeCard, setActiveCard] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveCard((current) => (current + 1) % 4);
    }, 2000);

    return () => window.clearInterval(timer);
  }, []);

  const heroCards = [
    {
      key: "label",
      className: "left-2 top-2 z-20 md:left-6 md:top-2 md:w-[46%] md:max-w-[14rem]",
      content: <LabelPreviewCard />,
    },
    {
      key: "money-order",
      className: "right-2 top-2 z-30 md:right-6 md:top-16 md:w-[43%] md:max-w-[13rem]",
      content: <MoneyOrderPreviewCard />,
    },
    {
      key: "tracking",
      className: "left-2 top-2 z-30 md:bottom-24 md:left-8 md:top-auto md:w-[52%] md:max-w-[16rem]",
      content: <TrackingPreviewCard compact />,
    },
    {
      key: "summary",
      className: "right-2 top-2 z-20 md:bottom-4 md:right-8 md:top-auto md:w-[42%] md:max-w-[13rem]",
      content: (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-brand-ink"><PackageCheck className="h-3.5 w-3.5 text-brand" /> Shipment Summary</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
            {summaryItems.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <div className="text-slate-500">{label}</div>
                <div className="font-semibold text-slate-900">{value}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

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
              <Button to="/register" className="w-full justify-center sm:w-auto">Create Free Account</Button>
              <Button href="#workflow" variant="secondary" className="w-full justify-center sm:w-auto">View Product Showcase</Button>
            </div>

            <div className="mt-8 flex flex-wrap gap-2.5">
              {highlights.map((label) => (
                <span key={label} className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[34px] pb-2 md:min-h-[36rem] lg:min-h-[41rem]">
            <div className="pointer-events-none absolute -left-10 top-8 h-28 w-28 rounded-full bg-emerald-300/35 blur-2xl" />
            <div className="pointer-events-none absolute right-4 top-0 h-40 w-40 rounded-full bg-brand/25 blur-3xl" />

            <div className="relative z-10 mx-auto w-full max-w-[42rem] rounded-[34px] border border-white/80 bg-white p-2 shadow-[0_32px_80px_rgba(2,44,34,0.16)] md:absolute md:left-0 md:right-0 md:top-8">
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

            <div className="relative z-20 mt-4 grid gap-3 md:mt-0 md:block">
              {heroCards.map((card, index) => {
                const isActive = index === activeCard;

                return (
                  <div
                    key={card.key}
                    data-hero-card={card.key}
                    className={[
                      "w-full rounded-3xl transition-all duration-700 ease-out md:absolute",
                      card.className,
                      isActive
                        ? "translate-y-0 scale-100 opacity-100 md:shadow-[0_28px_65px_rgba(15,23,42,0.2)]"
                        : "translate-y-2 scale-[0.97] opacity-70 md:translate-y-3 md:scale-[0.96]",
                    ].join(" ")}
                    style={{ willChange: "transform, opacity" }}
                  >
                    {card.content}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
