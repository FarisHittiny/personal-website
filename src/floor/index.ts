/** Floor shell: capability gate, card, fallback tiles and the lazy import of
 *  the three.js scene.
 *
 *  The static tiles in index.html (`#floor-pads`) are the default floor: the
 *  no-JS copy, the fallback, and the keyboard and screen-reader list. This
 *  module upgrades to the 3D floor only when the device can run it:
 *
 *  | `?force-fallback`, low-end, no WebGL2  | tiles only                      |
 *  | reduced motion, otherwise capable      | tiles + "Turn on the 3D floor"  |
 *  | otherwise                              | goLive() once the page is idle  |
 *
 *  `./scene` is the only path to three.js and is imported dynamically, so
 *  three stays out of the main bundle. Only `import type` from it here. */

import { HEADLINES } from "../content";
import { detectCapabilities } from "../lib/capabilities";
import { flash } from "../lib/flash";
import type { FloorScene } from "./scene";

export function mountFloor(): void {
  const host = document.getElementById("floor");
  const canvas = document.getElementById("floor-canvas") as HTMLCanvasElement | null;
  if (!host || !canvas) return;

  const card = document.getElementById("floor-card");
  const hint = document.getElementById("floor-hint");
  const enable = document.getElementById("floor-enable") as HTMLButtonElement | null;
  const more = document.getElementById("card-more") as HTMLAnchorElement | null;
  const pads = [...host.querySelectorAll<HTMLAnchorElement>("#floor-pads a[data-pad]")];

  const caps = detectCapabilities();
  let scene: FloorScene | null = null;
  let live = false;
  let shown = -1;
  let fillToken = 0;

  /* ============ Card (port of the prototype's show(i)) ============ */

  const setText = (id: string, text: string): void => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  function fillCard(i: number): void {
    const h = HEADLINES[i];
    setText("card-kicker", h.card.kicker);
    setText("card-number", h.number);
    setText("card-title", h.card.title);
    setText("card-desc", h.how);
    more?.setAttribute("href", `#${h.target}`);

    const links = document.getElementById("card-links");
    if (links) {
      links.replaceChildren(
        ...h.card.links.map((l) => {
          const a = document.createElement("a");
          a.href = l.href;
          a.textContent = l.label;
          if (l.external) {
            a.target = "_blank";
            a.rel = "noopener";
          }
          return a;
        }),
      );
    }
  }

  /** Open the card on pad `i`, or close it with -1. Wired to the scene's onPadChange. */
  function showCard(i: number): void {
    if (i === shown || !card) return;
    const h = HEADLINES[i];
    if (!h) {
      shown = -1;
      fillToken++;
      card.classList.remove("on");
      return;
    }
    const wasOpen = shown >= 0;
    shown = i;
    hint?.classList.add("off");
    card.classList.add("on");
    if (wasOpen) {
      fillCard(i);
    } else {
      // The live region was visibility:hidden a moment ago. Fill it one frame
      // after it becomes visible so screen readers announce the new text.
      const token = ++fillToken;
      requestAnimationFrame(() => {
        if (token === fillToken) fillCard(i);
      });
    }
  }

  more?.addEventListener("click", () => {
    const h = HEADLINES[shown];
    if (h) flash(h.flash);
  });

  /* ============ Pad links: tiles, keyboard list ============ */

  pads.forEach((a) => {
    const i = Number(a.dataset.pad);
    const h = HEADLINES[i];
    if (!h) return;
    a.addEventListener("click", () => flash(h.flash));
    // While the floor is live, focusing a pad link rolls the ball there; the
    // scene opens the card through onPadChange when it arrives.
    a.addEventListener("focus", () => {
      if (live) scene?.rollTo(i);
    });
  });

  /* ============ Going live ============ */

  async function goLive(): Promise<void> {
    if (scene || !host || !canvas) return;
    try {
      const { startScene } = await import("./scene"); // the only path to three.js
      canvas.hidden = false;
      scene = startScene({ host, canvas, reducedMotion: !caps.motionOk, onPadChange: showCard });
      live = true;
      host.classList.add("floor--live");
      if (hint && shown < 0) hint.hidden = false;
    } catch (err) {
      console.warn("3D floor unavailable:", err); // warn, not error: verify needs zero errors
      scene = null;
      live = false;
      canvas.hidden = true;
      host.classList.remove("floor--live");
    }
  }

  if (!caps.floor3d) return; // tiles only

  if (!caps.motionOk) {
    // Reduced motion: keep the tiles, and let the visitor opt in.
    if (!enable) return;
    enable.hidden = false;
    enable.addEventListener(
      "click",
      () => {
        // The button is about to disappear; park focus on the floor so the
        // next Tab continues from here instead of the top of the page.
        host.tabIndex = -1;
        host.focus({ preventScroll: true });
        enable.hidden = true;
        void goLive();
      },
      { once: true },
    );
    return;
  }

  // Default: go live once the page has loaded and the main thread is idle.
  // Do not wait for interaction: the NPC demos the floor unprompted.
  const start = (): void => {
    const run = (): void => void goLive();
    if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 200);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
