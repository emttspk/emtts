import { ArrowRight, CheckCircle2, FileSpreadsheet, Package2, Radar, Route, ShieldCheck, WalletCards } from "lucide-react";
import Button from "./Button";
import Card from "./Card";

const badges = ["Free Labels", "Money Orders", "Tracking", "Complaint System"];

const trackingRows = [
  { code: "VPL26030700", status: "Delivered", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { code: "RGL26030700", status: "In Transit", tone: "text-amber-700 bg-amber-50 border-amber-200" },
  { code: "IRL26030700", status: "Processing", tone: "text-slate-700 bg-slate-50 border-slate-200" },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-8">
      <div className="pointer-events-none absolute inset-0 bg-hero-grid bg-[size:36px_36px] opacity-40" />
      <div className="pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-8 h-[34rem] w-[34rem] rounded-full bg-slate-900/10 blur-3xl" />
      <div className="ui-page relative">
        <div className="grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="ui-kicker">
              <CheckCircle2 className="h-4 w-4" /> Official Epost.pk Platform
            </div>
            <h1 className="mt-8 max-w-2xl font-display text-[34px] font-extrabold leading-[0.94] tracking-[-0.06em] text-brand-ink sm:text-5xl md:text-[48px] lg:text-[72px]">
              Book.<br />
              Print.<br />
              Track.<br />
              Resolve.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 md:text-[22px] md:leading-9">
              Pakistan&apos;s complete shipment management platform for labels, money orders, tracking and complaint automation.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Button to="/register">Create Free Account</Button>
              <Button href="#products" variant="secondary">View Live Demo</Button>
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              {badges.map((badge) => (
                <span key={badge} className="inline-flex items-center rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-xl">
                  {badge}
                </span>
              ))}
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Free labels", "Instant A4-ready PDFs"],
                ["Money orders", "MO references generated"],
                ["Tracking", "Live status visibility"],
                ["Complaints", "Resolution workflow"],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-3xl border border-white/70 bg-white/70 px-4 py-4 shadow-sm backdrop-blur-xl">
                  <div className="text-sm font-semibold text-brand-ink">{title}</div>
                  <div className="mt-1 text-xs leading-6 text-slate-500">{detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[44rem]">
            <div className="pointer-events-none absolute left-10 top-8 h-36 w-36 rounded-full bg-brand/20 blur-3xl" />
            <div className="pointer-events-none absolute right-0 top-16 h-48 w-48 rounded-full bg-slate-900/10 blur-3xl" />

            <Card className="absolute left-0 top-6 z-20 w-[19rem] animate-float p-5">
              <div className="flex items-center justify-between text-sm font-semibold text-brand-ink">
                <span className="inline-flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-brand" /> Excel Upload Preview</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">validated</span>
              </div>
              <div className="mt-4 rounded-[22px] border border-dashed border-brand/25 bg-brand/5 p-4">
                <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                  <span>orders.xlsx</span>
                  <span className="text-xs text-slate-500">1250 rows</span>
                  </div>
                <div className="mt-4 grid gap-2 text-xs text-slate-500">
                  {[
                    ["Valid rows", "1244"],
                    ["Missing cities", "4"],
                    ["MO applicable", "312"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                      <span>{label}</span>
                      <span className="font-semibold text-slate-900">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="absolute right-2 top-0 z-10 w-[21rem] p-5 md:right-8">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-brand-ink">Dashboard Preview</div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">Live activity</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ["Labels", "1,284"],
                  ["Tracking", "842"],
                  ["Complaints", "27"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[24px] bg-[linear-gradient(135deg,#0F172A,#1E293B)] p-4 text-white shadow-card">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Recent activity</span>
                  <span>updated 2m ago</span>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    ["Bulk batch imported", "Queue prepared"],
                    ["Label run completed", "PDF package ready"],
                    ["Complaint filed", "Awaiting response"],
                  ].map(([title, detail]) => (
                    <div key={title} className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2.5">
                      <div>
                        <div className="text-sm font-semibold text-white">{title}</div>
                        <div className="text-xs text-slate-300">{detail}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-emerald-300" />
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="absolute left-8 top-60 z-30 w-[20rem] p-5 md:left-16">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink"><Package2 className="h-4 w-4 text-brand" /> Label Preview</div>
              <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-inner">
                <div className="rounded-2xl bg-slate-900 px-3 py-2 font-mono text-[11px] tracking-[0.35em] text-white">||| |||| ||||| ||||</div>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <div><span className="font-semibold text-slate-900">Receiver</span> Abdul Rehman</div>
                  <div><span className="font-semibold text-slate-900">City</span> Lahore</div>
                  <div><span className="font-semibold text-slate-900">Tracking ID</span> <span className="font-mono">VPL26030700</span></div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-brand" /> Domestic label layout verified
                </div>
              </div>
            </Card>

            <Card className="absolute bottom-20 right-0 z-20 w-[21rem] animate-float p-5 [animation-delay:1.2s] md:right-10">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink"><Route className="h-4 w-4 text-brand" /> Tracking Card</div>
              <div className="mt-4 space-y-3">
                {trackingRows.map((row) => (
                  <div key={row.code} className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div>
                      <div className="font-mono text-sm font-semibold text-slate-900">{row.code}</div>
                      <div className={`status-pill mt-2 ${row.tone}`}>{row.status}</div>
                    </div>
                    <Radar className="h-5 w-5 text-slate-400" />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="absolute bottom-0 left-0 z-10 w-[18rem] p-5 [animation-delay:2s] md:left-10">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink"><WalletCards className="h-4 w-4 text-brand" /> Money Order</div>
              <div className="mt-4 rounded-[24px] bg-[linear-gradient(135deg,rgba(11,107,58,0.08),rgba(11,107,58,0.18))] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-brand">Generated</div>
                <div className="mt-2 font-mono text-lg font-bold text-slate-900">MOS26030700</div>
                <div className="mt-3 text-sm text-slate-600">Ready for print and reconciliation.</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
