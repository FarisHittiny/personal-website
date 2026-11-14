/** The floor's far horizon (Faris, Nov 2026: "I don't like too empty of a
 *  void"): a ridge of hills and, in front of it, a distant skyline with a few
 *  lit windows, ringing the stage past where the fog swallows the ground.
 *
 *  The camera looks down at the stage, so its top edge sits a few degrees
 *  below eye level: anything farther out than ~50 units and taller than ~7
 *  is off screen. So the skyline and ridge are close-ish (radius 57-64) and low,
 *  and read as distant only through colour: dim, blue, unlit, unfogged
 *  (fog would erase them), with a faint dusk rim along each crest. */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
} from "three";

/** Small seeded PRNG so the horizon looks the same on every visit. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A closed ring of hills: crest height from a few summed sines, coloured
 *  from `base` at the foot to `rim` at the crest. */
function ridge(radius: number, lo: number, hi: number, base: number, rim: number, seed: number): Mesh {
  const r = rng(seed);
  const waves = Array.from({ length: 5 }, (_, i) => ({ f: 2 + i * 2 + Math.floor(r() * 4), p: r() * Math.PI * 2, a: 1 / (i + 1.4) }));
  const total = waves.reduce((s, w) => s + w.a, 0);
  const N = 360;
  const pos: number[] = [], col: number[] = [];
  const cBase = new Color(base), cRim = new Color(rim), c = new Color();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    let n = 0;
    for (const w of waves) n += Math.sin(a * w.f + w.p) * w.a;
    const h = lo + (hi - lo) * (0.5 + 0.5 * n / total);
    const x = Math.sin(a) * radius, z = -Math.cos(a) * radius;
    pos.push(x, -2, z, x, h, z);
    col.push(cBase.r, cBase.g, cBase.b);
    c.copy(cBase).lerp(cRim, 0.85);
    col.push(c.r, c.g, c.b);
  }
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, d = a + 2, e = a + 3;
    idx.push(a, d, b, b, d, e);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return new Mesh(g, new MeshBasicMaterial({ vertexColors: true, fog: false, side: DoubleSide }));
}

/** A distant skyline in an arc behind the pads, with scattered lit windows. */
function skyline(radius: number, seed: number): Group {
  const r = rng(seed);
  const pos: number[] = [], col: number[] = [], idx: number[] = [], win: number[] = [];
  const foot = new Color(0x0b0d14), top = new Color(0x161c33);
  const ARC = 1.1;                                   // radians either side of straight back
  let a = -ARC;
  while (a < ARC) {
    const w = 1.2 + r() * 2.2;                       // width in world units
    const h = 2.5 + r() * r() * 7;                   // mostly low, a few towers
    const da = w / radius;
    const a0 = a, a1 = a + da;
    const p = (ang: number, y: number): void => {
      pos.push(Math.sin(ang) * radius, y, -Math.cos(ang) * radius);
    };
    const v = pos.length / 3;
    p(a0, -2); p(a1, -2); p(a0, h); p(a1, h);
    col.push(foot.r, foot.g, foot.b, foot.r, foot.g, foot.b, top.r, top.g, top.b, top.r, top.g, top.b);
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    // a few windows on its face, slightly in front of it
    const rows = Math.floor(h / 0.9), cols = Math.max(1, Math.floor(w / 0.7));
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (r() > 0.16) continue;
      const wa = a0 + ((x + 0.5) / cols) * da;
      const wy = 0.6 + y * 0.9;
      win.push(Math.sin(wa) * (radius - 0.2), wy, -Math.cos(wa) * (radius - 0.2));
    }
    a = a1 + (r() < 0.25 ? r() * 0.06 : 0.004);     // the odd gap between blocks
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const blocks = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, fog: false, side: DoubleSide }));
  const wg = new BufferGeometry();
  wg.setAttribute("position", new Float32BufferAttribute(win, 3));
  const windows = new Points(wg, new PointsMaterial({ color: 0xffd9a0, size: 0.3, transparent: true, opacity: 0.45, fog: false }));
  const out = new Group();
  out.add(blocks, windows);
  return out;
}

export function buildHorizon(): Group {
  const g = new Group();
  // The ridge shows above the skyline on tall (phone) screens.
  g.add(ridge(64, 2.5, 8, 0x0b0d14, 0x18203d, 7));
  g.add(skyline(57, 21));
  g.renderOrder = -1;
  return g;
}
