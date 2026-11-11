/** Particle number field. T1 stub: always returns null, so the page shows
 *  the plain `.big` number. T3 replaces this with the typed port of the
 *  prototype's makeParticles(). */

export interface ParticleOptions { reduce?: boolean; start?: number; fit?: number; count?: number;
  radius?: number; size?: number; gap?: number; font?: string; color?: [number, number, number] }

export interface ParticleField { show(i: number, hold?: number): void; idle(): void; resize(): void;
  step(now: number): void; setColor(c: [number, number, number]): void; dispose(): void }

export function makeParticles(
  _canvas: HTMLCanvasElement,
  _texts: readonly string[],
  _opts?: ParticleOptions,
): ParticleField | null {
  return null;
}
