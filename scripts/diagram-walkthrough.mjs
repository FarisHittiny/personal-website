// Keyboard-driven walkthrough of the data-path diagram: enters step mode,
// arrows through all 6 steps, screenshots each, then benchmark mode with
// every size. Fails on any console error.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const url = process.argv[2] ?? "http://localhost:4173/";
const outDir = process.argv[3] ?? "verify-out/diagram";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(url, { waitUntil: "networkidle" });
const dp = page.locator("#datapath");
await dp.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);

// Hover a stage → panel updates
await page.locator("#stg-bridge").hover();
await page.waitForTimeout(300);
const hoverText = await page.locator("#dp-panel-title").textContent();
console.log("hover panel:", hoverText);
await dp.screenshot({ path: path.join(outDir, "hover-bridge.png") });

// Step mode via keyboard only: tab to the button and press Enter
await page.locator("#dp-mode-step").focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
for (let i = 0; i < 6; i++) {
  const title = await page.locator("#dp-panel-title").textContent();
  const status = await page
    .locator('.dp-regrow[data-reg="STATUS"] .dp-reg-value')
    .textContent();
  console.log(`step ${i + 1}: ${title}  |  STATUS=${status}`);
  await dp.screenshot({ path: path.join(outDir, `step-${i + 1}.png`) });
  if (i < 5) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1100);
  }
}
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Benchmark mode, all sizes
await page.locator("#dp-mode-bench").click();
await page.waitForTimeout(1200);
for (const label of ["64 B", "1 KB", "4 KB"]) {
  await page.locator(".dp-size", { hasText: label }).click();
  await page.waitForTimeout(1100);
  const speedup = await page.locator("#dp-speedup").textContent();
  console.log(`bench ${label}: ${speedup}`);
}
await dp.screenshot({ path: path.join(outDir, "benchmark.png") });

await browser.close();
if (errors.length) {
  console.error("CONSOLE ERRORS:", errors);
  process.exit(1);
}
console.log("diagram walkthrough OK");
