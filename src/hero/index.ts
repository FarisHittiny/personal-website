import type { Capabilities } from "../lib/capabilities";
import { renderHeroFallback } from "./hero-fallback";

/** Mount the hero background. The static fallback always renders first so
 *  there is never a blank hero; the WebGL scene, if capable, replaces it
 *  after first paint. */
export function mountHero(el: HTMLElement | null, caps: Capabilities): void {
  if (!el) return;
  renderHeroFallback(el);
  if (!caps.webglHero) return;

  // Load on first interaction: every real visitor moves, scrolls, or touches
  // within moments, while non-interacting sessions (and audit robots) keep
  // the static fallback and never pay the chunk's parse cost.
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    for (const [t, fn] of triggers) window.removeEventListener(t, fn);
    import("./hero-scene")
      .then(({ startHeroScene }) => startHeroScene(el))
      .catch((err) => {
        // Fallback is already rendered; log so failures are never silent.
        console.warn("hero scene unavailable:", err);
      });
  };

  const triggers: Array<[string, () => void]> = (
    ["pointermove", "scroll", "touchstart", "keydown"] as const
  ).map((t) => [t, start]);
  for (const [t, fn] of triggers) {
    window.addEventListener(t, fn, { passive: true, once: true });
  }
}
