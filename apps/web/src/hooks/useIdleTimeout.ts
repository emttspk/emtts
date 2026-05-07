import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

const CACHE_KEYS_TO_CLEAR = [
  "DASHBOARD_STATS_CACHE_KEY",
  "dashboard_stats_cache",
  "plans_cache",
  "wallet_queue_cache",
  "shipments_stats_cache",
  "complaints_cache",
];

function clearAllAppCache() {
  // Clear known cache keys
  CACHE_KEYS_TO_CLEAR.forEach((key) => {
    try { localStorage.removeItem(key); } catch {}
  });
  // Also clear any keys matching cache patterns
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes("_cache") || key.includes("cache_") || key.includes("_stats"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => {
    try { localStorage.removeItem(key); } catch {}
  });
  // Clear sessionStorage entirely
  try { sessionStorage.clear(); } catch {}
}

export function useIdleTimeout(enabled: boolean = true) {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    clearAllAppCache();
    clearSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(logout, IDLE_TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    if (!enabled) return;

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "touchmove",
      "click",
      "wheel",
    ];

    const handleActivity = () => resetTimer();

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start the initial timer
    resetTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [enabled, resetTimer]);
}
