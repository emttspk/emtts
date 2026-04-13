import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

const perks = ["Bulk labels & envelopes", "Bulk tracking engine", "Complaint automation", "Queue-based processing"];

export default function AuthShell(props: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-50">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-indigo-50 via-gray-50 to-gray-50" />
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-indigo-100/60 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:px-8">
        <div className="hidden md:block">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-md">BD</div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Bulk Dispatch &amp; Tracking</div>
              <div className="text-xs text-gray-600">Dispatch operations, unified</div>
            </div>
          </Link>

          <h1 className="mt-8 text-3xl font-semibold tracking-tight text-gray-900">{props.title}</h1>
          <p className="mt-3 max-w-md text-sm text-gray-600">{props.subtitle}</p>

          <div className="mt-8 grid gap-3">
            {perks.map((p) => (
              <div key={p} className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {p}
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="md:hidden">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-md">BD</div>
              <div className="text-sm font-semibold text-gray-900">Bulk Dispatch &amp; Tracking</div>
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-gray-900">{props.title}</h1>
            <p className="mt-2 text-sm text-gray-600">{props.subtitle}</p>
          </div>

          <div className="mt-8 rounded-xl border bg-white p-6 shadow-sm">{props.children}</div>

          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-600">
            <span>© {new Date().getFullYear()} Bulk Dispatch &amp; Tracking System</span>
            <span className="h-1 w-1 rounded-full bg-gray-300" />
            <Link to="/" className="hover:text-gray-900">
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

