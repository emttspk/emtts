import { useState } from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="inline-flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B5D3B] text-xs font-bold text-white shadow">
            PP
          </span>
          <span className="text-sm font-bold tracking-tight text-gray-900">
            ePost <span className="font-normal text-[#0B5D3B]">Label SaaS</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-5 text-sm font-medium text-gray-600 md:flex">
          <a href="#features" className="transition hover:text-[#0B5D3B]">Features</a>
          <a href="#workflow" className="transition hover:text-[#0B5D3B]">Workflow</a>
          <a href="#pricing" className="transition hover:text-[#0B5D3B]">Pricing</a>
          <a href="#contact" className="transition hover:text-[#0B5D3B]">Contact</a>
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 sm:inline-flex">
            Login
          </Link>
          <Link to="/register" className="rounded-lg bg-[#0B5D3B] px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-[#094E32] sm:text-sm">
            Create Free Account
          </Link>
          {/* Mobile menu toggle */}
          <button
            className="ml-1 rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {open && (
        <div className="border-t border-gray-100 bg-white px-4 pb-4 md:hidden">
          <nav className="mt-2 flex flex-col gap-1 text-sm font-medium text-gray-700">
            <a href="#features" className="rounded-lg px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>Features</a>
            <a href="#workflow" className="rounded-lg px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>Workflow</a>
            <a href="#pricing" className="rounded-lg px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>Pricing</a>
            <a href="#contact" className="rounded-lg px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>Contact</a>
            <Link to="/login" className="rounded-lg px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>Login</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
