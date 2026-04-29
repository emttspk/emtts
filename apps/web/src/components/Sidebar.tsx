import { NavLink, useNavigate } from "react-router-dom";
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

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/generate-labels", label: "Generate Labels", icon: UploadCloud },
  { to: "/generate-money-orders", label: "Generate Money Order", icon: Wallet },
  { to: "/tracking", label: "Tracking", icon: Radar },
  { to: "/download-labels", label: "Download Labels", icon: Download },
  { to: "/packages", label: "Package", icon: Package },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar(props: { isOpen: boolean; setIsOpen: (v: boolean) => void; collapsed?: boolean; userEmail?: string }) {
  const navigate = useNavigate();
  const role = getRole();
  const collapsed = Boolean(props.collapsed);

  const NavItem = (p: { to: string; label: string; icon: any }) => (
    <NavLink
      to={p.to}
      title={collapsed ? p.label : undefined}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-0",
          isActive
            ? "bg-white text-brand shadow-[0_10px_24px_rgba(15,23,42,0.2)]"
            : "text-slate-200 hover:bg-white/10 hover:text-white",
        )
      }
      onClick={() => props.setIsOpen(false)}
    >
      <p.icon className="h-5 w-5 flex-none opacity-90 transition-transform duration-200 ease-out group-hover:scale-105" />
      <span className={cn("truncate", collapsed && "hidden lg:inline")}>{p.label}</span>
    </NavLink>
  );

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
              <div className="text-sm font-semibold">Epost.pk</div>
              <div className="max-w-[170px] truncate text-[11px] text-slate-300">{props.userEmail ?? "Operations Workspace"}</div>
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
            {role === "ADMIN" ? <NavItem to="/admin" label="Admin" icon={Shield} /> : null}
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


