import { defineConfig } from "vite";

// Served from https://people.tamu.edu/~farishittiny/ (a subdirectory, not
// domain root) — base must stay './' so every asset URL is relative.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 2048,
  },
});
