/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--stage-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        stage: {
          bg: token("bg"),
          surface: token("surface"),
          surface2: token("surface2"),
          border: token("border"),
          muted: token("muted"),
          fg: token("fg"),
          accent: token("accent"),
          danger: token("danger"),
        },
      },
      fontFamily: {
        // オフライン動作(PWA / Tauri)のため Web フォントは読み込まず、OS 標準フォントを使う。
        sans: ["system-ui", "-apple-system", "Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Meiryo", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
      },
    },
  },
  plugins: [],
};
