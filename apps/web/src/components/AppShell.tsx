import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import type { MeResponse } from "../lib/types";
import { fetchMe } from "../lib/UserService";
import { resolvePageTitle } from "../lib/navigation";
import { useIdleTimeout } from "../hooks/useIdleTimeout";

export default function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Global idle timeout: auto-logout after 15 min of inactivity
  useIdleTimeout(true);

  const title = useMemo(() => {
    return resolvePageTitle(loc.pathname);
  }, [loc.pathname]);

  useEffect(() => {
    let ok = true;
    setLoading(true);
    fetchMe({ source: "app-shell" })
      .then((data) => {
        if (!ok) return;
        setMe(data);
      })
      .catch(() => {
        if (!ok) return;
        navigate("/login");
      })
      .finally(() => {
        if (!ok) return;
        setLoading(false);
      });
    return () => {
      ok = false;
    };
  }, [navigate]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [loc.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-[linear-gradient(180deg,#F7F9FC,#F4F7FB)] text-[color:var(--text-strong)]">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        userEmail={me?.user.email}
      />

      <div className="ml-0 flex min-w-0 flex-1 flex-col overflow-hidden md:ml-[96px] lg:ml-[284px]">
        <Topbar
          title={title}
          setIsSidebarOpen={setIsSidebarOpen}
          userEmail={me?.user.email}
        />

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent">
          <Outlet context={{ me, refreshMe: async () => setMe(await fetchMe({ force: true, source: "shell-refresh" })) }} />
          {loading && (loc.state as { postLogin?: boolean } | null)?.postLogin ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
              <div className="w-full max-w-lg rounded-[2rem] border border-emerald-200 bg-white p-7 text-center shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
                <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
                <div className="mt-4 text-2xl font-semibold text-slate-900">Signing you in... loading dashboard</div>
                <div className="mt-2 text-sm text-slate-600">
                  Preparing your account, package, and latest shipment workspace.
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

