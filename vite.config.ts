import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Served from the domain root on Cloudflare Pages, so base is "/".
export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    assetsInlineLimit: 2048,
    // The floor scene chunk (three.js) is about 501 kB, 128 kB gzip. It is
    // lazy-loaded after the page is idle and never blocks first paint, so the
    // default 500 kB warning is raised just past it.
    chunkSizeWarningLimit: 560,
    // Multi-page: /catalog-rag/ is a second entry with its own script.
    rollupOptions: {
      input: { main: page("index.html"), catalogRag: page("catalog-rag/index.html") },
    },
  },
});
