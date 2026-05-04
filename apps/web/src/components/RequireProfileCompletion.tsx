import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";

export default function RequireProfileCompletion(props: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const me = await api<{ onboardingRequired?: boolean }>("/api/me");
        if (!active) return;
        setOnboardingRequired(!!me.onboardingRequired);
      } catch {
        if (!active) return;
        setOnboardingRequired(false);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="px-4 py-6 text-sm text-slate-500">Checking profile status...</div>;
  }

  if (onboardingRequired) {
    return <Navigate to="/register/profile" replace />;
  }

  return <>{props.children}</>;
}
