/** Phase 2 body: the rigged GLB of Faris (public/models/faris.glb, built by
 *  scripts/build-character.mjs), behind the same Character interface as the
 *  stand-in. The scene starts with the stand-in and swaps this in once it has
 *  loaded; if loading fails the stand-in simply stays (see scene.ts).
 *
 *  Clips baked into the GLB: idle, walk, run, kick, cheer (all in place; the
 *  scene moves root). The brain's pose picks the clip:
 *    cheer            -> cheer (loops)
 *    kick > 0         -> kick, once, squeezed into the brain's 0.3 s kick
 *    speed            -> idle / walk / run, cross-faded, playback rate ∝ speed
 *    paddling         -> idle, right arm raised in code, paddle in his hand
 *  Loaded from its own chunk so GLTFLoader and the meshopt decoder stay out of
 *  the scene chunk and off the critical path. */

import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  LoopOnce,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type AnimationAction,
  type Bone,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  BLADE, BOOT, PICKLEBALL, PICKLEBALL_EMISSIVE, PICKLEBALL_GLOW,
  type Character, type CharacterPose,
} from "./character";

export const MODEL_URL = "/models/faris.glb";

const HEIGHT = 2.75;          // world units, about the stand-in's height at its 1.2 scale
const WALK_SPEED = 1.6;       // ground speed (units/s) at which the walk clip plays at 1x
const RUN_SPEED = 4.6;        // same for the run clip
const RUN_FROM = 2.8;         // above this speed he runs instead of walks
const IDLE_BELOW = 0.25;
const FADE = 0.18;            // s, cross-fade between locomotion clips
const KICK_TIME = 0.3;        // s, the brain's kick length (npc.ts)

export async function loadModelCharacter(url = MODEL_URL): Promise<Character> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const model = gltf.scene;

  /* Normalise: feet on the ground, centred, a fixed height. */
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const s = HEIGHT / size.y;
  model.scale.setScalar(s);
  model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  model.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) m.frustumCulled = false; // skinned bounds don't follow the pose
  });

  const root = new Group();
  root.add(model);

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const geo = <G extends BufferGeometry>(g: G): G => { geometries.push(g); return g; };
  const own = <M extends Material>(m: M): M => { materials.push(m); return m; };

  const shadow = new Mesh(geo(new CircleGeometry(0.62, 24)),
    own(new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  /* ---- clips ---- */
  const mixer = new AnimationMixer(model);
  const action = (name: string): AnimationAction => {
    const clip = gltf.animations.find((c) => c.name === name);
    if (!clip) throw new Error(`faris.glb has no "${name}" clip`);
    return mixer.clipAction(clip);
  };
  const idle = action("idle"), walk = action("walk"), run = action("run");
  const kick = action("kick"), cheer = action("cheer");
  kick.setLoop(LoopOnce, 1);
  kick.clampWhenFinished = true;
  kick.timeScale = kick.getClip().duration / KICK_TIME;
  for (const a of [idle, walk, run, cheer]) { a.play(); a.setEffectiveWeight(0); }
  idle.setEffectiveWeight(1);

  /* ---- bones for the paddle routine ---- */
  const bone = (n: string): Bone => {
    const b = model.getObjectByName(n) as Bone | undefined;
    if (!b) throw new Error(`faris.glb has no bone ${n}`);
    return b;
  };
  const rArm = bone("mixamorigRightArm"), rFore = bone("mixamorigRightForeArm"), rHand = bone("mixamorigRightHand");

  const paddle = new Group();
  const grip = new Mesh(geo(new CylinderGeometry(0.035, 0.035, 0.2, 8)), own(new MeshStandardMaterial({ color: BOOT, roughness: 0.7 })));
  const blade = new Mesh(geo(new BoxGeometry(0.34, 0.42, 0.035)), own(new MeshStandardMaterial({ color: BLADE, roughness: 0.5 })));
  grip.position.y = 0.1;
  blade.position.y = 0.4;
  paddle.add(grip, blade);
  paddle.visible = false;
  root.add(paddle);
  const pball = new Mesh(geo(new SphereGeometry(0.075, 14, 10)), own(new MeshStandardMaterial({
    color: PICKLEBALL, emissive: PICKLEBALL_GLOW, emissiveIntensity: PICKLEBALL_EMISSIVE, roughness: 0.5,
  })));
  pball.visible = false;
  root.add(pball);

  /* ---- weights ---- */
  const loco = { idle: 1, walk: 0, run: 0, cheer: 0 };
  const goal = { idle: 1, walk: 0, run: 0, cheer: 0 };
  let kicking = false;

  const tmpA = new Vector3(), tmpB = new Vector3(), want = new Vector3();
  const qa = new Quaternion(), qb = new Quaternion();

  /** Turn `b` (in world space) so the direction from it to `child` points along `dir` (root space). */
  function aim(b: Object3D, child: Object3D, dir: Vector3): void {
    root.updateMatrixWorld(true);
    b.getWorldPosition(tmpA);
    child.getWorldPosition(tmpB);
    const cur = tmpB.sub(tmpA).normalize();
    want.copy(dir).transformDirection(root.matrixWorld);
    qa.setFromUnitVectors(cur, want);                       // world delta
    b.getWorldQuaternion(qb);
    const parentQ = b.parent!.getWorldQuaternion(new Quaternion());
    b.quaternion.copy(parentQ.invert().multiply(qa.multiply(qb)));
  }

  function update(pose: CharacterPose, now: number, dt: number): void {
    const sp = pose.speed;
    goal.idle = goal.walk = goal.run = goal.cheer = 0;
    if (pose.state === "cheer") goal.cheer = 1;
    else if (sp < IDLE_BELOW) goal.idle = 1;
    else if (sp < RUN_FROM) goal.walk = 1;
    else goal.run = 1;

    const k = Math.min(1, dt / FADE);
    for (const key of ["idle", "walk", "run", "cheer"] as const) loco[key] += (goal[key] - loco[key]) * k;
    walk.timeScale = Math.max(0.6, sp / WALK_SPEED);
    run.timeScale = Math.max(0.7, sp / RUN_SPEED);

    if (pose.kick > 0 && !kicking) {
      kicking = true;
      kick.reset().setEffectiveWeight(1).play();
    } else if (pose.kick <= 0 && kicking) {
      kicking = false;
      kick.fadeOut(0.12);
    }
    const free = kicking ? 0.15 : 1;
    idle.setEffectiveWeight(loco.idle * free);
    walk.setEffectiveWeight(loco.walk * free);
    run.setEffectiveWeight(loco.run * free);
    cheer.setEffectiveWeight(loco.cheer * free);

    mixer.update(dt);

    paddle.visible = pball.visible = pose.paddling;
    if (pose.paddling) {
      // Upper arm forward and a little down, forearm level: paddle held out in front.
      aim(rArm, rFore, new Vector3(0.15, -0.35, 1).normalize());
      aim(rFore, rHand, new Vector3(0.05, 0.1, 1).normalize());
      root.updateMatrixWorld(true);
      rHand.getWorldPosition(tmpA);
      root.worldToLocal(tmpA);
      paddle.position.copy(tmpA);
      paddle.rotation.set(Math.PI / 2 - 0.25, 0, 0); // blade flat-ish, facing up
      paddle.position.z += 0.05;
      const bnc = Math.abs(Math.sin(now / 1000 * 5.4));
      pball.position.set(tmpA.x, tmpA.y + 0.12 + bnc * 0.6, tmpA.z + 0.42);
    }
  }

  return {
    root,
    update,
    dispose(): void {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      root.removeFromParent();
      model.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          (mat as MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      });
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
