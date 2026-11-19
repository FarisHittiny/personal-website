/** The NPC's decisions: pure logic, no three.js import, no DOM.
 *
 *  A port of the prototype's `npc` object, `wanderTo` and `stepNpc`
 *  (docs/redesign/prototype.html, offsets 37879–41400) with every tuning
 *  number kept. The animation half of `stepNpc` lives in character.ts; the
 *  ball-versus-body collision lives in scene.ts. Every random call goes
 *  through `rng` so the brain can be simulated with a seeded source
 *  (scripts/check-npc.mjs).
 *
 *  The brain owns his ground position: the scene copies `x`, `z` and `facing`
 *  onto the character's root and hands `pose` to `character.update`. */

import type { CharacterActivity, CharacterPose, CharacterState } from "./character";

export interface NpcInput {
  now: number; dt: number;            // scene clock ms, s
  ballX: number; ballZ: number;
  ballHeight: number;                 // prototype `by`
  ballSpeed: number;                  // hypot(vel.x, vel.z)
  steering: boolean;                  // a steer key is held OR a click/roll target is pending
  lastInputAt: number;                // scene-clock ms of the last key or click; start at -9999
  onPad: number;                      // -1 or pad index
}

export interface NpcOutput {
  x: number; z: number; facing: number;       // root transform
  pose: CharacterPose;
  kick: { x: number; z: number } | null;      // non-null only on the frame he passes
  /** While he holds the ball: the scene puts it CARRY_Z in front of him
   *  (along facing), "lift" of the way from the ground up to CARRY_Y. It is
   *  null on the frame he lets go; the ball then drops from where it was. */
  carry: { lift: number } | null;
}

export interface Npc {
  step(input: NpcInput): NpcOutput;
  userTookBall(): void;
  /** Wave at the visitor once (the floor just came into view). False if he is
   *  busy with the ball; call again later. */
  greet(now: number): boolean;
}

/* The carried ball's centre, in his root space (world units). */
export const CARRY_Y = 1.7;          // about his waist: arms round it, chin over it
export const CARRY_Z = 0.95;         // in front of him

/* Tuning: the prototype's, except where marked (Faris, Nov 2026: kick less,
   fist pump, a kick OR a pickleball forehand, lined up so the ball goes where
   he faces, and idle activities instead of one bouncy idle). */
const START_X = -3.5, START_Z = -3.5;
const FIRST_IDLE_MS = 6500;          // until = now + 6500
const FIRST_COOL_MS = 12000;         // first pass at ~12 s (was 8500)
const INPUT_GUARD_MS = 3000;         // no key/click for 3 s
const IDLE_BALL_SPEED = 1.5;         // ball nearly stopped
const KICK_MAX_HEIGHT = 0.4;         // by < 0.4
const KICK_REACH_OFF_PAD = 9;        // chase only if the ball is within 9
const PAD_WAIT_MS = 6000;            // he lets a pad glow 6 s before kicking off it
const RUN_SPEED = 6.2;
const WALK_SPEED = 2.3;
const KICK_SETUP = 1.15;             // he plants this far behind the ball, facing where it will go
const STRIKE_TIME = 0.55;            // s, wind-up + strike (the clip's 0.32-0.87 s)
const STRIKE_CONTACT = 0.45;         // fraction of the strike at which the foot meets the ball
const ARRIVE = 0.3;                  // close enough to the set-up spot
const CLEAR = 1.25;                  // he goes round the ball rather than through it
const AIM_PAD_OFF_PAD = 0.65;        // chance to aim at a pad when the ball is off one
const AIM_PAD_ON_PAD = 0.5;          // ... and when it is sitting on one
const CENTRE = { x: 0, z: 2.5 };     // BALL_START in content.ts
const KICK_COOL_MS = 45000;          // at most one pass every 45 s (was 5200)
const AFTER_KICK_IDLE_MS = 1200;
const PAD_SIDE_SCALE = 0.72;         // stand at (p.x * 0.72, p.z * 0.72 - 0.6)
const PAD_SIDE_BACK = 0.6;
const PAD_ARRIVE = 0.5;
const CHEER_MS = 1900;               // the fist pump clip (was a 2.6 s cheer)
const LEAVE_PAD_IDLE_MS = 800;
const WANDER_SPREAD = 7;             // ball.x ± 7
const WANDER_X_LIMIT = 14;
const WANDER_Z_MIN = -13, WANDER_Z_MAX = 6;
const WANDER_ARRIVE = 0.4;
const WANDER_IDLE_MS = 1400, WANDER_IDLE_RAND_MS = 2600;
const HIT_CHANCE = 0.5;              // after the first pass: forehand instead of kick
const HIT_DIST = 1.7;                // he swings from paddle reach, not kicking range
const SWING_TIME = 0.55;             // s, the whole forehand
const SWING_CONTACT = 0.55;          // fraction of the swing at which the paddle meets the ball
/* Carry (Faris, Nov 2026: "I want me to pick up the ball and carry it"):
   instead of passing, he sometimes squats, picks the ball up, walks it to a
   pad and sets it down there. Any key or click makes him drop it. */
const CARRY_CHANCE = 0.3;            // after the first pass; the rest split kick / forehand
const PICK_TIME = 1.4;               // s, squat, grab, stand up with it
const PUT_TIME = 1.2;                // s, squat, set it down, stand up
const PUT_RELEASE = 0.6;             // fraction of PUT_TIME at which the ball is on the ground and let go
const WAVE_MS = 2200;                // the hello when the floor comes into view
/* Idle activities: on arriving somewhere he sometimes does one of these, for
   about the clip's length, facing the camera. */
const ACTIVITY_CHANCE = 0.55;
const ACTIVITIES: readonly (readonly [CharacterActivity, number])[] = [
  ["weightshift", 8000], ["lookaround", 6300], ["stretch", 8800],
  ["texting", 8000], ["juggle", 4000],   // "thinking" cut (Faris: "very zesty")
];
const VEL_SMOOTH = 7;                // min(1, dt * 7)
const FACE_MOVING = 0.5;             // face travel direction above this speed
const FACE_CAMERA = 0.35;            // rad, while cheering or watching
const TURN_RATE = 9;                 // min(1, dt * 9)

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const smooth = (a: number, b: number, v: number): number => {
  const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u);
};

export function createNpc(
  pads: readonly { x: number; z: number }[],
  now: number,
  rng: () => number = Math.random,
  /** Dev only (scene.ts ?first=carry|hit): what the first pass is, for screenshots. */
  firstMode?: "carry" | "hit",
): Npc {
  let state: CharacterState = "idle";
  let until = now + FIRST_IDLE_MS;
  let cool = now + FIRST_COOL_MS;
  let x = START_X, z = START_Z;
  let tx = START_X, tz = START_Z;
  let face = 0;
  let vx = 0, vz = 0;
  let pad = -1, padSince = 0;
  let passed = false;
  let cheerUntil = 0;
  let firstPass = true;                // the first pass always lands on a pad, so the card demo shows
  let hitMode: boolean | null = null;  // this pass: forehand (true) or kick (false); chosen when the chase starts
  let swingT = -1;                     // s into the forehand, -1 when not swinging
  let strikeT = -1;                    // s into the kick, -1 when not kicking
  let passDest: { x: number; z: number } | null = null;  // chosen when the chase starts
  let passFace = 0;
  let activity: CharacterActivity | null = "juggle";     // he greets the page juggling
  let carryMode = false;               // this pass is a carry (chosen with hitMode)
  let pickT = -1, putT = -1;           // s into the pick-up / set-down, -1 when not
  let carrying = false;                // the ball is in his hands, walking it to passDest
  let carryFrom = Infinity;            // scene ms the ball left the ground (input after this drops it)
  let carryFace = 0;
  let waveUntil = 0;

  function wanderTo(ballX: number, ballZ: number): void {
    tx = clamp(ballX + (rng() * WANDER_SPREAD * 2 - WANDER_SPREAD), -WANDER_X_LIMIT, WANDER_X_LIMIT);
    tz = clamp(ballZ - 2 - rng() * 6, WANDER_Z_MIN, WANDER_Z_MAX);
    state = "walk";
  }

  function step(input: NpcInput): NpcOutput {
    const { now: t, dt, ballX, ballZ, onPad } = input;
    const bx = ballX - x, bz = ballZ - z, bd = Math.hypot(bx, bz);
    let goal = 0, gx = 0, gz = 0;
    let kick: { x: number; z: number } | null = null;

    /* He only touches the ball when the visitor has left it alone, so he
       never fights them for it. */
    const idleBall = !input.steering && input.ballSpeed < IDLE_BALL_SPEED && t - input.lastInputAt > INPUT_GUARD_MS;
    if (onPad !== pad) { pad = onPad; padSince = t; }
    const mayKick = t > cool && input.ballHeight < KICK_MAX_HEIGHT && idleBall &&
      (onPad < 0 ? bd < KICK_REACH_OFF_PAD : (passed && t - padSince > PAD_WAIT_MS));

    /* Pass it onto a pad, or back to the middle. */
    const pickDest = (): { x: number; z: number } => {
      let dest: { x: number; z: number } = CENTRE;
      if ((firstPass || rng() < (onPad >= 0 ? AIM_PAD_ON_PAD : AIM_PAD_OFF_PAD)) && pads.length > (onPad >= 0 ? 1 : 0)) {
        let pick: number;
        do { pick = Math.floor(rng() * pads.length); } while (pick === onPad);
        dest = pads[pick];
      }
      return dest;
    };
    const pickPad = (): { x: number; z: number } => {
      if (pads.length < (onPad >= 0 ? 2 : 1)) return CENTRE;
      let pick: number;
      do { pick = Math.floor(rng() * pads.length); } while (pick === onPad);
      return pads[pick];
    };
    const passDone = (): void => {
      firstPass = false; passed = true; hitMode = null; passDest = null; carryMode = false;
      pickT = -1; putT = -1; carrying = false; carryFrom = Infinity;
      cool = t + KICK_COOL_MS; state = "idle"; until = t + AFTER_KICK_IDLE_MS; goal = 0;
    };
    if (state !== "idle") activity = null;
    let lift = -1;                       // >= 0 while the ball is in his hands
    let crouch = 0, hold = 0;
    const ballInHands = pickT >= 0 || carrying || putT >= 0;
    if (ballInHands && (input.steering || input.lastInputAt > carryFrom)) {
      /* The visitor wants it back: let go on the spot (the scene drops it). */
      passDone(); passed = false; until = t + AFTER_KICK_IDLE_MS;
    } else if (pickT >= 0) {
      /* Squat, hands to its sides, stand up with it. */
      pickT += dt;
      const u = pickT / PICK_TIME;
      crouch = smooth(0, 0.42, u) * (1 - smooth(0.55, 1, u));
      hold = smooth(0.1, 0.45, u);
      lift = smooth(0.55, 1, u);
      state = "pickup"; passFace = carryFace;
      if (u >= 0.55 && carryFrom === Infinity) carryFrom = t;
      if (pickT >= PICK_TIME) { pickT = -1; carrying = true; }
    } else if (carrying) {
      /* Walk it over and stop with the ball above the pad's centre. */
      const dest = passDest!;
      let dx = dest.x - x, dz = dest.z - z;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      gx = dest.x - dx * CARRY_Z - x; gz = dest.z - dz * CARRY_Z - z;
      state = "carry"; goal = WALK_SPEED; lift = 1; hold = 1;
      if (Math.hypot(gx, gz) < ARRIVE) {
        goal = 0; vx *= 0.5; vz *= 0.5; carrying = false; putT = 0; passFace = Math.atan2(dx, dz);
      }
    } else if (putT >= 0) {
      /* Squat, set it down on the pad, let go, stand up. */
      putT += dt;
      const u = putT / PUT_TIME;
      crouch = smooth(0, 0.5, u) * (1 - smooth(PUT_RELEASE, 1, u));
      lift = u >= PUT_RELEASE ? -1 : 1 - smooth(0, 0.5, u);
      hold = 1 - smooth(PUT_RELEASE, 0.85, u);
      state = "putdown";
      if (putT >= PUT_TIME) passDone();
    } else if (waveUntil > t) {
      state = "wave";
    } else if (swingT >= 0 || strikeT >= 0) {
      /* Mid-forehand or mid-kick: planted, facing the target; the ball leaves at contact. */
      const forehand = swingT >= 0;
      const len = forehand ? SWING_TIME : STRIKE_TIME;
      const at = len * (forehand ? SWING_CONTACT : STRIKE_CONTACT);
      const before = forehand ? swingT : strikeT;
      const after = before + dt;
      if (forehand) swingT = after; else strikeT = after;
      state = forehand ? "swing" : "kick";
      if (before < at && after >= at && passDest) kick = { ...passDest };
      if (after >= len) { swingT = -1; strikeT = -1; passDone(); }
    } else if (mayKick) {
      if (hitMode === null) {
        carryMode = firstPass ? firstMode === "carry" : rng() < CARRY_CHANCE;
        hitMode = firstPass ? firstMode === "hit" : !carryMode && rng() < HIT_CHANCE;
        passDest = carryMode ? pickPad() : pickDest();
        if (carryMode) carryFace = Math.atan2(bx, bz);   // walk straight up to it
      }
      const dest = passDest!;
      // Line up so the ball goes the way he faces: behind it for a kick; for a
      // forehand, beside it with the ball at his front-right.
      let dx = dest.x - ballX, dz = dest.z - ballZ;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      passFace = Math.atan2(dx, dz);
      let sx: number, sz: number;
      if (carryMode) {
        passFace = carryFace;
        sx = ballX - Math.sin(carryFace) * CARRY_Z; sz = ballZ - Math.cos(carryFace) * CARRY_Z;
      } else if (hitMode) {
        const rx = -dz, rz = dx;                   // his right (local -X) when facing (dx, dz)
        sx = ballX - HIT_DIST * (dx + rx) * Math.SQRT1_2;
        sz = ballZ - HIT_DIST * (dz + rz) * Math.SQRT1_2;
      } else {
        sx = ballX - dx * KICK_SETUP; sz = ballZ - dz * KICK_SETUP;
      }
      state = "chase"; goal = RUN_SPEED;
      // Go round the ball if the straight line to the spot would cross it.
      const ex = sx - x, ez = sz - z, el = Math.hypot(ex, ez) || 1;
      const tc = clamp(((ballX - x) * ex + (ballZ - z) * ez) / (el * el), 0, 1);
      const cd = Math.hypot(x + ex * tc - ballX, z + ez * tc - ballZ);
      if (cd < CLEAR && tc > 0 && tc < 1) {
        const side = Math.sign(bx * ez - bz * ex) || 1;   // stay on the side he is already on
        gx = ballX - side * (ez / el) * (CLEAR + 0.3) - x;
        gz = ballZ + side * (ex / el) * (CLEAR + 0.3) - z;
      } else { gx = ex; gz = ez; }
      if (el < ARRIVE) {
        goal = 0; vx *= 0.5; vz *= 0.5;
        if (carryMode) { pickT = 0; state = "pickup"; }
        else if (hitMode) { swingT = 0; state = "swing"; } else { strikeT = 0; state = "kick"; }
      }
    } else if (onPad >= 0) {
      /* Stand beside the lit pad; cheer for a few seconds, then just watch. */
      const p = pads[onPad];
      const ox = p.x * PAD_SIDE_SCALE, oz = p.z * PAD_SIDE_SCALE - PAD_SIDE_BACK;
      if (Math.hypot(ox - x, oz - z) > PAD_ARRIVE) {
        state = "run"; gx = ox - x; gz = oz - z; goal = RUN_SPEED; cheerUntil = t + CHEER_MS;
      } else state = t < cheerUntil ? "cheer" : "watch";
    } else if (state === "cheer" || state === "watch" || state === "chase" || state === "run" || state === "swing" || state === "kick" ||
      state === "wave" || state === "pickup" || state === "carry" || state === "putdown") {
      hitMode = null; passDest = null;
      state = "idle"; until = t + LEAVE_PAD_IDLE_MS;
    } else if (state === "walk") {
      gx = tx - x; gz = tz - z;
      if (Math.hypot(gx, gz) < WANDER_ARRIVE) {
        state = "idle"; until = t + WANDER_IDLE_MS + rng() * WANDER_IDLE_RAND_MS;
        if (rng() < ACTIVITY_CHANCE) {
          const [name, ms] = ACTIVITIES[Math.floor(rng() * ACTIVITIES.length)]!;
          activity = name; until = t + ms;
        }
      } else goal = WALK_SPEED;
    } else if (state === "idle" && t > until) { activity = null; wanderTo(ballX, ballZ); }

    const gl = Math.hypot(gx, gz);
    let wx = 0, wz = 0;
    if (goal > 0 && gl > 0.001) { wx = gx / gl * goal; wz = gz / gl * goal; }
    const k = Math.min(1, dt * VEL_SMOOTH);
    vx += (wx - vx) * k; vz += (wz - vz) * k;
    x += vx * dt; z += vz * dt;
    const speed = Math.hypot(vx, vz);

    /* Face where he is going; when kicking or swinging, face where the ball
       will go; when standing, watch the ball; when cheering, watching a pad or
       busy with an activity, face the camera. */
    const paddling = swingT >= 0 || (state === "chase" && hitMode === true);
    const want = swingT >= 0 || strikeT >= 0 || pickT >= 0 || putT >= 0 ? passFace
      : speed > FACE_MOVING ? Math.atan2(vx, vz)
      : carrying ? face
      : (state === "cheer" || state === "watch" || state === "wave" || activity ? FACE_CAMERA : Math.atan2(bx, bz));
    face += Math.atan2(Math.sin(want - face), Math.cos(want - face)) * Math.min(1, dt * TURN_RATE);


    return {
      x, z, facing: face,
      pose: { state, speed, kick: strikeT >= 0 ? strikeT / STRIKE_TIME : 0, paddling,
        swing: swingT >= 0 ? swingT / SWING_TIME : 0, activity,
        crouch, hold, lift: Math.max(0, lift),
        wave: waveUntil > t ? 1 - (waveUntil - t) / WAVE_MS : 0 },
      kick,
      carry: lift >= 0 ? { lift } : null,
    };
  }

  return {
    step,
    /** A key or click steer: he no longer owns the pass that put the ball on a pad. */
    userTookBall(): void { passed = false; },
    greet(t: number): boolean {
      const busy = hitMode !== null || swingT >= 0 || strikeT >= 0 || pickT >= 0 || carrying || putT >= 0 ||
        state === "cheer" || state === "run" || state === "chase";
      if (busy) return false;
      waveUntil = t + WAVE_MS; state = "wave"; activity = null;
      return true;
    },
  };
}
