/** The NPC's body, behind an interface so Phase 2 can swap in a rigged GLB.
 *
 *  The stand-in is the prototype's primitive figure (docs/redesign/prototype.html,
 *  meshes at offsets 35164–37879, animation at 41400–42300). It only reads the
 *  pose the brain (npc.ts) hands it; it makes no decisions. The scene owns
 *  root.position.x/z and root.rotation.y; everything here animates children. */

import {
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";

export type CharacterState = "idle" | "walk" | "chase" | "run" | "kick" | "swing" | "cheer" | "watch";

/** Something he does while standing around (clips in faris.glb; npc.ts picks). */
export type CharacterActivity = "weightshift" | "lookaround" | "stretch" | "thinking" | "texting" | "juggle";

export interface CharacterPose {
  state: CharacterState;
  speed: number;      // ground speed, world units/s (0 to about 6.2)
  kick: number;       // 0 = not kicking; otherwise progress 0→1 through the strike (contact at 0.45)
  paddling: boolean;  // paddle in hand (running in to hit, or swinging)
  swing: number;      // 0 = not swinging; otherwise progress 0→1 through the forehand (contact at 0.55)
  activity: CharacterActivity | null;  // idle activity, if any (the stand-in just stands)
}

export interface Character {
  root: Object3D;   // the scene sets root.position.x/z and root.rotation.y, nothing else
  update(pose: CharacterPose, now: number, dt: number): void;  // now = scene clock in ms, dt in s
  dispose(): void;
}

const SKIN = 0xc98f6a, HAIR = 0x17130f, KIT = 0x6c8cff, SHORTS = 0x161a26, SOCK = 0xf2f3f5;
export const BOOT = 0x0d0e12;
const DARK = new Set([HAIR, SHORTS, BOOT]);

/** A pickleball paddle: rounded composite face with an edge guard, a taped
 *  grip and a butt cap. Local +Y runs from the butt (origin) up the grip to
 *  the top of the face; the face's normal is local +Z. About 0.62 units long. */
export function buildPaddle(
  geo: <G extends BufferGeometry>(g: G) => G,
  own: <M extends Material>(m: M) => M,
): Group {
  const g = new Group();
  const W = 0.29, H = 0.4, Y0 = 0.2, RT = 0.07, RB = 0.035;
  const outline = (w: number, h: number, rt: number, rb: number): Shape => {
    const s = new Shape();
    s.moveTo(-w / 2 + rb, 0);
    s.lineTo(w / 2 - rb, 0);
    s.quadraticCurveTo(w / 2, 0, w / 2, rb);
    s.lineTo(w / 2, h - rt);
    s.quadraticCurveTo(w / 2, h, w / 2 - rt, h);
    s.lineTo(-w / 2 + rt, h);
    s.quadraticCurveTo(-w / 2, h, -w / 2, h - rt);
    s.lineTo(-w / 2, rb);
    s.quadraticCurveTo(-w / 2, 0, -w / 2 + rb, 0);
    return s;
  };
  const face = new Mesh(geo(new ExtrudeGeometry(outline(W, H, RT, RB), {
    depth: 0.018, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10,
  })), own(new MeshStandardMaterial({ color: PADDLE_FACE, roughness: 0.42 })));
  face.position.set(0, Y0, -0.009);
  const guard = new Mesh(geo(new ExtrudeGeometry(outline(W + 0.024, H + 0.02, RT + 0.01, RB + 0.01), {
    depth: 0.012, bevelEnabled: false, curveSegments: 10,
  })), own(new MeshStandardMaterial({ color: PADDLE_EDGE, roughness: 0.6 })));
  guard.position.set(0, Y0 - 0.01, -0.006);
  const grip = new Mesh(geo(new CylinderGeometry(0.027, 0.031, Y0 + 0.02, 14)),
    own(new MeshStandardMaterial({ color: PADDLE_GRIP, roughness: 0.9 })));
  grip.position.y = (Y0 + 0.02) / 2;
  const cap = new Mesh(geo(new CylinderGeometry(0.036, 0.036, 0.018, 14)),
    own(new MeshStandardMaterial({ color: PADDLE_CAP, roughness: 0.5 })));
  cap.position.y = 0.009;
  g.add(guard, face, grip, cap);
  return g;
}
const PADDLE_FACE = 0x6c8cff, PADDLE_EDGE = 0x1b1f2a, PADDLE_GRIP = 0x15171c, PADDLE_CAP = 0xd9dde8;

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

  /* Pickleball paddle, in his right hand when he goes to hit the ball. The
   * arm hangs along -Y, so the paddle is flipped to continue past the hand. */
  const paddle = buildPaddle(geo, own);
  paddle.position.y = -0.56;
  paddle.rotation.x = Math.PI;
  paddle.visible = false;
  armR.add(paddle);

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

    paddle.visible = pose.paddling;
    body.rotation.y = 0;
    if (pose.swing > 0) {
      // Forehand at the big ball (same phases as modelCharacter.ts): turn back,
      // swing through at waist height (contact at 0.55), follow through.
      const u = pose.swing;
      const sweep = u < 0.4 ? -(u / 0.4) : u < 0.72 ? -1 + ((u - 0.4) / 0.32) * 2 : 1 - ((u - 0.72) / 0.28);
      body.rotation.y = sweep * 0.45;
      armR.rotation.x = -1.15;
      armR.rotation.z = sweep * 0.9;
    } else if (pose.paddling) {
      armR.rotation.x = -0.5;          // paddle held ready while he runs in
    }
    if (pose.state === "cheer") {
      // One quick fist pump (the GLB plays Mixamo's "Fist Pump").
      const c = (now % 1900) / 1900;
      armR.rotation.x = -2.2 - Math.max(0, Math.sin(c * Math.PI * 3)) * 0.5;
      armR.rotation.z = -0.15;
    }
    if (pose.kick > 0) legR.rotation.x = -1.3 * Math.sin(Math.PI * pose.kick);

    body.position.y = Math.abs(Math.sin(phase)) * 0.07 * run + (run < 0.05 ? Math.sin(now / 600) * 0.012 : 0);
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
