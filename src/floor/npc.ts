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

import type { CharacterPose, CharacterState } from "./character";

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
}

export interface Npc { step(input: NpcInput): NpcOutput; userTookBall(): void }

/* Tuning: the prototype's, except where marked (Faris, Nov 2026: kick less, fist pump). */
const START_X = -3.5, START_Z = -3.5;
const FIRST_IDLE_MS = 6500;          // until = now + 6500
const FIRST_PADDLE_MS = 6300;        // paddleUntil = now + 6300
const FIRST_COOL_MS = 12000;         // first pass at ~12 s (was 8500)
const INPUT_GUARD_MS = 3000;         // no key/click for 3 s
const IDLE_BALL_SPEED = 1.5;         // ball nearly stopped
const KICK_MAX_HEIGHT = 0.4;         // by < 0.4
const KICK_REACH_OFF_PAD = 9;        // chase only if the ball is within 9
const PAD_WAIT_MS = 6000;            // he lets a pad glow 6 s before kicking off it
const RUN_SPEED = 6.2;
const WALK_SPEED = 2.3;
const KICK_DIST = 0.95;
const AIM_PAD_OFF_PAD = 0.65;        // chance to aim at a pad when the ball is off one
const AIM_PAD_ON_PAD = 0.5;          // ... and when it is sitting on one
const CENTRE = { x: 0, z: 2.5 };     // BALL_START in content.ts
const KICK_TIME = 0.3;               // s
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
const PADDLE_CHANCE = 0.4;
const PADDLE_MS = 4200, PADDLE_IDLE_MS = 4400;
const VEL_SMOOTH = 7;                // min(1, dt * 7)
const FACE_MOVING = 0.5;             // face travel direction above this speed
const FACE_CAMERA = 0.35;            // rad, while paddling, cheering or watching
const TURN_RATE = 9;                 // min(1, dt * 9)
const PADDLE_MAX_SPEED = 0.4;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function createNpc(
  pads: readonly { x: number; z: number }[],
  now: number,
  rng: () => number = Math.random,
): Npc {
  let state: CharacterState = "idle";
  let until = now + FIRST_IDLE_MS;
  let paddleUntil = now + FIRST_PADDLE_MS;
  let cool = now + FIRST_COOL_MS;
  let x = START_X, z = START_Z;
  let tx = START_X, tz = START_Z;
  let face = 0;
  let kickT = 0;
  let vx = 0, vz = 0;
  let pad = -1, padSince = 0;
  let passed = false;
  let cheerUntil = 0;
  let firstPass = true;                // the first pass always lands on a pad, so the card demo shows

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

    if (mayKick) {
      state = "chase"; gx = bx; gz = bz; goal = RUN_SPEED;
      if (bd < KICK_DIST) {
        /* Pass it onto a pad, or back to the middle. */
        let dest: { x: number; z: number } = CENTRE;
        if ((firstPass || rng() < (onPad >= 0 ? AIM_PAD_ON_PAD : AIM_PAD_OFF_PAD)) && pads.length > (onPad >= 0 ? 1 : 0)) {
          let pick: number;
          do { pick = Math.floor(rng() * pads.length); } while (pick === onPad);
          dest = pads[pick];
        }
        kick = { x: dest.x, z: dest.z };
        firstPass = false;
        passed = true;
        kickT = KICK_TIME; cool = t + KICK_COOL_MS; state = "idle"; until = t + AFTER_KICK_IDLE_MS; goal = 0;
      }
    } else if (onPad >= 0) {
      /* Stand beside the lit pad; cheer for a few seconds, then just watch. */
      const p = pads[onPad];
      const ox = p.x * PAD_SIDE_SCALE, oz = p.z * PAD_SIDE_SCALE - PAD_SIDE_BACK;
      if (Math.hypot(ox - x, oz - z) > PAD_ARRIVE) {
        state = "run"; gx = ox - x; gz = oz - z; goal = RUN_SPEED; cheerUntil = t + CHEER_MS;
      } else state = t < cheerUntil ? "cheer" : "watch";
    } else if (state === "cheer" || state === "watch" || state === "chase" || state === "run") {
      state = "idle"; until = t + LEAVE_PAD_IDLE_MS;
    } else if (state === "walk") {
      gx = tx - x; gz = tz - z;
      if (Math.hypot(gx, gz) < WANDER_ARRIVE) {
        state = "idle"; until = t + WANDER_IDLE_MS + rng() * WANDER_IDLE_RAND_MS;
        if (rng() < PADDLE_CHANCE) { paddleUntil = t + PADDLE_MS; until = t + PADDLE_IDLE_MS; }
      } else goal = WALK_SPEED;
    } else if (state === "idle" && t > until) wanderTo(ballX, ballZ);

    const gl = Math.hypot(gx, gz);
    let wx = 0, wz = 0;
    if (goal > 0 && gl > 0.001) { wx = gx / gl * goal; wz = gz / gl * goal; }
    const k = Math.min(1, dt * VEL_SMOOTH);
    vx += (wx - vx) * k; vz += (wz - vz) * k;
    x += vx * dt; z += vz * dt;
    const speed = Math.hypot(vx, vz);

    /* Face where he is going; when standing, watch the ball; when paddling
       or cheering, face the camera. */
    const paddling = state === "idle" && t < paddleUntil && speed < PADDLE_MAX_SPEED;
    const want = speed > FACE_MOVING ? Math.atan2(vx, vz)
      : (paddling || state === "cheer" || state === "watch" ? FACE_CAMERA : Math.atan2(bx, bz));
    face += Math.atan2(Math.sin(want - face), Math.cos(want - face)) * Math.min(1, dt * TURN_RATE);

    if (kickT > 0) kickT -= dt;

    return {
      x, z, facing: face,
      pose: { state, speed, kick: kickT > 0 ? 1 - kickT / KICK_TIME : 0, paddling },
      kick,
    };
  }

  return {
    step,
    /** A key or click steer: he no longer owns the pass that put the ball on a pad. */
    userTookBall(): void { passed = false; },
  };
}
