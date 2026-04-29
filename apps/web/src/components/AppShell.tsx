import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import type { MeResponse } from "../lib/types";
import { fetchMe } from "../lib/UserService";
import Card from "./Card";
import { cn } from "../lib/cn";

const titleMap: Array<{ prefix: string; title: string }> = [
  { prefix: "/dashboard", title: "Dashboard" },
  { prefix: "/generate-labels", title: "Generate Labels" },
  { prefix: "/admin/generate-labels", title: "Generate Labels" },
  { prefix: "/generate-money-orders", title: "Generate Money Order" },
  { prefix: "/admin/generate-money-orders", title: "Generate Money Order" },
  { prefix: "/tracking", title: "Tracking" },
  { prefix: "/tracking-workspace", title: "Tracking" },
  { prefix: "/download-labels", title: "Download Labels" },
  { prefix: "/jobs", title: "Download Labels" },
  { prefix: "/packages", title: "Package" },
  { prefix: "/select-package", title: "Package" },
  { prefix: "/update-package", title: "Package" },
  { prefix: "/settings", title: "Settings" },
  { prefix: "/admin/template-designer", title: "Template Designer" },
  { prefix: "/admin", title: "Admin" },
];

export default function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const title = useMemo(() => {
    const hit = titleMap.find((t) => loc.pathname.startsWith(t.prefix));
    return hit?.title ?? "Epost.pk";
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
    <div className="flex min-h-screen bg-brand-radial">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} collapsed userEmail={me?.user.email} />
      <div className={cn("flex min-w-0 flex-1 flex-col", "md:pl-16 lg:pl-64")}>
        <Topbar title={title} setIsSidebarOpen={setIsSidebarOpen} userEmail={me?.user.email} />

        <main className="relative flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(11,107,58,0.12),_transparent_24%)]" />
          <div className="pointer-events-none absolute inset-0 bg-hero-grid bg-[size:34px_34px] opacity-[0.18]" />
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 md:px-8 md:py-8 xl:px-10">
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

