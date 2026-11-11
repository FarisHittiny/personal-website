/** Particle number field: a typed port of the prototype's makeParticles().
 *  A Fibonacci sphere of points that scatters and re-forms into each text in
 *  `texts`, drawn with raw WebGL 1 (no three.js). Returns null when WebGL,
 *  shader compile or program link fails, so the page keeps the plain `.big`
 *  number. Every tuning number below is the prototype's. */

export interface ParticleOptions { reduce?: boolean; start?: number; fit?: number; count?: number;
  radius?: number; size?: number; gap?: number; font?: string; color?: [number, number, number] }

export interface ParticleField { show(i: number, hold?: number): void; idle(): void; resize(): void;
  step(now: number): void; setColor(c: [number, number, number]): void; dispose(): void }

const VERT =
  "attribute vec3 p;attribute float sd;uniform vec2 asp;uniform float sz;varying float vA;varying float vS;" +
  "void main(){float sc=1./(1.+p.z*.45);gl_Position=vec4(p.x*sc*asp.x,p.y*sc*asp.y,0.,1.);" +
  "gl_PointSize=sz*sc*(.65+.7*sd);vA=clamp(.85-p.z*.7,.2,1.);vS=sd;}";

const FRAG =
  "precision mediump float;uniform vec3 col;uniform float al;varying float vA;varying float vS;" +
  "void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.05,d)*vA;" +
  "vec3 c=mix(mix(col,vec3(1.),.08),vec3(1.),step(.88,vS)*.8);gl_FragColor=vec4(c,a*al);}";

/** Golden-angle increment for the Fibonacci sphere. */
const GOLDEN = 2.399963;

type GL = WebGLRenderingContext;

function compile(gl: GL, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function makeParticles(
  canvas: HTMLCanvasElement,
  texts: readonly string[],
  opts: ParticleOptions = {},
): ParticleField | null {
  const reduce = !!opts.reduce;
  let col: [number, number, number] = opts.color || [0.424, 0.549, 1];

  /* ---- Context, shaders, program ---- */
  let gl: GL | null = null;
  try {
    gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const g: GL = gl;

  const vs = compile(g, g.VERTEX_SHADER, VERT);
  const fs = compile(g, g.FRAGMENT_SHADER, FRAG);
  const prog = g.createProgram();
  const dropGl = (): null => {
    if (vs) g.deleteShader(vs);
    if (fs) g.deleteShader(fs);
    if (prog) g.deleteProgram(prog);
    return null;
  };
  if (!vs || !fs || !prog) return dropGl();
  g.attachShader(prog, vs);
  g.attachShader(prog, fs);
  g.linkProgram(prog);
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) return dropGl();
  g.useProgram(prog);

  /* ---- Points: Fibonacci sphere, starting scattered at 2.2x ---- */
  const N = opts.count || (window.innerWidth < 900 ? 9000 : 17000);
  const R0 = opts.radius || 0.4;
  let dpr = 1;
  const pos = new Float32Array(N * 3);
  const sph = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  let tgt: Float32Array | null = null;
  let mode: "sphere" | "text" = "sphere";
  let until = 0;
  let next: number | null = null;
  let back = 0;
  const pm = { x: 99, y: 99 };

  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - y * y);
    const ph = i * GOLDEN;
    const R = R0 * (0.93 + Math.random() * 0.14);
    sph[i * 3] = Math.cos(ph) * r * R;
    sph[i * 3 + 1] = y * R;
    sph[i * 3 + 2] = Math.sin(ph) * r * R;
    seed[i] = Math.random();
    pos[i * 3] = sph[i * 3] * 2.2;
    pos[i * 3 + 1] = sph[i * 3 + 1] * 2.2;
    pos[i * 3 + 2] = sph[i * 3 + 2] * 2.2;
  }

  /** Rasterise `txt` on a 900x400 canvas and sample N target points from its ink. */
  function shapeFor(txt: string): Float32Array {
    const W = 900;
    const H = 400;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const out = new Float32Array(N * 3);
    const x = c.getContext("2d", { willReadFrequently: true });
    const pts: number[] = [];
    if (x) {
      let fsz = 300;
      const fam = (opts.font || "Manrope") + ", Arial, sans-serif";
      const fit = opts.fit || 0.78;
      x.font = "700 " + fsz + "px " + fam;
      const w = x.measureText(txt).width;
      fsz = Math.floor(fsz * Math.min(1, (fit * W) / w));
      x.font = "700 " + fsz + "px " + fam;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillStyle = "#fff";
      x.fillText(txt, W / 2, H / 2 + fsz * 0.04);
      const d = x.getImageData(0, 0, W, H).data;
      for (let py = 0; py < H; py += 2)
        for (let px = 0; px < W; px += 2) if (d[(py * W + px) * 4 + 3] > 120) pts.push(px, py);
    }
    const n = pts.length / 2;
    const k = 2 / W;
    for (let q = 0; q < N; q++) {
      const j = n ? Math.floor(Math.random() * n) * 2 : 0;
      out[q * 3] = ((pts[j] || W / 2) + Math.random() * 2 - W / 2) * k;
      out[q * 3 + 1] = -((pts[j + 1] || H / 2) + Math.random() * 2 - H / 2) * k;
      out[q * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    return out;
  }

  const shapes = texts.map(shapeFor);

  /* ---- Buffers, attributes, uniforms, blend ---- */
  const buf = g.createBuffer();
  const sb = g.createBuffer();
  const lp = g.getAttribLocation(prog, "p");
  const ls = g.getAttribLocation(prog, "sd");
  if (!buf || !sb || lp < 0 || ls < 0) {
    if (buf) g.deleteBuffer(buf);
    if (sb) g.deleteBuffer(sb);
    return dropGl();
  }
  g.bindBuffer(g.ARRAY_BUFFER, buf);
  g.bufferData(g.ARRAY_BUFFER, pos, g.DYNAMIC_DRAW);
  g.enableVertexAttribArray(lp);
  g.vertexAttribPointer(lp, 3, g.FLOAT, false, 0, 0);
  g.bindBuffer(g.ARRAY_BUFFER, sb);
  g.bufferData(g.ARRAY_BUFFER, seed, g.STATIC_DRAW);
  g.enableVertexAttribArray(ls);
  g.vertexAttribPointer(ls, 1, g.FLOAT, false, 0, 0);

  const U = {
    asp: g.getUniformLocation(prog, "asp"),
    sz: g.getUniformLocation(prog, "sz"),
    col: g.getUniformLocation(prog, "col"),
    al: g.getUniformLocation(prog, "al"),
  };

  g.enable(g.BLEND);
  g.blendFunc(g.SRC_ALPHA, g.ONE);
  g.clearColor(0, 0, 0, 0);

  /* ---- Pointer repel input ---- */
  const onMove = (e: PointerEvent): void => {
    const b = canvas.getBoundingClientRect();
    pm.x = ((e.clientX - b.left) / b.width - 0.5) * 2;
    pm.y = -((e.clientY - b.top) / b.height - 0.5) * 2 * (b.height / b.width);
  };
  const onLeave = (): void => {
    pm.x = 99;
    pm.y = 99;
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  let disposed = false;

  const api: ParticleField = {
    setColor(c) {
      col = c;
    },

    /** Scatter to the sphere, then form text i. If `hold` is set, return to
     *  the sphere that many ms after forming. */
    show(i, hold) {
      if (reduce) {
        const s = shapes[i];
        if (s) {
          tgt = s;
          pos.set(s);
          mode = "text";
        }
        return;
      }
      mode = "sphere";
      until = performance.now() + (opts.gap || 700);
      next = i;
      back = hold ? until + hold : 0;
    },

    idle() {
      mode = "sphere";
      next = null;
      back = 0;
    },

    resize() {
      if (disposed) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
      g.viewport(0, 0, canvas.width, canvas.height);
    },

    step(now) {
      if (disposed) return;
      const t = now / 1000;
      if (mode === "sphere" && next !== null && now > until) {
        const s = shapes[next];
        next = null;
        if (s) {
          mode = "text";
          tgt = s;
        }
      }
      if (mode === "text" && back && now > back) {
        mode = "sphere";
        back = 0;
      }
      const shape = mode === "text" ? tgt : null;
      const ca = Math.cos(t * 0.5);
      const sa = Math.sin(t * 0.5);
      const k = shape ? 0.075 : 0.05;
      const r = 0.16;
      const rr = r * r;
      const mx = pm.x;
      const my = pm.y;

      if (!reduce) {
        for (let q = 0; q < N; q++) {
          const j = q * 3;
          const sd = seed[q];
          let tx: number;
          let ty: number;
          let tz: number;
          if (shape) {
            tx = shape[j] + Math.sin(t * 1.3 + sd * 40) * 0.0035;
            ty = shape[j + 1] + Math.cos(t * 1.1 + sd * 31) * 0.0035;
            tz = shape[j + 2];
          } else {
            const x = sph[j];
            const z = sph[j + 2];
            tx = x * ca + z * sa;
            ty = sph[j + 1];
            tz = -x * sa + z * ca;
          }
          const dx = pos[j] - mx;
          const dy = pos[j + 1] - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < rr) {
            const d = Math.sqrt(d2) + 0.0001;
            const f = (1 - d / r) * 0.05;
            pos[j] += (dx / d) * f;
            pos[j + 1] += (dy / d) * f;
          }
          const kk = k * (0.55 + sd * 0.9);
          pos[j] += (tx - pos[j]) * kk;
          pos[j + 1] += (ty - pos[j + 1]) * kk;
          pos[j + 2] += (tz - pos[j + 2]) * kk;
        }
      }

      g.bindBuffer(g.ARRAY_BUFFER, buf);
      g.bufferSubData(g.ARRAY_BUFFER, 0, pos);
      const base = (opts.size || 3.1) * dpr * Math.max(0.7, Math.min(1.25, canvas.clientWidth / 640));
      g.uniform2f(U.asp, 1, canvas.width / canvas.height);
      g.uniform3f(U.col, col[0], col[1], col[2]);
      g.clear(g.COLOR_BUFFER_BIT);
      // Pass 1: wide, faint halo. Pass 2: the dots.
      g.uniform1f(U.sz, base * 5);
      g.uniform1f(U.al, 0.045);
      g.drawArrays(g.POINTS, 0, N);
      g.uniform1f(U.sz, base);
      g.uniform1f(U.al, 0.72);
      g.drawArrays(g.POINTS, 0, N);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      g.deleteBuffer(buf);
      g.deleteBuffer(sb);
      g.deleteProgram(prog);
      g.deleteShader(vs);
      g.deleteShader(fs);
    },
  };

  if (reduce && opts.start != null) {
    const s = shapes[opts.start];
    if (s) {
      tgt = s;
      pos.set(s);
      mode = "text";
    }
  }
  api.resize();
  return api;
}
