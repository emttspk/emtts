const columns = [
  {
    title: "Products",
    links: [
      { label: "Book Parcel", href: "/upload" },
      { label: "Generate Label", href: "#labels" },
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
    <footer id="support" className="border-t border-slate-200 bg-white text-slate-900">
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-8 pt-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#0f172a,#0b6b3a)] text-sm font-extrabold text-white shadow-[0_10px_30px_rgba(11,107,58,0.34)]">EP</div>
            <div>
              <div className="text-sm font-extrabold tracking-[0.02em] text-slate-900">Epost.pk</div>
              <div className="text-xs text-slate-500">Pakistan Post Operations Platform</div>
            </div>
          </div>
          <a
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition-all duration-200 hover:border-slate-500"
          >
            Create Free Account
          </a>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {columns.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">{group.title}</h3>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
                {group.links.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="transition-colors duration-200 hover:text-slate-900">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500 sm:flex sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Epost.pk. All rights reserved.</p>
          <p className="mt-2 sm:mt-0">Built for Pakistan Post operations teams.</p>
        </div>
      </div>
    </footer>
  );
}