// Visual + console verification for the built site. Usage:
//   npm run preview                      (serves dist/ on :4173)
//   node scripts/verify.mjs [url] [outdir] [--reduced-motion] [--fps] [--ipv4] [--only=desktop|mobile]
//
// Runs at 1440x900 and on Playwright's iPhone 13 device, in headless
// Chromium with SwiftShader so the three.js floor really renders. It:
//   - fails on any console error or page error (the content-drift check in
//     main.ts reports through console.error, so drift fails here too);
//   - fails on horizontal overflow (scrollWidth > innerWidth);
//   - checks that every in-page link has a target, and that the tile, pad,
//     card and nav jumps land on (and flash) the right entry;
//   - checks that /resume/Resume.pdf answers 200;
//   - takes the state screenshots: floor on load, the paddle routine, a pad
//     with the card open, the cheer, 30 s idle (the NPC must pass the ball
//     onto a pad and open a card by himself), each record section,
//     ?force-fallback, reduced motion before and after "Turn on the 3D
//     floor", the contact form's failure state, /catalog-rag/ and /404.html.
// Formspree and the catalog-rag API are blocked: nothing is ever submitted.
// --reduced-motion runs every page in a reduced-motion context.
// --fps measures the floor's frame rate for 3 s (at 390 px on mobile, with
// a 4x CPU throttle).
// Exits 1 on any failure.
import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith("--"));
const base = new URL(pos[0] ?? "http://localhost:4173/");
const outDir = pos[1] ?? "verify-out";
const reducedAll = args.includes("--reduced-motion");
const probeFps = args.includes("--fps");
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
await mkdir(outDir, { recursive: true });

const SECTIONS = ["floor", "numbers", "about", "experience", "projects", "wins", "off-the-clock", "contact"];
const BLOCKED = [/formspree\.io/, /\.run\.app\//];

// --ipv4: resolve localhost to 127.0.0.1 (keeps the http://localhost:4173
// origin the catalog API allows, when something else holds [::1]:4173).
const ipv4 = args.includes("--ipv4") ? ["--host-resolver-rules=MAP localhost 127.0.0.1"] : [];
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...ipv4],
});
const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok   ${msg}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A fresh context + page with error capture and the network blocks. */
async function open(label, ctxOpts, urlPath, { reduced = reducedAll } = {}) {
  const ctx = await browser.newContext({ ...ctxOpts, reducedMotion: reduced ? "reduce" : "no-preference" });
  await ctx.route((u) => BLOCKED.some((re) => re.test(u.href)), (route) => route.abort());
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // The aborted Formspree request in the form check logs a load error; that one is expected.
    if (BLOCKED.some((re) => re.test(msg.location()?.url ?? ""))) return;
    fail(`[${label} ${urlPath}] console error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => fail(`[${label} ${urlPath}] pageerror: ${err.message}`));
  const res = await page.goto(new URL(urlPath, base).href, { waitUntil: "load" });
  if (!res || (!res.ok() && !urlPath.includes("404"))) fail(`[${label}] ${urlPath} answered ${res?.status()}`);
  return { ctx, page };
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
}

async function noOverflow(page, label, where) {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  if (sw > iw) fail(`[${label}] horizontal overflow on ${where}: scrollWidth ${sw} > innerWidth ${iw}`);
  else ok(`[${label}] no horizontal overflow on ${where} (${sw} <= ${iw})`);
}

async function waitLive(page, timeout = 20000) {
  await page.waitForSelector("#floor.floor--live", { timeout });
}

/** Where an element sits after a jump. Lands = top near the top of the viewport,
 *  or the page is scrolled to the bottom and the element is on screen. */
async function landed(page, id) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect();
    const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;
    const onTop = r.top >= -4 && r.top <= window.innerHeight * 0.35;
    const visibleAtBottom = atBottom && r.top < window.innerHeight && r.bottom > 0;
    return { exists: true, top: Math.round(r.top), ok: onTop || visibleAtBottom, flash: el.classList.contains("flash") };
  }, id);
}

async function settleScroll(page) {
  // Smooth scrolling: wait until scrollY stops changing.
  // Wait until scrollY has held still for 5 checks (smooth scrolls can start late).
  await page.evaluate(async () => {
    let last = -1;
    let still = 0;
    for (let i = 0; i < 100 && still < 5; i++) {
      await new Promise((r) => setTimeout(r, 80));
      still = window.scrollY === last ? still + 1 : 0;
      last = window.scrollY;
    }
  });
}

async function measureFps(page, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(800);
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const loop = () => {
      frames++;
      if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
      else resolve((frames / (performance.now() - t0)) * 1000);
    };
    requestAnimationFrame(loop);
  }));
  console.log(`  info [${label}] floor FPS over 3 s: ${fps.toFixed(1)} (SwiftShader, not a GPU)`);
}

async function run(label, ctxOpts) {
  console.log(`\n== ${label} ==`);
  const P = (n) => `${label}-${n}`;

  /* ---- 1. Live floor: load, paddle, sections, links ---- */
  {
    const { ctx, page } = await open(label, ctxOpts, "/");
    const live = await waitLive(page).then(() => true, () => false);
    if (!live) {
      fail(`[${label}] #floor never went live (no WebGL2 in this browser?)`);
    } else {
      ok(`[${label}] floor went live`);
      const t0 = Date.now();
      await wait(1000);
      await shot(page, P("floor-load"));
      // The first paddle routine starts about 6.3 s of scene time after load,
      // and runs while he idles. Shoot across that window.
      for (const at of [3000, 5000, 7000, 9000]) {
        await wait(Math.max(0, at - (Date.now() - t0)));
        await shot(page, P(`paddle-${at / 1000}s`));
      }
      await noOverflow(page, label, "/ (live floor)");
    }

    // Every in-page link has a target.
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute("href").slice(1))
        .filter((id) => id && !document.getElementById(id)),
    );
    if (missing.length) fail(`[${label}] in-page links with no target: ${missing.join(", ")}`);
    else ok(`[${label}] every a[href^="#"] has a target`);

    // Section ids exist, and a shot of each.
    for (const id of SECTIONS) {
      const el = page.locator(`#${id}`);
      if ((await el.count()) === 0) { fail(`[${label}] missing section #${id}`); continue; }
      if (id === "floor") continue;
      await el.scrollIntoViewIfNeeded();
      await wait(500);
      await el.screenshot({ path: path.join(outDir, `${P("section")}-${id}.png`) });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(300);
    await noOverflow(page, label, "/ after scrolling");

    // Scroll-spy nav, tabs' targets, and the skip link land on their sections.
    const spy = await page.$$eval(".spy a, .skip-link, .acts a[href^='#']", (as) => as.map((a) => a.getAttribute("href").slice(1)));
    for (const id of spy) {
      await page.evaluate((id) => document.querySelector(`a[href="#${id}"]`)?.click(), id);
      await settleScroll(page);
      const r = await landed(page, id);
      if (!r.ok) fail(`[${label}] link #${id} did not land (top ${r.top})`);
      else ok(`[${label}] link #${id} lands (top ${r.top})`);
    }

    // Résumé PDF.
    // Fetched from the page, so it goes through the same host resolution.
    const pdf = await page.evaluate(async () => {
      const r = await fetch("/resume/Resume.pdf");
      return { status: r.status, type: r.headers.get("content-type"), bytes: (await r.arrayBuffer()).byteLength };
    });
    if (pdf.status !== 200) fail(`[${label}] /resume/Resume.pdf answered ${pdf.status}`);
    else ok(`[${label}] /resume/Resume.pdf 200 (${pdf.type}, ${pdf.bytes} bytes)`);

    if (probeFps && live) {
      if (label === "mobile") {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await measureFps(page, `${label}, 4x CPU throttle`);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      } else {
        await measureFps(page, label);
      }
    }
    await ctx.close();
  }

  /* ---- 2. Pad -> card -> cheer -> Full details ---- */
  {
    const { ctx, page } = await open(label, ctxOpts, "/");
    if (await waitLive(page).then(() => true, () => false)) {
      await wait(600);
      await page.focus('#floor-pads a[data-pad="1"]');
      const opened = await page.waitForSelector("#floor-card.on", { timeout: 15000 }).then(() => true, () => false);
      if (!opened) fail(`[${label}] focusing pad 1 never opened the card`);
      else {
        ok(`[${label}] focusing pad 1 rolled the ball there and opened the card`);
        const t0 = Date.now();
        await wait(350);
        await shot(page, P("pad-card"));
        const title = await page.textContent("#card-title");
        if (!/catalog RAG/i.test(title ?? "")) fail(`[${label}] card title is "${title}", expected the Catalog RAG card`);
        for (const at of [1000, 1800, 2600, 3800, 5000]) {
          await wait(Math.max(0, at - (Date.now() - t0)));
          await shot(page, P(`cheer-${at / 1000}s`));
        }
        // "Full details" jumps to the entry and flashes it.
        await page.click("#card-more");
        await settleScroll(page);
        const r = await landed(page, "x-rag");
        if (!r.ok || !r.flash) fail(`[${label}] card "Full details" -> x-rag: lands ${r.ok} (top ${r.top}, scrollY ${await page.evaluate(() => window.scrollY)}), flash ${r.flash}`);
        else ok(`[${label}] card "Full details" lands on #x-rag and flashes it`);
        await shot(page, P("card-jump-x-rag"));
        // The card closes once the ball leaves the pad (onPadChange(-1)).
        await page.evaluate(() => window.scrollTo(0, 0));
        await settleScroll(page);
        await page.focus('#floor-pads a[data-pad="3"]');
        await page.waitForFunction(() => /RISC-V/.test(document.getElementById("card-title")?.textContent ?? ""), null, { timeout: 15000 })
          .then(() => ok(`[${label}] rolling to pad 3 swapped the card to RISC-V`), () => fail(`[${label}] card never switched to pad 3`));
        // Steer off the pad with the keyboard and watch the card close.
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.down("KeyS");
        const closed = await page.waitForFunction(() => !document.getElementById("floor-card").classList.contains("on"), null, { timeout: 8000 })
          .then(() => true, () => false);
        await page.keyboard.up("KeyS");
        if (!closed) fail(`[${label}] card stayed open after the ball left the pad`);
        else ok(`[${label}] card closed when the ball left the pad`);
      }
    }
    await ctx.close();
  }

  /* ---- 3. Idle 30 s: he passes the ball and a card opens by itself ---- */
  {
    const { ctx, page } = await open(label, ctxOpts, "/");
    if (await waitLive(page).then(() => true, () => false)) {
      const t0 = Date.now();
      let opened = false;
      let openedAt = 0;
      let shot12 = false;
      let shot30 = false;
      while (Date.now() - t0 < 60000) {
        const el = Date.now() - t0;
        if (!shot12 && el >= 12000) { await shot(page, P("idle-12s")); shot12 = true; }
        if (!shot30 && el >= 30000) { await shot(page, P("idle-30s")); shot30 = true; }
        if (!opened && (await page.$("#floor-card.on"))) {
          opened = true;
          openedAt = el;
          await wait(400);
          await shot(page, P("idle-card-opened"));
        }
        if (opened && shot30) break;
        await wait(250);
      }
      if (!opened) fail(`[${label}] left idle, no card opened within 60 s`);
      else if (openedAt > 45000) fail(`[${label}] left idle, the first card opened only after ${(openedAt / 1000).toFixed(1)} s`);
      else ok(`[${label}] left idle, a card opened by itself after ${(openedAt / 1000).toFixed(1)} s`);
    }
    await ctx.close();
  }

  /* ---- 4. ?force-fallback: tiles, and every tile jump ---- */
  {
    const { ctx, page } = await open(label, ctxOpts, "/?force-fallback");
    await wait(2500);
    if (await page.$("#floor.floor--live")) fail(`[${label}] ?force-fallback still went live`);
    if (!(await page.isVisible("#floor-pads a[data-pad='0']"))) fail(`[${label}] fallback tiles not visible`);
    await shot(page, P("fallback"));
    await noOverflow(page, label, "/?force-fallback");
    const tiles = await page.$$eval("#floor-pads a[data-pad]", (as) => as.map((a) => a.getAttribute("href").slice(1)));
    const flashes = ["x-aramco", "x-rag", "x-research", "x-riscv", "w-tidal"];
    for (let i = 0; i < tiles.length; i++) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await wait(150);
      await page.click(`#floor-pads a[data-pad="${i}"]`);
      await settleScroll(page);
      const r = await landed(page, tiles[i]);
      const f = await page.evaluate((id) => document.getElementById(id)?.classList.contains("flash"), flashes[i]);
      if (!r.ok || !f) fail(`[${label}] tile ${i} -> #${tiles[i]}: lands ${r.ok} (top ${r.top}), #${flashes[i]} flash ${f}`);
      else ok(`[${label}] tile ${i} lands on #${tiles[i]} and flashes #${flashes[i]}`);
      if (i === 4) await shot(page, P("tile-jump-wins-flash"));
    }
    await ctx.close();
  }

  /* ---- 5. Reduced motion: tiles + the opt-in button ---- */
  {
    const { ctx, page } = await open(label, ctxOpts, "/", { reduced: true });
    await wait(2000);
    const btn = await page.isVisible("#floor-enable");
    if (!btn) fail(`[${label}] reduced motion: "Turn on the 3D floor" not shown`);
    if (await page.$("#floor.floor--live")) fail(`[${label}] reduced motion went live without asking`);
    await shot(page, P("reduced-before"));
    if (btn) {
      await page.click("#floor-enable");
      const live = await waitLive(page).then(() => true, () => false);
      if (!live) fail(`[${label}] reduced motion: the button did not start the floor`);
      else ok(`[${label}] reduced motion: tiles + button, and the button starts the floor`);
      await wait(1500);
      await shot(page, P("reduced-after"));
    }
    await ctx.close();
  }

  /* ---- 6. Contact form failure state (network blocked; nothing is sent) ---- */
  {
    const { ctx, page } = await open(label, ctxOpts, "/?force-fallback");
    await page.fill("#cf-name", "Verify script");
    await page.fill("#cf-email", "verify@example.com");
    await page.fill("#cf-msg", "Automated check with the network blocked. Not a real message.");
    await page.click('#contact-form button[type="submit"]');
    await page.waitForFunction(() => document.getElementById("form-status")?.classList.contains("is-error"), null, { timeout: 8000 })
      .then(() => ok(`[${label}] contact form shows the failure text with Formspree blocked`),
        () => fail(`[${label}] contact form did not show the failure text`));
    await page.locator("#contact").screenshot({ path: path.join(outDir, `${P("contact-blocked")}.png`) });
    await ctx.close();
  }

  /* ---- 7. Satellite pages ---- */
  for (const [p, name] of [["/catalog-rag/", "catalog-rag"], ["/404.html", "404"]]) {
    const { ctx, page } = await open(label, ctxOpts, p);
    await wait(800);
    await shot(page, P(name));
    await page.screenshot({ path: path.join(outDir, `${P(name)}-full.png`), fullPage: true });
    await noOverflow(page, label, p);
    await ctx.close();
  }
}

if (only !== "mobile") await run("desktop", { viewport: { width: 1440, height: 900 } });
if (only !== "desktop") await run("mobile", { ...devices["iPhone 13"] });

await browser.close();

if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`);
  failures.forEach((f) => console.error("  " + f));
  process.exit(1);
}
console.log(`\nOK: screenshots in ${outDir}, zero console errors, no overflow`);
