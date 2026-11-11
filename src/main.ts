import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/floor.css";

import { HEADLINES, TABS, type Headline } from "./content";
import { makeParticles, type ParticleField } from "./particles";
import { mountFloor } from "./floor";
import { initContact } from "./lib/contact";

const root = document.documentElement;
root.classList.add("js");

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ============ Headline sync ============
   index.html carries a static copy of every headline value for first paint
   and no-JS visitors. content.ts is the source of truth: report any drift,
   then write the content.ts value. */
const byId = new Map(HEADLINES.map((h) => [h.id as string, h]));
const syncFields: [attr: string, pick: (h: Headline) => string | null][] = [
  ["data-num", (h) => h.number],
  ["data-label", (h) => h.label],
  ["data-tab-label", (h) => h.tabLabel],
];
for (const [attr, pick] of syncFields) {
  document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
    const id = el.getAttribute(attr) ?? "";
    const h = byId.get(id);
    const want = h ? pick(h) : null;
    if (want === null) {
      console.error(`content drift: ${attr}="${id}" has no value in content.ts`);
      return;
    }
    const have = (el.textContent ?? "").trim();
    if (have !== want) {
      console.error(`content drift: ${attr}="${id}" shows "${have}", content.ts has "${want}"`);
      el.textContent = want;
    }
  });
}

/* ============ Number tabs ============ */
const tabs = [...document.querySelectorAll<HTMLButtonElement>("#numbers button[data-tab]")];
const big = document.getElementById("numbers-big");
const how = document.getElementById("numbers-how");
let cur = 0;
let particles: ParticleField | null = null;

function writeHow(h: Headline): void {
  if (!how) return;
  const lead = document.createElement("b");
  lead.textContent = h.howLead;
  how.replaceChildren(lead, document.createTextNode(` ${h.how}`));
}

tabs.forEach((button) => {
  button.addEventListener("click", () => {
    const i = TABS.findIndex((h) => h.id === button.dataset.tab);
    if (i < 0 || i === cur) return;
    cur = i;
    tabs.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
    const h = TABS[i];
    if (big) big.textContent = h.number;
    particles?.show(i);
    how?.classList.add("swap");
    setTimeout(() => {
      // Only the latest click writes, so fast clicking cannot show a stale panel.
      if (cur !== i) return;
      writeHow(h);
      how?.classList.remove("swap");
    }, reduce ? 0 : 180);
  });
});

/* ============ Particle number field ============ */
const pcanvas = document.getElementById("numbers-canvas") as HTMLCanvasElement | null;
const stage = document.querySelector<HTMLElement>("#numbers .stage");
let booted = false;
let stageVisible = false;
let raf = 0;

function frame(now: number): void {
  raf = 0;
  if (!particles || !stageVisible || document.hidden) return;
  particles.step(now);
  raf = requestAnimationFrame(frame);
}

/** Run the rAF loop only while the stage is on screen and the tab is visible. */
function syncLoop(): void {
  const shouldRun = particles !== null && stageVisible && !document.hidden;
  if (shouldRun && !raf) raf = requestAnimationFrame(frame);
  else if (!shouldRun && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

function boot(): void {
  if (booted || !pcanvas) return;
  booted = true;
  particles = makeParticles(pcanvas, TABS.map((h) => h.number), { reduce, start: cur, fit: 0.8 });
  if (!particles) return;
  root.classList.add("has-gl");
  particles.show(cur);
  syncLoop();
}

if (pcanvas) {
  if (document.fonts?.load) {
    document.fonts.load("700 100px Manrope").then(boot, boot);
    setTimeout(boot, 1800);
  } else {
    boot();
  }
  window.addEventListener("resize", () => particles?.resize());
}

if (stage && "IntersectionObserver" in window) {
  new IntersectionObserver((entries) => {
    for (const entry of entries) stageVisible = entry.isIntersecting;
    syncLoop();
  }).observe(stage);
} else {
  stageVisible = true;
}
document.addEventListener("visibilitychange", syncLoop);

/* ============ Floor, contact, year ============ */
mountFloor();
initContact();

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());
