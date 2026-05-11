import { useState } from "react";
import { Menu, X } from "lucide-react";

const navLinks = [
  { href: "/upload", label: "Book Parcel" },
  { href: "#labels", label: "Generate Labels" },
  { href: "#money-orders", label: "Money Order" },
  { href: "#complaints", label: "Support" },
  { href: "#contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const ctaClass = "inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold tracking-[0.01em]";

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--line)] bg-white/95 shadow-[0_8px_24px_rgba(8,18,37,0.06)] backdrop-blur-2xl">
      <div className="mx-auto flex h-[74px] w-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3.5">
          <a
            href="/"
            className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-2 py-2 shadow-[0_12px_30px_rgba(16,185,129,0.12)]"
          >
            <img src="/assets/pakistan-post-logo.png" alt="Pakistan Post" className="h-8 w-auto object-contain" />
          </a>
          <div className="min-w-0 leading-tight">
            <div className="whitespace-nowrap text-[15px] font-extrabold tracking-[0.01em] text-slate-900">Epost.pk</div>
            <div className="whitespace-nowrap text-[11px] font-medium text-slate-500">Pakistan Post logistics workspace</div>
          </div>
        </div>

        <nav className="hidden min-w-0 flex-1 items-center justify-center px-4 lg:flex">
          <div className="flex items-center gap-6 whitespace-nowrap text-[14px] font-semibold text-slate-700 xl:gap-8">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`whitespace-nowrap py-2 font-semibold transition-colors duration-200 hover:text-[#10B981] ${
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
            className={`${ctaClass} min-w-[132px] rounded-xl border border-[color:var(--line)] bg-white text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#10B981] hover:text-[#10B981]`}
          >
            Login
          </a>
          <a
            href="/register"
            className={`${ctaClass} min-w-[190px] rounded-xl bg-[linear-gradient(135deg,#081225,#10B981)] text-white shadow-[0_12px_28px_rgba(16,185,129,0.3)] transition-transform duration-200 hover:-translate-y-0.5`}
          >
            Create Free Account
          </a>
        </div>

        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-slate-100 bg-white px-4 pb-6 pt-4 shadow-[0_16px_36px_rgba(15,23,42,0.10)] lg:hidden">
          <div className="mx-auto grid w-full max-w-[1240px] gap-2">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <a href="/login" className="inline-flex h-11 items-center justify-center rounded-xl border border-[color:var(--line)] bg-white px-3 text-center text-sm font-semibold text-slate-800 shadow-sm">
                Login
              </a>
              <a href="/register" className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#081225,#10B981)] px-3 text-center text-sm font-bold text-white shadow-[0_6px_18px_rgba(16,185,129,0.28)]">
                Create Free Account
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}