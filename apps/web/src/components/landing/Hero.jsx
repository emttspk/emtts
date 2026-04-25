import { CheckCircle2, FileSpreadsheet, MapPinned, Route, WalletCards } from "lucide-react";
import Button from "./Button";
import Card from "./Card";

const badges = ["Free Labels", "Money Orders", "Tracking", "Complaint System"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[#E5E7EB] bg-[#F8FAF9]">
      <div className="pointer-events-none absolute -right-44 top-4 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,_rgba(11,93,59,0.32),_rgba(22,163,74,0.08)_58%,_transparent_72%)]" />
      <div className="ui-page relative">
        <div className="grid items-center gap-8 lg:grid-cols-[45%_55%]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-2 text-xs font-semibold text-brand">
              <CheckCircle2 className="h-4 w-4" /> Epost.pk Official Partner Platform
            </div>
            <h1 className="mt-6 text-5xl font-black leading-tight tracking-tight text-[#0F172A]">
              Free Labels, Money Orders, Tracking & Complaint System
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Book, print, track and manage Pakistan Post shipments from one dashboard.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/register">Create Free Account</Button>
              <Button to="/tracking" variant="secondary">Track Shipment</Button>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span key={badge} className="inline-flex items-center rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-xl">
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <Card className="p-5">
              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileSpreadsheet className="h-4 w-4 text-brand" /> Excel Upload Card</div>
                  <div className="mt-3 rounded-2xl border border-dashed border-brand/30 bg-brand/5 p-3 text-xs text-slate-600">orders_april.xlsx • 1,248 rows validated</div>
                </Card>

                <Card className="p-4">
                  <div className="text-sm font-semibold text-slate-900">Label Preview Card</div>
                  <div className="mt-3 rounded-2xl border border-[#E5E7EB] bg-white p-3 text-xs text-slate-700">
                    <div className="font-mono text-[11px]">||||| |||| |||| |||||</div>
                    <div className="mt-2">To: Ali Raza, Lahore</div>
                    <div>From: Epost.pk, Karachi</div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Route className="h-4 w-4 text-brand" /> Tracking Card</div>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAF9] px-3 py-2 font-mono">VPL26030700</div>
                    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAF9] px-3 py-2 font-mono">RGL26030700</div>
                    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAF9] px-3 py-2 font-mono">IRL2603070</div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><WalletCards className="h-4 w-4 text-brand" /> Money Order Card</div>
                  <div className="mt-3 rounded-2xl border border-[#E5E7EB] bg-[#F8FAF9] p-3 text-xs text-slate-700">
                    <div className="font-mono">MOS26030700</div>
                    <div className="mt-1 text-brand">Status: Generated</div>
                  </div>
                </Card>
              </div>

              <div className="mt-4 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-xs text-slate-600">
                <MapPinned className="mb-2 h-5 w-5 text-brand" />
                Unified operations view on <span className="font-semibold text-brand">www.Epost.pk</span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
