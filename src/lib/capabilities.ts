/** Capability gate for the WebGL hero. Anything short of a confident "yes"
 *  gets the static fallback — no blank hero, ever. */

export interface Capabilities {
  webglHero: boolean;
  motionOk: boolean;
}

declare global {
  interface Navigator {
    deviceMemory?: number;
  }
}

export function detectCapabilities(): Capabilities {
  const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

  if (new URLSearchParams(location.search).has("force-fallback")) {
    return { webglHero: false, motionOk };
  }
  if (!motionOk) return { webglHero: false, motionOk };
  if ((navigator.deviceMemory ?? 4) <= 2) return { webglHero: false, motionOk };
  if ((navigator.hardwareConcurrency ?? 4) <= 2) return { webglHero: false, motionOk };

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return { webglHero: false, motionOk };
  } catch {
    return { webglHero: false, motionOk };
  }

  return { webglHero: true, motionOk };
}
