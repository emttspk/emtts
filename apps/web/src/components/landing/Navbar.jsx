import { useState } from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-emerald-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6">
        <Link to="/" className="inline-flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-xs font-bold text-white shadow-card">PP</span>
          <span className="text-sm font-bold tracking-tight text-slate-900">
            Pakistan Post <span className="text-brand">Labels</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <a href="#features" className="transition hover:text-brand">Features</a>
          <a href="#workflow" className="transition hover:text-brand">Workflow</a>
          <a href="#pricing" className="transition hover:text-brand">Pricing</a>
          <a href="#contact" className="transition hover:text-brand">Contact</a>
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/login" className="btn-secondary hidden sm:inline-flex">
            Login
          </Link>
          <Link to="/register" className="btn-primary px-4 py-2">
            Create Free Account
          </Link>
          <button className="rounded-xl border border-emerald-100 p-2 text-slate-600 hover:bg-slate-50 md:hidden" aria-label="Toggle menu" onClick={() => setOpen((v) => !v)}>
            {open ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            )}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-emerald-100 bg-white px-6 pb-4 md:hidden">
          <nav className="mt-2 flex flex-col gap-1 text-sm font-medium text-slate-700">
            <a href="#features" className="rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => setOpen(false)}>Features</a>
            <a href="#workflow" className="rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => setOpen(false)}>Workflow</a>
            <a href="#pricing" className="rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => setOpen(false)}>Pricing</a>
            <a href="#contact" className="rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => setOpen(false)}>Contact</a>
            <Link to="/login" className="rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => setOpen(false)}>Login</Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
