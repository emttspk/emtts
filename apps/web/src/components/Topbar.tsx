import { useMemo, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";
import { cn } from "../lib/cn";

function initials(email?: string) {
  if (!email) return "U";
  const name = email.split("@")[0] ?? "User";
  const parts = name.split(/[.\-_ ]+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? parts[0]?.[1] ?? "").toUpperCase();
  return `${a}${b}`.slice(0, 2);
}

export default function Topbar(props: {
  title: string;
  setIsSidebarOpen: (v: boolean) => void;
  userEmail?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const badge = useMemo(() => initials(props.userEmail), [props.userEmail]);

  return (
    <header className="sticky top-0 z-30 border-b border-emerald-100/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-3">
          <button onClick={() => props.setIsSidebarOpen(true)} className="btn-secondary px-2.5 py-2 md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand/60">Operations</div>
            <div className="text-3xl font-semibold text-gray-900">{props.title}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn-secondary p-2">
            <Bell className="h-5 w-5" />
          </button>

          <button
            className="btn-secondary p-2"
            onClick={() => {
              clearSession();
              navigate("/login");
            }}
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-2 py-1.5 shadow-card transition-all duration-200 ease-in-out hover:shadow-cardHover"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-card">
                {badge}
              </div>
              <div className="hidden text-left md:block">
                <div className="text-sm font-medium text-gray-900">{props.userEmail ?? "Account"}</div>
                <div className="text-xs text-gray-600">Workspace</div>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-500" />
            </button>

            {open ? (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-card">
                <div className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">Signed in</div>
                  <div className="mt-1 truncate text-sm text-gray-600">{props.userEmail ?? "—"}</div>
                </div>
                <div className="border-t" />
                <button
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-red-600",
                    "transition-all duration-200 ease-in-out hover:bg-gray-50",
                  )}
                  onClick={() => {
                    clearSession();
                    navigate("/login");
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
