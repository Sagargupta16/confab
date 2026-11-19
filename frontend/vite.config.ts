import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The hosted page is built for GitHub Pages under /confab/ into dist. Every other build
// goes inside the Python package, so the API serves it from a checkout and from an
// installed wheel alike.
// (No @types/node here, so process is reached through globalThis.)
const nodeProcess = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
const isGitHubPages = nodeProcess?.env.GITHUB_PAGES === "true";

// The API runs on 8011 (see the root package.json); the page talks to it through
// this proxy, so the browser only ever sees one origin.
export default defineConfig({
  base: isGitHubPages ? "/confab/" : "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "logo.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "confab",
        short_name: "confab",
        description: "A group chat with Amazon Bedrock models. Mention one and it answers.",
        theme_color: "#0a0a0b",
        background_color: "#0a0a0b",
        display: "standalone",
        orientation: "any",
        // Relative to Vite's base, so it resolves to /confab/ on Pages.
        start_url: ".",
        scope: ".",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell only. Chats and rounds always go to the network.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: isGitHubPages
    ? { outDir: "dist" }
    : { outDir: "../backend/src/confab/static", emptyOutDir: true },
  server: {
    port: 5183,
    strictPort: true,
    // xfwd: the API sees the real client address, so local mode refuses a LAN client
    // even when the dev server runs with --host.
    proxy: { "/api": { target: "http://127.0.0.1:8011", xfwd: true } },
  },
});
