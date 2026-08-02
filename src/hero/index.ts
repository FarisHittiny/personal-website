import type { Capabilities } from "../lib/capabilities";
import { renderHeroFallback } from "./hero-fallback";

/** Mount the hero background. The static fallback always renders first so
 *  there is never a blank hero; the WebGL scene, if capable, replaces it
 *  after first paint. */
export function mountHero(el: HTMLElement | null, caps: Capabilities): void {
  if (!el) return;
  renderHeroFallback(el);
  if (!caps.webglHero) return;

  const start = () => {
    import("./hero-scene")
      .then(({ startHeroScene }) => startHeroScene(el))
      .catch(() => {
        /* fallback already rendered — nothing to do */
      });
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(start, { timeout: 2000 });
  } else {
    setTimeout(start, 300);
  }
}
