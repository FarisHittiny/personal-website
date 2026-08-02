// Generates datasheet-styled placeholder images for every photo slot the
// site uses. Real photos later go into assets-src/ with the same base names
// and `npm run images` overwrites these — markup never changes.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "public", "img");
await mkdir(outDir, { recursive: true });

const SLOTS = [
  { name: "portrait", w: 960, h: 1200, label: "PORTRAIT", fig: "FIG 1.1" },
  { name: "eartag", w: 960, h: 720, label: "RESEARCH EXPO", fig: "FIG 3.1" },
];

function placeholderSvg({ w, h, label, fig }) {
  const grid = [];
  for (let x = 0; x <= w; x += 80) {
    grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#1b1b21" stroke-width="1"/>`);
  }
  for (let y = 0; y <= h; y += 80) {
    grid.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#1b1b21" stroke-width="1"/>`);
  }
  const cx = w / 2;
  const cy = h / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#121216"/>
  ${grid.join("")}
  <rect x="24" y="24" width="${w - 48}" height="${h - 48}" fill="none" stroke="#26262e" stroke-width="2"/>
  <line x1="24" y1="24" x2="${w - 24}" y2="${h - 24}" stroke="#26262e" stroke-width="1"/>
  <line x1="${w - 24}" y1="24" x2="24" y2="${h - 24}" stroke="#26262e" stroke-width="1"/>
  <rect x="${cx - 150}" y="${cy - 46}" width="300" height="92" fill="#0a0a0c" stroke="#7a6420" stroke-width="1"/>
  <text x="${cx}" y="${cy - 8}" font-family="monospace" font-size="26" letter-spacing="4" fill="#c9a227" text-anchor="middle">${label}</text>
  <text x="${cx}" y="${cy + 26}" font-family="monospace" font-size="16" letter-spacing="3" fill="#8b8b88" text-anchor="middle">${fig} — IMAGE PENDING</text>
</svg>`);
}

for (const slot of SLOTS) {
  const svg = placeholderSvg(slot);
  const base = sharp(svg);
  await base.clone().jpeg({ quality: 80 }).toFile(path.join(outDir, `${slot.name}-960.jpg`));
  await base.clone().webp({ quality: 75 }).toFile(path.join(outDir, `${slot.name}-960.webp`));
  await base.clone().avif({ quality: 50 }).toFile(path.join(outDir, `${slot.name}-960.avif`));
  console.log(`placeholder: ${slot.name} (${slot.w}x${slot.h})`);
}
