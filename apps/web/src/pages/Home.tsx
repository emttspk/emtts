import Navbar from "../components/Navbar";
import HomeHero from "../components/HomeHero";
import Footer from "../components/Footer";
import OperationsModules from "../components/OperationsModules";
import SEO from "../components/SEO";

export default function Home() {
  return (
    <div className="public-shell">
      <SEO
        title="Home | ePost.pk"
        description="Pakistan Post tracking, bulk tracking, shipping label generation, money orders, complaints, and ecommerce shipping tools in one workspace."
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
