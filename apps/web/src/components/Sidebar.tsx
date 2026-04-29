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

export default function Sidebar(props: { isOpen: boolean; setIsOpen: (v: boolean) => void; collapsed?: boolean; userEmail?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getRole();
  const collapsed = Boolean(props.collapsed);

  const NavItem = (p: { to: string; label: string; icon: any; matchPrefixes: string[] }) => {
    const active = isRouteActive(location.pathname, { matchPrefixes: p.matchPrefixes });
    return (
    <Link
      to={p.to}
      title={collapsed ? p.label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-0",
        active
          ? "border-l-2 border-emerald-300 bg-[linear-gradient(90deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] text-white shadow-[0_12px_28px_rgba(15,23,42,0.26)]"
          : "text-slate-100/90 hover:bg-white/10 hover:text-white",
      )}
      onClick={() => props.setIsOpen(false)}
    >
      <p.icon className={cn("h-5 w-5 flex-none transition-transform duration-200 ease-out group-hover:scale-105", active ? "opacity-100" : "opacity-90")} />
      <span className={cn("truncate", collapsed && "hidden lg:inline")}>{p.label}</span>
      {active ? <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-emerald-200" /> : null}
    </Link>
    );
  };

  return (
    <>
      <div
        className={cn("fixed inset-0 z-40 bg-black/40 md:hidden", props.isOpen ? "block" : "hidden")}
        onClick={() => props.setIsOpen(false)}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-full border-r border-white/10 bg-[linear-gradient(180deg,#0F172A,#13243B,#0B6B3A)] text-white shadow-[20px_0_60px_rgba(15,23,42,0.16)]",
          "transition-transform duration-300 ease-in-out md:translate-x-0",
          props.isOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "w-64 md:w-[88px] lg:w-64" : "w-64",
        )}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <div className={cn("flex items-center gap-3", collapsed && "md:justify-center md:gap-0")}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-semibold text-brand shadow-card">
              EP
            </div>
            <div className={cn("leading-tight", collapsed && "md:hidden lg:block")}>
              <div className="text-sm font-semibold text-white">Epost.pk</div>
              <div className="max-w-[170px] truncate text-xs font-medium text-slate-200">{props.userEmail ?? "Operations Workspace"}</div>
            </div>
          </div>
          <button className="text-gray-300 hover:text-white md:hidden" onClick={() => props.setIsOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="px-3 pb-4 pt-3">
          <div className={cn("space-y-1", collapsed && "md:space-y-2")}>
            {nav.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
            {role === "ADMIN" ? <NavItem to="/admin" label="Admin" icon={Shield} matchPrefixes={APP_NAV_ITEMS.find((item) => item.label === "Admin")?.matchPrefixes ?? ["/admin"]} /> : null}
          </div>
        </nav>

        <div className="mt-auto border-t border-white/10 px-3 pb-4 pt-3">
          <button
            title={collapsed ? "Logout" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-200 transition-all duration-200 ease-out hover:bg-white/10 hover:text-white",
              collapsed && "md:justify-center lg:justify-start",
            )}
            onClick={() => {
              clearSession();
              navigate("/login");
            }}
          >
            <LogOut className="h-5 w-5 flex-none opacity-90" />
            <span className={cn(collapsed && "md:hidden lg:inline")}>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}


