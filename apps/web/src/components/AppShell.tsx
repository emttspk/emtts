import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import type { MeResponse } from "../lib/types";
import { fetchMe } from "../lib/UserService";
import Card from "./Card";
import { resolvePageTitle } from "../lib/navigation";

export default function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
    <div className="flex h-screen overflow-hidden bg-[#0B1220] text-slate-100">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        collapsed={isSidebarCollapsed}
        setCollapsed={setIsSidebarCollapsed}
        userEmail={me?.user.email}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          setIsSidebarOpen={setIsSidebarOpen}
          userEmail={me?.user.email}
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
        />

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4">
          {loading ? (
            <div className="grid gap-4">
              <Card className="p-6">
                <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
                <div className="mt-3 h-4 w-80 animate-pulse rounded bg-gray-100" />
              </Card>
              <Card className="p-6">
                <div className="h-4 w-56 animate-pulse rounded bg-gray-100" />
                <div className="mt-4 h-28 w-full animate-pulse rounded bg-gray-100" />
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

