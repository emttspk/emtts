import { useState } from "react";
import { Menu, X, Search } from "lucide-react";

const navLinks = [
  { href: "/upload", label: "Book Parcel" },
  { href: "#labels", label: "Generate Label" },
  { href: "#money-orders", label: "Money Order" },
  { href: "#complaints", label: "Complaints" },
  { href: "#contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto grid h-[76px] w-full max-w-[1240px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#0f172a,#0b6b3a)] text-sm font-extrabold text-white shadow-[0_10px_30px_rgba(11,107,58,0.34)]"
          >
            EP
          </a>
          <div className="leading-tight">
            <div className="whitespace-nowrap text-sm font-extrabold tracking-[0.02em] text-slate-900">Epost.pk</div>
            <div className="whitespace-nowrap text-[11px] font-medium text-slate-500">Pakistan Post Operations Platform</div>
          </div>
        </div>

        <nav className="hidden justify-self-center lg:flex">
          <div className="flex items-center gap-8 text-[15px] font-semibold text-slate-700">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`whitespace-nowrap py-2 transition-colors duration-200 hover:text-[#0b6b3a] ${
                  pathname === item.href ? "text-slate-950" : "text-slate-700"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="hidden items-center justify-self-end gap-2.5 lg:flex">
          <a
            href="/tracking"
            className="inline-flex h-10 items-center justify-center gap-1 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:border-[#0b6b3a] hover:text-[#0b6b3a]"
          >
            <Search className="h-3.5 w-3.5" />
            Track
          </a>
          <a
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:text-slate-950"
          >
            Login
          </a>
          <a
            href="/register"
            className="inline-flex h-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(11,107,58,0.3)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Create Free Account
          </a>
        </div>

        <div className="justify-self-end lg:hidden">
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
              <a href="/tracking" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700">
                Track
              </a>
              <a href="/login" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700">
                Login
              </a>
              <a href="/register" className="rounded-xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-3 py-2 text-center text-sm font-semibold text-white">
                Create Free Account
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}