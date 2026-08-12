// Icon set: public/favicon.svg -> PNG rasters + favicon.ico.
// Run after editing favicon.svg so every icon stays in sync with the source.
//   node scripts/make-icons.mjs
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pub = path.join(root, "public");
const svg = await readFile(path.join(pub, "favicon.svg"));

// density is set high so the 32-unit viewBox rasterizes cleanly at every size
const render = (size) =>
  sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const PNGS = [
  [16, "favicon-16.png"],
  [32, "favicon-32.png"],
  [180, "apple-touch-icon.png"],
];
for (const [size, name] of PNGS) {
  await writeFile(path.join(pub, name), await render(size));
  console.log(`wrote ${name} (${size}x${size})`);
}

// favicon.ico with PNG-compressed 16/32/48 entries (supported since Vista).
const ICO_SIZES = [16, 32, 48];
const images = await Promise.all(ICO_SIZES.map(render));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(ICO_SIZES.length, 4);

let offset = 6 + 16 * ICO_SIZES.length;
const entries = [];
for (let i = 0; i < ICO_SIZES.length; i++) {
  const e = Buffer.alloc(16);
  e.writeUInt8(ICO_SIZES[i] === 256 ? 0 : ICO_SIZES[i], 0); // width
  e.writeUInt8(ICO_SIZES[i] === 256 ? 0 : ICO_SIZES[i], 1); // height
  e.writeUInt8(0, 2); // palette size
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // color planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  entries.push(e);
}
await writeFile(path.join(pub, "favicon.ico"), Buffer.concat([header, ...entries, ...images]));
console.log(`wrote favicon.ico (${ICO_SIZES.join(", ")})`);
