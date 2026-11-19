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
  LinearFilter,
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
import { CARRY_Y, CARRY_Z } from "./npc";

export const MODEL_URL = "/models/faris.glb";

const HEIGHT = 3.3;           // world units (Faris, Nov 2026: 2.75 read "a little small")
/* Ground speeds (units/s) at which the clips play at 1x, scaled with his height so
 * the feet do not scurry (Faris: "I walk around all weird"): Mixamo walk ~0.78 and
 * run ~1.9 body-heights per second. */
const WALK_SPEED = 0.78 * HEIGHT;
const RUN_SPEED = 1.9 * HEIGHT;
const RUN_FROM = 2.8;         // above this speed he runs instead of walks
const IDLE_BELOW = 0.25;
const FADE = 0.18;            // s, cross-fade between locomotion clips
const STRIKE_FROM = 0.32;     // s into "Strike Forward Jog" where the brain's 0.55 s strike starts
const PADDLE_SCALE = 1;       // life size; buildPaddle is already at scene scale
/* Slimmer through the body (Faris: "I look fat"): width and depth only. */
const SLIM = 0.93;
const BALL_R = 0.62;          // scene.ts R
/* Squat for picking the ball up: hips drop this far (world units) at full
 * crouch, the spine leans forward this much (rad); legs bend to keep the feet put. */
const SQUAT_DROP = 1.05;
const SQUAT_LEAN = 0.55;
/* Glance at the visitor's cursor: neck + head together, at most this far. */
const LOOK_YAW = 1.0, LOOK_UP = 0.3, LOOK_DOWN = 0.45;

export async function loadModelCharacter(url = MODEL_URL): Promise<Character> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const model = gltf.scene;

  /* Normalise: feet on the ground, centred, a fixed height. */
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const s = HEIGHT / size.y;
  model.scale.set(s * SLIM, s, s * SLIM);
  model.position.set(-((box.min.x + box.max.x) / 2) * s * SLIM, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s * SLIM);
  model.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; // skinned bounds don't follow the pose
    /* No mipmaps: the texture atlas packs its pieces edge to edge, so the
     * smaller mip levels blend the jacket's beige into the black trousers as
     * pale streaks (Faris: "why are my pants so shiny"). At his on-screen size
     * the 1K texture is close to 1:1, so plain linear filtering holds up. */
    const map = (m.material as MeshStandardMaterial).map;
    if (map) { map.generateMipmaps = false; map.minFilter = LinearFilter; map.needsUpdate = true; }
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
  const ACTIVITY_NAMES = ["weightshift", "lookaround", "stretch", "texting", "juggle"] as const;
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
  const lArm = bone("mixamorigLeftArm"), lFore = bone("mixamorigLeftForeArm");
  const hips = bone("mixamorigHips"), spine = bone("mixamorigSpine"), neck = bone("mixamorigNeck");
  const lUp = bone("mixamorigLeftUpLeg"), lLeg = bone("mixamorigLeftLeg"), lFoot = bone("mixamorigLeftFoot");
  const rUp = bone("mixamorigRightUpLeg"), rLeg = bone("mixamorigRightLeg");

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
  function aim(b: Object3D, child: Object3D, dir: Vector3, weight = 1): void {
    root.updateMatrixWorld(true);
    aimWorld(b, child, new Vector3().copy(dir).transformDirection(root.matrixWorld), weight);
  }
  /** Same, with the direction already in world space; weight < 1 turns only part of the way. */
  function aimWorld(b: Object3D, child: Object3D, dirW: Vector3, weight = 1): void {
    root.updateMatrixWorld(true);
    b.getWorldPosition(tmpA);
    child.getWorldPosition(tmpB);
    const cur = tmpB.sub(tmpA).normalize();
    want.copy(dirW).normalize();
    if (weight < 1) want.lerp(cur, 1 - weight).normalize();
    qa.setFromUnitVectors(cur, want);                       // world delta
    b.getWorldQuaternion(qb);
    const parentQ = b.parent!.getWorldQuaternion(new Quaternion());
    b.quaternion.copy(parentQ.invert().multiply(qa.multiply(qb)));
  }
  /** Turn b by a world-space rotation on top of its current pose. */
  function rotateWorld(b: Object3D, q: Quaternion): void {
    root.updateMatrixWorld(true);
    b.getWorldQuaternion(qb);
    const parentQ = b.parent!.getWorldQuaternion(new Quaternion());
    b.quaternion.copy(parentQ.invert().multiply(q.clone().multiply(qb)));
  }
  /** Two-bone IK: bend a-b-c so c reaches target (world), the middle joint
   *  bending toward pole (a direction in root space). */
  const ikA = new Vector3(), ikB = new Vector3(), ikC = new Vector3(), ikN = new Vector3(), ikP = new Vector3(), ikE = new Vector3();
  function reach(a: Object3D, b: Object3D, c: Object3D, target: Vector3, pole: Vector3): void {
    root.updateMatrixWorld(true);
    a.getWorldPosition(ikA); b.getWorldPosition(ikB); c.getWorldPosition(ikC);
    const la = ikA.distanceTo(ikB), lb = ikB.distanceTo(ikC);
    ikN.copy(target).sub(ikA);
    const d = Math.min(Math.max(ikN.length(), Math.abs(la - lb) + 1e-3), (la + lb) * 0.999);
    ikN.normalize();
    const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    ikP.copy(pole).transformDirection(root.matrixWorld);
    ikP.addScaledVector(ikN, -ikP.dot(ikN)).normalize();
    ikE.copy(ikA).addScaledVector(ikN, la * cosA).addScaledVector(ikP, la * sinA);
    aimWorld(a, b, ikE.clone().sub(ikA));
    root.updateMatrixWorld(true);
    b.getWorldPosition(ikB);
    aimWorld(b, c, ikA.clone().addScaledVector(ikN, d).sub(ikB));
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

    squat(pose.crouch);
    if (pose.hold > 0) holdBall(pose);
    if (pose.wave > 0) waveHello(pose.wave, _now);
    lookAt(pose, dt);

    paddle.visible = pose.paddling;
    if (pose.paddling) forehand(pose.swing);
    else curlFingers(false);
    props();
  }

  /* ---- squat: drop the hips, lean in, bend the legs so the feet stay put ---- */
  const footL = new Vector3(), footR = new Vector3(), fqL = new Quaternion(), fqR = new Quaternion();
  const KNEE_POLE = new Vector3(0, 0, 1), AXIS_X = new Vector3(1, 0, 0);
  function squat(c: number): void {
    if (c <= 0.001) return;
    root.updateMatrixWorld(true);
    lFoot.getWorldPosition(footL); rFoot.getWorldPosition(footR);
    lFoot.getWorldQuaternion(fqL); rFoot.getWorldQuaternion(fqR);
    hips.getWorldPosition(tmpH);
    tmpH.y -= c * SQUAT_DROP;
    hips.parent!.worldToLocal(tmpH);
    hips.position.copy(tmpH);
    const lean = new Vector3().copy(AXIS_X).transformDirection(root.matrixWorld);
    rotateWorld(spine, new Quaternion().setFromAxisAngle(lean, c * SQUAT_LEAN));
    reach(lUp, lLeg, lFoot, footL, KNEE_POLE);
    reach(rUp, rLeg, rFoot, footR, KNEE_POLE);
    for (const [f, q] of [[lFoot, fqL], [rFoot, fqR]] as const) {   // feet stay flat
      root.updateMatrixWorld(true);
      f.parent!.getWorldQuaternion(qc);
      f.quaternion.copy(qc.invert().multiply(q));
    }
  }

  /* ---- hands on the ball's sides (picking it up, carrying, setting it down) ---- */
  const handT = new Vector3(), handNow = new Vector3();
  const ELBOW_L = new Vector3(1, -0.4, -0.6), ELBOW_R = new Vector3(-1, -0.4, -0.6);
  function holdBall(pose: CharacterPose): void {
    const h = pose.hold;
    for (const [arm, fore, hand, side, pole] of [[lArm, lFore, lHand, 1, ELBOW_L], [rArm, rFore, rHand, -1, ELBOW_R]] as const) {
      root.updateMatrixWorld(true);
      handT.set(side * BALL_R * 0.93, BALL_R + pose.lift * (CARRY_Y - BALL_R) + 0.05, CARRY_Z - 0.14)
        .applyMatrix4(root.matrixWorld);
      hand.getWorldPosition(handNow);
      handNow.lerp(handT, h);
      reach(arm, fore, hand, handNow, pole);
    }
  }

  /* ---- hello: right arm up, forearm waving ---- */
  const WAVE_UPPER = new Vector3(-0.85, 0.5, 0.2), waveFore = new Vector3();
  function waveHello(u: number, now: number): void {
    const w = Math.min(1, u / 0.12, (1 - u) / 0.15);
    if (w <= 0) return;
    aim(rArm, rFore, WAVE_UPPER, w);
    waveFore.set(-0.25 + Math.sin(now / 1000 * Math.PI * 2 * 1.6) * 0.45, 1, 0.25).normalize();
    aim(rFore, rHand, waveFore, w);
  }

  /* ---- glance at the visitor's cursor ---- */
  let lookW = 0, lookYaw = 0, lookPitch = 0;
  const lookT = new Vector3(), headP = new Vector3(), invRoot = new Quaternion(), upW = new Vector3(), rightW = new Vector3();
  const LOOKING: ReadonlySet<string> = new Set(["idle", "walk", "watch", "carry"]);
  function lookAt(pose: CharacterPose, dt: number): void {
    const on = !!pose.look && LOOKING.has(pose.state) && (!pose.activity || pose.activity === "weightshift");
    lookW += ((on ? 1 : 0) - lookW) * Math.min(1, dt * 4);
    if (on) lookT.set(pose.look!.x, pose.look!.y, pose.look!.z);
    if (lookW < 0.01) return;
    root.updateMatrixWorld(true);
    head.getWorldPosition(headP);
    const d = lookT.clone().sub(headP).applyQuaternion(root.getWorldQuaternion(invRoot).invert());
    const yaw = Math.max(-LOOK_YAW, Math.min(LOOK_YAW, Math.atan2(d.x, d.z)));
    const pitch = Math.max(-LOOK_DOWN, Math.min(LOOK_UP, Math.atan2(d.y, Math.hypot(d.x, d.z))));
    const k = Math.min(1, dt * 6);
    lookYaw += (yaw - lookYaw) * k; lookPitch += (pitch - lookPitch) * k;
    upW.set(0, 1, 0).transformDirection(root.matrixWorld);
    rightW.copy(AXIS_X).transformDirection(root.matrixWorld);
    for (const [b, share] of [[neck, 0.4], [head, 0.6]] as const) {
      const q = new Quaternion().setFromAxisAngle(upW, lookYaw * lookW * share)
        .multiply(new Quaternion().setFromAxisAngle(rightW, -lookPitch * lookW * share));
      rotateWorld(b, q);
    }
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
