import { CheckCircle2, MapPinned, PackageCheck, Route, WalletCards } from "lucide-react";
import Button from "./Button";
import Card from "./Card";
import StatCard from "./StatCard";

const trustBadges = ["No Credit Card", "Free Tier", "Instant Setup"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[#E5E7EB] bg-[#F8FAF9]">
      <div className="pointer-events-none absolute -right-40 top-8 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,_rgba(11,93,59,0.28),_rgba(22,163,74,0.06)_55%,_transparent_70%)]" />
      <div className="ui-page relative">
        <div className="grid items-center gap-8 lg:grid-cols-[45%_55%]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-2 text-xs font-semibold text-brand">
              <CheckCircle2 className="h-4 w-4" /> Official Pakistan Post Partner Platform
            </div>
            <h1 className="mt-6 text-5xl font-black leading-tight tracking-tight text-[#0F172A]">
              Ship Anywhere in Pakistan.
              <span className="block text-brand">Track Every Step.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Generate labels, create money orders, and track shipments in real time.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/register">Create Free Account</Button>
              <Button href="#how-it-works" variant="secondary">See How It Works</Button>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {trustBadges.map((badge) => (
                <span key={badge} className="inline-flex items-center rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-lg">
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <Card className="p-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard title="Total Shipments" value="12,458" tone="text-[#0F172A]" />
                <StatCard title="Delivered" value="9,876" tone="text-[#16A34A]" />
                <StatCard title="In Transit" value="2,134" tone="text-brand" />
                <StatCard title="Failed" value="448" tone="text-red-600" />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <Card className="p-4">
                  <div className="text-sm font-semibold text-slate-900">Recent Shipments</div>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between"><span className="font-mono">LK123456789PK</span><span className="rounded-full bg-emerald-100 px-2 py-1 text-brand">Delivered</span></div>
                    <div className="flex items-center justify-between"><span className="font-mono">LK987654321PK</span><span className="rounded-full bg-sky-100 px-2 py-1 text-sky-700">In Transit</span></div>
                    <div className="flex items-center justify-between"><span className="font-mono">LK456789123PK</span><span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">Pending</span></div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm font-semibold text-slate-900">Tracking Map</div>
                  <div className="mt-4 rounded-2xl border border-dashed border-brand/20 bg-brand/5 p-4 text-xs text-slate-600">
                    <MapPinned className="mb-2 h-5 w-5 text-brand" />
                    Lahore to Karachi route active
                    <div className="mt-2 flex items-center gap-2"><Route className="h-4 w-4 text-brand" /> Next status sync in 2 min</div>
                  </div>
                </Card>
              </div>
            </Card>

            <Card className="absolute -left-6 top-8 hidden p-3 lg:block">
              <div className="flex items-center gap-2 text-xs text-slate-700"><PackageCheck className="h-4 w-4 text-brand" /> Label Card</div>
            </Card>
            <Card className="absolute -right-6 top-40 hidden p-3 lg:block">
              <div className="flex items-center gap-2 text-xs text-slate-700"><Route className="h-4 w-4 text-brand" /> Tracking Card</div>
            </Card>
            <Card className="absolute bottom-4 right-10 hidden p-3 lg:block">
              <div className="flex items-center gap-2 text-xs text-slate-700"><WalletCards className="h-4 w-4 text-brand" /> Money Order Card</div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
