import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Home,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  mode?: "login" | "register";
};

export default function AuthShell(props: AuthShellProps) {
  const isLogin = props.mode !== "register";
  const topPrompt = isLogin
    ? { action: "Create Account", href: "/register" }
    : { action: "Sign in", href: "/login" };

  const featureItems = [
    {
      icon: ShieldCheck,
      title: "Secure Access",
    },
    {
      icon: BadgeCheck,
      title: "Tracking",
    },
    {
      icon: ArrowRight,
      title: "Workspace",
    },
  ];

  const trustItems = [
    { icon: ShieldCheck, label: "Secure Login" },
    { icon: BadgeCheck, label: "Verified Service" },
  ];

  return (
    <div className="relative min-h-screen min-h-[100svh] overflow-hidden bg-[linear-gradient(180deg,#fdfefe_0%,#f4fbf6_55%,#eef7f1_100%)] px-3 py-2 font-auth sm:px-4 lg:px-5 lg:py-3">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-8 h-56 w-56 rounded-full bg-[#12B347]/12 blur-3xl"
        animate={{ x: [0, 30, -12, 0], y: [0, 20, -8, 0] }}
        transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[#E1261C]/10 blur-3xl"
        animate={{ x: [0, -22, 0], y: [0, 18, 0] }}
        transition={{ duration: 16, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(18,179,71,0.1),transparent_26%),radial-gradient(circle_at_top_right,rgba(225,38,28,0.08),transparent_18%),linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] bg-[size:auto,auto,22px_22px,22px_22px] [mask-image:linear-gradient(180deg,rgba(255,255,255,0.7),rgba(255,255,255,0.2))]" />

      <motion.div
        className="relative mx-auto w-full max-w-[1360px] overflow-hidden rounded-[28px] border border-white/70 bg-white/68 shadow-[0_24px_90px_rgba(15,23,42,0.14)] backdrop-blur-2xl"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: "easeOut" }}
      >
        <div className="grid min-h-[calc(100vh-1rem)] min-h-[calc(100svh-1rem)] md:grid-cols-[0.94fr_0.96fr] xl:grid-cols-[1fr_1fr]">
          <section className="relative flex flex-col overflow-hidden border-b border-white/60 bg-[linear-gradient(160deg,rgba(255,255,255,0.92),rgba(240,250,243,0.82))] p-4 sm:p-5 md:border-b-0 md:border-r md:border-r-white/60 md:p-5 lg:p-5 xl:p-6">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <img src="/assets/pakistan-post-logo.png" alt="Pakistan Post" className="h-10 w-auto object-contain sm:h-11" />
                  <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E1261C]">Pakistan Post</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-200 hover:text-slate-950"
                >
                  <Home className="h-4 w-4" />
                  Home
                </Link>
                <Link
                  to={topPrompt.href}
                  className="inline-flex items-center justify-center rounded-full border border-[#12B347]/25 bg-white/80 px-3.5 py-1.5 text-sm font-semibold text-[#0F9D58] shadow-[0_10px_24px_rgba(18,179,71,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-[#12B347]/45 hover:bg-white"
                >
                  {topPrompt.action}
                </Link>
              </div>
            </div>

            <motion.div
              className="relative z-10 mt-4 max-w-[24rem] md:mt-5 lg:mt-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-[#12B347]/15 bg-white/70 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#0F9D58] shadow-[0_10px_24px_rgba(18,179,71,0.1)]">
                Secure Access
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
              <h1 className="mt-2.5 text-[2rem] font-extrabold tracking-[-0.05em] text-[#0F172A] sm:text-[2.25rem] lg:text-[2.55rem] lg:leading-[0.98] xl:text-[2.9rem]">
                Pakistan Post
              </h1>
            </motion.div>

            <motion.div
              className="relative z-10 mt-4 overflow-hidden rounded-[24px] border border-white/75 bg-white/55 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:mt-5 md:mt-4 lg:mt-5"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.18, ease: "easeOut" }}
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#12B347]/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-8 h-44 w-44 rounded-full bg-[#E1261C]/12 blur-3xl" />
              <img
                src="/assets/letter_box.png"
                alt="Pakistan Post office with signature red mailbox"
                className="relative z-10 h-[152px] w-full rounded-[20px] object-cover object-center sm:h-[172px] md:h-[164px] lg:h-[188px] xl:h-[212px]"
              />
            </motion.div>

            <div className="relative z-10 mt-3 grid gap-2 sm:grid-cols-3 md:mt-3 lg:mt-auto">
              {featureItems.map(({ icon: Icon, title }, index) => (
                <motion.div
                  key={title}
                  className="rounded-[20px] border border-white/70 bg-white/72 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.22 + index * 0.08, ease: "easeOut" }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(15,157,88,0.16),rgba(22,199,90,0.2))] text-[#0F9D58] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2.1} />
                  </div>
                  <h3 className="mt-2.5 text-[0.9rem] font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
                </motion.div>
              ))}
            </div>

            <p className="relative z-10 mt-3 text-[11px] text-slate-400">© 2026 Pakistan Post</p>
          </section>

          <section className="relative flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.74))] px-4 py-4 sm:px-5 sm:py-5 md:px-6 lg:px-7 xl:px-8">
            <div className="w-full max-w-[480px]">
              <motion.div
                className="rounded-[26px] border border-white/85 bg-[rgba(255,255,255,0.88)] p-[18px] shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-2xl sm:p-5 lg:p-6"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.18, ease: "easeOut" }}
              >
                <h1 className="text-[1.7rem] font-extrabold tracking-[-0.05em] text-[#0F172A] sm:text-[1.8rem]">{props.title}</h1>
                {props.subtitle ? <p className="mt-1.5 text-[14px] leading-5 text-[#64748B]">{props.subtitle}</p> : null}
                <div className="mt-4">{props.children}</div>
              </motion.div>

              <motion.div
                className="mt-3 grid gap-2 rounded-[22px] border border-white/75 bg-white/52 p-2.5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:grid-cols-2"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.24, ease: "easeOut" }}
              >
                {trustItems.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 rounded-2xl px-1 py-0.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-[#12B347]/10 text-[#12B347]">
                      <Icon className="h-4.5 w-4.5" strokeWidth={2.1} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-slate-900">{label}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
