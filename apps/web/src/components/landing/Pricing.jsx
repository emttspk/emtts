import Button from "./Button";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import { PACKAGE_CATALOG } from "../../lib/packageCatalog";

const formatCount = (value) => value.toLocaleString();

export default function Pricing() {
  return (
    <section id="pricing" className="py-8">
      <div className="ui-page">
        <SectionTitle kicker="Packages" title="FREE, STANDARD, BUSINESS" subtitle="Professional package comparison for Labels, Tracking, Money Orders, Complaints, and Units." align="center" />

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PACKAGE_CATALOG.map((plan) => (
            <Card key={plan.code} className={`relative p-8 ${plan.featured ? "bg-[linear-gradient(180deg,#0B6B3A,#07552E)] text-white shadow-glow" : "bg-white"}`}>
              {plan.badge ? <div className={`absolute right-6 top-6 rounded-full px-3 py-1 text-xs font-semibold ${plan.featured ? "bg-white/15 text-white" : "bg-brand/10 text-brand"}`}>{plan.badge}</div> : null}
              <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${plan.featured ? "text-emerald-100" : "text-slate-500"}`}>{plan.code}</div>
              <div className="mt-4 font-display text-5xl font-extrabold tracking-[-0.05em]">{plan.priceText}</div>
              <div className={`mt-2 text-sm ${plan.featured ? "text-emerald-50" : "text-slate-600"}`}>per cycle</div>
              <div className={`mt-4 text-sm leading-7 ${plan.featured ? "text-emerald-50" : "text-slate-600"}`}>{plan.tagline}</div>
              <div className="mt-6 grid gap-3 text-sm">
                {[
                  [`Units`, formatCount(plan.units)],
                  [`Tracking`, formatCount(plan.tracking)],
                  [`Money orders`, plan.moneyOrders],
                  [`Complaints`, plan.complaints],
                ].map(([label, value]) => (
                  <div key={label} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${plan.featured ? "bg-white/10 text-white" : "bg-slate-50 text-slate-700"}`}>
                    <span>{label}</span>
                    <span className="font-semibold">{value}</span>
                  </div>
                ))}
              </div>
              <Button to="/register" variant={plan.featured ? "secondary" : "primary"} className={plan.featured ? "mt-8 w-full border-white/40 bg-white text-brand hover:bg-white/90" : "mt-8 w-full"}>
                Select {plan.displayName}
              </Button>
            </Card>
          ))}
        </div>

        <Card className="mt-8 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Feature</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">FREE</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">STANDARD</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">BUSINESS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                <tr><td className="px-4 py-3 font-medium text-slate-700">Labels</td><td className="px-4 py-3">{formatCount(PACKAGE_CATALOG[0].units)}</td><td className="px-4 py-3">{formatCount(PACKAGE_CATALOG[1].units)}</td><td className="px-4 py-3">{formatCount(PACKAGE_CATALOG[2].units)}</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Tracking</td><td className="px-4 py-3">{formatCount(PACKAGE_CATALOG[0].tracking)}</td><td className="px-4 py-3">{formatCount(PACKAGE_CATALOG[1].tracking)}</td><td className="px-4 py-3">{formatCount(PACKAGE_CATALOG[2].tracking)}</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Money Orders</td><td className="px-4 py-3">Included</td><td className="px-4 py-3">Included</td><td className="px-4 py-3">Included</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Complaints</td><td className="px-4 py-3">{PACKAGE_CATALOG[0].complaints}</td><td className="px-4 py-3">{PACKAGE_CATALOG[1].complaints}</td><td className="px-4 py-3">{PACKAGE_CATALOG[2].complaints}</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Units</td><td className="px-4 py-3">{formatCount(PACKAGE_CATALOG[0].units)}</td><td className="px-4 py-3">{formatCount(PACKAGE_CATALOG[1].units)}</td><td className="px-4 py-3">{formatCount(PACKAGE_CATALOG[2].units)}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </section>
  );
}
