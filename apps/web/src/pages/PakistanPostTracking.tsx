import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import SEO from "../components/SEO";

export default function PakistanPostTracking() {
  return (
    <div className="public-shell">
      <SEO
        title="Pakistan Post, Bulk Tracking & Parcel Status | ePost.pk"
        description="Track Pakistan Post parcels, check bulk tracking status, manage pending shipments, and use ePost.pk tools for labels, money orders, and 1 click complaints."
        canonicalPath="/pakistan-post-tracking"
      />
      <Navbar />

      <main className="bg-[radial-gradient(circle_at_8%_0%,rgba(47,126,219,0.2),transparent_34%),radial-gradient(circle_at_94%_10%,rgba(14,165,118,0.18),transparent_30%),linear-gradient(180deg,#f5faff_0%,#edf6ff_52%,#effbf5_100%)] px-4 py-10 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-[1120px] rounded-[28px] border border-[#dce8f5] bg-white/92 p-6 shadow-[0_20px_44px_rgba(10,31,68,0.1)] sm:p-8 lg:p-10">
          <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
            Pakistan Post Tracking Guide
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0f1f3a] sm:text-4xl">
            Pakistan Post Tracking for online sellers
          </h1>
          <p className="mt-4 max-w-[72ch] text-base leading-7 text-slate-600">
            Use this page to track parcel status quickly, handle bulk dispatch visibility, and move from tracking to action when a shipment needs follow-up.
            ePost.pk helps operations teams keep customer updates consistent without switching between multiple tools.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/tracking" className="btn-primary rounded-full px-5 py-2 text-sm">
              Track Parcel
            </a>
            <a href="/register" className="rounded-full border border-[#dce8f5] bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#8eb8e7] hover:text-[#0f1f3a]">
              Start Free
            </a>
          </div>
        </section>

        <section className="mx-auto mt-8 grid w-full max-w-[1120px] gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">Bulk tracking for multiple parcels</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              When dispatch volume grows, bulk tracking helps teams review pending, in-transit, and delivered statuses together and prioritize exceptions faster.
            </p>
          </article>
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">When to use 1 Click Complaints</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use 1 Click Complaints when shipment events stall, destination scans are missing, or customer delivery expectations are at risk and need immediate escalation.
            </p>
          </article>
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">Labels and money order generation</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Keep dispatch operations connected by generating labels and money orders from the same workspace used for shipment status checks.
            </p>
          </article>
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">Why use ePost.pk</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              ePost.pk combines tracking visibility, shipment workflows, and support actions so online sellers can reduce response time and improve delivery communication.
            </p>
          </article>
        </section>

        <section className="mx-auto mt-8 w-full max-w-[1120px] rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          ePost.pk is an independent shipping productivity tool and does not claim to be the official Pakistan Post website.
        </section>

        <section className="mx-auto mt-6 w-full max-w-[1120px] rounded-2xl border border-[#dce8f5] bg-white/88 p-5">
          <h2 className="text-base font-bold text-[#0f1f3a]">Useful links</h2>
          <ul className="mt-3 flex flex-wrap gap-3 text-sm">
            <li>
              <a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/tracking">
                Track parcels
              </a>
            </li>
            <li>
              <a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/pakistan-post-complaints">
                Pakistan Post complaints
              </a>
            </li>
            <li>
              <a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/label-generator">
                Label generator
              </a>
            </li>
            <li>
              <a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/money-order-generation">
                Money order generation
              </a>
            </li>
            <li>
              <a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/register">
                Create account
              </a>
            </li>
            <li>
              <a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/pricing">
                View pricing
              </a>
            </li>
            <li>
              <a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/bulk-tracking">
                Bulk tracking guide
              </a>
            </li>
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}
