import { useState } from "react";
import { Menu, X } from "lucide-react";
import Button from "./Button";

const links = [
  { href: "#workflow", label: "Showcase" },
  { href: "#tracking-types", label: "Tracking Types" },
  { href: "#pricing", label: "Pricing" },
  { href: "#trust", label: "Trust" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-4 z-40 px-4 md:px-6">
      <div className="ui-glass mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 md:px-6">
        <a href="#" className="inline-flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-sm font-extrabold text-white shadow-glow">EP</span>
          <div className="leading-tight">
            <div className="text-base font-bold text-brand-ink">Epost.pk</div>
            <div className="hidden text-xs text-slate-500 sm:block">Official platform for labels, money orders, tracking and complaints</div>
          </div>
        </a>

        <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 lg:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-brand">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button to="/login" variant="secondary" className="px-6">Login</Button>
          <Button to="/register" className="px-6">Create Free Account</Button>
        </div>

        <button type="button" onClick={() => setOpen((v) => !v)} className="btn-ghost px-3 py-2 lg:hidden" aria-label="Toggle navigation">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div className="ui-glass mx-auto mt-3 w-full max-w-7xl px-6 py-4 lg:hidden">
          <div className="grid gap-2 text-sm font-medium text-slate-700">
            {links.map((link) => (
              <a key={link.href} href={link.href} className="rounded-2xl px-3 py-2 hover:bg-slate-50">
                {link.label}
              </a>
            ))}
            <Button to="/login" variant="secondary" className="mt-2">Login</Button>
            <Button to="/register">Create Free Account</Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
