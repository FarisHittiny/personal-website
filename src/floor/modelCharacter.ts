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
  Group,
  LoopOnce,
  Matrix4,
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
import { buildPaddle, type Character, type CharacterActivity, type CharacterPose } from "./character";

export const MODEL_URL = "/models/faris.glb";

const HEIGHT = 2.75;          // world units, about the stand-in's height at its 1.2 scale
const WALK_SPEED = 1.6;       // ground speed (units/s) at which the walk clip plays at 1x
const RUN_SPEED = 4.6;        // same for the run clip
const RUN_FROM = 2.8;         // above this speed he runs instead of walks
const IDLE_BELOW = 0.25;
const FADE = 0.18;            // s, cross-fade between locomotion clips
const STRIKE_FROM = 0.32;     // s into "Strike Forward Jog" where the brain's 0.55 s strike starts
const PADDLE_SCALE = 1;       // life size; buildPaddle is already at scene scale

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
  // The kick is Mixamo's "Strike Forward Jog": the brain's strike covers the
  // clip's last stride and the strike (STRIKE_FROM..+STRIKE_TIME, contact at
  // 0.57 s), so the foot meets the ball when the brain sends it.
  kick.setLoop(LoopOnce, 1);
  kick.clampWhenFinished = true;
  /* Idle activities (npc.ts ACTIVITIES); "juggle" loops one touch. */
  const ACTIVITY_NAMES = ["weightshift", "lookaround", "stretch", "thinking", "texting", "juggle"] as const;
  const acts = Object.fromEntries(ACTIVITY_NAMES.map((n) => [n, action(n)])) as Record<CharacterActivity, AnimationAction>;
  for (const a of Object.values(acts)) { a.play(); a.setEffectiveWeight(0); }
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
  const lHand = bone("mixamorigLeftHand"), head = bone("mixamorigHead"), rFoot = bone("mixamorigRightFoot");
  const rFinger = bone("mixamorigRightHandMiddle1");

  /* Props for two activities: a small ball for juggling, a phone for texting. */
  const jball = new Mesh(geo(new SphereGeometry(0.16, 24, 16)),
    own(new MeshStandardMaterial({ color: 0xe6eaf4, roughness: 0.82 })));
  jball.visible = false;
  root.add(jball);
  const phone = new Mesh(geo(new BoxGeometry(0.13, 0.25, 0.016)),
    own(new MeshStandardMaterial({ color: 0x15171c, roughness: 0.35 })));
  phone.visible = false;
  root.add(phone);

  const paddle = buildPaddle(geo, own);
  paddle.scale.setScalar(PADDLE_SCALE);
  paddle.visible = false;
  root.add(paddle);

  /* ---- weights ---- */
  type Slot = "idle" | "walk" | "run" | "cheer" | CharacterActivity;
  const SLOTS: readonly Slot[] = ["idle", "walk", "run", "cheer", ...ACTIVITY_NAMES];
  const slotAction: Record<Slot, AnimationAction> = { idle, walk, run, cheer, ...acts };
  const loco = Object.fromEntries(SLOTS.map((n) => [n, n === "idle" ? 1 : 0])) as Record<Slot, number>;
  const goal = { ...loco };
  let kicking = false;
  let cheering = false;
  let current: CharacterActivity | null = null;

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

  function update(pose: CharacterPose, _now: number, dt: number): void {
    const sp = pose.speed;
    for (const n of SLOTS) goal[n] = 0;
    if (pose.state === "cheer") {
      if (!cheering) cheer.reset().play();   // a fresh pump each time he reaches a lit pad
      goal.cheer = 1;
    }
    cheering = pose.state === "cheer";
    const act = pose.state === "idle" && sp < IDLE_BELOW ? pose.activity : null;
    if (act !== current) { if (act) acts[act].reset().play(); current = act; }
    if (goal.cheer) { /* fist pump */ }
    else if (act) goal[act] = 1;
    else if (sp < IDLE_BELOW) goal.idle = 1;
    else if (sp < RUN_FROM) goal.walk = 1;
    else goal.run = 1;

    const k = Math.min(1, dt / FADE);
    for (const n of SLOTS) loco[n] += (goal[n] - loco[n]) * k;
    walk.timeScale = Math.max(0.6, sp / WALK_SPEED);
    run.timeScale = Math.max(0.7, sp / RUN_SPEED);

    if (pose.kick > 0 && !kicking) {
      kicking = true;
      kick.reset().setEffectiveWeight(1).play();
      kick.time = STRIKE_FROM;
    } else if (pose.kick <= 0 && kicking) {
      kicking = false;
      kick.fadeOut(0.15);
    }
    const free = kicking ? 0.1 : 1;
    for (const n of SLOTS) slotAction[n].setEffectiveWeight(loco[n] * free);

    mixer.update(dt);

    paddle.visible = pose.paddling;
    if (pose.paddling) forehand(pose.swing);
    else curlFingers(false);
    props();
  }

  /* Juggling ball and phone follow the body after the clips have posed it. */
  const JUGGLE_TOUCH = 0.27;  // s into the "juggle" clip where the right foot meets the ball
  const tmpH = new Vector3();
  function props(): void {
    jball.visible = loco.juggle > 0.5;
    phone.visible = loco.texting > 0.5;
    if (!jball.visible && !phone.visible) return;
    root.updateMatrixWorld(true);
    if (jball.visible) {
      const d = acts.juggle.getClip().duration;
      const ph = (((acts.juggle.time - JUGGLE_TOUCH) % d) + d) % d / d;  // 0 at each touch
      rFoot.getWorldPosition(tmpA);
      root.worldToLocal(tmpA);
      jball.position.set(tmpA.x, 0.32 + Math.sin(Math.PI * ph) * 1.05, tmpA.z + 0.22);
    }
    if (phone.visible) {
      rHand.getWorldPosition(tmpA); lHand.getWorldPosition(tmpB); head.getWorldPosition(tmpH);
      root.worldToLocal(tmpA); root.worldToLocal(tmpB); root.worldToLocal(tmpH);
      phone.position.copy(tmpA).lerp(tmpB, 0.5);
      phone.position.y += 0.06;
      phone.position.z += 0.16;   // in front of the fingers, held up toward his face
      phone.lookAt(root.localToWorld(tmpH.clone()));
    }
  }

  /* ---- pickleball forehand at the big ball, on top of the clips ----
   * Root space: +Z is his front, -X his right. The brain plants him with the
   * ball at his front-right and hands over swing progress (contact at 0.55):
   * turn back, swing through at waist height, follow through across the body.
   * With the paddle out but no swing yet (running in), he holds it ready. */
  const KEYS: readonly (readonly [number, Vector3, number])[] = [
    // [progress, upper-arm direction, chest twist (rad, - = turned to his right)]
    // A low drive: the big ball's centre is below his waist, so the arm
    // swings down and through it rather than across the chest.
    // The paddle sweeps round from his right: at contact it points out to his
    // right-front with the face square to the ball (front-right of him).
    [0.0, new Vector3(-0.3, -0.9, 0.25), 0],        // ready, paddle low at his side
    [0.4, new Vector3(-0.6, -0.6, -0.5), -0.45],    // backswing
    [0.55, new Vector3(-0.55, -0.7, 0.35), -0.05],  // contact
    [0.72, new Vector3(0.2, -0.25, 0.8), 0.35],     // follow-through, low to high
    [1.0, new Vector3(-0.3, -0.9, 0.25), 0],        // back to ready
  ];
  const upperDir = new Vector3(), foreDir = new Vector3(), side = new Vector3();
  const UP = new Vector3(0, 1, 0), FORE_BEND = new Vector3(0, 0.2, 0.2);
  const basis = new Matrix4();
  const GRIP_AT = 0.07;     // the fist closes round the handle this far up from the butt
  const GRIP_ANGLE = 0.45;  // the handle runs thumb-ward, tilted this much toward the fingers
  const GRIP_ALONG = 0.95;  // the handle crosses the palm at the knuckles (fraction of hand-to-knuckle)
  const GRIP_OUT = 0.03;    // and sits this far out from the palm, inside the curled fingers
  const X_AXIS = new Vector3(1, 0, 0);
  const THUMB_HINT = new Vector3(-1, 0.6, 0).normalize();  // up and to his right (root space)
  const qc = new Quaternion();
  const palm = new Vector3(), axis = new Vector3();
  const fingerDir = new Vector3(), palmN = new Vector3(), thumbDir = new Vector3();
  const ease = (t: number): number => t * t * (3 - 2 * t);

  function twist(b: Object3D, angle: number): void {
    root.updateMatrixWorld(true);
    want.copy(UP).transformDirection(root.matrixWorld);
    qa.setFromAxisAngle(want, angle);
    b.getWorldQuaternion(qb);
    const parentQ = b.parent!.getWorldQuaternion(new Quaternion());
    b.quaternion.copy(parentQ.invert().multiply(qa.multiply(qb)));
  }

  function forehand(u: number): void {
    let i = 0;
    while (i < KEYS.length - 2 && u >= KEYS[i + 1]![0]) i++;
    const [u0, d0, t0] = KEYS[i]!, [u1, d1, t1] = KEYS[i + 1]!;
    const f = ease(Math.min(1, Math.max(0, (u - u0) / (u1 - u0))));
    upperDir.copy(d0).lerp(d1, f).normalize();
    if (u > 0) twist(chest, t0 + (t1 - t0) * f);
    aim(rArm, rFore, upperDir);
    foreDir.copy(upperDir).add(FORE_BEND).normalize();
    aim(rFore, rHand, foreDir);

    // Hand: a handshake grip. The hand carries on from the forearm with the
    // thumb kept up and out to his right, so the palm (and the paddle face,
    // parallel to it) looks forward at the ball and the head never drops.
    root.updateMatrixWorld(true);
    fingerDir.copy(foreDir);
    thumbDir.copy(THUMB_HINT).addScaledVector(fingerDir, -THUMB_HINT.dot(fingerDir)).normalize();
    palmN.crossVectors(thumbDir, fingerDir).normalize();
    // hand-local axes: +X toward the thumb, +Y along the fingers, +Z out of the palm
    basis.makeBasis(thumbDir, fingerDir, palmN);
    qa.setFromRotationMatrix(basis);                               // root space
    root.getWorldQuaternion(qb).multiply(qa);                      // world
    rHand.parent!.getWorldQuaternion(qc);
    rHand.quaternion.copy(qc.invert().multiply(qb));
    curlFingers(true);

    // Paddle: the handle lies diagonally across the palm, inside the curled
    // fingers, and leaves the fist between thumb and index; the butt sticks
    // out under the little finger.
    root.updateMatrixWorld(true);
    rHand.getWorldPosition(tmpA); root.worldToLocal(tmpA);
    rFinger.getWorldPosition(tmpB); root.worldToLocal(tmpB);
    const knuckle = tmpA.distanceTo(tmpB);
    axis.copy(thumbDir).addScaledVector(fingerDir, GRIP_ANGLE).normalize();
    palm.copy(tmpA)
      .addScaledVector(fingerDir, knuckle * GRIP_ALONG)
      .addScaledVector(palmN, GRIP_OUT);
    side.crossVectors(axis, palmN).normalize();
    basis.makeBasis(side, axis, palmN);
    paddle.quaternion.setFromRotationMatrix(basis);
    paddle.position.copy(palm).addScaledVector(axis, -GRIP_AT * PADDLE_SCALE);
  }

  /* The clips leave the fingers at the bind pose (open hand). While he holds
   * the paddle they close round the handle: each joint bends about its local
   * X axis (positive closes toward the palm). */
  const CURL: readonly (readonly [string, number])[] = [
    ["Index1", 1.25], ["Index2", 1.45], ["Index3", 0.9],
    ["Middle1", 1.3], ["Middle2", 1.5], ["Middle3", 0.9],
    ["Ring1", 1.35], ["Ring2", 1.5], ["Ring3", 0.9],
    ["Pinky1", 1.4], ["Pinky2", 1.4], ["Pinky3", 0.9],
    ["Thumb1", 0.3], ["Thumb2", 0.7], ["Thumb3", 0.7],
  ];
  // The thumb's joints sit at an angle to the hand, so its bend axis is worked
  // out from the bind pose: it folds across the front of the fist, toward the
  // palm and the little finger (hand-local +Z and -X).
  const THUMB_TO = new Vector3(-0.6, 0, 1).normalize();
  const thumbChain = new Quaternion();
  const fingers = CURL.map(([n, a]) => {
    const b = bone(`mixamorigRightHand${n}`);
    let ax = X_AXIS;
    if (n.startsWith("Thumb")) {
      thumbChain.multiply(b.quaternion);                              // hand -> this joint, at rest
      const to = THUMB_TO.clone().applyQuaternion(thumbChain.clone().invert());
      ax = new Vector3(0, 1, 0).cross(to).normalize();
    }
    return { b, rest: b.quaternion.clone(), bent: b.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(ax, a)) };
  });
  let curled = false;
  function curlFingers(on: boolean): void {
    if (on === curled) return;
    curled = on;
    for (const f of fingers) f.b.quaternion.copy(on ? f.bent : f.rest);
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
