/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#10B981",
          dark: "#059669",
          ink: "#111827",
          mist: "#F7F9FC",
          line: "#E8EDF5",
          mute: "#6B7280",
          success: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        auth: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 40px rgba(8, 18, 37, 0.07)",
        cardHover: "0 24px 54px rgba(8, 18, 37, 0.12)",
        glass: "0 20px 48px rgba(8, 18, 37, 0.08)",
        glow: "0 0 0 1px rgba(255,255,255,0.3), 0 24px 56px rgba(16, 185, 129, 0.2)",
      },
      backgroundImage: {
        "hero-grid": "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
        "brand-radial": "radial-gradient(circle at top left, rgba(11, 107, 58, 0.20), transparent 34%), radial-gradient(circle at top right, rgba(15, 23, 42, 0.12), transparent 26%), linear-gradient(180deg, #f8fafc 0%, #edf7f0 52%, #f8fafc 100%)",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.8s linear infinite",
        "pulse-soft": "pulseSoft 4s ease-in-out infinite",
        fade: "fadeIn 1s ease-out forwards",
        "tracking-pulse": "trackingPulse 2.5s ease-in-out infinite",
        scale102: "scale102 0.3s ease-out",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.65", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        trackingPulse: {
          "0%, 100%": { opacity: "1", r: "5" },
          "50%": { opacity: "0.6", r: "7" },
        },
        scale102: {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(1.02)" },
        },
      },
    },
  },
  plugins: [],
};
