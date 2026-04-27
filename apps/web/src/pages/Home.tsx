import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Footer from "../components/Footer";
import ProductShowcase from "../components/ProductShowcase";
import FeatureStrip from "../components/landing/FeatureStrip";
import Workflow from "../components/landing/Workflow";
import Pricing from "../components/landing/Pricing";
import CTA from "../components/landing/CTA";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7fbf8] text-slate-900">
      <Navbar />
      <main>
        <Hero />
        <FeatureStrip />
        <ProductShowcase />
        <Workflow />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
