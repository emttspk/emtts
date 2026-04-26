import Button from "./Button";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const plans = [
  { name: "FREE", price: "Rs 0", labels: "250", tracking: "250", moneyOrders: "Included", complaints: "Basic", units: "250", description: "For new teams validating workflow and label generation." },
  { name: "STANDARD", price: "Rs 999", labels: "1,000", tracking: "1,000", moneyOrders: "Included", complaints: "5/day, 50/month", units: "1,000", badge: "Most Popular", featured: true, description: "For growing dispatch operations that need daily shipment control." },
  { name: "BUSINESS", price: "Rs 2500", labels: "3,000", tracking: "3,000", moneyOrders: "Included", complaints: "10/day, 300/month", units: "3,000", badge: "Best Value", description: "For high-volume teams managing labels, MOs, tracking and escalations." },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-8">
      <div className="ui-page">
        <SectionTitle kicker="Packages" title="FREE, STANDARD, BUSINESS" subtitle="Professional package comparison for Labels, Tracking, Money Orders, Complaints, and Units." align="center" />

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} className={`relative p-8 ${plan.featured ? "bg-[linear-gradient(180deg,#0B6B3A,#07552E)] text-white shadow-glow" : "bg-white"}`}>
              {plan.badge ? <div className={`absolute right-6 top-6 rounded-full px-3 py-1 text-xs font-semibold ${plan.featured ? "bg-white/15 text-white" : "bg-brand/10 text-brand"}`}>{plan.badge}</div> : null}
              <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${plan.featured ? "text-emerald-100" : "text-slate-500"}`}>{plan.name}</div>
              <div className="mt-4 font-display text-5xl font-extrabold tracking-[-0.05em]">{plan.price}</div>
              <div className={`mt-2 text-sm ${plan.featured ? "text-emerald-50" : "text-slate-600"}`}>per cycle</div>
              <div className={`mt-4 text-sm leading-7 ${plan.featured ? "text-emerald-50" : "text-slate-600"}`}>{plan.description}</div>
              <div className="mt-6 grid gap-3 text-sm">
                {[
                  [`Units`, plan.units],
                  [`Tracking`, plan.tracking],
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
                Select {plan.name}
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
                <tr><td className="px-4 py-3 font-medium text-slate-700">Labels</td><td className="px-4 py-3">250</td><td className="px-4 py-3">1,000</td><td className="px-4 py-3">3,000</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Tracking</td><td className="px-4 py-3">250</td><td className="px-4 py-3">1,000</td><td className="px-4 py-3">3,000</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Money Orders</td><td className="px-4 py-3">Included</td><td className="px-4 py-3">Included</td><td className="px-4 py-3">Included</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Complaints</td><td className="px-4 py-3">Basic</td><td className="px-4 py-3">5/day, 50/month</td><td className="px-4 py-3">10/day, 300/month</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Units</td><td className="px-4 py-3">250</td><td className="px-4 py-3">1,000</td><td className="px-4 py-3">3,000</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </section>
  );
}
