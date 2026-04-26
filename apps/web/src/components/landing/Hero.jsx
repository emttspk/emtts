import { ArrowRight, CheckCircle2, FileSpreadsheet, Package2, Radar, Route, ShieldCheck, WalletCards } from "lucide-react";
import Button from "./Button";
import Card from "./Card";
import {
  HeroLabelPreview,
  HeroTrackingPreview,
  HeroMoneyOrderPreview,
  HeroDashboardPreview,
} from "./HeroPreviewComponents";

const badges = ["Booking", "Free Labels", "Money Order", "Tracking", "Complaint System"];
const excelColumns = ["Date", "Consignee", "Address", "Barcode", "MO"];

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

            <HeroDashboardPreview />

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

            <HeroLabelPreview />

            <HeroTrackingPreview />

            <HeroMoneyOrderPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
