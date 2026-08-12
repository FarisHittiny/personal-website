/** WebGL hero: a sparse 3D circuit-lattice of points and connecting traces,
 *  slow ambient drift, gentle cursor repulsion. Tree-shaken three imports,
 *  one Points + one LineSegments draw call, no lights, no postprocessing.
 *  Self-demotes (removes itself, leaving the SVG fallback) if the first
 *  60 frames average under 30 fps. */

import {
  BufferAttribute,
  BufferGeometry,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

const COUNT = 240;
const LINK_DIST = 2.1;
const SLAB = { x: 16, y: 9, z: 4 };

// Shared displacement: ambient drift + cursor repulsion, identical for the
// point cloud and the line endpoints so traces stay attached to their nodes.
const DISPLACE = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouse;      // world-space, z=0 plane
  uniform float uMouseOn;
  vec3 displace(vec3 p, vec3 seed) {
    vec3 q = p;
    q.x += sin(uTime * 0.11 + seed.x * 6.28) * 0.22;
    q.y += cos(uTime * 0.13 + seed.y * 6.28) * 0.18;
    q.z += sin(uTime * 0.09 + seed.z * 6.28) * 0.25;
    vec2 d = q.xy - uMouse;
    float r = length(d);
    float push = smoothstep(3.2, 0.0, r) * 0.9 * uMouseOn;
    q.xy += normalize(d + 0.0001) * push;
    return q;
  }
`;

const POINT_VERT = /* glsl */ `
  attribute vec3 aSeed;
  attribute float aGold;
  varying float vGold;
  varying float vDepth;
  ${DISPLACE}
  void main() {
    vGold = aGold;
    vec3 p = displace(position, aSeed);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = clamp((-mv.z - 6.0) / 14.0, 0.0, 1.0);
    gl_PointSize = (aGold > 0.5 ? 4.8 : 2.6) * (14.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAG = /* glsl */ `
  varying float vGold;
  varying float vDepth;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.15, d) * (1.0 - vDepth * 0.85);
    vec3 accent = vec3(0.086, 0.220, 0.435); // --accent  #16386f
    vec3 trace = vec3(0.710, 0.682, 0.600); // --line-1  #b5ae99
    gl_FragColor = vec4(mix(trace, accent, vGold), a * (vGold > 0.5 ? 0.9 : 0.55));
  }
`;

const LINE_VERT = /* glsl */ `
  attribute vec3 aSeed;
  varying float vDepth;
  ${DISPLACE}
  void main() {
    vec3 p = displace(position, aSeed);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = clamp((-mv.z - 6.0) / 14.0, 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const LINE_FRAG = /* glsl */ `
  varying float vDepth;
  void main() {
    // --line-0 #d6d0bf; alpha lifted from 0.3 to hold visibility now that the
    // trace color sits closer to the cream page than the old cool grey did.
    gl_FragColor = vec4(0.839, 0.816, 0.749, 0.45 * (1.0 - vDepth * 0.9));
  }
`;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startHeroScene(el: HTMLElement): void {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 60);
  camera.position.z = 11;

  const rand = mulberry32(0xfa215);
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 3);
  const gold = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (rand() - 0.5) * SLAB.x;
    pos[i * 3 + 1] = (rand() - 0.5) * SLAB.y;
    pos[i * 3 + 2] = (rand() - 0.5) * SLAB.z;
    seed[i * 3] = rand();
    seed[i * 3 + 1] = rand();
    seed[i * 3 + 2] = rand();
    gold[i] = rand() < 0.2 ? 1 : 0;
  }

  const uniforms = {
    uTime: { value: 0 },
    uMouse: { value: [999, 999] },
    uMouseOn: { value: 0 },
  };

  const pGeo = new BufferGeometry();
  pGeo.setAttribute("position", new BufferAttribute(pos, 3));
  pGeo.setAttribute("aSeed", new BufferAttribute(seed, 3));
  pGeo.setAttribute("aGold", new BufferAttribute(gold, 1));
  const pMat = new ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
  });
  scene.add(new Points(pGeo, pMat));

  // Static topology: connect near neighbors once at startup.
  const linkPos: number[] = [];
  const linkSeed: number[] = [];
  for (let i = 0; i < COUNT; i++) {
    for (let j = i + 1; j < COUNT; j++) {
      const dx = pos[i * 3] - pos[j * 3];
      const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
      const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < LINK_DIST * LINK_DIST) {
        for (const k of [i, j]) {
          linkPos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
          linkSeed.push(seed[k * 3], seed[k * 3 + 1], seed[k * 3 + 2]);
        }
      }
    }
  }
  const lGeo = new BufferGeometry();
  lGeo.setAttribute("position", new BufferAttribute(new Float32Array(linkPos), 3));
  lGeo.setAttribute("aSeed", new BufferAttribute(new Float32Array(linkSeed), 3));
  const lMat = new ShaderMaterial({
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
  });
  scene.add(new LineSegments(lGeo, lMat));

  // Pointer → world coords on the z=0 plane.
  const onMove = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const halfW = halfH * camera.aspect;
    uniforms.uMouse.value = [nx * halfW, ny * halfH];
    uniforms.uMouseOn.value = 1;
  };
  const onLeave = () => {
    uniforms.uMouseOn.value = 0;
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  el.addEventListener("pointerleave", onLeave);

  const onResize = () => {
    camera.aspect = el.clientWidth / el.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(el.clientWidth, el.clientHeight);
  };
  window.addEventListener("resize", onResize);

  let running = true;
  let visible = true;
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(el);
  document.addEventListener("visibilitychange", () => {
    visible = document.visibilityState === "visible" && visible;
  });

  // The static SVG fallback sits underneath; fade it out while the live
  // scene runs so its non-moving nodes don't double the lattice.
  const fallbackSvg = el.querySelector<SVGSVGElement>("svg");
  if (fallbackSvg) {
    fallbackSvg.style.transition = "opacity 1.2s ease";
    fallbackSvg.style.opacity = "0";
  }

  const dispose = () => {
    running = false;
    io.disconnect();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("resize", onResize);
    renderer.dispose();
    pGeo.dispose();
    lGeo.dispose();
    pMat.dispose();
    lMat.dispose();
    renderer.domElement.remove();
    if (fallbackSvg) fallbackSvg.style.opacity = "1";
  };

  // Self-demotion probe: average the first 60 frame-to-frame deltas,
  // ignoring gaps over 250 ms (tab switches, jank spikes) so a backgrounded
  // tab can't trigger a false demotion.
  const noDemote = new URLSearchParams(location.search).has("no-demote");
  let probeCount = 0;
  let probeSum = 0;
  let lastFrame = 0;

  const t0 = performance.now();
  const tick = (now: number) => {
    if (!running) return;
    requestAnimationFrame(tick);
    if (!visible) {
      lastFrame = 0;
      return;
    }
    uniforms.uTime.value = (now - t0) / 1000;
    renderer.render(scene, camera);

    if (!noDemote && probeCount < 60) {
      if (lastFrame > 0) {
        const dt = now - lastFrame;
        if (dt < 250) {
          probeSum += dt;
          probeCount++;
          if (probeCount === 60 && 1000 / (probeSum / 60) < 30) {
            dispose(); // fallback SVG is still underneath
            return;
          }
        }
      }
      lastFrame = now;
    }
  };

  el.appendChild(renderer.domElement);
  requestAnimationFrame(tick);
}
