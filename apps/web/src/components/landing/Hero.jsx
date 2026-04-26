import { ArrowRight, CheckCircle2, FileSpreadsheet, Package2, Radar, Route, ShieldCheck, WalletCards } from "lucide-react";
import Button from "./Button";
import Card from "./Card";

const badges = ["Booking", "Free Labels", "Money Order", "Tracking", "Complaint System"];

const dashboardStats = [
  ["Total Labels", "12,840"],
  ["Tracking", "8,420"],
  ["Money Orders", "3,120"],
  ["Complaints", "27"],
];

const excelColumns = ["Date", "Consignee", "Address", "Barcode", "MO"];
const labelTabs = ["A4", "Envelope", "Multi"];

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
              <CheckCircle2 className="h-4 w-4" /> Epost.pk Premium Platform
            </div>
            <h1 className="mt-8 max-w-2xl font-display text-[34px] font-extrabold leading-[0.94] tracking-[-0.06em] text-brand-ink sm:text-5xl md:text-[48px] lg:text-[72px]">
              Book.<br />
              Print.<br />
              Track.<br />
              Resolve.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 md:text-[22px] md:leading-9">
              Epost.pk combines Booking, Free Labels, Money Order, Tracking, and Complaint System into one premium operations workspace for Pakistan Post teams.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Button to="/register">Create Free Account</Button>
              <Button href="#products" variant="secondary">Open Product Demo</Button>
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
                ["Booking", "Fast parcel intake and dispatch batching"],
                ["Free Labels", "A4 and envelope print packs in one click"],
                ["Money Order", "Auto-generated MOS references and values"],
                ["Tracking", "Live route and delivery-state visibility"],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-3xl border border-white/70 bg-white/70 px-4 py-4 shadow-sm backdrop-blur-xl">
                  <div className="text-sm font-semibold text-brand-ink">{title}</div>
                  <div className="mt-1 text-xs leading-6 text-slate-500">{detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[49rem]">
            <div className="pointer-events-none absolute left-10 top-8 h-36 w-36 rounded-full bg-brand/20 blur-3xl" />
            <div className="pointer-events-none absolute right-0 top-16 h-48 w-48 rounded-full bg-slate-900/10 blur-3xl" />

            <Card className="absolute right-2 top-0 z-10 w-[21rem] p-5 md:right-8">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-brand-ink">Dashboard Preview</div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">Live activity</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {dashboardStats.map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[24px] bg-[linear-gradient(135deg,#0F172A,#1E293B)] p-4 text-white shadow-card">
                <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
                  <span>Chart: 7 day dispatch trend</span>
                  <span>Updated 2m ago</span>
                </div>
                <div className="grid grid-cols-7 items-end gap-1.5">
                  {[28, 42, 36, 54, 64, 58, 72].map((bar, idx) => (
                    <div key={idx} className="h-16 rounded bg-white/10 p-1">
                      <div className="w-full rounded bg-emerald-300/90" style={{ height: `${bar}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    ["Batch imported", "Queue prepared"],
                    ["Label run completed", "PDF package ready"],
                    ["Complaint filed", "Awaiting response"],
                  ].map(([title, detail]) => (
                    <div key={title} className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2">
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

            <Card className="absolute left-0 top-6 z-20 w-[19rem] animate-float p-5">
              <div className="flex items-center justify-between text-sm font-semibold text-brand-ink">
                <span className="inline-flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-brand" /> Excel Upload Preview</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">validated</span>
              </div>
              <div className="mt-4 rounded-[22px] border border-dashed border-brand/25 bg-brand/5 p-4">
                <div className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-600">Rows imported: 1,244 / 1,250</div>
                <div className="mt-3 grid grid-cols-5 gap-1 text-[10px] font-semibold text-slate-500">
                  {excelColumns.map((column) => (
                    <div key={column} className="rounded bg-white px-1.5 py-1 text-center">{column}</div>
                  ))}
                </div>
                <div className="mt-3 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2"><span>Validation</span><span className="font-semibold text-emerald-700">Passed</span></div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2"><span>Missing cities</span><span className="font-semibold text-amber-700">4</span></div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2"><span>MO rows</span><span className="font-semibold text-slate-900">312</span></div>
                </div>
              </div>
            </Card>

            <Card className="absolute left-8 top-64 z-30 w-[20rem] p-5 md:left-16">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink"><Package2 className="h-4 w-4 text-brand" /> Label Preview</div>
              <div className="mt-4 flex gap-2">
                {labelTabs.map((tab, idx) => (
                  <span key={tab} className={`rounded-full px-3 py-1 text-xs font-semibold ${idx === 0 ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{tab}</span>
                ))}
              </div>
              <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-inner">
                <div className="rounded-2xl bg-slate-900 px-3 py-2 font-mono text-[11px] tracking-[0.35em] text-white">||| |||| ||||| ||||</div>
                <div className="mt-4 grid gap-2 text-sm text-slate-600">
                  <div><span className="font-semibold text-slate-900">Receiver</span> Abdul Rehman</div>
                  <div><span className="font-semibold text-slate-900">Sender</span> Epost.pk Dispatch Hub</div>
                  <div><span className="font-semibold text-slate-900">Tracking ID</span> <span className="font-mono">VPL26030700</span></div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-brand" /> A4 and envelope styles verified
                </div>
              </div>
            </Card>

            <Card className="absolute bottom-20 right-0 z-20 w-[21rem] animate-float p-5 [animation-delay:1.2s] md:right-10">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink"><Route className="h-4 w-4 text-brand" /> Tracking Preview</div>
              <div className="mt-4 space-y-3">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Origin: Lahore</span>
                    <span>Destination: Karachi</span>
                  </div>
                  <div className="mt-2 rounded-full bg-white p-1">
                    <div className="relative h-2 rounded-full bg-slate-200">
                      <div className="absolute left-0 top-0 h-2 w-3/5 rounded-full bg-brand animate-pulse" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                    <span className="font-mono font-semibold text-slate-900">VPL26030700</span>
                    <span className="status-pill border-amber-200 bg-amber-50 text-amber-700">In Transit</span>
                  </div>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Route map pulse</div>
                    <Radar className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Animated path updates while tracking engine runs.</div>
                </div>
              </div>
            </Card>

            <Card className="absolute bottom-0 left-0 z-10 w-[18rem] p-5 [animation-delay:2s] md:left-10">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink"><WalletCards className="h-4 w-4 text-brand" /> Money Order Preview</div>
              <div className="mt-4 rounded-[24px] bg-[linear-gradient(135deg,rgba(11,107,58,0.08),rgba(11,107,58,0.18))] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-brand">Status: Generated</div>
                <div className="mt-2 font-mono text-lg font-bold text-slate-900">MOS26030700</div>
                <div className="mt-2 text-sm text-slate-600">Amount: PKR 8,450</div>
                <div className="mt-3 text-sm text-slate-600">Ready for print and reconciliation.</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
