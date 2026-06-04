import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppErrorBoundary from "./components/AppErrorBoundary";
import RequireAuth from "./components/RequireAuth";
import RequireProfileCompletion from "./components/RequireProfileCompletion";
import RequireAdmin from "./components/RequireAdmin";
import AppShell from "./components/AppShell";
import { TEMPLATE_DESIGNER_ENABLED } from "./lib/featureFlags";
import { trackPageView } from "./lib/analytics";
import { getToken } from "./lib/auth";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import RegisterProfile from "./pages/RegisterProfile";

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
const AdminCommandCenter = lazy(() => import("./pages/admin/AdminCommandCenter"));
const AdminComplaintMonitor = lazy(() => import("./pages/AdminComplaintMonitor"));
const TemplateDesigner = lazy(() => import("./pages/TemplateDesigner"));
const GenerateLabels = lazy(() => import("./pages/GenerateLabels"));
const GenerateMoneyOrder = lazy(() => import("./pages/admin/GenerateMoneyOrder"));
const JazzCashResult = lazy(() => import("./pages/JazzCashResult"));
const AggregatorJazzCashResult = lazy(() => import("./pages/AggregatorJazzCashResult"));
const SupportTicketsPage = lazy(() => import("./pages/SupportTicketsPage"));
const SupportTicketDetailPage = lazy(() => import("./pages/SupportTicketDetailPage"));
const BookingQuote = lazy(() => import("./pages/BookingQuote"));
const AggregatorBookings = lazy(() => import("./pages/AggregatorBookings"));
const AggregatorBookingDetail = lazy(() => import("./pages/AggregatorBookingDetail"));
const AdminAggregatorBookings = lazy(() => import("./pages/admin/AdminAggregatorBookings"));
const PostageCalculator = lazy(() => import("./pages/PostageCalculator"));
const PostageUploadSummary = lazy(() => import("./pages/PostageUploadSummary"));
const PostageComparison = lazy(() => import("./pages/PostageComparison"));
const PakistanPostTracking = lazy(() => import("./pages/PakistanPostTracking"));

function Loading() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-[linear-gradient(180deg,#f4f9ff_0%,#eef6ff_55%,#f2fbf8_100%)] p-4">
      <div className="w-full max-w-3xl rounded-[30px] border border-[#dce8f5] bg-white/95 p-6 shadow-[0_28px_64px_rgba(10,31,68,0.12)] md:p-8">
        <div className="h-2 w-32 animate-pulse rounded-full bg-[#0ea576]/20" />
        <div className="mt-4 h-8 w-56 animate-pulse rounded-xl bg-slate-100" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-slate-100" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function TrackingEntry() {
  return getToken() ? <Navigate to="/tracking-workspace" replace /> : <PublicTracking />;
}

function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<Loading />}>
        <AnalyticsRouteTracker />
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
        <Route path="/pakistan-post-tracking" element={<PakistanPostTracking />} />
        <Route path="/payment/jazzcash/result" element={<JazzCashResult />} />
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
          <Route path="/generate-labels" element={<GenerateLabels />} />
          <Route path="/generate-money-orders" element={<GenerateMoneyOrder />} />
          <Route
            path="/upload"
            element={<Upload />}
          />
          <Route
            path="/booking-quote"
            element={
              <RequireAdmin>
                <BookingQuote />
              </RequireAdmin>
            }
          />
          <Route
            path="/postage-calculator"
            element={
              <RequireAdmin>
                <PostageCalculator />
              </RequireAdmin>
            }
          />
          <Route
            path="/postage-upload-summary"
            element={
              <RequireAdmin>
                <PostageUploadSummary />
              </RequireAdmin>
            }
          />
          <Route
            path="/postage-comparison"
            element={
              <RequireAdmin>
                <PostageComparison />
              </RequireAdmin>
            }
          />
          <Route
            path="/aggregator-bookings"
            element={
              <RequireAdmin>
                <AggregatorBookings />
              </RequireAdmin>
            }
          />
          <Route
            path="/aggregator-bookings/:bookingId"
            element={
              <RequireAdmin>
                <AggregatorBookingDetail />
              </RequireAdmin>
            }
          />
          <Route
            path="/aggregator-bookings/payment/jazzcash/result"
            element={
              <RequireAdmin>
                <AggregatorJazzCashResult />
              </RequireAdmin>
            }
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
          <Route path="/support" element={<SupportTicketsPage />} />
          <Route path="/support/:ticketId" element={<SupportTicketDetailPage />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminCommandCenter />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/legacy"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />
          <Route path="/admin/generate-labels" element={<Navigate to="/generate-labels" replace />} />
          <Route
            path="/admin/complaint-monitor"
            element={
              <RequireAdmin>
                <AdminComplaintMonitor />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/aggregator-bookings"
            element={
              <RequireAdmin>
                <AdminAggregatorBookings />
              </RequireAdmin>
            }
          />
          <Route path="/admin/generate-money-orders" element={<Navigate to="/generate-money-orders" replace />} />
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
    </AppErrorBoundary>
  );
}
