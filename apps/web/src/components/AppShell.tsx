import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import type { MeResponse } from "../lib/types";
import { fetchMe } from "../lib/UserService";
import Card from "./Card";
import { resolvePageTitle } from "../lib/navigation";
import { useIdleTimeout } from "../hooks/useIdleTimeout";

export default function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Global idle timeout: auto-logout after 15 min of inactivity
  useIdleTimeout(true);

  const title = useMemo(() => {
    return resolvePageTitle(loc.pathname);
  }, [loc.pathname]);

  useEffect(() => {
    let ok = true;
    setLoading(true);
    fetchMe()
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
          {loading ? (
            <div className="ui-page grid gap-4">
              <Card className="p-6">
                <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
                <div className="mt-3 h-4 w-80 animate-pulse rounded bg-slate-100" />
              </Card>
              <Card className="p-6">
                <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 h-28 w-full animate-pulse rounded bg-slate-100" />
              </Card>
            </div>
          ) : (
            <Outlet context={{ me, refreshMe: async () => setMe(await fetchMe()) }} />
          )}
        </main>
      </div>
    </div>
  );
}

