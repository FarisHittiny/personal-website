/** The three.js floor: world, pads, ball, input, camera, loop.
 *  Port of the prototype (docs/redesign/prototype.html, r128) onto three r169.
 *  This module (and character.ts through it) is the only path to three.js;
 *  index.ts imports it lazily.
 *
 *  r169 retune (plan section 2). Final values, matched to the prototype at
 *  1440x900 by screenshot and pixel sampling (ground, lamp pool, idle and lit
 *  pads, ball, and cubes in the character's skin/kit/shorts/sock colours):
 *    HemisphereLight(0x9fb2ff, 0x07080c)   0.75            -> 3.0
 *    DirectionalLight(0xffffff) (6,12,9)   0.85            -> 3.5
 *    PointLight(0x6C8CFF) under the ball   (2.4, 18, 2)    -> (45, 18, decay 1.1)
 *    pad disc emissive                     0.08 + g * 0.5  -> 0.004 + g * 0.8
 *    ball core emissive                    0.7             -> 0.42
 *  Ground is MeshLambertMaterial (was MeshStandardMaterial, roughness 0.92,
 *  metalness 0.1). In linear space the sun's specular term outweighs the
 *  diffuse term on an albedo this dark, so a Standard ground went grey at any
 *  sun strength that also lit the character like the prototype. Lambert has no
 *  specular, and with it one set of lights matches both ground and character.
 *  The pad glow factor was measured: x0.30 rendered a lit pad at about half
 *  the prototype's brightness.
 *  Unlit colours (background, fog, grid, rings, beams, stars) are unchanged.
 *  Every physics, camera and input number is the prototype's. */

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WireframeGeometry,
} from "three";
import { BALL_START, HEADLINES } from "../content";
import { createStandInCharacter } from "./character";
import { createNpc } from "./npc";

export interface SceneOptions {
  host: HTMLElement; canvas: HTMLCanvasElement; reducedMotion: boolean;
  onPadChange(index: number): void;           // called only when the value changes; -1 = none
}

export interface FloorScene { rollTo(index: number): void; dispose(): void }

/* ---- tuned for r169 (see header) ---- */
const HEMI_INTENSITY = 3.0;
const SUN_INTENSITY = 3.5;
const LAMP_INTENSITY = 45;
const LAMP_DECAY = 1.1;
const DISC_EMISSIVE_BASE = 0.004;
const DISC_EMISSIVE_GLOW = 0.8;
const CORE_EMISSIVE = 0.42;

/* ---- pad labels ----
 * Which line of the pad label is drawn large. "topic" (Faris's pick): big
 * topic name on top, number smaller underneath. "number" is the prototype
 * (big blue number, small white topic name). The slot sets size, weight,
 * colour and position; this constant only decides which text goes where.
 * The large slot's text shrinks to fit the label width if it has to. */
const LABEL_LARGE: "number" | "topic" = "topic";
const LABEL_W = 512;
const LABEL_H = 256;
const LABEL_FIT = 492; // max text width in px inside the 512 px canvas
const LABEL_SLOTS = {
  large: { weight: 700, size: 120, color: "#6C8CFF", y: 130 },
  small: { weight: 600, size: 44, color: "#F2F3F5", y: 200 },
} as const;

const ACC = 0x6c8cff;
const STAGE = 0x0b0c10;
const R = 0.62;                 // ball radius
const ACCEL = 30;
const FRONT_EDGE = 8;           // ball.z clamp toward the camera
const ARROWDOWN_RELEASE = 7.5;  // from here on ArrowDown scrolls the page

type Dir = "u" | "d" | "l" | "r";
const KEYMAP: Record<string, Dir> = {
  ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d",
  ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r",
};

interface PadObj { g: Group; disc: Mesh<CylinderGeometry, MeshStandardMaterial>;
  ring: Mesh<TorusGeometry, MeshBasicMaterial>; label: HTMLCanvasElement; tex: CanvasTexture; glow: number }

function drawLabel(c: HTMLCanvasElement, num: string, topic: string): void {
  const x = c.getContext("2d");
  if (!x) return;
  x.clearRect(0, 0, LABEL_W, LABEL_H);
  x.textAlign = "center";
  const lines = LABEL_LARGE === "number"
    ? { large: num, small: topic }
    : { large: topic, small: num };
  for (const slot of ["large", "small"] as const) {
    const s = LABEL_SLOTS[slot];
    const text = lines[slot];
    let size: number = s.size;
    x.font = `${s.weight} ${size}px Manrope, Arial, sans-serif`;
    const w = x.measureText(text).width;
    if (w > LABEL_FIT) {
      size = Math.floor((size * LABEL_FIT) / w);
      x.font = `${s.weight} ${size}px Manrope, Arial, sans-serif`;
    }
    x.fillStyle = s.color;
    x.fillText(text, LABEL_W / 2, s.y);
  }
}

/** Throws if the renderer cannot be created. */
export function startScene(opts: SceneOptions): FloorScene {
  const { host, canvas, reducedMotion } = opts;

  // Let a constructor error propagate: index.ts falls back to the static tiles.
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  // touch-action: pan-y on the canvas (so phones can scroll past) is in floor.css.

  const scene = new Scene();
  scene.background = new Color(STAGE);
  scene.fog = new Fog(STAGE, 16, 44);
  const cam = new PerspectiveCamera(48, 1, 0.1, 200);

  scene.add(new HemisphereLight(0x9fb2ff, 0x07080c, HEMI_INTENSITY));
  const sun = new DirectionalLight(0xffffff, SUN_INTENSITY);
  sun.position.set(6, 12, 9);
  scene.add(sun);

  const ground = new Mesh(new PlaneGeometry(140, 140),
    new MeshLambertMaterial({ color: 0x0f121a }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new GridHelper(140, 70, 0x2b3558, 0x182035);
  grid.position.y = 0.01;
  scene.add(grid);

  const sg = new BufferGeometry();
  const sp: number[] = [];
  for (let i = 0; i < 500; i++) {
    sp.push((Math.random() - 0.5) * 160, 8 + Math.random() * 40, (Math.random() - 0.5) * 160 - 20);
  }
  sg.setAttribute("position", new Float32BufferAttribute(sp, 3));
  scene.add(new Points(sg, new PointsMaterial({ color: 0x9fb2ff, size: 0.18, transparent: true, opacity: 0.7 })));

  /* ---- pads ---- */
  const pads = HEADLINES.map((h) => h.pad);
  const padObjs: PadObj[] = HEADLINES.map((h) => {
    const g = new Group();
    g.position.set(h.pad.x, 0, h.pad.z);
    const disc = new Mesh(new CylinderGeometry(2.3, 2.3, 0.08, 56), new MeshStandardMaterial({
      color: 0x151a2a, emissive: ACC, emissiveIntensity: DISC_EMISSIVE_BASE, roughness: 0.6 }));
    disc.position.y = 0.04;
    g.add(disc);
    const ring = new Mesh(new TorusGeometry(2.3, 0.045, 8, 72),
      new MeshBasicMaterial({ color: ACC, transparent: true, opacity: 0.55 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    g.add(ring);
    const beam = new Mesh(new CylinderGeometry(0.03, 0.03, 5, 8),
      new MeshBasicMaterial({ color: ACC, transparent: true, opacity: 0.22 }));
    beam.position.y = 2.5;
    g.add(beam);
    const label = document.createElement("canvas");
    label.width = LABEL_W;
    label.height = LABEL_H;
    drawLabel(label, h.number, h.label);
    const tex = new CanvasTexture(label);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const spr = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(4.4, 2.2, 1); // smaller than the prototype's 5.2: topic-large labels are wider
    spr.position.y = 3.3;
    g.add(spr);
    scene.add(g);
    return { g, disc, ring, label, tex, glow: 0 };
  });
  let disposed = false;
  // Redraw the labels once Manrope is in (the prototype rebuilt the pads).
  if (document.fonts?.load) {
    document.fonts.load("700 100px Manrope").then(() => {
      if (disposed) return;
      padObjs.forEach((o, i) => {
        const h = HEADLINES[i]!;
        drawLabel(o.label, h.number, h.label);
        o.tex.needsUpdate = true;
      });
    }, () => {});
  }

  /* ---- ball and lamp ---- */
  const ball = new Group();
  const core = new Mesh(new SphereGeometry(R, 36, 24), new MeshStandardMaterial({
    color: 0xdfe6ff, emissive: ACC, emissiveIntensity: CORE_EMISSIVE, roughness: 0.3 }));
  const wire = new LineSegments(new WireframeGeometry(new IcosahedronGeometry(R * 1.02, 1)),
    new LineBasicMaterial({ color: STAGE, transparent: true, opacity: 0.55 }));
  ball.add(core, wire);
  ball.position.set(BALL_START.x, R, BALL_START.z);
  scene.add(ball);
  const lamp = new PointLight(ACC, LAMP_INTENSITY, 18, LAMP_DECAY);
  scene.add(lamp);
  let by = 0;
  let bvy = 0;

  /* ---- NPC ---- */
  let clock = 0; // scene clock, ms; advances only while rendering
  const character = createStandInCharacter();
  scene.add(character.root);
  const npc = createNpc(pads, clock);
  let npcX = 0;  // his position after the previous frame's step
  let npcZ = 0;
  let npcSeen = false;

  /* ---- state ---- */
  const vel = new Vector3();
  const axis = new Vector3();
  const camGoal = new Vector3();
  const look = new Vector3();
  const held = new Map<string, Dir>(); // code -> direction
  let target: { x: number; z: number } | null = null;
  let lastInputAt = -9999;
  let visible = true;  // any part on screen
  let active = true;   // more than half on screen
  let narrow = false;
  let shown = -1;

  const tookBall = (): void => {
    lastInputAt = clock;
    npc.userTookBall();
  };
  const isHeld = (d: Dir): boolean => {
    for (const v of held.values()) if (v === d) return true;
    return false;
  };

  /* ---- keyboard ---- */
  const onKeyDown = (e: KeyboardEvent): void => {
    const k = KEYMAP[e.code];
    if (!k || !active || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement) {
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return;
    }
    // At the front edge ArrowDown belongs to the page again (KeyS still steers).
    if (e.code === "ArrowDown" && ball.position.z >= ARROWDOWN_RELEASE) {
      held.delete(e.code);
      return;
    }
    held.set(e.code, k);
    target = null;
    e.preventDefault();
    tookBall();
  };
  const onKeyUp = (e: KeyboardEvent): void => { held.delete(e.code); };
  const onBlur = (): void => { held.clear(); };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  /* ---- click / tap ---- */
  const ray = new Raycaster();
  const ndc = new Vector2();
  const plane = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  const onClick = (e: MouseEvent): void => {
    const b = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    let best: { x: number; z: number } | null = null;
    let bd = 9;
    for (const p of pads) {
      const d = Math.hypot(p.x - hit.x, p.z - hit.z);
      if (d < 3 && d < bd) { bd = d; best = p; }
    }
    target = best ? { x: best.x, z: best.z } : { x: hit.x, z: hit.z };
    tookBall();
  };
  canvas.addEventListener("click", onClick);

  /* ---- size ---- */
  const size = (): void => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    narrow = w < 720;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.fov = narrow ? 62 : 48;
    cam.updateProjectionMatrix();
  };
  size();
  cam.position.set(0, 22, 26);
  const ro = new ResizeObserver(size);
  ro.observe(host);

  /* ---- loop ---- */
  let raf = 0;
  let prev = 0;

  const frame = (now: number): void => {
    raf = 0;
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    clock += dt * 1000;

    let ax = (isHeld("r") ? 1 : 0) - (isHeld("l") ? 1 : 0);
    let az = (isHeld("d") ? 1 : 0) - (isHeld("u") ? 1 : 0);
    if (target) {
      const dx = target.x - ball.position.x;
      const dz = target.z - ball.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) target = null;
      else { const s = Math.min(1, d / 2.5); ax = (dx / d) * s; az = (dz / d) * s; }
    }
    const m = Math.hypot(ax, az);
    if (m > 1) { ax /= m; az /= m; }
    vel.x += ax * ACCEL * dt;
    vel.z += az * ACCEL * dt;
    const damp = Math.exp(-3.4 * dt);
    vel.x *= damp;
    vel.z *= damp;
    ball.position.x += vel.x * dt;
    ball.position.z += vel.z * dt;
    const rr = Math.hypot(ball.position.x, ball.position.z);
    if (rr > 17) { ball.position.x *= 17 / rr; ball.position.z *= 17 / rr; }
    if (ball.position.z > FRONT_EDGE) { ball.position.z = FRONT_EDGE; if (vel.z > 0) vel.z = 0; }
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 0.001) { axis.set(vel.z, 0, -vel.x).normalize(); ball.rotateOnWorldAxis(axis, (speed * dt) / R); }
    bvy -= 18 * dt;
    by += bvy * dt;
    if (by < 0) { by = 0; bvy = bvy < -2 ? -bvy * 0.42 : 0; }
    ball.position.y = R + by;
    lamp.position.set(ball.position.x, 1.8 + by, ball.position.z);

    let on = -1;
    padObjs.forEach((o, i) => {
      const p = pads[i]!;
      const inside = Math.hypot(p.x - ball.position.x, p.z - ball.position.z) < 2.2;
      if (inside) on = i;
      o.glow += ((inside ? 1 : 0) - o.glow) * Math.min(1, dt * 6);
      o.disc.material.emissiveIntensity = DISC_EMISSIVE_BASE + o.glow * DISC_EMISSIVE_GLOW;
      o.ring.material.opacity = 0.55 + o.glow * 0.45;
      o.ring.scale.setScalar(1 + o.glow * 0.06 + Math.sin(clock / 500 + i) * 0.01);
    });
    if (on !== shown) { shown = on; opts.onPadChange(on); }

    const out = npc.step({
      now: clock, dt,
      ballX: ball.position.x, ballZ: ball.position.z,
      ballHeight: by, ballSpeed: Math.hypot(vel.x, vel.z),
      steering: held.size > 0 || target !== null,
      lastInputAt, onPad: on,
    });
    if (out.kick) {
      const kx = out.kick.x - ball.position.x;
      const kz = out.kick.z - ball.position.z;
      const kl = Math.hypot(kx, kz) || 1;
      target = { x: out.kick.x, z: out.kick.z };
      vel.x = (kx / kl) * 7;
      vel.z = (kz / kl) * 7;
      bvy = 4.6;
    }
    // Keep the ball from rolling through him. Like the prototype's stepNpc
    // (px, pz are read before he moves), this uses his position from the
    // previous frame; the brain hands back the position after this step.
    const px = npcSeen ? npcX : out.x;
    const pz = npcSeen ? npcZ : out.z;
    npcX = out.x;
    npcZ = out.z;
    npcSeen = true;
    character.root.position.x = out.x;
    character.root.position.z = out.z;
    character.root.rotation.y = out.facing;
    character.update(out.pose, clock, dt);
    const bx = ball.position.x - px;
    const bz = ball.position.z - pz;
    const bd = Math.hypot(bx, bz);
    if (bd < R + 0.5 && by < 0.5 && out.pose.state !== "chase") {
      const nx = bd > 0.001 ? bx / bd : 1;
      const nz = bd > 0.001 ? bz / bd : 0;
      ball.position.x = px + nx * (R + 0.5);
      ball.position.z = pz + nz * (R + 0.5);
      const vn = vel.x * nx + vel.z * nz;
      if (vn < 0) { vel.x -= 1.5 * vn * nx; vel.z -= 1.5 * vn * nz; }
    }

    camGoal.set(ball.position.x * 0.85, narrow ? 14 : 9.5, ball.position.z + (narrow ? 19 : 13));
    cam.position.lerp(camGoal, reducedMotion ? 1 : 1 - Math.exp(-3.2 * dt));
    look.set(ball.position.x, 0.6, ball.position.z - (narrow ? 2.5 : 4.5));
    cam.lookAt(look);
    renderer.render(scene, cam);

    if (!disposed) raf = requestAnimationFrame(frame);
  };

  const running = (): boolean => visible && !document.hidden && !disposed;
  const sync = (): void => {
    if (running()) {
      if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const io = new IntersectionObserver((es) => {
    const e = es[es.length - 1]!;
    visible = e.isIntersecting;
    active = e.intersectionRatio > 0.5;
    if (!active) held.clear();
    sync();
  }, { threshold: [0, 0.5, 0.51] });
  io.observe(host);
  const onVisibility = (): void => { if (document.hidden) held.clear(); sync(); };
  document.addEventListener("visibilitychange", onVisibility);
  sync();

  return {
    rollTo(index: number): void {
      const p = pads[index];
      if (!p) return;
      target = { x: p.x, z: p.z };
      tookBall();
      sync();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("click", onClick);
      character.dispose();
      const mats = new Set<Material>();
      const texs = new Set<Texture>();
      scene.traverse((o: Object3D) => {
        const m = o as Partial<Mesh>;
        m.geometry?.dispose();
        const mm = m.material;
        if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => mats.add(x));
      });
      mats.forEach((m) => {
        const map = (m as Partial<SpriteMaterial>).map;
        if (map) texs.add(map);
        m.dispose();
      });
      texs.forEach((t) => t.dispose());
      renderer.dispose();
    },
  };
}
