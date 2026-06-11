import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import SEO from "../components/SEO";

export default function LeopardsTrackingAlternative() {
  return (
    <div className="public-shell">
      <SEO
        title="Leopards Courier Tracking Alternative for Sellers | ePost.pk"
        description="Looking for a Leopards courier tracking alternative? ePost.pk provides Pakistan Post bulk tracking, label generation, money orders, and complaint automation in one platform."
        canonicalPath="/leopards-tracking-alternative"
      />
      <Navbar />

      <main className="bg-[radial-gradient(circle_at_8%_0%,rgba(47,126,219,0.2),transparent_34%),radial-gradient(circle_at_94%_10%,rgba(14,165,118,0.18),transparent_30%),linear-gradient(180deg,#f5faff_0%,#edf6ff_52%,#effbf5_100%)] px-4 py-10 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-[1120px] rounded-[28px] border border-[#dce8f5] bg-white/92 p-6 shadow-[0_20px_44px_rgba(10,31,68,0.1)] sm:p-8 lg:p-10">
          <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
            Leopards Alternative
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0f1f3a] sm:text-4xl">
            Leopards courier tracking alternative for online sellers
          </h1>
          <p className="mt-4 max-w-[72ch] text-base leading-7 text-slate-600">
            If you are evaluating Leopards courier alternatives for Pakistan Post shipments, ePost.pk offers a unified workspace for tracking, labels, money orders, and complaints.
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
            <h2 className="text-lg font-bold text-[#0f1f3a]">Bulk tracking for Pakistan Post parcels</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Monitor multiple shipments at once, spot pending deliveries, and prioritise follow-up actions from one screen.</p>
          </article>
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">Label and money order generation</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Keep dispatch workflows connected by generating labels and money orders from the same workspace used for tracking.</p>
          </article>
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">1 Click Complaints for delayed parcels</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Move from tracking to complaint follow-up faster when delivery stalls or customer timelines need attention.</p>
          </article>
          <article className="rounded-2xl border border-[#dce8f5] bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0f1f3a]">Billing and usage management</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Track usage across labels, tracking, and complaints, and upgrade plans as your dispatch volume grows.</p>
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
