import { CheckCircle2, ShieldCheck } from "lucide-react";
import Button from "./Button";
import {
  HeroPreviewStack,
} from "./HeroPreviewComponents";

const badges = ["Booking", "Free Labels", "Money Order", "Tracking", "Complaint System"];
const trustSignals = [
  "Pakistan Post workflow ready",
  "Code128 label output",
  "Live shipment timeline",
  "Money order reconciliation",
];
const productLogos = ["BOOKING", "LABELS", "TRACKING", "MONEY ORDER", "COMPLAINTS"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(175deg,#ecfdf3_0%,#f8fcfa_45%,#eefaf4_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-hero-grid bg-[size:30px_30px] opacity-35" />
      <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-10 h-[34rem] w-[34rem] rounded-full bg-brand/15 blur-3xl" />
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

            <div className="mt-8 rounded-3xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                {trustSignals.map((signal) => (
                  <span key={signal} className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-1.5 font-medium">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    {signal}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-white/80 bg-white/70 p-4 backdrop-blur-xl">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Product Suite</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {productLogos.map((logo) => (
                  <span key={logo} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold tracking-[0.1em] text-white">
                    {logo}
                  </span>
                ))}
              </div>
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

          <div className="relative min-h-[40rem]">
            <div className="pointer-events-none absolute left-10 top-8 h-36 w-36 rounded-full bg-brand/20 blur-3xl" />
            <div className="pointer-events-none absolute right-0 top-16 h-48 w-48 rounded-full bg-slate-900/10 blur-3xl" />
            <HeroPreviewStack />
          </div>
        </div>
      </div>
    </section>
  );
}
