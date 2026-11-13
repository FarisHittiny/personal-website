/** The NPC's body, behind an interface so Phase 2 can swap in a rigged GLB.
 *
 *  The stand-in is the prototype's primitive figure (docs/redesign/prototype.html,
 *  meshes at offsets 35164–37879, animation at 41400–42300). It only reads the
 *  pose the brain (npc.ts) hands it; it makes no decisions. The scene owns
 *  root.position.x/z and root.rotation.y; everything here animates children. */

import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";

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

const SKIN = 0xc98f6a, HAIR = 0x17130f, KIT = 0x6c8cff, SHORTS = 0x161a26, SOCK = 0xf2f3f5;
export const BOOT = 0x0d0e12;
const DARK = new Set([HAIR, SHORTS, BOOT]);
export const BLADE = 0xf2c230, PICKLEBALL = 0xe9f25a, PICKLEBALL_GLOW = 0x8f9a10;
/* r169: emissive intensity ≈ old^2.2 (plan section 2), so the prototype's 0.6 becomes 0.33. */
export const PICKLEBALL_EMISSIVE = 0.33;

/* [x, y, z, radius] for each curl of hair. */
const CURLS: readonly (readonly [number, number, number, number])[] = [
  [0, 2.13, -0.04, 0.26], [-0.16, 2.1, 0.02, 0.15], [0.16, 2.1, 0.02, 0.15], [0, 2.2, 0.08, 0.16],
  [-0.12, 2.02, -0.16, 0.16], [0.12, 2.02, -0.16, 0.16], [0, 1.95, -0.2, 0.15],
];

export function createStandInCharacter(): Character {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const geo = <G extends BufferGeometry>(g: G): G => { geometries.push(g); return g; };
  const own = <M extends Material>(m: M): M => { materials.push(m); return m; };
  /* Dark parts (hair, shorts, boots) are Lambert: under the r169 lights a
   * Standard material's specular term greyed them out next to the prototype,
   * the same reason the ground is Lambert (scene.ts header). */
  const mat = (c: number, r = 0.7): Material => own(DARK.has(c)
    ? new MeshLambertMaterial({ color: c })
    : new MeshStandardMaterial({ color: c, roughness: r }));

  const root = new Group();
  const body = new Group();
  root.add(body);

  const part = (g: BufferGeometry, m: Material, y: number, parent: Object3D = body): Mesh => {
    const mesh = new Mesh(g, m);
    mesh.position.y = y;
    parent.add(mesh);
    return mesh;
  };

  part(geo(new CylinderGeometry(0.33, 0.27, 0.78, 20)), mat(KIT), 1.27);      // torso
  part(geo(new CylinderGeometry(0.28, 0.3, 0.3, 20)), mat(SHORTS), 0.8);     // hips
  part(geo(new CylinderGeometry(0.1, 0.11, 0.12, 12)), mat(SKIN), 1.7);      // neck
  part(geo(new SphereGeometry(0.27, 24, 18)), mat(SKIN), 1.96);              // head
  const hairMat = mat(HAIR, 0.95);
  for (const [hx, hy, hz, hr] of CURLS) {
    part(geo(new SphereGeometry(hr, 14, 10)), hairMat, 0).position.set(hx, hy, hz);
  }

  function limb(x: number, y: number, len: number, rad: number, c1: number, c2: number): Group {
    const pivot = new Group();
    pivot.position.set(x, y, 0);
    part(geo(new CylinderGeometry(rad, rad * 0.85, len, 12)), mat(c1), -len / 2, pivot);
    part(geo(new SphereGeometry(rad * 1.05, 12, 10)), mat(c2), -len, pivot);
    body.add(pivot);
    return pivot;
  }
  const armL = limb(-0.42, 1.6, 0.62, 0.09, KIT, SKIN);
  const armR = limb(0.42, 1.6, 0.62, 0.09, KIT, SKIN);
  const legL = limb(-0.15, 0.72, 0.62, 0.115, SOCK, BOOT);
  const legR = limb(0.15, 0.72, 0.62, 0.115, SOCK, BOOT);

  /* Pickleball paddle and ball, shown only during his paddle routine. */
  const paddle = new Group();
  part(geo(new CylinderGeometry(0.035, 0.035, 0.2, 8)), mat(BOOT), -0.1, paddle);   // grip
  part(geo(new BoxGeometry(0.34, 0.42, 0.035)), mat(BLADE, 0.5), -0.4, paddle);     // blade
  paddle.position.y = -0.62;
  paddle.visible = false;
  armR.add(paddle);
  const pball = part(geo(new SphereGeometry(0.075, 14, 10)), own(new MeshStandardMaterial({
    color: PICKLEBALL, emissive: PICKLEBALL_GLOW, emissiveIntensity: PICKLEBALL_EMISSIVE, roughness: 0.5,
  })), 0);
  pball.visible = false;

  const shadow = part(geo(new CircleGeometry(0.55, 24)),
    own(new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })), 0.02, root);
  shadow.rotation.x = -Math.PI / 2;

  root.scale.setScalar(1.2);

  let phase = 0;

  function update(pose: CharacterPose, now: number, dt: number): void {
    const sp = pose.speed, run = Math.min(1, sp / 5.5);
    phase += sp * dt * 2.3;
    const sw = Math.sin(phase) * 0.95 * run;
    legL.rotation.x = sw; legR.rotation.x = -sw;
    armL.rotation.x = -sw * 0.8; armR.rotation.x = sw * 0.8;
    armL.rotation.z = 0; armR.rotation.z = 0;
    let hop = 0;

    paddle.visible = pball.visible = pose.paddling;
    if (pose.paddling) {
      const bnc = Math.abs(Math.sin(now / 1000 * 5.4));
      armR.rotation.x = -1.35 + (1 - bnc) * 0.14;
      pball.position.set(0.42, 1.52 + bnc * 0.6, 0.86);
    }
    if (pose.state === "cheer") {
      const c = now / 140;
      hop = Math.abs(Math.sin(c)) * 0.28;
      armL.rotation.x = Math.PI + Math.sin(c * 2) * 0.25;
      armR.rotation.x = Math.PI - Math.sin(c * 2) * 0.25;
      armL.rotation.z = 0.25; armR.rotation.z = -0.25;
    }
    if (pose.kick > 0) legR.rotation.x = -1.3 * Math.sin(Math.PI * pose.kick);

    body.position.y = hop + Math.abs(Math.sin(phase)) * 0.07 * run + (run < 0.05 && !hop ? Math.sin(now / 600) * 0.012 : 0);
    body.rotation.x = 0.16 * run;
  }

  return {
    root,
    update,
    dispose(): void {
      root.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
