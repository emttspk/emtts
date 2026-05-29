import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { getRole } from "../lib/auth";
import {
  listAdminSupportNotifications,
  listSupportNotifications,
  markAdminSupportNotificationsRead,
  markSupportNotificationsRead,
  type SupportNotification,
} from "../lib/support";

export default function SupportNotificationsBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const role = String(getRole() ?? "USER").toUpperCase();
  const isAdmin = role === "ADMIN";
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<SupportNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadNotifications() {
    setLoading(true);
    setError(null);
    try {
      const result = isAdmin ? await listAdminSupportNotifications() : await listSupportNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, [isAdmin, location.pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markRead(notificationIds?: string[], markAll?: boolean) {
    if (isAdmin) {
      await markAdminSupportNotificationsRead({ notificationIds, markAll });
      return;
    }
    await markSupportNotificationsRead({ notificationIds, markAll });
  }

  async function openNotification(notification: SupportNotification) {
    if (!notification.isRead) {
      await markRead([notification.id], false);
    }
    setOpen(false);
    await loadNotifications();
    navigate(isAdmin ? `/admin?tab=support&ticketId=${encodeURIComponent(notification.ticketId)}` : `/support/${encodeURIComponent(notification.ticketId)}`);
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button className="btn-secondary ui-touch-target relative p-2.5" title="Support notifications" onClick={() => setOpen((value) => !value)}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-[color:var(--line)] bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--text-strong)]">Support notifications</div>
              <div className="text-xs text-slate-500">{unreadCount} unread</div>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-brand disabled:opacity-50"
              disabled={unreadCount === 0}
              onClick={async () => {
                await markRead(undefined, true);
                await loadNotifications();
              }}
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading ? <p className="px-3 py-4 text-sm text-slate-500">Loading notifications...</p> : null}
            {error ? <p className="px-3 py-4 text-sm text-rose-600">{error}</p> : null}
            {!loading && !error && notifications.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No support notifications yet.</p> : null}

            {!loading && !error ? notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`mb-2 w-full rounded-2xl border px-3 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50 ${notification.isRead ? "border-slate-100 bg-white" : "border-emerald-200 bg-emerald-50/60"}`}
                onClick={() => void openNotification(notification)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{notification.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{notification.ticket?.ticketNumber ?? notification.ticketId}</div>
                  </div>
                  <div className="text-[11px] text-slate-400">{new Date(notification.createdAt).toLocaleString()}</div>
                </div>
                <p className="mt-2 text-sm text-slate-600">{notification.message}</p>
              </button>
            )) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}