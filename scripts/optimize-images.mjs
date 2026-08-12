// Image pipeline: originals in assets-src/ -> optimized AVIF/WebP/JPEG in
// public/img/, using the exact filenames the markup already references.
//
// Drop real photos into assets-src/ named after their slot (portrait.jpg,
// eartag.jpg — any of .jpg/.jpeg/.png) and run `npm run images`. Files are
// center-cropped to the slot's aspect ratio, so any reasonable source works.
import sharp from "sharp";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, "assets-src");
const outDir = path.join(root, "public", "img");
await mkdir(outDir, { recursive: true });

const SLOTS = [
  { name: "portrait", w: 960, h: 1200 },
  // extract: attention parks the band high and fills the top third with
  // ceiling — shifted down to sit on the group and the poster (source 3024x4032).
  { name: "eartag", w: 960, h: 720, extract: { left: 0, top: 1134, width: 3024, height: 2268 } },
  { name: "sitevisit", w: 960, h: 1200 },
  { name: "awards", w: 960, h: 720 },
  { name: "asa", w: 960, h: 720 },
  { name: "roberto", w: 960, h: 720 },
  // extract: sharp's attention crop decapitates this one — band tuned to keep
  // faces and the full "WE ARE JORDAN" flag text (source is 1536x2304).
  { name: "jordan", w: 960, h: 720, extract: { left: 0, top: 573, width: 1536, height: 1152 } },
  { name: "flagday", w: 960, h: 720 },
];

async function findSource(name) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const p = path.join(srcDir, name + ext);
    try {
      await access(p);
      return p;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

let missing = 0;
for (const slot of SLOTS) {
  const src = await findSource(slot.name);
  if (!src) {
    console.log(`skip: no assets-src/${slot.name}.{jpg,jpeg,png,webp} — placeholder stays`);
    missing++;
    continue;
  }
  let img = sharp(src);
  if (slot.extract) img = img.extract(slot.extract);
  img = img.resize(slot.w, slot.h, { fit: "cover", position: "attention" });
  await img.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(outDir, `${slot.name}-960.jpg`));
  await img.clone().webp({ quality: 75 }).toFile(path.join(outDir, `${slot.name}-960.webp`));
  await img.clone().avif({ quality: 50 }).toFile(path.join(outDir, `${slot.name}-960.avif`));
  console.log(`optimized: ${slot.name} <- ${path.basename(src)}`);
}
if (missing) {
  console.log(`\n${missing} slot(s) still on placeholders. Run scripts/make-placeholders.mjs to regenerate those if needed.`);
}
