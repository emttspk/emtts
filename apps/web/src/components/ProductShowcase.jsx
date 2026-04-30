const showcaseCards = [
  { title: "Label", image: "/assets/label.png", href: "/register" },
  { title: "Money Orders", image: "/assets/money-order.png", href: "/register" },
  { title: "Tracking", image: "/assets/tracking.png", href: "/tracking" },
  { title: "Dashboard", image: "/assets/dashboard.png", href: "/dashboard" },
  { title: "Complaints", image: "/assets/complaint.png", href: "/complaints" },
  { title: "Package", image: "/assets/package.png", href: "/register" },
  { title: "Delivery Monitoring", image: "/assets/tracking.png", href: "/tracking" },
];

export default function ProductShowcase() {
  return (
    <section id="features" className="relative overflow-hidden bg-[#f8fcfa] py-14 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(11,107,58,0.08),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(15,23,42,0.08),transparent_24%)]" />
      <div className="ui-page relative">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Products</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-900 sm:text-4xl">Operational Modules</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Seven core surfaces for Pakistan Post workflows.</p>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {showcaseCards.map((card) => (
            <a
              href={card.href}
              key={card.title}
              className="group block overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(15,23,42,0.12)]"
            >
              <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                <img src={card.image} alt={card.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
              </div>
              <div className="px-1 pb-1 pt-3 text-base font-bold tracking-[-0.01em] text-slate-900">{card.title}</div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
