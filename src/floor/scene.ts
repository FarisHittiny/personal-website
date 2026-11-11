/** The three.js floor: world, pads, ball, input, camera, loop.
 *  T1 stub: renders nothing; rollTo(i) reports the pad straight away.
 *  T5 ports the prototype onto three r169. This module (and character.ts
 *  through it) is the only path to three.js; index.ts imports it lazily. */

export interface SceneOptions {
  host: HTMLElement; canvas: HTMLCanvasElement; reducedMotion: boolean;
  onPadChange(index: number): void;           // called only when the value changes; -1 = none
}

export interface FloorScene { rollTo(index: number): void; dispose(): void }

/** Throws if the renderer cannot be created. */
export function startScene(opts: SceneOptions): FloorScene {
  let current = -1;
  return {
    rollTo(index: number): void {
      if (index === current) return;
      current = index;
      opts.onPadChange(index);
    },
    dispose(): void {},
  };
}
