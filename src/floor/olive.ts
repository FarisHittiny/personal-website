/** An old olive tree at the back-left of the stage (Faris, Nov 2026: "I like
 *  the idea but it looks very poor" -> rebuilt, stylized). Procedural, no asset:
 *  - a squat trunk of three stems twisting round each other from a flared base,
 *    with smooth low-frequency gnarl rather than per-vertex jitter;
 *  - limbs that fork twice into thin twigs;
 *  - a canopy of a few smooth lumpy masses (no individual leaves).
 *  Seeded, so it is the same on every visit. */
import {
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export function buildOlive(): Group {
  let s = 20261114;
  const rnd = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  const rr = (a: number, b: number): number => a + (b - a) * rnd();
  const tree = new Group();

  /* ---- wood ---- */
  const bark = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const barkA = new Color(0x5a5046), barkB = new Color(0x3a332c), bc = new Color();
  const tips: { p: Vector3; d: Vector3 }[] = [];

  /** A tapered tube along `pts`, its surface gently gnarled by a few sines. */
  const wood = (pts: Vector3[], r0: number, r1: number, seg = 20, rad = 10): CatmullRomCurve3 => {
    const curve = new CatmullRomCurve3(pts);
    const g = new TubeGeometry(curve, seg, 1, rad, false);
    const pos = g.attributes.position!;
    const col: number[] = [];
    const ph = rr(0, 6.28), v = new Vector3();
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const c = curve.getPointAt(u);
      const r = r0 + (r1 - r0) * Math.pow(u, 0.8);
      for (let j = 0; j <= rad; j++) {
        const k = i * (rad + 1) + j;
        const a = (j / rad) * Math.PI * 2;
        const gn = 1 + 0.16 * Math.sin(a * 3 + u * 9 + ph) + 0.08 * Math.sin(a * 5 - u * 14 + ph * 2);
        v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r * gn).add(c);
        pos.setXYZ(k, v.x, v.y, v.z);
        bc.copy(barkA).lerp(barkB, 0.5 + 0.5 * Math.sin(a * 4 + u * 20 + ph));
        col.push(bc.r, bc.g, bc.b);
      }
    }
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    tree.add(new Mesh(g, bark));
    return curve;
  };

  /** A limb from `p` heading `d`, forking `depth` more times; tips collected. */
  const branch = (p: Vector3, d: Vector3, len: number, r: number, depth: number): void => {
    const pts = [p.clone()];
    const dir = d.clone().normalize();
    const q = p.clone();
    for (let i = 0; i < 3; i++) {
      dir.add(new Vector3(rr(-0.35, 0.35), rr(-0.1, 0.25), rr(-0.35, 0.35))).normalize();
      q.addScaledVector(dir, len / 3);
      pts.push(q.clone());
    }
    const rEnd = depth === 0 ? 0.015 : r * 0.55;
    const c = wood(pts, r, rEnd, depth === 0 ? 8 : 14, depth === 0 ? 5 : 8);
    if (depth === 0) {
      tips.push({ p: q.clone(), d: dir.clone() });
      return;
    }
    const kids = depth === 2 ? 3 : 2 + (rnd() < 0.5 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const at = c.getPointAt(rr(0.55, 1));
      const sp = new Vector3(rr(-1, 1), rr(0.1, 0.7), rr(-1, 1)).normalize();
      branch(at, dir.clone().multiplyScalar(0.6).add(sp), len * rr(0.55, 0.75), rEnd * 0.9, depth - 1);
    }
  };

  // trunk: three stems twisting round a common axis, flared at the foot
  const crown: Vector3[] = [];
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const a = a0 + t * 1.6;
      const rad = 0.32 * (1 - t) + 0.12 + (i === 5 ? 0.25 : 0);
      pts.push(new Vector3(Math.cos(a) * rad + t * 0.2, -0.15 + t * 1.55, Math.sin(a) * rad));
    }
    wood(pts, 0.27, 0.16, 18, 10);
    crown.push(pts[5]!);
  }
  // main limbs out of the crown: wide and low, the olive's umbrella shape
  const LIMBS = 6;
  for (let k = 0; k < LIMBS; k++) {
    const a = (k / LIMBS) * Math.PI * 2 + rr(-0.3, 0.3);
    const from = crown[k % 3]!.clone();
    const d = new Vector3(Math.cos(a), rr(0.55, 0.9), Math.sin(a));
    branch(from, d, rr(1.3, 1.7), 0.13, 2);
  }

  /* ---- foliage ----
   * No individual leaves (Faris: "the leaves look horrible"): a few smooth,
   * lumpy canopy masses, silver-green on top shading to dark olive beneath,
   * one per twig tip plus two broad ones to tie the crown together. */
  const crownMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const under = new Color(0x2f3826), mid = new Color(0x56633f), silver = new Color(0x8a9679), fc = new Color();
  const blob = (c: Vector3, sx: number, sy: number, sz: number): void => {
    const base = new SphereGeometry(1, 28, 18);
    base.deleteAttribute("uv");
    base.deleteAttribute("normal");
    const g = mergeVertices(base);
    const pos = g.attributes.position!;
    const p1 = rr(0, 6.28), p2 = rr(0, 6.28), v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const lump = 1 + 0.13 * Math.sin(v.x * 3.1 + p1) * Math.sin(v.y * 2.7 + p2) * Math.sin(v.z * 3.3 + p1)
                     + 0.07 * Math.sin(v.x * 6 + v.z * 5 + p2);
      v.multiplyScalar(lump);
      v.y = v.y < 0 ? v.y * 0.6 : v.y;               // flatter underside
      pos.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal!, col: number[] = [];
    for (let i = 0; i < nrm.count; i++) {
      const ny = nrm.getY(i);
      if (ny > 0) fc.copy(mid).lerp(silver, Math.pow(ny, 1.5) * 0.85);
      else fc.copy(mid).lerp(under, Math.min(1, -ny * 1.4));
      col.push(fc.r, fc.g, fc.b);
    }
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    const m = new Mesh(g, crownMat);
    m.position.copy(c);
    m.rotation.y = rr(0, 6.28);
    tree.add(m);
  };
  for (const tp of tips) {
    const w = rr(0.55, 0.75);
    blob(tp.p.clone().add(new Vector3(0, 0.08, 0)), w, rr(0.42, 0.55), w * rr(0.85, 1.1));
  }
  // two broad masses over the crown so the canopy reads as one umbrella
  const cx = tips.reduce((a, t) => a.add(t.p), new Vector3()).multiplyScalar(1 / tips.length);
  blob(cx.clone().add(new Vector3(0.4, -0.05, 0.2)), 1.3, 0.6, 1.1);
  blob(cx.clone().add(new Vector3(-0.5, 0.05, -0.3)), 1.2, 0.55, 1.2);

  const soil = new Mesh(new CircleGeometry(1.5, 28), new MeshLambertMaterial({ color: 0x17140f }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.02;
  tree.add(soil);
  return tree;
}
