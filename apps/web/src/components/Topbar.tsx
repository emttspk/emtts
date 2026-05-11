import { useMemo, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, Plus, Search, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";
import { cn } from "../lib/cn";
import ActionButton from "./ui/ActionButton";
import SearchInput from "./ui/SearchInput";

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
  const [query, setQuery] = useState("");

  const badge = useMemo(() => initials(props.userEmail), [props.userEmail]);

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-[color:var(--line)] bg-white/90 backdrop-blur-2xl">
      <div className="flex min-h-[76px] w-full items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => props.setIsSidebarOpen(true)} className="btn-secondary px-2.5 py-2 md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Operations Workspace</div>
            <div className="truncate font-display text-2xl font-extrabold tracking-[-0.04em] text-[color:var(--text-strong)] md:text-[1.8rem]">{props.title}</div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search jobs, tracking IDs, cities"
            className="hidden min-w-[18rem] flex-1 lg:flex lg:max-w-xl"
          />

          <ActionButton
            variant="secondary"
            className="hidden lg:inline-flex"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/generate-labels")}
          >
            Quick Action
          </ActionButton>

          <button className="btn-secondary p-2.5" title="Notifications">
            <Bell className="h-5 w-5" />
          </button>

          <button className="btn-secondary hidden p-2.5 md:inline-flex" title="Settings" onClick={() => navigate("/settings")}>
            <Settings className="h-5 w-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 rounded-2xl border border-[color:var(--line)] bg-white px-2.5 py-2 shadow-sm transition-all duration-200 ease-out hover:shadow-card"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#10B981,#2563EB)] text-sm font-semibold text-white shadow-glow">
                {badge}
              </div>
              <div className="hidden max-w-[180px] text-left md:block">
                <div className="truncate text-sm font-semibold text-[color:var(--text-strong)]">{props.userEmail ?? "Account"}</div>
                <div className="truncate text-xs text-slate-500">Workspace access</div>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-500" />
            </button>

            {open ? (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-[20px] border border-[color:var(--line)] bg-white shadow-card">
                <div className="px-4 py-3">
                  <div className="text-sm font-semibold text-[color:var(--text-strong)]">Signed in</div>
                  <div className="mt-1 truncate text-sm text-slate-600">{props.userEmail ?? "-"}</div>
                </div>
                <div className="border-t" />
                <button
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-red-600",
                    "transition-all duration-300 ease-in-out hover:bg-gray-50",
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

