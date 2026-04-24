/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0B5D3B",
          dark: "#094E32",
        },
      },
      boxShadow: {
        card: "0 16px 40px rgba(11, 93, 59, 0.12)",
        cardHover: "0 22px 52px rgba(11, 93, 59, 0.2)",
      },
    },
  },
  plugins: [],
};
