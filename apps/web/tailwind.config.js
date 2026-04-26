/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0B6B3A",
          dark: "#07552E",
          ink: "#0F172A",
          mist: "#F8FAFC",
          line: "#E2E8F0",
          mute: "#64748B",
          success: "#16A34A",
          warning: "#F59E0B",
          danger: "#DC2626",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        card: "0 24px 60px rgba(15, 23, 42, 0.08)",
        cardHover: "0 28px 90px rgba(15, 23, 42, 0.14)",
        glass: "0 20px 60px rgba(15, 23, 42, 0.10)",
        glow: "0 0 0 1px rgba(255,255,255,0.3), 0 30px 80px rgba(11, 107, 58, 0.18)",
      },
      backgroundImage: {
        "hero-grid": "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
        "brand-radial": "radial-gradient(circle at top left, rgba(11, 107, 58, 0.20), transparent 34%), radial-gradient(circle at top right, rgba(15, 23, 42, 0.12), transparent 26%), linear-gradient(180deg, #f8fafc 0%, #edf7f0 52%, #f8fafc 100%)",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.8s linear infinite",
        "pulse-soft": "pulseSoft 4s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.65", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
      },
    },
  },
  plugins: [],
};
