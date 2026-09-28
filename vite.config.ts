import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Served from the domain root on Cloudflare Pages, so base is "/".
export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    assetsInlineLimit: 2048,
    // Multi-page: /catalog-rag/ is a second entry with its own script.
    rollupOptions: {
      input: { main: page("index.html"), catalogRag: page("catalog-rag/index.html") },
    },
  },
});
