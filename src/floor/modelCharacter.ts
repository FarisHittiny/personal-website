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
  // The celebration is a single fist pump (Mixamo "Fist Pump", 1.9 s): it
  // plays once per pad and holds its last frame while the weight fades out.
  cheer.setLoop(LoopOnce, 1);
  cheer.clampWhenFinished = true;
  for (const a of [idle, walk, run, cheer]) { a.play(); a.setEffectiveWeight(0); }
  idle.setEffectiveWeight(1);

  /* ---- bones for the paddle routine ---- */
  const bone = (n: string): Bone => {
    const b = model.getObjectByName(n) as Bone | undefined;
    if (!b) throw new Error(`faris.glb has no bone ${n}`);
    return b;
  };
  const rArm = bone("mixamorigRightArm"), rFore = bone("mixamorigRightForeArm"), rHand = bone("mixamorigRightHand");
  const chest = bone("mixamorigSpine2");

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
  let cheering = false;

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
    if (pose.state === "cheer") {
      if (!cheering) cheer.reset().play();   // a fresh pump each time he reaches a lit pad
      goal.cheer = 1;
    }
    cheering = pose.state === "cheer";
    if (goal.cheer) { /* fist pump */ }
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
    if (pose.paddling) swing(now);
  }

  /* ---- pickleball forehand, on top of the idle clip ----
   * Root space: +Z is his front, -X his right. One rally every SWING_S: the
   * ball arcs in, he turns back, swings through it at waist height and follows
   * through across his body, and the ball flies back out. */
  const SWING_S = 1.6;
  const KEYS: readonly (readonly [number, Vector3, number])[] = [
    // [phase, upper-arm direction, chest twist (rad, - = turned to his right)]
    [0.0, new Vector3(-0.35, -0.75, 0.55), 0],      // ready
    [0.4, new Vector3(-0.8, -0.6, -0.35), -0.45],  // backswing, waist height
    [0.55, new Vector3(-0.55, -0.35, 0.75), -0.1],  // contact
    [0.72, new Vector3(0.55, 0.15, 0.6), 0.35],     // follow-through
    [1.0, new Vector3(-0.35, -0.75, 0.55), 0],      // back to ready
  ];
  const CONTACT = 0.55;
  const BALL_IN = new Vector3(-1.7, 1.9, 4.5), BALL_OUT = new Vector3(0.9, 2.4, 6.5);
  const contactAt = new Vector3(-0.95, 1.25, 0.95);  // refined from the paddle each swing
  const upperDir = new Vector3(), foreDir = new Vector3(), tmpC = new Vector3();
  const UP = new Vector3(0, 1, 0), FORE_BEND = new Vector3(0, 0.35, 0.45);
  const ease = (t: number): number => t * t * (3 - 2 * t);

  function twist(b: Object3D, angle: number): void {
    root.updateMatrixWorld(true);
    want.copy(UP).transformDirection(root.matrixWorld);
    qa.setFromAxisAngle(want, angle);
    b.getWorldQuaternion(qb);
    const parentQ = b.parent!.getWorldQuaternion(new Quaternion());
    b.quaternion.copy(parentQ.invert().multiply(qa.multiply(qb)));
  }

  function swing(now: number): void {
    const u = ((now / 1000) % SWING_S) / SWING_S;
    let i = 0;
    while (i < KEYS.length - 2 && u >= KEYS[i + 1]![0]) i++;
    const [u0, d0, t0] = KEYS[i]!, [u1, d1, t1] = KEYS[i + 1]!;
    const f = ease((u - u0) / (u1 - u0));
    upperDir.copy(d0).lerp(d1, f).normalize();
    twist(chest, t0 + (t1 - t0) * f);
    aim(rArm, rFore, upperDir);
    foreDir.copy(upperDir).add(FORE_BEND).normalize();
    aim(rFore, rHand, foreDir);

    root.updateMatrixWorld(true);
    rHand.getWorldPosition(tmpA);
    root.worldToLocal(tmpA);
    paddle.position.copy(tmpA);
    paddle.quaternion.setFromUnitVectors(UP, foreDir);  // grip along the forearm, blade beyond the hand
    if (Math.abs(u - CONTACT) < 0.02) tmpC.copy(foreDir).multiplyScalar(0.4).add(tmpA), contactAt.lerp(tmpC, 0.5);

    // Ball: in on an arc to the contact point, then back out.
    const into = u < CONTACT;
    const s = into ? u / CONTACT : (u - CONTACT) / (1 - CONTACT);
    if (into) pball.position.copy(BALL_IN).lerp(contactAt, s);
    else pball.position.copy(contactAt).lerp(BALL_OUT, s);
    pball.position.y += Math.sin(Math.PI * s) * (into ? 0.7 : 1.1);
    pball.visible = s < 0.92 || into;
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
