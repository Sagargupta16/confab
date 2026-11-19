import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API runs on 8011 (see the root package.json); the page talks to it through
// this proxy, so the browser only ever sees one origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5183,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8011" },
  },
});
