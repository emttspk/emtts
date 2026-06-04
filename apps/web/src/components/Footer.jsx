export default function Footer() {
  const isLoggedIn = typeof window !== "undefined" && Boolean(window.localStorage.getItem("labelgen_token"));
  const columns = [
    {
      title: "PRODUCTS",
      links: [
        { label: "All Services", href: "/#services" },
        { label: "How It Works", href: "/#how-it-works" },
        { label: "Billing Packages", href: "/#billing-packages" },
      ],
    },
    {
      title: "SHIPPING TOOLS",
      links: [
        { label: "Pakistan Post Tracking Guide", href: "/pakistan-post-tracking" },
        { label: "Track Shipment", href: "/tracking" },
        { label: "Book Parcel", href: "/upload" },
        { label: "Complaint Monitor", href: "/complaints" },
      ],
    },
    {
      title: "YOUR ACCOUNT",
      links: [
        { label: "Login", href: "/login" },
        { label: "Create Account", href: "/register" },
        { label: "Email OTP Login", href: "/email-otp-login" },
      ],
    },
    {
      title: "HELP & SUPPORT",
      links: [
        { label: "Forgot Password", href: "/forgot-password" },
        { label: "Recover Username", href: "/forgot-username" },
        { label: isLoggedIn ? "My Tickets" : "Login to create support ticket", href: isLoggedIn ? "/support" : "/login?next=%2Fsupport" },
        { label: isLoggedIn ? "Create Ticket" : "Support Tickets", href: isLoggedIn ? "/support" : "/login?next=%2Fsupport" },
      ],
    },
    {
      title: "COMPANY INFO",
      links: isLoggedIn
        ? [
            { label: "Support Tickets", href: "/support" },
            { label: "My Tickets", href: "/support" },
            { label: "Create Ticket", href: "/support" },
            { label: "Mon-Sat 9:00am-6:00pm", href: "/#support" },
            { label: "Privacy Policy & Terms", href: "/#support" },
          ]
        : [
            { label: "Support Tickets", href: "/login?next=%2Fsupport" },
            { label: "Login to create support ticket", href: "/login?next=%2Fsupport" },
            { label: "Mon-Sat 9:00am-6:00pm", href: "/#support" },
            { label: "Privacy Policy & Terms", href: "/#support" },
          ],
    },
  ];

  return (
    <footer id="support" className="border-t border-[#dce8f5] bg-[linear-gradient(180deg,#f7fbff,#f0f8ff_45%,#effaf5)] text-slate-900">
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-8 pt-10 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-[26px] border border-white/80 bg-white/85 p-5 shadow-[0_18px_44px_rgba(10,31,68,0.1)] backdrop-blur-xl md:flex md:items-center md:justify-between">
          <div className="inline-flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#0f1f3a,#0ea576)] text-sm font-extrabold text-white shadow-[0_10px_30px_rgba(12,129,109,0.3)]">EP</div>
            <div>
              <div className="text-sm font-extrabold tracking-[0.02em] text-[#0f1f3a]">ePost.pk</div>
              <div className="text-xs text-slate-500">Pakistan Post operations command center</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 md:mt-0">
            <span className="ui-badge-soft">Live Platform</span>
            <a
              href="/register"
              className="btn-primary h-10 rounded-full px-5 text-sm"
            >
              Start Free
            </a>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:items-stretch">
          {columns.map((group) => (
            <div key={group.title} className="flex h-full flex-col rounded-2xl border border-white/85 bg-white/80 p-4 shadow-[0_12px_28px_rgba(10,31,68,0.08)]">
              <h3 className="min-h-[2.25rem] text-xs font-bold uppercase tracking-[0.16em] text-slate-700">{group.title}</h3>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
                {group.links.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="transition-colors duration-200 hover:text-[#0f1f3a]">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-[#dce8f5] pt-5 text-xs text-slate-500 sm:flex sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ePost.pk. All rights reserved.</p>
          <p className="mt-2 sm:mt-0">Built for Pakistan Post operations teams.</p>
        </div>
      </div>
    </footer>
  );
}