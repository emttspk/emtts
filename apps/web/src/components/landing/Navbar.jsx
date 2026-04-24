import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B5D3B] text-sm font-bold text-white shadow-sm">
            PP
          </span>
          <span className="text-sm font-bold tracking-tight text-gray-900 sm:text-base">Pakistan Post Label SaaS</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-gray-600 md:flex">
          <a href="#features" className="transition hover:text-[#0B5D3B]">Features</a>
          <a href="#workflow" className="transition hover:text-[#0B5D3B]">Workflow</a>
          <a href="#pricing" className="transition hover:text-[#0B5D3B]">Pricing</a>
          <a href="#contact" className="transition hover:text-[#0B5D3B]">Contact</a>
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100">
            Login
          </Link>
          <Link to="/register" className="rounded-lg bg-[#0B5D3B] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#094E32]">
            Create Free Account
          </Link>
        </div>
      </div>
    </header>
  );
}
