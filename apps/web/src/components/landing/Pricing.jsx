import { useEffect, useMemo, useState } from "react";
import Button from "./Button";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import { fetchPlans } from "../../lib/PackageService";

const formatCount = (value) => value.toLocaleString();
const formatPrice = (priceCents) => `Rs ${Math.round((priceCents || 0) / 100).toLocaleString()}`;

function complaintText(plan) {
  const included = Number(plan.complaintsIncluded || 0);
  if (included <= 0) return "Not included";

  const parts = [];
  if (plan.dailyComplaintLimit && plan.dailyComplaintLimit > 0) {
    parts.push(`${plan.dailyComplaintLimit}/day`);
  }
  if (plan.monthlyComplaintLimit && plan.monthlyComplaintLimit > 0) {
    parts.push(`${plan.monthlyComplaintLimit}/month`);
  }
  if (parts.length === 0) {
    parts.push(`${included}/month`);
  }
  return parts.join(", ");
}

export default function Pricing() {
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    fetchPlans()
      .then((items) => setPlans(items.filter((plan) => !plan.isSuspended)))
      .catch(() => setPlans([]));
  }, []);

  const orderedPlans = useMemo(() => {
    return [...plans].sort((a, b) => (a.discountPriceCents ?? a.priceCents) - (b.discountPriceCents ?? b.priceCents));
  }, [plans]);

  return (
    <section id="pricing" className="py-10 md:py-12">
      <div className="ui-page">
        <SectionTitle kicker="Packages" title="FREE, STANDARD, BUSINESS" subtitle="Professional package comparison for Labels, Tracking, Money Orders, Complaints, and Units." align="center" />

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {orderedPlans.map((plan, index) => {
            const featured = index === 1;
            const displayName = String(plan.name || "PLAN").replace(/\s+plan$/i, "").trim().toUpperCase();
            const priceCents = plan.discountPriceCents ?? plan.priceCents;
            const tagline = `${formatCount(plan.monthlyLabelLimit || 0)} units included every cycle.`;
            return (
              <Card key={plan.id} className={`relative rounded-3xl p-8 shadow-xl ${featured ? "bg-[linear-gradient(180deg,#0B6B3A,#07552E)] text-white shadow-glow" : "bg-white"}`}>
                {featured ? <div className={`absolute right-6 top-6 rounded-full px-3 py-1 text-xs font-semibold ${featured ? "bg-white/15 text-white" : "bg-brand/10 text-brand"}`}>Most popular</div> : null}
                <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${featured ? "text-emerald-100" : "text-slate-500"}`}>{displayName}</div>
                <div className="mt-4 font-display text-5xl font-extrabold tracking-[-0.05em]">{formatPrice(priceCents)}</div>
                <div className={`mt-2 text-sm ${featured ? "text-emerald-50" : "text-slate-600"}`}>per cycle</div>
                <div className={`mt-4 text-sm leading-7 ${featured ? "text-emerald-50" : "text-slate-600"}`}>{tagline}</div>
                <div className="mt-6 grid gap-3 text-sm">
                  {[
                    ["Units", formatCount(plan.monthlyLabelLimit || 0)],
                    ["Tracking", formatCount(plan.monthlyTrackingLimit || 0)],
                    ["Money orders", (plan.moneyOrdersIncluded || 0) > 0 ? "Included" : "Not included"],
                    ["Complaints", complaintText(plan)],
                  ].map(([label, value]) => (
                    <div key={label} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${featured ? "bg-white/10 text-white" : "bg-slate-50 text-slate-700"}`}>
                      <span>{label}</span>
                      <span className="font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
                <Button to={priceCents > 0 ? "/billing" : "/register"} variant={featured ? "secondary" : "primary"} className={featured ? "mt-8 w-full border-white/40 bg-white text-brand hover:bg-white/90" : "mt-8 w-full"}>
                  Select {displayName}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
