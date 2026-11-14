/** Night-time life for the floor (Faris, Nov 2026, after the olive tree):
 *  - fireflies: warm specks drifting and blinking low over the ground;
 *  - string lights: warm bulbs on a sagging wire from the olive tree to two
 *    posts behind the pads, like a backyard at night;
 *  - a low dry-stone wall by the tree (dev mockup only until he approves it).
 *  All seeded so the layout never changes; the bulbs and fireflies ignore fog
 *  so they still glow at the back of the stage. */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
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

/** Warm bulbs on a sagging wire through the given anchor points (tops). */
export function buildStringLights(anchors: Vector3[], posts: Vector3[]): Group {
  const out = new Group();
  const postMat = new MeshStandardMaterial({ color: 0x3a332c, roughness: 1 });
  for (const p of posts) {
    const m = new Mesh(new CylinderGeometry(0.06, 0.08, p.y, 6), postMat);
    m.position.set(p.x, p.y / 2, p.z);
    out.add(m);
  }
  const wireMat = new MeshBasicMaterial({ color: 0x1c1a17 });
  const bulbMat = new MeshBasicMaterial({ color: 0xffd08a, fog: false });
  const bulbGeo = new SphereGeometry(0.07, 8, 6);
  const glow: number[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]!, b = anchors[i + 1]!;
    const span = a.distanceTo(b);
    const sag = span * 0.12;
    const pts: Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const u = k / 16;
      pts.push(new Vector3().lerpVectors(a, b, u).add(new Vector3(0, -sag * 4 * u * (1 - u), 0)));
    }
    const curve = new CatmullRomCurve3(pts);
    out.add(new Mesh(new TubeGeometry(curve, 32, 0.012, 4, false), wireMat));
    const n = Math.round(span / 0.75);
    for (let k = 1; k < n; k++) {
      const p = curve.getPointAt(k / n);
      const bulb = new Mesh(bulbGeo, bulbMat);
      bulb.position.copy(p).add(new Vector3(0, -0.08, 0));
      out.add(bulb);
      glow.push(bulb.position.x, bulb.position.y, bulb.position.z);
    }
  }
  const gg = new BufferGeometry();
  gg.setAttribute("position", new Float32BufferAttribute(glow, 3));
  out.add(new Points(gg, new PointsMaterial({
    color: 0xffb860, size: 0.9, map: glowTexture(), transparent: true, opacity: 0.55,
    depthWrite: false, blending: AdditiveBlending, fog: false,
  })));
  return out;
}

/** A low dry-stone wall: irregular stones stacked in three rough courses
 *  along an arc. Dev mockup only for now. */
export function buildStoneWall(from: Vector3, to: Vector3, bow = 1.2): Group {
  const r = rng(777);
  const out = new Group();
  const geo = new DodecahedronGeometry(1, 0);
  const mats = [0x6b6255, 0x5a5248, 0x7a7062].map((c) => new MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
  const len = from.distanceTo(to);
  const side = new Vector3().subVectors(to, from).normalize();
  const bowDir = new Vector3(side.z, 0, -side.x);
  for (let row = 0; row < 4; row++) {
    let u = (row % 2) * 0.12;
    while (u < len) {
      const w = 0.45 + r() * 0.3;
      const t = u / len;
      const p = new Vector3().lerpVectors(from, to, t).addScaledVector(bowDir, Math.sin(t * Math.PI) * bow);
      const m = new Mesh(geo, mats[Math.floor(r() * 3)]!);
      m.scale.set(w, 0.19 + r() * 0.06, 0.3 + r() * 0.06);
      m.position.set(p.x, 0.16 + row * 0.32, p.z).addScaledVector(bowDir, (r() - 0.5) * 0.06);
      m.rotation.set((r() - 0.5) * 0.3, Math.atan2(-side.z, side.x) + (r() - 0.5) * 0.3, (r() - 0.5) * 0.3);
      out.add(m);
      u += w * 1.7;
    }
  }
  return out;
}
