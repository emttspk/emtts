const MAIN_CARDS = [
  { title: "Label Generation", image: "/assets/label.png", href: "/register", orientation: "portrait" },
  { title: "Money Orders", image: "/assets/money-order.png", href: "/register", orientation: "portrait" },
  { title: "Tracking", image: "/assets/track.png", href: "/tracking", orientation: "landscape" },
  { title: "Dashboard", image: "/assets/dashboard.png", href: "/dashboard", orientation: "landscape" },
  { title: "Complaints", image: "/assets/complaint.png", href: "/complaints", orientation: "portrait" },
  { title: "Package", image: "/assets/package.png", href: "/register", orientation: "portrait" },
  { title: "Delivery Monitoring", image: "/assets/tracking.png", href: "/tracking", orientation: "landscape" },
];

const SUITE_CARDS = [
  { title: "Label Generation", image: "/assets/label.png" },
  { title: "Money Order Generation", image: "/assets/money-order.png" },
  { title: "Tracking", image: "/assets/tracking.png" },
  { title: "Dashboard", image: "/assets/dashboard.png" },
];

export default function ProductShowcase() {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f4fbff_0%,#f8fcfa_40%,#eef6ff_100%)] py-14 md:py-16">
      <div className="mx-auto w-full max-w-[1400px] px-5 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Main Product Cards</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-4xl">Operations Product Modules</h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {MAIN_CARDS.map((card) => (
            <article
              key={card.title}
              className="flex h-full flex-col rounded-xl border border-white/80 bg-white/70 p-3 shadow-[0_18px_35px_rgba(15,23,42,0.14)] backdrop-blur-lg transition hover:-translate-y-1 hover:shadow-[0_24px_44px_rgba(15,23,42,0.18)]"
            >
              <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img
                  src={card.image}
                  alt={card.title}
                  loading="lazy"
                  className={`h-[260px] w-full ${card.orientation === "portrait" ? "object-contain p-3" : "object-cover"}`}
                />
              </div>

              <h3 className="text-lg font-black tracking-[-0.02em] text-slate-900">{card.title}</h3>

              <a
                href={card.href}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-4 text-sm font-bold text-white"
              >
                Open Module
              </a>
            </article>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-slate-200 bg-white/85 p-6 shadow-sm">
          <h3 className="text-center text-xl font-black tracking-[-0.02em] text-slate-950">Operations Product Suite</h3>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {SUITE_CARDS.map((card) => (
              <article key={card.title} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                  <img src={card.image} alt={card.title} className="h-[160px] w-full object-contain p-2" />
                </div>
                <p className="mt-3 text-center text-sm font-bold text-slate-900">{card.title}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
