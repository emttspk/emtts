import { useState } from "react";
import { Menu, X, Search } from "lucide-react";

const navLinks = [
  { href: "/upload", label: "Book Parcel" },
  { href: "#labels", label: "Labels" },
  { href: "#money-orders", label: "Money Orders" },
  { href: "/tracking", label: "Tracking" },
  { href: "#complaints", label: "Complaints" },
  { href: "#contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/50 bg-white/65 backdrop-blur-2xl shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
      <div className="mx-auto flex h-[88px] w-full max-w-[1240px] items-center px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-[0_0_30%] items-center gap-3">
          <a
            href="/"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#0f172a,#0b6b3a)] text-sm font-extrabold text-white shadow-[0_10px_30px_rgba(11,107,58,0.35)]"
          >
            PP
          </a>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-extrabold uppercase tracking-[0.08em] text-slate-900">P.Post Dispatch</div>
            <div className="truncate text-[11px] font-medium text-slate-500">Official shipment workspace for Pakistan Post operations</div>
          </div>
        </div>

        <nav className="hidden flex-[0_0_40%] items-center justify-center lg:flex">
          <div className="flex items-center gap-7 text-[13px] font-semibold text-slate-600">
            {navLinks.map((item) => (
              <a key={item.label} href={item.href} className="transition-colors duration-200 hover:text-slate-900">
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="hidden flex-[0_0_30%] items-center justify-end gap-2.5 lg:flex">
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-slate-300/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 hover:border-slate-900 hover:text-slate-900"
          >
            Login
          </a>
          <a
            href="/register"
            className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,23,42,0.22)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Create Free Account
          </a>
          <a
            href="/tracking"
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition-all duration-200 hover:border-emerald-300"
          >
            <Search className="h-4 w-4" />
            Track
          </a>
        </div>

        <div className="ml-auto lg:hidden">
          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/60 bg-white/95 px-4 pb-5 pt-4 shadow-[0_20px_40px_rgba(15,23,42,0.09)] lg:hidden">
          <div className="mx-auto grid w-full max-w-[1240px] gap-2">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <a href="/login" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700">
                Login
              </a>
              <a href="/register" className="rounded-xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-3 py-2 text-center text-sm font-semibold text-white">
                Create Free Account
              </a>
              <a href="/tracking" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-800">
                Track
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}