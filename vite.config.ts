import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "StageSounds",
        short_name: "StageSounds",
        description: "低遅延・高信頼性のステージ音響ポン出し（サンプラー）アプリケーション",
        display: "standalone",
        start_url: "./",
        scope: "./",
        theme_color: "#0f1012",
        background_color: "#0f1012",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // ステージ現場での完全オフライン起動のため、ビルド成果物一式を Service Worker に
        // プリキャッシュする（ネットワーク遮断下での F5 リロード・ブラウザ再起動に対応）。
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2,ttf,eot,webmanifest,json}"],
      },
    }),
  ],
  base: "./",
  build: {
    target: "es2020",
  },
});
