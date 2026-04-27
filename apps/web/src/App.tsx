import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./components/RequireAdmin";
import AppShell from "./components/AppShell";
import Card from "./components/Card";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const PublicTracking = lazy(() => import("./pages/PublicTracking"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const BulkTracking = lazy(() => import("./pages/BulkTracking"));
const Complaints = lazy(() => import("./pages/Complaints"));
const Upload = lazy(() => import("./pages/Upload"));
const Jobs = lazy(() => import("./pages/Jobs"));
const Downloads = lazy(() => import("./pages/Downloads"));
const Billing = lazy(() => import("./pages/Billing"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));

function Loading() {
  return (
    <div className="w-full max-w-full px-3 py-6">
      <Card className="p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-gray-100" />
        <div className="mt-3 h-4 w-96 animate-pulse rounded bg-gray-100" />
      </Card>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/track" element={<PublicTracking />} />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tracking" element={<BulkTracking />} />
          <Route path="/complaints" element={<Complaints />} />
          <Route
            path="/upload"
            element={<Upload />}
          />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/downloads" element={<Navigate to="/jobs?filter=completed" replace />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/pricing" element={<Billing />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Settings />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
