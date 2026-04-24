import { Link } from "react-router-dom";

const plans = [
  {
    name: "FREE",
    price: "Rs 0",
    per: "/month",
    features: ["250 labels / month", "Bulk tracking", "Money orders"],
    cta: "Create Free Account",
  },
  {
    name: "STANDARD",
    price: "Rs 999",
    per: "/month",
    features: ["1,000 labels / month", "Bulk tracking", "Money orders", "Complaint automation"],
    cta: "Create Free Account",
    recommended: true,
  },
  {
    name: "BUSINESS",
    price: "Rs 2500",
    per: "/month",
    features: ["3,000 labels / month", "Bulk tracking", "Money orders", "Priority support"],
    cta: "Create Free Account",
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="border-b border-emerald-100 bg-[#f8fcf9]">
      <div className="ui-page">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Pricing</div>
          <h2 className="mt-4 text-4xl font-bold text-slate-900">Simple and transparent plans</h2>
          <p className="mt-3 text-base text-slate-600">Start free. Upgrade as your shipment volume grows.</p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`ui-card relative flex flex-col p-8 ${plan.recommended ? "border-brand bg-brand text-white" : ""}`}
            >
              {plan.recommended ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand shadow-card">
                  Most Popular
                </span>
              ) : null}
              <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${plan.recommended ? "text-emerald-100" : "text-slate-500"}`}>
                {plan.name}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">{plan.price}</span>
                <span className={plan.recommended ? "text-emerald-100" : "text-slate-500"}>{plan.per}</span>
              </div>

              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {plan.features.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${plan.recommended ? "bg-emerald-200" : "bg-brand"}`} />
                    <span className={plan.recommended ? "text-emerald-50" : "text-slate-700"}>{item}</span>
                  </li>
                ))}
              </ul>

              <Link to="/register" className={plan.recommended ? "btn-secondary mt-7 border-white/40 bg-white text-brand" : "btn-primary mt-7"}>
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
