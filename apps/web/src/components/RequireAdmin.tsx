import { Navigate } from "react-router-dom";
import { getRole, getToken } from "../lib/auth";

export default function RequireAdmin(props: { children: React.ReactNode }) {
  const ok = getToken() && getRole() === "ADMIN";
  return ok ? <>{props.children}</> : <Navigate to="/dashboard" replace />;
}

