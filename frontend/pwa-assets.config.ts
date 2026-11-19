import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Icons for the installed page, made from public/logo.svg. The apple icon is
// full-bleed (the logo already paints its own near-black canvas); iOS rounds it.
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent },
    maskable: { ...minimal2023Preset.maskable },
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions: { fit: "contain", background: "#0a0a0b" },
    },
  },
  images: ["public/logo.svg"],
});
