import Navbar from "../components/Navbar";
import HomeHero from "../components/HomeHero";
import Footer from "../components/Footer";
import OperationsModules from "../components/OperationsModules";
import SEO from "../components/SEO";

export default function Home() {
  return (
    <div className="public-shell">
      <SEO
        title="Pakistan Post Tracking, 1 Click Complaints, Bulk Tracking, Labels & Money Orders | ePost.pk"
        description="Use ePost.pk for Pakistan Post bulk tracking, 1 click complaints, label generation, money order generation, billing, and ecommerce shipping management from one workspace."
        canonicalPath="/"
      />
      <Navbar />
      <main>
        <HomeHero />
        <section className="mx-auto mt-4 w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
          <a
            href="/pakistan-post-tracking"
            className="inline-flex items-center rounded-full border border-[#dce8f5] bg-white px-4 py-2 text-sm font-semibold text-[#0f1f3a] shadow-sm transition hover:border-[#8eb8e7]"
          >
            Pakistan Post Tracking Guide
          </a>
        </section>
        <OperationsModules />
      </main>
      <Footer />
    </div>
  );
}
