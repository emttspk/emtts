import { useState } from "react";
import { Menu, X } from "lucide-react";
import { trackLeadStart } from "../lib/analytics";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isLoggedIn = typeof window !== "undefined" && Boolean(window.localStorage.getItem("labelgen_token"));
  const showMobileCtaBar =
    typeof window !== "undefined" &&
    !/^\/(login|register(?:\/profile)?|forgot-password|forgot-username|email-otp-login)$/i.test(pathname);
  const navLinks = [
    { href: "/#services", label: "Services" },
    { href: "/#how-it-works", label: "How It Works" },
    { href: "/tracking", label: "Track" },
    { href: "/#billing-packages", label: "Packages" },
    { href: isLoggedIn ? "/support" : "/login?next=%2Fsupport", label: "Support" },
  ];
  const ctaClass = "inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold tracking-[0.01em]";

  return (
    <header className="sticky top-0 z-50 border-b border-[#dce8f5] bg-white/92 shadow-[0_10px_28px_rgba(10,31,68,0.08)] backdrop-blur-2xl">
      <div className="mx-auto flex h-[58px] w-full max-w-[1280px] items-center justify-between gap-3 px-4 sm:h-[68px] sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
          <a
            href="/"
            className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-[#dce8f5] bg-white px-1.5 py-1.5 shadow-[0_12px_30px_rgba(14,165,118,0.12)] sm:px-2 sm:py-2"
          >
            <img src="/assets/pakistan-post-logo.png" alt="Pakistan Post" className="h-7 w-auto object-contain sm:h-8" width="108" height="32" loading="eager" decoding="async" fetchPriority="high" />
          </a>
          <div className="min-w-0 leading-tight">
            <div className="whitespace-nowrap text-[14px] font-extrabold tracking-[0.01em] text-slate-900 sm:text-[15px]">ePost.pk</div>
            <div className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-slate-500 sm:text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live operations workspace
            </div>
          </div>
        </div>

        <nav className="hidden min-w-0 flex-1 items-center justify-center px-4 lg:flex">
          <div className="flex items-center gap-5 whitespace-nowrap text-[13px] font-semibold text-slate-700 xl:gap-7">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`whitespace-nowrap py-2 font-semibold transition-colors duration-200 hover:text-[#0ea576] ${
                  pathname === item.href ? "text-slate-950" : "text-slate-700"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="hidden items-center justify-end gap-2.5 whitespace-nowrap lg:flex">
          <a
            href="/login"
            className={`${ctaClass} min-w-[122px] rounded-xl border border-[#dce8f5] bg-white text-slate-700 shadow-[0_10px_24px_rgba(10,31,68,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0b7f6d] hover:text-[#0b7f6d]`}
          >
            Login
          </a>
          <a
            href="/register"
            className={`${ctaClass} min-w-[162px] rounded-xl bg-[linear-gradient(135deg,#0f1f3a,#0ea576)] text-white shadow-[0_12px_28px_rgba(10,31,68,0.24)] transition-transform duration-200 hover:-translate-y-0.5`}
          >
            Start Free
          </a>
        </div>

        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#dce8f5] bg-white text-slate-700 sm:h-10 sm:w-10"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-[#e9f1fa] bg-white px-4 pb-5 pt-3.5 shadow-[0_16px_36px_rgba(10,31,68,0.1)] lg:hidden">
          <div className="mx-auto grid w-full max-w-[1240px] gap-2">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl border border-transparent px-4 py-2.5 text-sm font-semibold text-slate-900 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <a href="/login" className="inline-flex h-11 items-center justify-center rounded-xl border border-[#dce8f5] bg-white px-3 text-center text-sm font-semibold text-slate-800 shadow-sm">
                Login
              </a>
              <a href="/register" className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0f1f3a,#0ea576)] px-3 text-center text-sm font-bold text-white shadow-[0_6px_18px_rgba(10,31,68,0.2)]">
                Start Free
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {showMobileCtaBar ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#dce8f5] bg-white/96 px-4 py-3 shadow-[0_-12px_32px_rgba(10,31,68,0.12)] backdrop-blur-2xl lg:hidden">
          <div className="mx-auto grid w-full max-w-[1240px] grid-cols-2 gap-2">
            <a
              href="/register"
              onClick={() => trackLeadStart("navbar_mobile")}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0f1f3a,#0ea576)] px-3 text-center text-sm font-bold text-white shadow-[0_10px_26px_rgba(10,31,68,0.2)]"
            >
              Start Free
            </a>
            <a
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#dce8f5] bg-white px-3 text-center text-sm font-semibold text-slate-700"
            >
              Login
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
