// Generates the 1200x630 social-card image in the site's visual language.
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function latticeLines(seedFn, w, h, n, maxD) {
  const pts = Array.from({ length: n }, () => [seedFn() * w, seedFn() * h]);
  let out = "";
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pts[i][0] - pts[j][0];
      const dy = pts[i][1] - pts[j][1];
      if (dx * dx + dy * dy < maxD * maxD) {
        out += `<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${pts[j][0]}" y2="${pts[j][1]}" stroke="#d6d0bf" stroke-opacity="0.55"/>`;
      }
    }
  }
  for (const [x, y] of pts) {
    const gold = seedFn() < 0.2;
    out += `<circle cx="${x}" cy="${y}" r="${gold ? 3 : 1.8}" fill="${gold ? "#16386f" : "#b5ae99"}"/>`;
  }
  return out;
}

let a = 0xfa215;
const rand = () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#f2eee3"/>
  ${latticeLines(rand, 1200, 630, 70, 170)}
  <rect x="0" y="0" width="1200" height="630" fill="url(#f)"/>
  <defs><radialGradient id="f" cx="30%" cy="45%" r="80%">
    <stop offset="0%" stop-color="#f2eee3" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="#f2eee3" stop-opacity="0.93"/>
  </radialGradient></defs>
  <text x="90" y="255" font-family="Georgia, serif" font-size="30" letter-spacing="6" fill="#5d6a8a">FH-2027 · PRELIMINARY DATASHEET · REV 2.1</text>
  <text x="84" y="360" font-family="Georgia, serif" font-size="92" font-weight="600" fill="#1a2338">Faris Hittiny</text>
  <rect x="90" y="392" width="520" height="4" fill="#16386f"/>
  <text x="90" y="460" font-family="Georgia, serif" font-size="34" fill="#3e4a68">Computer systems, from RTL to production AI.</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(root, "public", "og-image.png"));
console.log("og-image.png written");
