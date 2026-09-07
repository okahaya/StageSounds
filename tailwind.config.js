/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        stage: {
          bg: "#0f1012",
          surface: "#1e2227",
          surface2: "#17191c",
          border: "#2a2f37",
          muted: "#9ba3af",
          playing: "#00e676",
          fading: "#f59e0b",
          danger: "#ef4444",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "3px",
        md: "4px",
      },
    },
  },
  plugins: [],
};
