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
        <OperationsModules />
      </main>
      <Footer />
    </div>
  );
}
