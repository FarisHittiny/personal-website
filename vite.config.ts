import { defineConfig } from "vite";

// Served from the domain root on Cloudflare Pages, so base is "/".
export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    assetsInlineLimit: 2048,
  },
});
