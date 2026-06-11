import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import SEO from "../components/SEO";

export default function PostOfficeTracking() {
  return (
    <div className="public-shell">
      <SEO
        title="Post Office Tracking for Pakistan Parcels | ePost.pk"
        description="Track Pakistan Post parcels with post office tracking tools. ePost.pk offers bulk tracking, label generation, money orders, and complaint management for online sellers."
        canonicalPath="/post-office-tracking"
      />
      <Navbar />

      <main className="bg-[radial-gradient(circle_at_8%_0%,rgba(47,126,219,0.2),transparent_34%),radial-gradient(circle_at_94%_10%,rgba(14,165,118,0.18),transparent_30%),linear-gradient(180deg,#f5faff_0%,#edf6ff_52%,#effbf5_100%)] px-4 py-10 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-[1120px] rounded-[28px] border border-[#dce8f5] bg-white/92 p-6 shadow-[0_20px_44px_rgba(10,31,68,0.1)] sm:p-8 lg:p-10">
          <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
            Post Office Tracking Guide
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0f1f3a] sm:text-4xl">
            Post office tracking for Pakistan Post parcels
          </h1>
          <p className="mt-4 max-w-[72ch] text-base leading-7 text-slate-600">
            Use post office tracking tools to monitor Pakistan Post parcel movement, check bulk shipment status, and connect tracking with label dispatch, money orders, and complaint follow-up from one workspace.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/tracking" className="btn-primary rounded-full px-5 py-2 text-sm">
              Open Tracking
            </a>
            <a href="/register" className="rounded-full border border-[#dce8f5] bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#8eb8e7] hover:text-[#0f1f3a]">
              Start Free
            </a>
          </div>
        </section>

        <section className="mx-auto mt-8 grid w-full max-w-[1120px] gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">Track Pakistan Post parcels by tracking ID</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Enter single or multiple tracking IDs to check shipment status, delivery progress, and exception flags in real time.</p>
          </article>
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">Bulk tracking for high-volume dispatch</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Monitor large shipment batches together and isolate pending, delayed, or returned parcels faster.</p>
          </article>
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">Labels, money orders, and complaints</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Keep tracking connected with label generation, money order workflows, and complaint follow-up in one operational view.</p>
          </article>
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">Why sellers use ePost.pk for post office tracking</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Teams use ePost.pk to combine tracking visibility with dispatch, billing, and support actions for Pakistan Post shipments.</p>
          </article>
        </section>

        <section className="mx-auto mt-8 w-full max-w-[1120px] rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          ePost.pk is an independent shipping productivity tool and does not claim to be the official Pakistan Post website.
        </section>

        <section className="mx-auto mt-6 w-full max-w-[1120px] rounded-2xl border border-[#dce8f5] bg-white/88 p-5">
          <h2 className="text-base font-bold text-[#0f1f3a]">Useful links</h2>
          <ul className="mt-3 flex flex-wrap gap-3 text-sm">
            <li><a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/register">Start Free</a></li>
            <li><a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/pricing">View pricing</a></li>
            <li><a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/tracking">Open tracking</a></li>
            <li><a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/label-generator">Label generator</a></li>
            <li><a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/pakistan-post-tracking">Pakistan Post tracking guide</a></li>
            <li><a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/bulk-tracking">Bulk tracking guide</a></li>
            <li><a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/pakistan-post-complaints">Pakistan Post complaints</a></li>
            <li><a className="font-semibold text-[#0f1f3a] underline decoration-[#8eb8e7] decoration-2 underline-offset-4" href="/ecommerce-shipping-pakistan">Ecommerce shipping Pakistan</a></li>
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}
