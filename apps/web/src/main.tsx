import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

declare global {
  interface Window {
    mgt?: {
      clearMarks?: (...args: unknown[]) => void;
      [key: string]: unknown;
    };
  }
}

if (typeof window !== "undefined") {
  window.mgt = window.mgt ?? {};
  if (typeof window.mgt.clearMarks !== "function") {
    window.mgt.clearMarks = () => {};
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
