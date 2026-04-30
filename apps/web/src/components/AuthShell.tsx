import { Link } from "react-router-dom";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  mode?: "login" | "register";
};

export default function AuthShell(props: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,rgba(14,116,144,0.16),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(11,107,58,0.16),transparent_28%),linear-gradient(170deg,#f8fcff_0%,#eef7f2_52%,#eef4ff_100%)] px-4 py-5 sm:px-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="mb-4">
          <Link
            to="/"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
          >
            Home
          </Link>
        </div>

        <div className="grid overflow-hidden rounded-[28px] border border-white/70 bg-white/65 shadow-[0_30px_70px_rgba(15,23,42,0.16)] backdrop-blur-xl md:grid-cols-[1.05fr_0.95fr]">
          <section className="relative min-h-[260px] bg-slate-100/40 md:min-h-[680px]">
            <img src="/assets/letter_box.png" alt="Pakistan Post letter box" className="h-full w-full object-contain p-6 md:p-10" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,23,42,0.05),rgba(15,23,42,0.22))]" />
          </section>

          <section className="flex items-center justify-center p-5 sm:p-8 lg:p-10">
            <div className="w-full max-w-[480px] rounded-3xl border border-white/80 bg-white/90 p-6 shadow-[0_24px_58px_rgba(15,23,42,0.2)] backdrop-blur-xl sm:p-8">
              <h1 className="text-2xl font-black tracking-[-0.02em] text-slate-950">{props.title}</h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{props.subtitle}</p>
              <div className="mt-5">{props.children}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
