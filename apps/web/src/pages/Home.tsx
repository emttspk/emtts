import Navbar from "../components/landing/Navbar";
import Hero from "../components/landing/Hero";
import FreePlan from "../components/landing/FreePlan";
import Features from "../components/landing/Features";
import Workflow from "../components/landing/Workflow";
import Pricing from "../components/landing/Pricing";
import CTA from "../components/landing/CTA";
import Footer from "../components/landing/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar />
      <main>
        <Hero />
        <FreePlan />
        <Features />
        <Workflow />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

