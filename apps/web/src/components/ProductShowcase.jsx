const mainCards = [
  {
    title: "Label Generation",
    image: "/assets/label.png",
    href: "/register",
    orientation: "portrait",
    actionLine: "Create and print dispatch-ready labels.",
  },
  {
    title: "Money Orders",
    image: "/assets/money-order.png",
    href: "/register",
    orientation: "portrait",
    actionLine: "Process money order workflows with confidence.",
  },
  {
    title: "Tracking",
    image: "/assets/track.png",
    href: "/tracking",
    orientation: "landscape",
    actionLine: "Track live shipment movement across stages.",
  },
  {
    title: "Dashboard",
    image: "/assets/dashboard.png",
    href: "/dashboard",
    orientation: "landscape",
    actionLine: "View operational KPIs and dispatch performance.",
  },
  {
    title: "Complaints",
    image: "/assets/complaint.png",
    href: "/complaints",
    orientation: "portrait",
    actionLine: "Manage customer complaint intake and follow-up.",
  },
  {
    title: "Package Plans",
    image: "/assets/package.png",
    href: "/register",
    orientation: "portrait",
    actionLine: "Configure package plans for shipping operations.",
  },
  {
    title: "Delivery Monitoring",
    image: "/assets/tracking.png",
    href: "/tracking",
    orientation: "landscape",
    actionLine: "Monitor delivery status and service timelines.",
  },
];

const operationalCards = [
  {
    title: "Label",
    image: "/assets/label.png",
    href: "/register",
    layout: "vertical",
    orientation: "portrait",
  },
  {
    title: "Money Orders",
    image: "/assets/money-order.png",
    href: "/register",
    layout: "horizontal",
    orientation: "landscape",
  },
  {
    title: "Tracking",
    image: "/assets/track.png",
    href: "/tracking",
    layout: "horizontal",
    orientation: "landscape",
  },
  {
    title: "Complaints",
    image: "/assets/complaint.png",
    href: "/complaints",
    layout: "vertical",
    orientation: "portrait",
  },
  {
    title: "Package",
    image: "/assets/package.png",
    href: "/register",
    layout: "horizontal",
    orientation: "landscape",
  },
  {
    title: "Delivery Monitoring",
    image: "/assets/tracking.png",
    href: "/tracking",
    layout: "vertical",
    orientation: "portrait",
  },
];

export default function ProductShowcase() {
  return (
    <section id="features" className="relative overflow-hidden bg-[#f7fcfa] py-14 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_15%,rgba(11,107,58,0.10),transparent_30%),radial-gradient(circle_at_92%_0%,rgba(15,23,42,0.08),transparent_26%)]" />

      <div className="ui-page relative">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Homepage Modules</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-900 sm:text-4xl">Pakistan Post Product Suite</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
            Premium visual module cards for core products and daily operational workflows.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {mainCards.map((card) => (
            <article key={card.title} className="group [perspective:1300px]">
              <div className="relative h-[260px] md:h-[320px] [transform-style:preserve-3d] transition duration-700 md:group-hover:[transform:rotateY(180deg)] md:group-focus-within:[transform:rotateY(180deg)]">
                <div className="absolute inset-0 overflow-hidden rounded-xl border border-white/70 bg-white/80 p-3 shadow-lg backdrop-blur-xl [backface-visibility:hidden]">
                  <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img
                      src={card.image}
                      alt={card.title}
                      loading="lazy"
                      className={`h-full w-full ${card.orientation === "portrait" ? "object-contain p-2" : "object-cover"}`}
                    />
                  </div>
                </div>

                <div className="absolute inset-0 rounded-xl border border-emerald-200/60 bg-[linear-gradient(145deg,#0f172a,#0b6b3a)] p-5 text-white shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <div className="flex h-full flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-bold tracking-[-0.01em]">{card.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-emerald-50/95">{card.actionLine}</p>
                    </div>
                    <a
                      href={card.href}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-white px-4 text-sm font-bold text-emerald-800 transition hover:brightness-95"
                    >
                      Open Module
                    </a>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xl font-black tracking-[-0.02em] text-slate-900">Operational Modules</h3>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">6 Active Modules</p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {operationalCards.map((card) => (
              <article
                key={card.title}
                className="group rounded-xl border border-white/70 bg-white/85 p-3 shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-[0_18px_35px_rgba(15,23,42,0.14)]"
              >
                <div className={`grid gap-3 ${card.layout === "horizontal" ? "grid-cols-[44%_56%]" : "grid-cols-[38%_62%]"}`}>
                  <div
                    className={`overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${
                      card.layout === "horizontal" ? "h-24" : "h-32"
                    }`}
                  >
                    <img
                      src={card.image}
                      alt={card.title}
                      loading="lazy"
                      className={`h-full w-full ${card.orientation === "portrait" ? "object-contain p-2" : "object-cover"}`}
                    />
                  </div>

                  <div className="flex min-w-0 flex-col justify-between">
                    <h4 className="text-base font-bold tracking-[-0.01em] text-slate-900">{card.title}</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Operational access for daily dispatch actions.</p>
                    <a
                      href={card.href}
                      className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-3 text-xs font-bold text-white transition hover:brightness-105"
                    >
                      Open
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
