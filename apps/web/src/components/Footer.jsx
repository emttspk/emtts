const columns = [
  {
    title: "Products",
    links: [
      { label: "Book Parcel", href: "/upload" },
      { label: "Labels", href: "#labels" },
      { label: "Money Orders", href: "#money-orders" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "#support" },
      { label: "Contact", href: "#contact" },
      { label: "Complaint Assistance", href: "#complaints" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Platform", href: "/" },
      { label: "Security", href: "#security" },
      { label: "Terms", href: "#terms" },
    ],
  },
  {
    title: "Tracking",
    links: [
      { label: "Track Shipment", href: "/tracking" },
      { label: "Route Visibility", href: "/tracking" },
      { label: "Delivery Updates", href: "/tracking" },
    ],
  },
  {
    title: "Pricing",
    links: [
      { label: "Plans", href: "/pricing" },
      { label: "Billing", href: "/billing" },
      { label: "Enterprise", href: "#pricing" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "support@epost.pk", href: "mailto:support@epost.pk" },
      { label: "Mon-Sat 9:00am-6:00pm", href: "#contact" },
      { label: "Pakistan Operations Desk", href: "#contact" },
    ],
  },
];

export default function Footer() {
  return (
    <footer id="support" className="relative overflow-hidden border-t border-white/20 bg-[linear-gradient(160deg,#0f172a_0%,#0e2239_56%,#0b6b3a_100%)] text-white">
      <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-12 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[1240px] px-4 pb-8 pt-14 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">P.Post Dispatch Platform</div>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.03em] text-white">Shipping, Tracking and Money Orders in one modern workspace</h2>
          </div>
          <a
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur transition-all duration-200 hover:bg-white/20"
          >
            Create Free Account
          </a>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {columns.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">{group.title}</h3>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-200">
                {group.links.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="transition-colors duration-200 hover:text-white">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-white/20 pt-5 text-xs text-slate-300 sm:flex sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} P.Post Dispatch. All rights reserved.</p>
          <p className="mt-2 sm:mt-0">Built for premium Pakistan Post operations teams.</p>
        </div>
      </div>
    </footer>
  );
}