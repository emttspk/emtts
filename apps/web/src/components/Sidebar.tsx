import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Download,
  LayoutDashboard,
  LogOut,
  Mail,
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
  { to: "/generate-labels", label: "Generate Labels", icon: UploadCloud, matchPrefixes: ["/generate-labels", "/admin/generate-labels"] },
  { to: "/generate-money-orders", label: "Generate Money Order", icon: Wallet, matchPrefixes: ["/generate-money-orders", "/admin/generate-money-orders"] },
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
          "group relative flex h-12 items-center rounded-2xl px-3.5 text-sm font-semibold transition-all duration-200 ease-out",
          "gap-3",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-0",
          active
            ? "border border-emerald-300/30 bg-[linear-gradient(135deg,rgba(16,185,129,0.24),rgba(37,99,235,0.16))] text-white shadow-[0_12px_32px_rgba(16,185,129,0.18)]"
            : "border border-transparent text-slate-200 hover:bg-white/8 hover:text-white",
        )}
        onClick={() => props.setIsOpen(false)}
      >
        <p.icon className={cn("h-5 w-5 flex-none transition-transform duration-200 ease-out group-hover:scale-105", active ? "opacity-100" : "opacity-90")} />
        <span className="truncate md:hidden lg:inline">{p.label}</span>
        {active ? <span className="absolute right-3 hidden h-1.5 w-1.5 rounded-full bg-emerald-200 lg:block" /> : null}
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
          "fixed left-0 top-0 z-50 flex h-screen shrink-0 flex-col border-r border-white/5 bg-[linear-gradient(180deg,#081225,#0A1325_55%,#0E1B33)] text-white shadow-[20px_0_60px_rgba(2,6,23,0.28)]",
          "w-[284px] md:w-[96px] lg:w-[284px]",
          "transition-transform duration-300 ease-in-out md:translate-x-0",
          props.isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-white/10 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex rounded-2xl border border-white/10 bg-white px-2 py-2 shadow-[0_12px_30px_rgba(16,185,129,0.16)]">
                <img src="/assets/pakistan-post-logo.png" alt="Pakistan Post" className="h-8 w-10 object-contain md:h-8 md:w-10 lg:h-9 lg:w-[90px]" />
              </div>
              <div className="min-w-0 leading-tight md:hidden lg:block">
                <div className="text-sm font-semibold text-white">Epost.pk</div>
                <div className="truncate text-xs font-medium text-slate-300">Pakistan Post workspace</div>
              </div>
            </div>
            <button className="rounded-lg p-2 text-gray-300 transition hover:bg-white/10 hover:text-white md:hidden" onClick={() => props.setIsOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 rounded-[20px] border border-white/10 bg-white/5 p-2.5 md:hidden lg:block">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 text-xs font-semibold text-white">
                {props.userEmail?.slice(0, 2).toUpperCase() ?? "EP"}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{props.userEmail ?? "Operations team"}</div>
                <div className="text-xs text-slate-300">Enterprise logistics</div>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3.5">
          <div className="mb-2.5 hidden px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 md:hidden lg:block">
            Workspace
          </div>
          <div className="grid gap-1.5">
            {nav.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
            {role === "ADMIN" ? <NavItem to="/admin" label="Admin" icon={Shield} matchPrefixes={APP_NAV_ITEMS.find((item) => item.label === "Admin")?.matchPrefixes ?? ["/admin"]} /> : null}
          </div>
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <div className="mb-2.5 hidden rounded-[18px] border border-white/10 bg-white/5 p-2.5 md:hidden lg:block">
            <div className="flex items-center gap-3 text-slate-300">
              <Bell className="h-4 w-4" />
              <div>
                <div className="text-sm font-semibold text-white">Workspace ready</div>
                <div className="text-xs">Track, print, and manage delivery flow.</div>
              </div>
            </div>
          </div>
          <button
            title="Logout"
            className="flex h-12 w-full items-center gap-3 rounded-2xl px-3.5 text-sm font-medium text-slate-200 transition-all duration-200 ease-out hover:bg-white/10 hover:text-white"
            onClick={() => {
              clearSession();
              navigate("/login");
            }}
          >
            <LogOut className="h-5 w-5 flex-none opacity-90" />
            <span className="md:hidden lg:inline">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}


