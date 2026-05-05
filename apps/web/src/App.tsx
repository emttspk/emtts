import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import RequireProfileCompletion from "./components/RequireProfileCompletion";
import RequireAdmin from "./components/RequireAdmin";
import AppShell from "./components/AppShell";
import Card from "./components/Card";
import { TEMPLATE_DESIGNER_ENABLED } from "./lib/featureFlags";
import { getToken } from "./lib/auth";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const RegisterProfile = lazy(() => import("./pages/RegisterProfile"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ForgotUsername = lazy(() => import("./pages/ForgotUsername"));
const EmailOtpLogin = lazy(() => import("./pages/EmailOtpLogin"));
const PublicTracking = lazy(() => import("./pages/PublicTracking"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const BulkTracking = lazy(() => import("./pages/BulkTracking"));
const Complaints = lazy(() => import("./pages/Complaints"));
const Upload = lazy(() => import("./pages/Upload"));
const Jobs = lazy(() => import("./pages/Jobs"));
const Downloads = lazy(() => import("./pages/Downloads"));
const Billing = lazy(() => import("./pages/Billing"));
const SelectPackage = lazy(() => import("./pages/SelectPackage"));
const UpdatePackage = lazy(() => import("./pages/UpdatePackage"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminComplaintMonitor = lazy(() => import("./pages/AdminComplaintMonitor"));
const TemplateDesigner = lazy(() => import("./pages/TemplateDesigner"));
const GenerateLabels = lazy(() => import("./pages/GenerateLabels"));
const GenerateMoneyOrder = lazy(() => import("./pages/admin/GenerateMoneyOrder"));

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

function TrackingEntry() {
  return getToken() ? <Navigate to="/tracking-workspace" replace /> : <PublicTracking />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/register/profile"
          element={
            <RequireAuth>
              <RegisterProfile />
            </RequireAuth>
          }
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/forgot-username" element={<ForgotUsername />} />
        <Route path="/email-otp" element={<EmailOtpLogin />} />
        <Route path="/email-otp-login" element={<EmailOtpLogin />} />
        <Route path="/track" element={<Navigate to="/tracking" replace />} />
        <Route path="/tracking" element={<TrackingEntry />} />
        <Route path="/tracking/:trackingId" element={<PublicTracking />} />

        <Route
          element={
            <RequireAuth>
              <RequireProfileCompletion>
                <AppShell />
              </RequireProfileCompletion>
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tracking" element={<Navigate to="/tracking-workspace" replace />} />
          <Route path="/tracking-workspace" element={<BulkTracking />} />
          <Route path="/complaints" element={<Complaints />} />
          <Route path="/generate-labels" element={<Navigate to="/admin/generate-labels" replace />} />
          <Route path="/generate-money-orders" element={<Navigate to="/admin/generate-money-orders" replace />} />
          <Route
            path="/upload"
            element={<Upload />}
          />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/download-labels" element={<Navigate to="/jobs?filter=completed" replace />} />
          <Route path="/downloads" element={<Navigate to="/jobs?filter=completed" replace />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/pricing" element={<Billing />} />
          <Route path="/billing/checkout" element={<Billing entryMode="select" />} />
          <Route path="/packages" element={<Navigate to="/select-package" replace />} />
          <Route path="/select-package" element={<SelectPackage />} />
          <Route path="/update-package" element={<UpdatePackage />} />
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
          <Route
            path="/admin/generate-labels"
            element={
              <RequireAdmin>
                <GenerateLabels />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/complaint-monitor"
            element={
              <RequireAdmin>
                <AdminComplaintMonitor />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/generate-money-orders"
            element={
              <RequireAdmin>
                <GenerateMoneyOrder />
              </RequireAdmin>
            }
          />
          {TEMPLATE_DESIGNER_ENABLED ? (
            <Route
              path="/admin/template-designer"
              element={
                <RequireAdmin>
                  <TemplateDesigner />
                </RequireAdmin>
              }
            />
          ) : null}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
