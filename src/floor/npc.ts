/** The NPC's decisions: pure logic, no three.js import, no DOM.
 *  T1 stub: stands idle at (-3.5, -3.5) facing the ball. T6 ports the
 *  prototype's state machine. */

import type { CharacterPose } from "./character";

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

export function createNpc(
  _pads: readonly { x: number; z: number }[],
  _now: number,
  _rng: () => number = Math.random,
): Npc {
  const x = -3.5;
  const z = -3.5;
  return {
    step(input: NpcInput): NpcOutput {
      return {
        x,
        z,
        facing: Math.atan2(input.ballX - x, input.ballZ - z),
        pose: { state: "idle", speed: 0, kick: 0, paddling: false },
        kick: null,
      };
    },
    userTookBall(): void {},
  };
}
