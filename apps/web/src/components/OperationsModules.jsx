const MODULES = [
  {
    title: "Label Generation",
    image: "/assets/label.png",
    href: "/register",
    description: "Generate printable shipping labels instantly",
  },
  {
    title: "Money Orders",
    image: "/assets/money-order.png",
    href: "/register",
    description: "Create verified money orders with dispatch records",
  },
  {
    title: "Tracking",
    image: "/assets/track.png",
    href: "/tracking",
    description: "Track parcel movement and delivery status in real time",
  },
  {
    title: "Dashboard",
    image: "/assets/dashboard.png",
    href: "/dashboard",
    description: "Manage shipments, analytics, and operational workflow",
  },
  {
    title: "Complaints",
    image: "/assets/complaint.png",
    href: "/complaints",
    description: "Register and monitor customer complaints",
  },
];

const BILLING_PACKAGES = [
  {
    name: "FREE",
    price: "Rs 0 / cycle",
    shipmentLimit: "Labels/Units: 250",
    moneyOrderLimit: "Tracking: 250",
    trackingAccess: "Money Orders: Included",
    complaintSupport: "Complaints: 1/day",
  },
  {
    name: "STANDARD",
    price: "Rs 999 / cycle",
    shipmentLimit: "Labels/Units: 1,000",
    moneyOrderLimit: "Tracking: 1,000",
    trackingAccess: "Money Orders: Included",
    complaintSupport: "Complaints: 5/day, 50/month",
  },
  {
    name: "BUSINESS",
    price: "Rs 2,500 / cycle",
    shipmentLimit: "Labels/Units: 3,000",
    moneyOrderLimit: "Tracking: 3,000",
    trackingAccess: "Money Orders: Included",
    complaintSupport: "Complaints: 10/day, 300/month (Admin: Unlimited)",
  },
];

export default function OperationsModules() {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f4fbff_0%,#f8fcfa_45%,#eef6ff_100%)] py-14 md:py-16">
      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Operations Product Suite</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-4xl">
            Core Modules
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
          {MODULES.map((module) => (
            <article
              key={module.title}
              className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-[0_20px_42px_rgba(15,23,42,0.14)] backdrop-blur-lg transition hover:-translate-y-1 hover:shadow-[0_26px_54px_rgba(15,23,42,0.18)]"
            >
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img src={module.image} alt={module.title} className="h-[240px] w-full object-contain p-4" loading="lazy" />
              </div>
              <h3 className="mt-4 text-lg font-black tracking-[-0.02em] text-slate-900">{module.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{module.description}</p>
              <a
                href={module.href}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-4 text-sm font-bold text-white"
              >
                Open Module
              </a>
            </article>
          ))}
        </div>

        <div className="mt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Billing Plans</p>
            <h3 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-4xl">
              Flexible Billing Packages
            </h3>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {BILLING_PACKAGES.map((plan) => (
              <article
                key={plan.name}
                className="rounded-2xl border border-white/80 bg-white/75 p-6 shadow-[0_22px_44px_rgba(15,23,42,0.14)] backdrop-blur-xl"
              >
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">{plan.name}</div>
                <div className="mt-2 text-2xl font-black tracking-[-0.02em] text-slate-950">{plan.price}</div>
                <ul className="mt-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>{plan.shipmentLimit}</li>
                  <li>{plan.moneyOrderLimit}</li>
                  <li>{plan.trackingAccess}</li>
                  <li>{plan.complaintSupport}</li>
                </ul>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}