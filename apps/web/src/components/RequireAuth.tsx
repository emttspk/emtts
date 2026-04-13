import { Navigate } from "react-router-dom";
import { getToken } from "../lib/auth";

export default function RequireAuth(props: { children: React.ReactNode }) {
  return getToken() ? <>{props.children}</> : <Navigate to="/login" replace />;
}

