import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import type { MeResponse } from "../lib/types";
import { fetchMe } from "../lib/UserService";
import Card from "./Card";
import { cn } from "../lib/cn";
import { resolvePageTitle } from "../lib/navigation";

export default function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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

  return (
    <div className="flex min-h-screen bg-[#0B1220] text-slate-100">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} collapsed userEmail={me?.user.email} />
      <div className={cn("flex min-w-0 flex-1 flex-col", "md:pl-[88px] lg:pl-64")}>
        <Topbar title={title} setIsSidebarOpen={setIsSidebarOpen} userEmail={me?.user.email} />

        <main className="relative flex-1 overflow-x-hidden overflow-y-visible bg-[#0B1220]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_24%)]" />
          <div className="pointer-events-none absolute inset-0 bg-hero-grid bg-[size:34px_34px] opacity-[0.08]" />
          <div className="w-full min-w-0 flex-1 max-w-none px-3 pt-0 pb-3 md:px-4 md:pt-0 md:pb-4">
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
          </div>
        </main>
      </div>
    </div>
  );
}

