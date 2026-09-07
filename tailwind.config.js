/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        stage: {
          bg: "#0a0a0f",
          panel: "#14141c",
          panel2: "#1c1c26",
          border: "#2a2a38",
          accent: "#f97316",
          accent2: "#22d3ee",
          danger: "#ef4444",
          success: "#22c55e",
        },
      },
      fontFamily: {
        mono: ["Consolas", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
