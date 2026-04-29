import { NavLink, useNavigate } from "react-router-dom";
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  UploadCloud,
  PackageSearch,
  Briefcase,
  Shield,
  X,
} from "lucide-react";
import { clearSession, getRole } from "../lib/auth";
import { cn } from "../lib/cn";
import { TEMPLATE_DESIGNER_ADMIN_EMAIL, TEMPLATE_DESIGNER_ENABLED } from "../lib/featureFlags";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Generate label", icon: UploadCloud },
  { to: "/tracking-workspace", label: "Track parcel", icon: PackageSearch },
  { to: "/jobs", label: "View jobs", icon: Briefcase },
  { to: "/billing", label: "Pricing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar(props: { isOpen: boolean; setIsOpen: (v: boolean) => void; collapsed?: boolean; userEmail?: string }) {
  const navigate = useNavigate();
  const role = getRole();
  const collapsed = Boolean(props.collapsed);
  const canUseTemplateDesigner =
    role === "ADMIN" &&
    TEMPLATE_DESIGNER_ENABLED &&
    String(props.userEmail ?? "").trim().toLowerCase() === TEMPLATE_DESIGNER_ADMIN_EMAIL;

  const NavItem = (p: { to: string; label: string; icon: any }) => (
    <NavLink
      to={p.to}
      title={collapsed ? p.label : undefined}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all duration-300 ease-in-out",
          isActive ? "bg-white text-brand shadow-card" : "text-slate-200 hover:bg-white/8 hover:text-white",
        )
      }
      onClick={() => props.setIsOpen(false)}
    >
      <p.icon className="h-5 w-5 flex-none opacity-90 transition-transform duration-300 ease-in-out group-hover:scale-105" />
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
          collapsed ? "w-64 md:w-16 lg:w-64" : "w-64",
        )}
      >
        <div className="flex h-20 items-center justify-between px-4">
          <div className={cn("flex items-center gap-3", collapsed && "md:justify-center md:gap-0")}>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-brand shadow-card">
              EP
            </div>
            <div className={cn("leading-tight", collapsed && "md:hidden lg:block")}>
              <div className="text-sm font-semibold">Epost.pk</div>
              <div className="text-xs text-slate-300">Booking, labels, MO, tracking and complaints</div>
            </div>
          </div>
          <button className="text-gray-300 hover:text-white md:hidden" onClick={() => props.setIsOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={cn("px-3", collapsed && "md:hidden lg:block")}>
          <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-200">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Workspace</div>
            <div className="mt-2 font-semibold text-white">Operations Console</div>
            <div className="mt-1 text-xs leading-5 text-slate-300">Premium control surface for labels, tracking, MOs and escalations.</div>
          </div>
        </div>

        <nav className="px-3 py-4">
          <div className={cn("space-y-1", collapsed && "md:space-y-2")}>
            {nav.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
            {role === "ADMIN" ? <NavItem to="/admin" label="Admin" icon={Shield} /> : null}
            {role === "ADMIN" ? <NavItem to="/admin/generate-labels" label="Generate labels" icon={UploadCloud} /> : null}
            {role === "ADMIN" ? <NavItem to="/admin/generate-money-orders" label="Generate money order" icon={UploadCloud} /> : null}
            {canUseTemplateDesigner ? <NavItem to="/admin/template-designer" label="Money Order Designer" icon={Shield} /> : null}
          </div>
        </nav>

        <div className="mt-auto px-3 pb-4">
          <button
            title={collapsed ? "Logout" : undefined}
          className={cn(
              "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-slate-200 transition-all duration-300 ease-in-out hover:bg-white/10 hover:text-white",
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


