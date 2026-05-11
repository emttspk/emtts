import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Headset,
  Home,
  LockKeyhole,
  Mail,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  mode?: "login" | "register";
};

export default function AuthShell(props: AuthShellProps) {
  const isLogin = props.mode !== "register";
  const topPrompt = isLogin
    ? { label: "New here?", action: "Create Account", href: "/register" }
    : { label: "Already have access?", action: "Sign in", href: "/login" };

  const featureItems = [
    {
      icon: ShieldCheck,
      title: "Secure & Safe",
      text: "Your data is protected with top-tier enterprise security.",
    },
    {
      icon: PackageCheck,
      title: "Track Shipments",
      text: "Monitor deliveries, status changes, and exceptions in real time.",
    },
    {
      icon: Headset,
      title: "24/7 Support",
      text: "Reach Pakistan Post operations support whenever you need help.",
    },
  ];

  const trustItems = [
    { icon: LockKeyhole, label: "Secure Login", detail: "256-bit SSL encryption" },
    { icon: ShieldCheck, label: "Privacy Protected", detail: "Your information is safe" },
    { icon: BadgeCheck, label: "Verified Service", detail: "Official Pakistan Post" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fdfefe_0%,#f4fbf6_55%,#eef7f1_100%)] px-4 py-4 font-auth sm:px-6 lg:px-8 lg:py-6">
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
        className="relative mx-auto w-full max-w-[1440px] overflow-hidden rounded-[32px] border border-white/70 bg-white/68 shadow-[0_32px_120px_rgba(15,23,42,0.16)] backdrop-blur-2xl"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: "easeOut" }}
      >
        <div className="grid min-h-[calc(100vh-2rem)] md:grid-cols-[1.02fr_0.98fr] xl:grid-cols-[1.08fr_0.92fr]">
          <section className="relative flex flex-col overflow-hidden border-b border-white/60 bg-[linear-gradient(160deg,rgba(255,255,255,0.92),rgba(240,250,243,0.82))] p-6 sm:p-8 md:min-h-[720px] md:border-b-0 md:border-r md:border-r-white/60 md:p-7 lg:p-10 xl:p-12">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-[18px] border border-[#E1261C]/15 bg-[#E1261C]/8 shadow-[0_12px_30px_rgba(225,38,28,0.15)]">
                  <div className="absolute inset-[7px] rounded-full border border-[#E1261C]/25" />
                  <Mail className="h-6 w-6 text-[#E1261C]" strokeWidth={2.2} />
                </div>
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.34em] text-[#E1261C]">Pakistan Post</p>
                  <h2 className="mt-1 text-[1.65rem] font-extrabold tracking-[-0.04em] text-slate-950">Pakistan Post</h2>
                  <p className="text-sm font-medium text-[#E1261C]">پاکستان پوسٹ</p>
                </div>
              </div>

              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-200 hover:text-slate-950"
              >
                <Home className="h-4 w-4" />
                Home
              </Link>
            </div>

            <motion.div
              className="relative z-10 mt-10 max-w-[34rem] md:mt-12 lg:mt-14"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-[#12B347]/15 bg-white/70 px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-[#0F9D58] shadow-[0_10px_24px_rgba(18,179,71,0.1)]">
                Workspace Access
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
              <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.06em] text-[#0F172A] sm:text-5xl lg:text-[4.25rem] lg:leading-[0.96] xl:text-[4.5rem] xl:leading-[0.95]">
                Welcome <span className="bg-[linear-gradient(135deg,#0F9D58,#16C75A)] bg-clip-text text-transparent">Back!</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#64748B] sm:text-lg">
                Sign in to access your shipment workspace and manage your deliveries.
              </p>
            </motion.div>

            <motion.div
              className="relative z-10 mt-8 overflow-hidden rounded-[30px] border border-white/75 bg-white/55 p-3 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:mt-10 md:mt-8 lg:mt-12"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.18, ease: "easeOut" }}
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#12B347]/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-8 h-44 w-44 rounded-full bg-[#E1261C]/12 blur-3xl" />
              <img
                src="/assets/letter_box.png"
                alt="Pakistan Post office with signature red mailbox"
                className="relative z-10 h-[260px] w-full rounded-[24px] object-cover object-center sm:h-[320px] md:h-[280px] lg:h-[400px] xl:h-[460px]"
              />
              <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 rounded-b-[24px] bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.22))] px-6 py-5 text-white">
                <p className="text-sm font-semibold tracking-[0.16em] text-white/75">National Delivery Workspace</p>
                <p className="mt-1 text-lg font-semibold">Designed for shipment operations, account control, and tracking visibility.</p>
              </div>
            </motion.div>

            <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-3 md:mt-5 lg:mt-auto">
              {featureItems.map(({ icon: Icon, title, text }, index) => (
                <motion.div
                  key={title}
                  className="rounded-[24px] border border-white/70 bg-white/72 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.22 + index * 0.08, ease: "easeOut" }}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(15,157,88,0.16),rgba(22,199,90,0.2))] text-[#0F9D58] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                    <Icon className="h-5 w-5" strokeWidth={2.1} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">{text}</p>
                </motion.div>
              ))}
            </div>

            <p className="relative z-10 mt-6 text-sm text-slate-400">© 2026 Pakistan Post. All rights reserved.</p>
          </section>

          <section className="relative flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.74))] px-5 py-8 sm:px-8 sm:py-10 md:px-7 lg:px-10 xl:px-12">
            <div className="w-full max-w-[540px]">
              <motion.div
                className="mb-6 flex items-center justify-between gap-4"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
              >
                <span className="text-sm font-medium text-slate-500">{topPrompt.label}</span>
                <Link
                  to={topPrompt.href}
                  className="inline-flex items-center justify-center rounded-2xl border border-[#12B347]/25 bg-white/80 px-5 py-2.5 text-sm font-semibold text-[#0F9D58] shadow-[0_12px_30px_rgba(18,179,71,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-[#12B347]/45 hover:bg-white"
                >
                  {topPrompt.action}
                </Link>
              </motion.div>

              <motion.div
                className="rounded-[32px] border border-white/85 bg-[rgba(255,255,255,0.88)] p-6 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur-2xl sm:p-8 lg:p-9"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.18, ease: "easeOut" }}
              >
                <h1 className="text-[2.1rem] font-extrabold tracking-[-0.05em] text-[#0F172A]">{props.title}</h1>
                <p className="mt-2 text-base leading-7 text-[#64748B]">{props.subtitle}</p>
                <div className="mt-7">{props.children}</div>
              </motion.div>

              <motion.div
                className="mt-6 grid gap-3 rounded-[28px] border border-white/75 bg-white/52 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:grid-cols-3"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.24, ease: "easeOut" }}
              >
                {trustItems.map(({ icon: Icon, label, detail }) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 sm:px-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#12B347]/10 text-[#12B347]">
                      <Icon className="h-4.5 w-4.5" strokeWidth={2.1} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{label}</p>
                      <p className="text-xs leading-5 text-slate-500">{detail}</p>
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
