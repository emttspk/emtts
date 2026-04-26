import Navbar from "../components/landing/Navbar";
import Hero from "../components/landing/Hero";
import FeatureStrip from "../components/landing/FeatureStrip";
import ProcessTimeline from "../components/landing/ProcessTimeline";
import TrackingTypes from "../components/landing/TrackingTypes";
import Pricing from "../components/landing/Pricing";
import CTA from "../components/landing/CTA";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7fbf8] text-slate-900">
      <Navbar />
      <main>
        <Hero />
        <FeatureStrip />
        <ProcessTimeline />
        <TrackingTypes />
        <Pricing />
        <CTA />
      </main>
    </div>
  );
}
