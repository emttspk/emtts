import { Navigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import HomeHero from "../components/HomeHero";
import Footer from "../components/Footer";
import OperationsModules from "../components/OperationsModules";
import { getToken } from "../lib/auth";

export default function Home() {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  if (isMobile && !getToken()) {
    return <Navigate to="/login" replace />;
  }

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
