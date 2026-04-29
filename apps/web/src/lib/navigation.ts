export type NavItem = {
  to: string;
  label: string;
  matchPrefixes: string[];
};

export const APP_NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", matchPrefixes: ["/dashboard"] },
  { to: "/admin/generate-labels", label: "Generate Labels", matchPrefixes: ["/generate-labels", "/admin/generate-labels"] },
  { to: "/admin/generate-money-orders", label: "Generate Money Order", matchPrefixes: ["/generate-money-orders", "/admin/generate-money-orders"] },
  { to: "/tracking-workspace", label: "Tracking", matchPrefixes: ["/tracking", "/tracking-workspace"] },
  { to: "/jobs?filter=completed", label: "Download Labels", matchPrefixes: ["/download-labels", "/downloads", "/jobs"] },
  { to: "/select-package", label: "Package", matchPrefixes: ["/packages", "/select-package", "/update-package"] },
  { to: "/settings", label: "Settings", matchPrefixes: ["/settings", "/profile"] },
  { to: "/admin/template-designer", label: "Template Designer", matchPrefixes: ["/admin/template-designer"] },
  { to: "/admin", label: "Admin", matchPrefixes: ["/admin"] },
];

export function isRouteActive(pathname: string, item: Pick<NavItem, "matchPrefixes">) {
  return item.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function resolvePageTitle(pathname: string) {
  const hit = APP_NAV_ITEMS.find((item) => isRouteActive(pathname, item));
  return hit?.label ?? "Epost.pk";
}
