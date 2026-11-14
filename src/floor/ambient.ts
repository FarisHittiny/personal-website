/** Fireflies over the floor (Faris, Nov 2026): a couple dozen warm specks
 *  drifting and blinking low over the ground. String lights and a stone wall
 *  were tried and cut as too busy. Seeded; they ignore fog so the far ones
 *  still glow. */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
} from "three";

function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A soft round glow, white in the middle, for additive point sprites. */
function glowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export interface Fireflies { object: Points; update(t: number): void }

export function buildFireflies(count = 46): Fireflies {
  const r = rng(4242);
  const home: { x: number; y: number; z: number; f: number; p: number; b: number }[] = [];
  for (let i = 0; i < count; i++) {
    home.push({
      x: -17 + r() * 34, y: 0.4 + r() * 2.4, z: -19 + r() * 20,
      f: 0.15 + r() * 0.25, p: r() * Math.PI * 2, b: 0.4 + r() * 0.9,
    });
  }
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  const warm = new Color(0xffd27a);
  const mat = new PointsMaterial({
    size: 0.6, map: glowTexture(), vertexColors: true, transparent: true,
    depthWrite: false, blending: AdditiveBlending, fog: false,
  });
  const object = new Points(g, mat);
  object.frustumCulled = false;
  const update = (t: number): void => {
    const P = g.attributes.position!, C = g.attributes.color!;
    home.forEach((h, i) => {
      const w = t * h.f + h.p;
      P.setXYZ(i, h.x + Math.sin(w) * 1.2 + Math.sin(w * 2.3) * 0.3,
        h.y + Math.sin(w * 1.7) * 0.35, h.z + Math.cos(w * 0.8) * 1.2);
      // slow blink: mostly lit, fading out now and then
      const k = Math.max(0, Math.sin(t * h.b + h.p * 3)) ** 0.6 * 0.9 + 0.1;
      C.setXYZ(i, warm.r * k, warm.g * k, warm.b * k);
    });
    P.needsUpdate = true;
    C.needsUpdate = true;
  };
  update(0);
  return { object, update };
}
