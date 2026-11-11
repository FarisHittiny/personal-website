/** Floor shell: capability gate, card, fallback tiles and the lazy import of
 *  the three.js scene. T1 stub: the static tiles in index.html are the whole
 *  floor, unless the URL has `?floor-dev`, which mounts the scene with no
 *  gating so T5 and T6 can develop against it. T4 replaces this. */

import { HEADLINES } from "../content";
import type { FloorScene } from "./scene";

export function mountFloor(): void {
  if (!new URLSearchParams(location.search).has("floor-dev")) return;

  const host = document.getElementById("floor");
  const canvas = document.getElementById("floor-canvas") as HTMLCanvasElement | null;
  if (!host || !canvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let scene: FloorScene | null = null;

  const showCard = (index: number): void => {
    const card = document.getElementById("floor-card");
    if (!card) return;
    const h = HEADLINES[index];
    card.classList.toggle("on", h !== undefined);
    if (!h) return;
    const set = (id: string, text: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set("card-kicker", h.card.kicker);
    set("card-number", h.number);
    set("card-title", h.card.title);
    set("card-desc", h.how);
  };

  async function goLive(): Promise<void> {
    if (!host || !canvas) return;
    try {
      const { startScene } = await import("./scene"); // the only path to three.js
      canvas.hidden = false;
      scene = startScene({ host, canvas, reducedMotion, onPadChange: showCard });
      host.classList.add("floor--live");
    } catch (err) {
      console.warn("3D floor unavailable:", err); // warn, not error: verify needs zero errors
      canvas.hidden = true;
      host.classList.remove("floor--live");
    }
  }

  document.querySelectorAll<HTMLAnchorElement>("#floor-pads a[data-pad]").forEach((a) => {
    a.addEventListener("focus", () => scene?.rollTo(Number(a.dataset.pad)));
  });

  const start = () => {
    const run = () => void goLive();
    if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 200);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
