/** Static hero background: a sparse circuit-lattice rendered as SVG.
 *  Ships in the main bundle; zero runtime cost; visually kin to the live
 *  WebGL scene so the fallback never feels like a downgrade. */

// Deterministic PRNG so the lattice is identical on every load.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderHeroFallback(el: HTMLElement): void {
  const rand = mulberry32(0xfa215);
  const W = 1600;
  const H = 900;
  const N = 46;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    pts.push([rand() * W, rand() * H]);
  }

  let lines = "";
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = pts[i][0] - pts[j][0];
      const dy = pts[i][1] - pts[j][1];
      const d2 = dx * dx + dy * dy;
      if (d2 < 210 * 210) {
        const o = (1 - Math.sqrt(d2) / 210) * 0.35;
        lines += `<line x1="${pts[i][0].toFixed(1)}" y1="${pts[i][1].toFixed(1)}" x2="${pts[j][0].toFixed(1)}" y2="${pts[j][1].toFixed(1)}" stroke="#3a3a44" stroke-opacity="${o.toFixed(2)}"/>`;
      }
    }
  }

  let dots = "";
  for (const [x, y] of pts) {
    const gold = rand() < 0.18;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${gold ? 2.2 : 1.4}" fill="${gold ? "#c9a227" : "#4a4a54"}" fill-opacity="${gold ? 0.8 : 0.6}"/>`;
  }

  el.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<defs><radialGradient id="hero-fade" cx="35%" cy="40%" r="75%">` +
    `<stop offset="0%" stop-color="#0a0a0c" stop-opacity="0"/>` +
    `<stop offset="100%" stop-color="#0a0a0c" stop-opacity="0.92"/>` +
    `</radialGradient></defs>` +
    lines +
    dots +
    `<rect width="${W}" height="${H}" fill="url(#hero-fade)"/>` +
    `</svg>`;
}
