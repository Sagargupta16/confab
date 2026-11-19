import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API runs on 8011 (see the root package.json); the page talks to it through
// this proxy, so the browser only ever sees one origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The built page goes inside the Python package, so the API serves it from a
  // checkout and from an installed wheel alike.
  build: { outDir: "../backend/src/confab/static", emptyOutDir: true },
  server: {
    port: 5183,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8011" },
  },
});
