import { useMemo, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, Search } from "lucide-react";
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
  const [query, setQuery] = useState("");

  const badge = useMemo(() => initials(props.userEmail), [props.userEmail]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-2xl">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => props.setIsSidebarOpen(true)} className="btn-secondary px-2.5 py-2 md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <div className="font-display text-2xl font-extrabold tracking-[-0.03em] text-gray-900">{props.title}</div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          <label className="hidden min-w-[16rem] flex-1 items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm lg:flex lg:max-w-md">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search jobs, tracking IDs, cities..."
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>

          <button className="btn-secondary p-2" title="Notifications">
            <Bell className="h-5 w-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-sm transition-all duration-200 ease-out hover:shadow-card"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-glow">
                {badge}
              </div>
              <div className="hidden max-w-[180px] text-left md:block">
                <div className="truncate text-sm font-medium text-gray-900">{props.userEmail ?? "Account"}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-500" />
            </button>

            {open ? (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-card">
                <div className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">Signed in</div>
                  <div className="mt-1 truncate text-sm text-gray-600">{props.userEmail ?? "-"}</div>
                </div>
                <div className="border-t" />
                <button
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-red-600",
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

