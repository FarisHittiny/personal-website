// Generates public/og-image.png, the 1200x630 social card, in the site's look.
//   node scripts/make-og.mjs
// Rendered with Playwright rather than sharp because sharp's SVG text cannot
// use Manrope. The font is inlined as a data URL so the page needs no server.
// Colours mirror src/styles/tokens.css; numbers mirror src/content.ts.
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const font = await readFile(path.join(root, "public", "fonts", "manrope-latin-wght-normal.woff2"));
const out = path.join(root, "public", "og-image.png");

const NUMBERS = [
  ["99.8%", "Aramco invoice extraction accuracy"],
  ["0.90", "Catalog RAG recall@5, from 0.61"],
  ["89.6%", "Ear-tag detection mAP@0.5"],
];

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: "Manrope";
    src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2-variations");
    font-weight: 200 800;
  }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: #0B0C10;
    color: #F2F3F5;
    font-family: "Manrope", sans-serif;
    -webkit-font-smoothing: antialiased;
    position: relative;
    overflow: hidden;
  }
  .glow {
    position: absolute; inset: 0;
    background: radial-gradient(760px circle at 86% 8%, rgba(108,140,255,0.16), transparent 70%);
  }
  .card {
    position: absolute; inset: 0;
    padding: 76px 88px 72px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .label {
    font-size: 19px; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: #9AA1AE;
  }
  h1 {
    margin-top: 18px;
    font-size: 96px; font-weight: 700; letter-spacing: -0.055em; line-height: 1;
  }
  .pitch {
    margin-top: 22px;
    font-size: 30px; font-weight: 500; letter-spacing: -0.015em; color: #C8CCD4;
  }
  .nums {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px;
    border-top: 1px solid #272B35; padding-top: 28px;
  }
  .nums b {
    display: block;
    font-size: 64px; font-weight: 700; letter-spacing: -0.05em; line-height: 1;
    color: #6C8CFF; font-variant-numeric: tabular-nums;
  }
  .nums span { display: block; margin-top: 10px; font-size: 19px; color: #9AA1AE; }
</style></head>
<body>
  <div class="glow"></div>
  <div class="card">
    <div>
      <div class="label">AI/ML Engineer</div>
      <h1>Faris Hittiny</h1>
      <p class="pitch">I build AI systems, then measure whether they work.</p>
    </div>
    <div class="nums">
      ${NUMBERS.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("")}
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  const loaded = await page.evaluate(async () => {
    const faces = await document.fonts.load('700 96px "Manrope"');
    await document.fonts.ready;
    return faces.length > 0 && faces.every((f) => f.status === "loaded");
  });
  if (!loaded) throw new Error("Manrope did not load; refusing to write a fallback-font card");
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log("wrote og-image.png (1200x630)");
} finally {
  await browser.close();
}
