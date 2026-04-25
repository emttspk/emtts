import Button from "./Button";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const plans = [
  { name: "FREE", price: "Rs 0", labels: "250", tracking: "250", moneyOrders: "Included", complaints: "Basic", units: "250", highlight: true },
  { name: "STANDARD", price: "Rs 999", labels: "1,000", tracking: "1,000", moneyOrders: "Included", complaints: "5/day, 50/month", units: "1,000" },
  { name: "BUSINESS", price: "Rs 2500", labels: "3,000", tracking: "3,000", moneyOrders: "Included", complaints: "10/day, 300/month", units: "3,000", badge: "Premium" },
];

export default function Pricing() {
  return (
    <section id="pricing" className="border-b border-[#E5E7EB] bg-white">
      <div className="ui-page">
        <SectionTitle kicker="Packages" title="FREE, STANDARD, BUSINESS" subtitle="Professional package comparison for Labels, Tracking, Money Orders, Complaints, and Units." align="center" />

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} className={`relative p-7 ${plan.highlight ? "border-brand bg-brand text-white" : ""}`}>
              {plan.badge ? <div className="absolute right-5 top-5 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">{plan.badge}</div> : null}
              <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${plan.highlight ? "text-emerald-100" : "text-slate-500"}`}>{plan.name}</div>
              <div className="mt-3 text-4xl font-black">{plan.price}</div>
              <div className={`mt-2 text-sm ${plan.highlight ? "text-emerald-100" : "text-slate-600"}`}>Units: {plan.units}</div>
              <Button to="/register" variant={plan.highlight ? "secondary" : "primary"} className={plan.highlight ? "mt-6 w-full border-white/50 bg-white text-brand" : "mt-6 w-full"}>
                Select {plan.name}
              </Button>
            </Card>
          ))}
        </div>

        <Card className="mt-8 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#F8FAF9]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Feature</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">FREE</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">STANDARD</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">BUSINESS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] bg-white">
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
