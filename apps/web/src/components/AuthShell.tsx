import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

const perks = ["Bulk labels & envelopes", "Bulk tracking engine", "Complaint automation", "Queue-based processing"];

export default function AuthShell(props: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7fbf8,#edf5ef)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(11,93,59,0.16),_transparent_35%)]" />
      <div className="pointer-events-none absolute -top-28 left-1/2 h-[500px] w-[860px] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" aria-hidden />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2">
        <div className="hidden md:block">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white shadow-card">PP</div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Pakistan Post Label Platform</div>
              <div className="text-xs text-slate-600">Dispatch operations, unified</div>
            </div>
          </Link>

          <h1 className="mt-8 text-4xl font-semibold tracking-tight text-slate-950">{props.title}</h1>
          <p className="mt-3 max-w-md text-sm text-slate-600">{props.subtitle}</p>

          <div className="mt-8 grid gap-3">
            {perks.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-brand" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="md:hidden">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white shadow-card">PP</div>
              <div className="text-sm font-semibold text-slate-900">Pakistan Post Label Platform</div>
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">{props.title}</h1>
            <p className="mt-2 text-sm text-slate-600">{props.subtitle}</p>
          </div>

          <div className="ui-card mt-8 p-6">{props.children}</div>

          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-600">
            <span>© {new Date().getFullYear()} Pakistan Post Label Platform</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <Link to="/" className="hover:text-brand">
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
