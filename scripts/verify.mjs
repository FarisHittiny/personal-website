// Visual + console verification loop. Usage:
//   node scripts/verify.mjs <url> <outdir> [--reduced-motion] [--fps]
// Captures full-page + per-section screenshots at desktop (1440x900) and
// mobile (390x844), asserts zero console errors, and optionally probes hero
// FPS for 3 seconds with synthetic mouse movement.
import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const url = process.argv[2] ?? "http://localhost:5173/";
const outDir = process.argv[3] ?? "verify-out";
const reducedMotion = process.argv.includes("--reduced-motion");
const probeFps = process.argv.includes("--fps");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function shoot(name, contextOpts, viewportLabel) {
  const ctx = await browser.newContext({
    ...contextOpts,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[${viewportLabel}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`[${viewportLabel}] pageerror: ${err.message}`));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Scroll through so lazy content loads before the full-page shot.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(outDir, `${name}-full.png`), fullPage: true });

  for (const id of ["hero", "about", "experience", "work", "leadership", "interests", "contact"]) {
    const el = page.locator(`#${id}`);
    if ((await el.count()) === 0) continue;
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await el.screenshot({ path: path.join(outDir, `${name}-${id}.png`) }).catch(() => {});
  }

  if (probeFps && name.startsWith("desktop")) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2500); // let the lazy hero chunk load + start
    const fpsPromise = page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const t0 = performance.now();
          const loop = () => {
            frames++;
            if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
            else resolve((frames / (performance.now() - t0)) * 1000);
          };
          requestAnimationFrame(loop);
        }),
    );
    for (let i = 0; i < 24; i++) {
      await page.mouse.move(200 + Math.sin(i / 3) * 400, 300 + Math.cos(i / 4) * 200, { steps: 4 });
      await page.waitForTimeout(120);
    }
    const fps = await fpsPromise;
    console.log(`FPS (hero, 3s, with mouse): ${fps.toFixed(1)}`);
  }

  await ctx.close();
}

await shoot("desktop", { viewport: { width: 1440, height: 900 } }, "desktop");
await shoot("mobile", { ...devices["iPhone 13"] }, "mobile");

await browser.close();

if (errors.length) {
  console.error(`\nCONSOLE ERRORS (${errors.length}):`);
  errors.forEach((e) => console.error("  " + e));
  process.exit(1);
}
console.log(`\nOK: screenshots in ${outDir}, zero console errors`);
