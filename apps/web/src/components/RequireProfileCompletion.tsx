import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { fetchMe, primeMeCache } from "../lib/UserService";

export default function RequireProfileCompletion(props: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const me = await fetchMe({ source: "require-profile" });
        if (!active) return;
        primeMeCache(me);
        const onboarding = (me as { onboardingRequired?: boolean }).onboardingRequired;
        setOnboardingRequired(Boolean(onboarding));
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
