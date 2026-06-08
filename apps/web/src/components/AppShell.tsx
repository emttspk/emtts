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
    console.info("[auth] loading user context", { path: loc.pathname });
    fetchMe({ source: "app-shell" })
      .then((data) => {
        if (!ok) return;
        console.info("[auth] loaded user context", { userId: data?.user?.id ?? null, email: data?.user?.email ?? null });
        setMe(data);
      })
      .catch(() => {
        if (!ok) return;
        console.warn("[auth] failed to load user context; redirecting to login");
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
          {loading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
            </div>
          ) : (
            <Outlet context={{ me, refreshMe: async () => setMe(await fetchMe({ force: true, source: "shell-refresh" })) }} />
          )}
        </main>
      </div>
    </div>
  );
}
