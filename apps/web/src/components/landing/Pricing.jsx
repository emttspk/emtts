import Button from "./Button";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const plans = [
  {
    name: "FREE",
    price: "Rs 0",
    limits: "250 units / month",
    complaints: "Basic complaint queue",
    features: ["Labels", "Tracking", "Money Orders"],
    highlight: true,
  },
  {
    name: "STANDARD",
    price: "Rs 999",
    limits: "1,000 units / month",
    complaints: "5/day, 50/month",
    features: ["Priority queue", "Analytics", "Email alerts"],
  },
  {
    name: "BUSINESS",
    price: "Rs 2500",
    limits: "3,000 units / month",
    complaints: "10/day, 300/month",
    features: ["Advanced analytics", "API access", "Team support"],
    badge: "Premium",
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="border-b border-[#E5E7EB] bg-white">
      <div className="ui-page">
        <SectionTitle kicker="Pricing" title="Plans Built for Every Dispatch Stage" subtitle="Transparent units, complaint limits, and premium controls." align="center" />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} className={`relative p-7 ${plan.highlight ? "border-brand bg-brand text-white" : ""}`}>
              {plan.badge ? <div className="absolute right-5 top-5 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">{plan.badge}</div> : null}
              <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${plan.highlight ? "text-emerald-100" : "text-slate-500"}`}>{plan.name}</div>
              <div className="mt-3 text-4xl font-black">{plan.price}</div>
              <div className={`mt-2 text-sm ${plan.highlight ? "text-emerald-100" : "text-slate-600"}`}>{plan.limits}</div>
              <div className={`mt-1 text-sm ${plan.highlight ? "text-emerald-100" : "text-slate-600"}`}>{plan.complaints}</div>
              <ul className="mt-5 space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className={plan.highlight ? "text-emerald-50" : "text-slate-700"}>• {feature}</li>
                ))}
              </ul>
              <Button to="/register" variant={plan.highlight ? "secondary" : "primary"} className={plan.highlight ? "mt-6 w-full border-white/50 bg-white text-brand" : "mt-6 w-full"}>
                Get Started
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
