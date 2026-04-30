import Navbar from "../components/Navbar";
import HomeHero from "../components/HomeHero";
import Footer from "../components/Footer";
import OperationsModules from "../components/OperationsModules";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7fbf8] text-slate-900">
      <Navbar />
      <main>
        <HomeHero />
        <OperationsModules />
      </main>
      <Footer />
    </div>
  );
}
