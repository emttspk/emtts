import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { api } from "../lib/api";
import type { MeResponse } from "../lib/types";
import Card from "./Card";
import { cn } from "../lib/cn";

const titleMap: Array<{ prefix: string; title: string }> = [
  { prefix: "/dashboard", title: "Dashboard" },
  { prefix: "/tracking", title: "Track Parcel" },
  { prefix: "/upload", title: "Generate Labels" },
  { prefix: "/jobs", title: "View Jobs" },
  { prefix: "/billing", title: "Pricing" },
  { prefix: "/settings", title: "Settings" },
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
    return hit?.title ?? "Bulk Dispatch & Tracking System";
  }, [loc.pathname]);

  useEffect(() => {
    let ok = true;
    setLoading(true);
    api<MeResponse>("/api/me")
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
    <div className="flex min-h-screen">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} collapsed />
      <div className={cn("flex min-w-0 flex-1 flex-col", "md:pl-16 lg:pl-64")}>
        <Topbar title={title} setIsSidebarOpen={setIsSidebarOpen} userEmail={me?.user.email} />

        <main className="relative flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.65),_transparent_26%)]" />
          <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
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
              <Outlet context={{ me, refreshMe: async () => setMe(await api<MeResponse>("/api/me")) }} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
