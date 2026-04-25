import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Button from "./Button";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6">
        <a href="#" className="inline-flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-sm font-bold text-white shadow-lg">PP</span>
          <div className="leading-tight">
            <div className="text-sm font-bold text-[#0F172A]">Pakistan Post</div>
            <div className="text-xs text-slate-500">Partner Platform</div>
          </div>
        </a>

        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-700 lg:flex">
          <a href="#labels" className="hover:text-brand">Labels</a>
          <a href="#money-orders" className="hover:text-brand">Money Orders</a>
          <a href="#tracking" className="hover:text-brand">Tracking</a>
          <a href="#pricing" className="hover:text-brand">Pricing</a>
          <a href="#help" className="inline-flex items-center gap-1 hover:text-brand">Help Center <ChevronDown className="h-4 w-4" /></a>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button to="/login" variant="secondary" className="px-6">Login</Button>
          <Button to="/register" className="px-6">Create Free Account</Button>
        </div>

        <button type="button" onClick={() => setOpen((v) => !v)} className="btn-secondary px-3 py-2 lg:hidden">
          Menu
        </button>
      </div>

      {open ? (
        <div className="border-t border-[#E5E7EB] bg-white px-6 py-4 lg:hidden">
          <div className="grid gap-2 text-sm font-medium text-slate-700">
            <a href="#labels" className="rounded-xl px-3 py-2 hover:bg-slate-50">Labels</a>
            <a href="#money-orders" className="rounded-xl px-3 py-2 hover:bg-slate-50">Money Orders</a>
            <a href="#tracking" className="rounded-xl px-3 py-2 hover:bg-slate-50">Tracking</a>
            <a href="#pricing" className="rounded-xl px-3 py-2 hover:bg-slate-50">Pricing</a>
            <a href="#help" className="rounded-xl px-3 py-2 hover:bg-slate-50">Help Center</a>
            <Button to="/login" variant="secondary" className="mt-2">Login</Button>
            <Button to="/register">Create Free Account</Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
