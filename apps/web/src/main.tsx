import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { initializeAnalytics } from "./lib/analytics";
import "./index.css";

const PRELOAD_RECOVERY_KEY = "epost_chunk_preload_recovered";

declare global {
  interface Window {
    mgt?: {
      clearMarks?: (...args: unknown[]) => void;
      [key: string]: unknown;
    };
  }
}

if (typeof window !== "undefined") {
  initializeAnalytics();

  window.mgt = window.mgt ?? {};
  if (typeof window.mgt.clearMarks !== "function") {
    window.mgt.clearMarks = () => {};
  }

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    try {
      const recovered = window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY) === "1";
      if (!recovered) {
        window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, "1");
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  });

  window.sessionStorage.removeItem(PRELOAD_RECOVERY_KEY);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
