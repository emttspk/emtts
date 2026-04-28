import { Link } from "react-router-dom";
import { ArrowUpRight, Home } from "lucide-react";
import letterBoxImage from "../assets/letter_box.jpg";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  mode?: "login" | "register";
};

export default function AuthShell(props: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(14,116,144,0.14),transparent_26%),linear-gradient(160deg,#f8fafc_0%,#eef7f1_58%,#f8fafc_100%)]">
      <div className="relative mx-auto min-h-screen w-full max-w-[1360px] px-4 py-4 sm:px-6 md:px-8 md:py-6">
        <div className="mb-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:text-slate-900"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
        </div>

        <div className="grid min-h-[calc(100vh-6.5rem)] overflow-hidden rounded-[34px] border border-white/70 bg-white/82 shadow-[0_34px_90px_rgba(15,23,42,0.14)] backdrop-blur md:grid-cols-[54fr_46fr]">
          <section className="relative hidden min-h-[640px] md:block">
            <img src={letterBoxImage} alt="Pakistan Post logistics" className="h-full w-full object-cover object-center" />
            <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(2,6,23,0.72),rgba(11,107,58,0.44),rgba(2,6,23,0.35))]" />
            <div className="absolute inset-x-10 bottom-10 max-w-[500px]">
              <div className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-200">
                Epost.pk Enterprise
              </div>
              <h1 className="mt-4 font-display text-4xl font-black leading-[1.05] tracking-[-0.04em] text-white">
                {props.mode === "register" ? "Create Your Shipping Workspace" : "Sign In To Operations Cloud"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Premium dispatch tooling for labels, money orders, tracking, and complaint operations.
              </p>
            </div>
          </section>

          <section className="flex items-center justify-center p-5 sm:p-8 lg:p-10">
            <div className="w-full max-w-[460px] rounded-[30px] border border-slate-200/90 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <div className="inline-flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#0f172a,#0b6b3a)] text-sm font-extrabold text-white">EP</div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">Epost.pk</div>
                    <div className="text-xs text-slate-500">Pakistan Post Platform</div>
                  </div>
                </div>
                <Link to="/" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
                  Home
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <h2 className="text-2xl font-bold tracking-[-0.02em] text-slate-950">{props.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{props.subtitle}</p>
              <div className="mt-6">{props.children}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


