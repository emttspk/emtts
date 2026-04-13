import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CreditCard, Mail, PhoneCall, ShieldCheck, Sparkles, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 to-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-indigo-50/40 via-transparent to-transparent" />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-[640px] w-[1080px] -translate-x-1/2 rounded-full bg-indigo-100/50 blur-3xl"
        aria-hidden
      />

      <header className="relative z-10">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 md:px-8">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-sm font-bold text-white shadow-lg">
              BD
            </div>
            <div className="text-lg font-bold text-gray-900">Bulk Dispatch &amp; Tracking System</div>
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
            <a href="#tracking" className="transition hover:text-slate-950">Tracking</a>
            <a href="#labels" className="transition hover:text-slate-950">Labels</a>
            <a href="#pricing" className="transition hover:text-slate-950">Pricing</a>
            <a href="#contact" className="transition hover:text-slate-950">Contact</a>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/login" className="rounded-lg px-4 py-2 text-gray-700 transition-all duration-200 ease-in-out hover:bg-white/80">
              Login
            </Link>
            <Link to="/register" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white shadow-lg transition-all duration-200 ease-in-out hover:bg-indigo-700 hover:shadow-xl">
              Start Free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-20 md:px-8 md:pt-32">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm backdrop-blur">
              <Sparkles className="h-5 w-5" />
              Unified Dispatch Ops Platform
            </div>

            <h1 className="mt-8 text-6xl font-black tracking-tight text-gray-900 md:text-7xl">Bulk Dispatch &amp; Tracking System</h1>

            <p className="mx-auto mt-8 max-w-2xl text-xl text-gray-600">Print, Track &amp; Manage Thousands of Shipments Instantly</p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/register" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-8 py-4 text-lg font-bold text-white shadow-lg transition-all duration-200 ease-in-out hover:bg-indigo-700 hover:shadow-xl sm:w-auto">
                Get Started Free <ArrowRight className="h-5 w-5" />
              </Link>
              <Link to="/register" className="inline-flex w-full items-center justify-center rounded-lg border-2 border-gray-300 bg-white px-8 py-4 text-lg font-bold text-gray-900 shadow-sm transition-all duration-200 ease-in-out hover:border-gray-400 hover:bg-gray-50 sm:w-auto">
                Explore Features
              </Link>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="text-sm font-medium text-slate-500">Tracking Accuracy</div>
              <div className="mt-3 text-4xl font-semibold text-slate-950">24/7</div>
              <div className="mt-2 text-sm text-slate-600">Bulk tracking queue with stored results and admin follow-up support.</div>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="text-sm font-medium text-slate-500">Label Operations</div>
              <div className="mt-3 text-4xl font-semibold text-slate-950">1 Upload</div>
              <div className="mt-2 text-sm text-slate-600">Generate labels, money orders, and tracking jobs from a unified file.</div>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="text-sm font-medium text-slate-500">Billing Visibility</div>
              <div className="mt-3 text-4xl font-semibold text-slate-950">Live</div>
              <div className="mt-2 text-sm text-slate-600">See package limits, remaining balances, and admin top-ups in one place.</div>
            </div>
          </div>

          <div id="labels" className="mt-20 grid grid-cols-1 gap-8 md:grid-cols-3">
            <Feature icon={Zap} title="Bulk Label Printing" desc="Upload Excel/CSV and download print-ready PDFs. Background processing keeps your workflow smooth." />
            <Feature icon={BarChart3} title="Bulk Tracking Dashboard" desc="Track thousands of shipments, store results, and monitor delivery progress." />
            <Feature icon={ShieldCheck} title="Complaint Automation" desc="Submit complaints via automation and keep complaint status attached to shipments." />
          </div>
        </section>

        <section id="tracking" className="relative z-10 border-t border-gray-200 bg-gray-50/50">
          <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
            <div className="text-center">
              <h2 className="text-4xl font-bold text-gray-900">Workflow</h2>
              <p className="mt-2 text-lg text-gray-600">Upload → Queue → Worker → Python API → Database → Dashboard</p>
            </div>

            <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-3">
              <Step number="1" title="Upload" desc="Import orders for labels or tracking numbers for bulk tracking" />
              <Step number="2" title="Process" desc="Queue workers generate PDFs and fetch tracking updates" />
              <Step number="3" title="Manage" desc="Shipments dashboard, complaints, downloads, and reporting" />
            </div>
          </div>
        </section>

        <section id="pricing" className="relative z-10 border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                <CreditCard className="h-4 w-4" />
                Billing
              </div>
              <h2 className="mt-5 text-4xl font-bold text-gray-900">Pricing made visible on the first page.</h2>
              <p className="mt-2 text-lg text-gray-600">Choose the package that fits your monthly label and tracking volume.</p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              <PricingCard title="Starter" price="Rs 0" subtitle="1,000 labels / 1,000 tracking" />
              <PricingCard title="Pro" price="Rs 1,999" subtitle="10,000 labels / 10,000 tracking" featured />
              <PricingCard title="Enterprise" price="Custom" subtitle="Tailored volumes and admin support" />
            </div>
          </div>
        </section>

        <section className="relative z-10 border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
            <div className="text-center">
              <h2 className="text-4xl font-bold text-gray-900">Media</h2>
              <p className="mt-2 text-lg text-gray-600">Barcode printing demo and tracking dashboard preview</p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">Barcode Printing Video</div>
                <div className="mt-3 overflow-hidden rounded-xl border bg-white">
                  <video className="h-64 w-full object-cover" controls poster="/media/barcode-demo-poster.svg">
                    <source src="/media/barcode-demo.mp4" type="video/mp4" />
                  </video>
                </div>
                <div className="mt-2 text-xs text-gray-600">Place your video at `apps/web/public/media/barcode-demo.mp4`.</div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">Tracking Dashboard Preview</div>
                <div className="mt-3 overflow-hidden rounded-xl border bg-white">
                  <img className="h-64 w-full object-cover" src="/media/tracking-dashboard-preview.svg" alt="Tracking dashboard preview" />
                </div>
                <div className="mt-2 text-xs text-gray-600">Replace this placeholder with a real screenshot when ready.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 bg-gradient-to-r from-indigo-600 to-indigo-700 py-20">
          <div className="mx-auto max-w-7xl px-4 text-center md:px-8">
            <h2 className="text-4xl font-bold text-white">Ready to dispatch at scale?</h2>
            <p className="mt-4 text-lg text-indigo-100">Labels, tracking, complaints, reporting — unified in one SaaS.</p>
            <Link to="/register" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-8 py-4 text-lg font-bold text-indigo-600 shadow-lg transition-all duration-200 ease-in-out hover:shadow-xl">
              Create Free Account <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </main>

      <footer id="contact" className="relative z-10 border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="text-lg font-semibold text-slate-950">Contact</div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                <div className="inline-flex items-center gap-2"><Mail className="h-4 w-4" /> support@bulkdispatch.local</div>
                <div className="inline-flex items-center gap-2"><PhoneCall className="h-4 w-4" /> +92 300 0000000</div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              <p>© 2026 Bulk Dispatch &amp; Tracking System.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature(props: { icon: any; title: string; desc: string }) {
  const Icon = props.icon;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-200 ease-in-out hover:shadow-lg hover:border-indigo-200">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-100">
        <Icon className="h-7 w-7 text-indigo-600" />
      </div>
      <div className="mt-6 text-xl font-bold text-gray-900">{props.title}</div>
      <div className="mt-2 text-gray-600">{props.desc}</div>
    </div>
  );
}

function Step(props: { number: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-2xl font-bold text-white shadow-lg">{props.number}</div>
      <div className="mt-6 text-xl font-bold text-gray-900">{props.title}</div>
      <div className="mt-2 text-gray-600">{props.desc}</div>
    </div>
  );
}

function PricingCard(props: { title: string; price: string; subtitle: string; featured?: boolean }) {
  return (
    <div className={`rounded-[28px] border p-7 shadow-[0_20px_60px_rgba(15,23,42,0.08)] ${props.featured ? "border-sky-200 bg-sky-50/70" : "border-slate-200 bg-white"}`}>
      <div className="text-xl font-semibold text-slate-950">{props.title}</div>
      <div className="mt-3 text-4xl font-semibold text-slate-950">{props.price}</div>
      <div className="mt-2 text-sm text-slate-600">{props.subtitle}</div>
      <Link to="/register" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
        Start now <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

