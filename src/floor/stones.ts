/** A few lone stones on the floor (Faris, Nov 2026: tried clustered pebbles,
 *  "I don't want clumps of them especially when all [of them] are identical").
 *  So: a handful of single stones, far apart, each its own shape (a jittered
 *  icosahedron), squash and tint, and small.
 *  Seeded, so the layout is the same on every visit. */
import { Color, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from "three";

function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Hand-placed (Faris: "place them better and not as big"): beside the pads
 *  and in the gaps of the arc, none in the foreground or at the frame edges.
 *  [x, z, size] - the pads sit at (+-9, -1.5), (+-6, -7) and (0, -9.5). */
const SPOTS: [number, number, number][] = [
  [-11.2, -4.4, 0.24], [-8.4, -4.9, 0.15], [-3.3, -9.9, 0.21], [2.9, -11.4, 0.15],
  [8.6, -4.2, 0.19], [11.4, -4.6, 0.14], [-3.6, -3.4, 0.13], [4.4, -2.1, 0.17],
];

export function buildStones(): Group {
  const r = rng(31337);
  const out = new Group();
  const placed = SPOTS.map(([x, z, size]) => ({ x, z, size }));
  const base = new Color(0x343947), tint = new Color();
  const v = new Vector3();
  for (const p of placed) {
    const g = new IcosahedronGeometry(1, 1);
    const pos = g.attributes.position!;
    // jitter each corner (same corner, same jitter, so the faces stay closed)
    const jit = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!jit.has(key)) jit.set(key, 0.78 + r() * 0.4);
      v.multiplyScalar(jit.get(key)!);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    tint.copy(base).offsetHSL((r() - 0.5) * 0.04, (r() - 0.5) * 0.06, (r() - 0.5) * 0.08);
    const m = new Mesh(g, new MeshStandardMaterial({ color: tint, roughness: 1, flatShading: true }));
    const size = p.size;
    m.scale.set(size * (0.9 + r() * 0.7), size * (0.35 + r() * 0.3), size * (0.8 + r() * 0.6));
    m.rotation.set((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3);
    m.position.set(p.x, m.scale.y * 0.55, p.z);
    out.add(m);
  }
  return out;
}
