/** Capability gate for the 3D floor. Anything short of a confident "yes"
 *  keeps the static tiles, so the opening screen is never blank.
 *
 *  - `floor3d`: the device can run the floor (WebGL2, not low-end, not forced off).
 *  - `motionOk`: the visitor has not asked for reduced motion.
 *  - `forced`: `?force-fallback` is in the URL (testing switch). */

export interface Capabilities {
  floor3d: boolean;
  motionOk: boolean;
  forced: boolean;
}

declare global {
  interface Navigator {
    deviceMemory?: number;
  }
}

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    // Hand the probe context back so it does not count against the page's limit.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function detectCapabilities(): Capabilities {
  const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const forced = new URLSearchParams(location.search).has("force-fallback");

  const lowEnd =
    (navigator.deviceMemory ?? 4) <= 2 || (navigator.hardwareConcurrency ?? 4) <= 2;

  const floor3d = !forced && !lowEnd && hasWebGL2();
  return { floor3d, motionOk, forced };
}
