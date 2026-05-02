import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Download,
  LayoutDashboard,
  LogOut,
  Package,
  Radar,
  Settings,
  UploadCloud,
  Shield,
  Wallet,
  X,
} from "lucide-react";
import { clearSession, getRole } from "../lib/auth";
import { cn } from "../lib/cn";
import { APP_NAV_ITEMS, isRouteActive } from "../lib/navigation";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, matchPrefixes: ["/dashboard"] },
  { to: "/admin/generate-labels", label: "Generate Labels", icon: UploadCloud, matchPrefixes: ["/generate-labels", "/admin/generate-labels"] },
  { to: "/admin/generate-money-orders", label: "Generate Money Order", icon: Wallet, matchPrefixes: ["/generate-money-orders", "/admin/generate-money-orders"] },
  { to: "/tracking-workspace", label: "Tracking", icon: Radar, matchPrefixes: ["/tracking", "/tracking-workspace"] },
  { to: "/jobs?filter=completed", label: "Download Labels", icon: Download, matchPrefixes: ["/download-labels", "/downloads", "/jobs"] },
  { to: "/select-package", label: "Package", icon: Package, matchPrefixes: ["/packages", "/select-package", "/update-package"] },
  { to: "/settings", label: "Settings", icon: Settings, matchPrefixes: ["/settings", "/profile"] },
];

export default function Sidebar(props: {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  userEmail?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getRole();

  const NavItem = (p: { to: string; label: string; icon: any; matchPrefixes: string[] }) => {
    const active = isRouteActive(location.pathname, { matchPrefixes: p.matchPrefixes });
    return (
      <Link
        to={p.to}
        title={p.label}
        className={cn(
          "group relative flex h-11 items-center rounded-xl px-3 text-sm font-semibold transition-all duration-200 ease-out",
          "gap-3",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-0",
          active
            ? "border border-emerald-300/40 bg-emerald-400/10 text-white"
            : "border border-transparent text-slate-100/90 hover:bg-white/10 hover:text-white",
        )}
        onClick={() => props.setIsOpen(false)}
      >
        <p.icon className={cn("h-5 w-5 flex-none transition-transform duration-200 ease-out group-hover:scale-105", active ? "opacity-100" : "opacity-90")} />
        <span className="truncate">{p.label}</span>
        {active ? <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-emerald-200" /> : null}
      </Link>
    );
  };

  return (
    <>
      <div
        className={cn("fixed inset-0 z-40 bg-black/50 md:hidden", props.isOpen ? "block" : "hidden")}
        onClick={() => props.setIsOpen(false)}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen shrink-0 flex-col border-r border-slate-800 bg-[linear-gradient(180deg,#0B1220,#0F172A,#111827)] text-white shadow-[20px_0_60px_rgba(2,6,23,0.28)]",
          "w-[260px] md:w-[88px] lg:w-[260px]",
          "transition-transform duration-300 ease-in-out md:translate-x-0",
          props.isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-[72px] items-center justify-between border-b border-white/10 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-semibold text-brand shadow-card">
              EP
            </div>
            <div className="min-w-0 leading-tight md:hidden lg:block">
              <div className="text-sm font-semibold text-white">Epost.pk</div>
              <div className="truncate text-xs font-medium text-slate-200">{props.userEmail ?? "Operations Workspace"}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="rounded-lg p-2 text-gray-300 transition hover:bg-white/10 hover:text-white md:hidden" onClick={() => props.setIsOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="grid gap-1.5">
            {nav.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
            {role === "ADMIN" ? <NavItem to="/admin" label="Admin" icon={Shield} matchPrefixes={APP_NAV_ITEMS.find((item) => item.label === "Admin")?.matchPrefixes ?? ["/admin"]} /> : null}
          </div>
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <button
            title="Logout"
            className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-200 transition-all duration-200 ease-out hover:bg-white/10 hover:text-white"
            onClick={() => {
              clearSession();
              navigate("/login");
            }}
          >
            <LogOut className="h-5 w-5 flex-none opacity-90" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}


