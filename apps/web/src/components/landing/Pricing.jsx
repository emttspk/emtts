import { Link } from "react-router-dom";

const plans = [
  {
    name: "FREE PLAN",
    price: "Rs 0",
    points: ["250 labels/month", "tracking", "money orders", "No complaint"],
    highlight: false,
  },
  {
    name: "STANDARD",
    price: "Rs 999",
    points: ["1000 labels", "complaint enabled", "5/day, 50/month", "cost x5 units"],
    highlight: true,
  },
  {
    name: "BUSINESS",
    price: "Rs 2500",
    points: ["3000 labels", "complaint enabled", "10/day, 300/month", "cost x3 units"],
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="border-b border-gray-100 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0B5D3B]">Pricing</div>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">Plans built for label volume</h2>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-2xl border p-6 shadow-sm ${plan.highlight ? "border-[#16A34A]/40 bg-[#16A34A]/5" : "border-gray-100 bg-gray-50"}`}
            >
              <div className="text-sm font-semibold tracking-wide text-gray-700">{plan.name}</div>
              <div className="mt-2 text-3xl font-extrabold text-[#0B5D3B]">{plan.price}</div>
              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                {plan.points.map((point) => (
                  <li key={point} className="rounded-md bg-white px-3 py-2">{point}</li>
                ))}
              </ul>
              <Link to="/register" className="mt-5 inline-flex rounded-lg bg-[#0B5D3B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#094E32]">
                Create Free Account
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
