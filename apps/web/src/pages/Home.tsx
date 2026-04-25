import Navbar from "../components/landing/Navbar";
import Hero from "../components/landing/Hero";
import FeatureStrip from "../components/landing/FeatureStrip";
import ProcessTimeline from "../components/landing/ProcessTimeline";
import FeaturesGrid from "../components/landing/FeaturesGrid";
import ProductPreview from "../components/landing/ProductPreview";
import Pricing from "../components/landing/Pricing";
import Footer from "../components/landing/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7fbf8] text-slate-900">
      <Navbar />
      <main>
        <Hero />
        <FeatureStrip />
        <ProcessTimeline />
        <FeaturesGrid />
        <ProductPreview />
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}
