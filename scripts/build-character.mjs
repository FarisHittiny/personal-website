/** Build public/models/faris.glb from the source assets in assets-src/character/
 *  (git-ignored: the Tripo export and the Mixamo clips are not ours to redistribute
 *  as source; only the baked, compressed result ships).
 *
 *    faris-rigged.glb   Hunyuan3D mesh, auto-rigged in Tripo (Mixamo bone names,
 *                       but Tripo's own bone axes and an A-pose bind pose)
 *    idle|walk|run|kick|cheer.fbx   Mixamo clips, "without skin", T-pose rest
 *
 *  The clips cannot be copied bone-for-bone: Tripo's local bone axes differ from
 *  Mixamo's and the rest poses differ (A vs T). So each frame is retargeted in
 *  world space: the source bone's rotation away from its rest is applied on top
 *  of a per-bone alignment that turns the target's rest direction onto the
 *  source's rest direction. Hips get the vertical bob only (clips play in place;
 *  the scene moves the character). Finger bones are left at rest.
 *
 *  Run: node scripts/build-character.mjs   (dev only; needs the git-ignored sources) */

import fs from "node:fs";
import path from "node:path";
import { AnimationMixer, Object3D, Quaternion, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptEncoder } from "meshoptimizer";
import { createRequire } from "node:module";
import { dedup, meshopt, prune, quantize, resample } from "@gltf-transform/functions";
/* @gltf-transform/functions loads its own sharp (via ndarray-pixels); two libvips
 * builds cannot share a process, so use that same copy for the textures. */
const sharp = createRequire(createRequire(import.meta.url).resolve("ndarray-pixels"))("sharp");

const SRC = "assets-src/character";
const OUT = "public/models/faris.glb";
const FPS = 30;
const CLIPS = [
  // name, file, seconds to keep (null = whole clip)
  ["idle", "idle.fbx", 4],
  ["walk", "walk.fbx", null],
  ["run", "run.fbx", null],
  ["kick", "kick.fbx", null],
  ["cheer", "cheer.fbx", 1.9], // Mixamo "Fist Pump"; the pump is 0.4–1.6 s
];
const SKIP = /Hand(Thumb|Index|Middle|Ring|Pinky)|Toe_End|HeadTop_End/;

const key = (name) => name.replace(/[:\s]/g, "");
/* A bone's direction is measured toward one specific child, the same in both
 * skeletons; bones with several children (hips, chest, hands) must not pick
 * whichever child happens to be listed first. */
const PRIMARY_CHILD = {
  mixamorigHips: "mixamorigSpine", mixamorigSpine2: "mixamorigNeck",
  mixamorigLeftHand: "mixamorigLeftHandMiddle1", mixamorigRightHand: "mixamorigRightHandMiddle1",
};
const pickChild = (k, kids, nameOf) => {
  const want = PRIMARY_CHILD[k];
  return want ? kids.find((c) => key(nameOf(c)) === want) : kids[0];
};

/* ---------- target skeleton (gltf-transform doc mirrored into three Object3Ds) ---------- */
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
await MeshoptEncoder.ready;
const doc = await io.read(path.join(SRC, "faris-rigged.glb"));
const root = doc.getRoot();

/* Materials: the exported roughness/metal map is a 2K 16-bit PNG that sharp
 * cannot re-encode and that adds a plasticky sheen at this size; a flat matte
 * finish matches the stylized look. Base colour goes to 1K WebP. */
for (const m of root.listMaterials()) {
  const mr = m.getMetallicRoughnessTexture();
  m.setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.85);
  mr?.dispose();
}
for (const t of root.listTextures()) {
  console.log("texture", t.getName(), t.getMimeType());
  // Decode to raw RGB first: the export's JPEG trips libvips' colourspace step on resize.
  const { data, info } = await sharp(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = await sharp(data, { raw: info }).resize(1024, 1024).webp({ quality: 82 }).toBuffer();
  t.setImage(new Uint8Array(img)).setMimeType("image/webp").setURI("");
}

const skin = root.listSkins()[0];
const jointSet = new Set(skin.listJoints());

const tObj = new Map(); // gltf Node -> Object3D
const tScene = new Object3D();
function mirror(node, parent) {
  const o = new Object3D();
  o.name = node.getName();
  o.position.fromArray(node.getTranslation());
  o.quaternion.fromArray(node.getRotation());
  o.scale.fromArray(node.getScale());
  parent.add(o);
  tObj.set(node, o);
  for (const c of node.listChildren()) mirror(c, o);
}
for (const n of root.listScenes()[0].listChildren()) mirror(n, tScene);
tScene.updateMatrixWorld(true);

const tByKey = new Map();
for (const j of jointSet) tByKey.set(key(j.getName()), j);
const tHips = tByKey.get("mixamorigHips");

/* Process joints parent-first. */
const order = [];
(function walk(node) {
  if (jointSet.has(node)) order.push(node);
  for (const c of node.listChildren()) walk(c);
})(root.listScenes()[0].listChildren()[0]);
for (const n of root.listScenes()[0].listChildren().slice(1)) (function walk(node) {
  if (jointSet.has(node) && !order.includes(node)) order.push(node);
  for (const c of node.listChildren()) walk(c);
})(n);

const wq = (o) => o.getWorldQuaternion(new Quaternion());
const wp = (o) => o.getWorldPosition(new Vector3());

/* Target rest data. */
const tRestWQ = new Map(), tRestDir = new Map();
for (const j of order) {
  const o = tObj.get(j);
  tRestWQ.set(j, wq(o));
  const child = pickChild(key(j.getName()), j.listChildren().filter((c) => jointSet.has(c)), (c) => c.getName());
  if (child) tRestDir.set(j, wp(tObj.get(child)).sub(wp(o)).normalize());
}
const tHipsRestY = wp(tObj.get(tHips)).y;
const tFootY = Math.min(wp(tObj.get(tByKey.get("mixamorigLeftFoot"))).y, wp(tObj.get(tByKey.get("mixamorigRightFoot"))).y);

/* ---------- source rest skeleton ----------
 * The clips' own FBX files do not carry a reliable rest pose (some load in the
 * clip's first frame), so every clip is played on Mixamo's X Bot (T-pose bind),
 * which shares the bone names. */
const loadFbx = (file) => {
  const buf = fs.readFileSync(path.join(SRC, file));
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
};
const src = loadFbx("xbot.fbx");
const sBones = new Map();
// FBXLoader nests a childless duplicate under each X Bot bone (one per skinned
// mesh); traversal meets the real bone first, so keep the first of each name.
src.traverse((o) => { if (o.name.startsWith("mixamorig") && !sBones.has(key(o.name))) sBones.set(key(o.name), o); });
const sRestLocal = new Map([...sBones].map(([k, o]) => [k, [o.position.clone(), o.quaternion.clone()]]));
src.updateMatrixWorld(true);
const sRestWQ = new Map(), sRestDir = new Map();
for (const [k, o] of sBones) {
  sRestWQ.set(k, wq(o));
  const child = pickChild(k, o.children.filter((c) => c.name !== o.name && sBones.has(key(c.name))), (c) => c.name);
  if (child) sRestDir.set(k, wp(child).sub(wp(o)).normalize());
}
const sHips = sBones.get("mixamorigHips");
const sHipsRestY = wp(sHips).y;
const sFootY = Math.min(wp(sBones.get("mixamorigLeftFoot")).y, wp(sBones.get("mixamorigRightFoot")).y);
const yScale = (tHipsRestY - tFootY) / (sHipsRestY - sFootY);
const align = new Map();
for (const j of order) {
  const td = tRestDir.get(j), sd = sRestDir.get(key(j.getName()));
  align.set(j, td && sd ? new Quaternion().setFromUnitVectors(td, sd) : new Quaternion());
}

/* ---------- per clip ---------- */
const anims = [];
for (const [name, file, keep] of CLIPS) {
  const clip = loadFbx(file).animations[0];
  for (const [k, [pos, quat]] of sRestLocal) { const o = sBones.get(k); o.position.copy(pos); o.quaternion.copy(quat); }
  const mixer = new AnimationMixer(src);
  mixer.stopAllAction();
  mixer.clipAction(clip).play();
  const dur = keep ? Math.min(keep, clip.duration) : clip.duration;
  const frames = Math.max(2, Math.round(dur * FPS) + 1);
  const times = new Float32Array(frames);
  const rot = new Map(order.map((j) => [j, new Float32Array(frames * 4)]));
  const hipT = new Float32Array(frames * 3);
  const tRest = tHips.getTranslation();
  let y0 = null;

  for (let f = 0; f < frames; f++) {
    const t = Math.min(dur, f / FPS);
    times[f] = t;
    mixer.setTime(t);
    src.updateMatrixWorld(true);
    const newWQ = new Map();
    for (const j of order) {
      const k = key(j.getName());
      const s = sBones.get(k);
      const parentNode = j.getParentNode();
      const parentWQ = newWQ.get(parentNode) ?? wq(tObj.get(parentNode));
      let world;
      if (!s || SKIP.test(k)) {
        // keep rest local rotation: world follows parent
        world = parentWQ.clone().multiply(new Quaternion().fromArray(j.getRotation()));
      } else {
        // delta from source rest, in world space, applied to the aligned target rest
        const delta = wq(s).multiply(sRestWQ.get(k).clone().invert());
        world = delta.multiply(align.get(j)).multiply(tRestWQ.get(j));
      }
      newWQ.set(j, world);
      const local = parentWQ.clone().invert().multiply(world).normalize();
      if (f > 0) { // keep quaternion sign continuous
        const a = rot.get(j), p = (f - 1) * 4;
        if (a[p] * local.x + a[p + 1] * local.y + a[p + 2] * local.z + a[p + 3] * local.w < 0) {
          local.set(-local.x, -local.y, -local.z, -local.w);
        }
      }
      rot.get(j).set([local.x, local.y, local.z, local.w], f * 4);
    }
    // hips: vertical bob only, scaled to the target, in the hips' parent space
    const y = wp(sHips).y;
    if (y0 === null) y0 = sHipsRestY;
    const dyWorld = (y - y0) * yScale;
    const parentO = tObj.get(tHips.getParentNode());
    const pw = parentO.getWorldScale(new Vector3());
    const dirLocal = new Vector3(0, dyWorld / pw.y, 0).applyQuaternion(wq(parentO).invert());
    hipT.set([tRest[0] + dirLocal.x, tRest[1] + dirLocal.y, tRest[2] + dirLocal.z], f * 3);
  }

  const anim = doc.createAnimation(name);
  const input = doc.createAccessor().setType("SCALAR").setArray(times);
  for (const j of order) {
    if (SKIP.test(key(j.getName()))) continue;
    const out = doc.createAccessor().setType("VEC4").setArray(rot.get(j));
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation("LINEAR");
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(j).setTargetPath("rotation").setSampler(sampler));
  }
  const hs = doc.createAnimationSampler().setInput(input)
    .setOutput(doc.createAccessor().setType("VEC3").setArray(hipT)).setInterpolation("LINEAR");
  anim.addSampler(hs).addChannel(doc.createAnimationChannel().setTargetNode(tHips).setTargetPath("translation").setSampler(hs));
  anims.push(`${name} ${dur.toFixed(2)}s`);
  mixer.stopAllAction(); mixer.uncacheRoot(src);
}

/* Drop extensions we don't need; three ignores them but they add noise. */
for (const ext of root.listExtensionsUsed()) {
  if (["KHR_materials_volume", "FB_ngon_encoding"].includes(ext.extensionName)) ext.dispose();
}

await doc.transform(
  resample({ tolerance: 1e-4 }),
  prune(),
  dedup(),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, clips: ${anims.join(", ")}`);
