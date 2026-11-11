/** The NPC's body, behind an interface so Phase 2 can swap in a rigged GLB.
 *  T1 stub: an empty Group that never animates. T6 builds the stand-in. */

import { Group, type Object3D } from "three";

export type CharacterState = "idle" | "walk" | "chase" | "run" | "cheer" | "watch";

export interface CharacterPose {
  state: CharacterState;
  speed: number;      // ground speed, world units/s (0 to about 6.2)
  kick: number;       // 0 = not kicking; otherwise progress 0→1 through the 0.3 s kick
  paddling: boolean;
}

export interface Character {
  root: Object3D;   // the scene sets root.position.x/z and root.rotation.y, nothing else
  update(pose: CharacterPose, now: number, dt: number): void;  // now = scene clock in ms, dt in s
  dispose(): void;
}

export function createStandInCharacter(): Character {
  const root = new Group();
  return {
    root,
    update(_pose: CharacterPose, _now: number, _dt: number): void {},
    dispose(): void {
      root.removeFromParent();
    },
  };
}
