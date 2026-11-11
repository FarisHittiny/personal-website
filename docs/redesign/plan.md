# Phase 1 build plan: floor and record

Branch `redesign/floor-and-record`. Phase 2 (Higgsfield GLB) is out of scope: no task may call a Higgsfield tool or generate anything paid.

Nothing in this plan was built or rendered. The light values in section 2 are calculated starting points, not tested ones.

## 0. How to run this plan

**Order**

| Step | Tasks | Mode |
|---|---|---|
| 1 | T1 Foundation | alone, first |
| 2 | T2 Record, T3 Particles, T4 Floor shell, T5 Scene, T6 Character, T7 Satellite pages and assets | parallel, disjoint files |
| 3 | T8 Integration and verification | alone, last |

T1 leaves typed stubs for every module, so each step-2 task compiles and runs alone.

**File ownership after T1** (only the owner edits the file; T8 owns everything at the end)

| Owner | Files |
|---|---|
| T2 | `index.html`, `src/main.ts`, `src/styles/home.css`, `src/lib/contact.ts` |
| T3 | `src/particles.ts` |
| T4 | `src/floor/index.ts`, `src/styles/floor.css`, `src/lib/capabilities.ts` |
| T5 | `src/floor/scene.ts` |
| T6 | `src/floor/npc.ts`, `src/floor/character.ts` |
| T7 | `catalog-rag/index.html`, `src/catalog-rag.ts`, `src/styles/catalog.css`, `public/404.html`, `public/favicon.svg`, generated icons, `public/og-image.png`, `scripts/make-icons.mjs`, `scripts/make-og.mjs`, `scripts/make-placeholders.mjs`, `scripts/optimize-images.mjs` |
| T8 | `scripts/verify.mjs`, `README.md`, plus fixes anywhere |
| Frozen after T1 | `src/content.ts`, `src/styles/tokens.css`, `src/styles/base.css`, `src/lib/flash.ts`, `package.json` |

- `index.html` is edited by T1, then T2, then T8, and nobody else. T4 needs no markup change, because T1 writes the floor DOM in final form.
- If a step-2 task thinks a frozen file or the floor DOM is wrong, it reports that in its hand-back. T8 makes the change.

**Git rules for every task**
- Never `git push`. Never check out, merge into, or commit on `main`.
- One commit per task, with the message given in the task.
- Stage explicit paths only (`git add <owned files>`), never `git add -A`.
- Parallel tasks should each use a worktree branched from the T1 commit, e.g. `git worktree add ../pw-t3 -b redesign/t3-particles redesign/floor-and-record`, then `npm ci` there. The orchestrator cherry-picks each commit back; ownership is disjoint, so there are no conflicts.
- If tasks share one tree instead, a `tsc` error in a file you do not own is not yours to fix.

**Reading the prototype.** It is a single line, so pointers below are byte offsets plus a function or variable name. Read a region with `tail -c +<offset+1> docs/redesign/prototype.html | head -c <length>`.

| Offset | Content |
|---|---|
| 357–10922 | CSS. Entries at 5005, floor at 7452, `@media 720px` at 10294, `@media 900px` at 10487 |
| 10943 | Floor markup |
| 11928 | `.shell` record. Numbers 12676, about 13603, experience 14332, projects 15961, wins 18324, contact 19379 |
| 20115 | `makeParticles`. `shapeFor` 21996, `api` 24182 |
| 26704 | `TXT`, `HOW`, tabs. `boot` 27867, pointer glow 28281, scroll spy 28492 |
| 29455 | `PADS`. `show(i)` 30751 |
| 31613 | Renderer, scene, lights, ground, grid, stars. `labelTex` 32772, `buildPads` 33225 |
| 34482 | Ball. `lamp` 34969 |
| 35164 | Character meshes: `mat`, `limb` 36300, `paddle` 36983 |
| 37879 | `npc` state. `wanderTo` 38147, `stepNpc` 38362, `mayKick` 38850, `pk` 40995, ball collision 42310 |
| 42793 | `KEYMAP` and key handlers. Click raycast 43336, `size()` 44035, IntersectionObserver 44356, `frame` 44565, camera 46214 |

**Prototype behaviour that must not be ported** (the brief wins)
1. Two `<h1>` elements (floor and sidebar). Only the floor keeps one.
2. `floor.hidden = true` when WebGL is missing. Use the static tiles instead.
3. `requestAnimationFrame` loops that never stop.
4. Google Fonts and the three.js CDN script.
5. `keydown` calling `preventDefault` on ArrowDown unconditionally.
6. A closed card whose links are still tabbable.
7. The Wins pad adding `.flash` to `<section id="wins">`, which no CSS rule matches.
8. `how.innerHTML`.
9. The prototype's Aramco paragraph and `HOW[]` strings, replaced by the brief's text.
10. A RAG card with only a GitHub link.

## 1. Cross-task contracts (T1 creates these; everyone codes against them)

### 1.1 `src/content.ts` (no DOM, no three.js)

```ts
export type HeadlineId = "aramco" | "rag" | "eartags" | "riscv" | "wins";

export interface CardLink { label: string; href: string; external: boolean }

export interface Headline {
  id: HeadlineId;
  number: string;           // text on pad, tile, tab, card, particles
  label: string;            // pad and tile label
  tabLabel: string | null;  // caption under the tab number; null = pad only
  target: string;           // element id that links jump to
  flash: string;            // element id that gets .flash after a jump
  howLead: string;          // bold lead-in in the tab panel
  how: string;              // brief's table text, verbatim; also the card body
  pad: { x: number; z: number };
  card: { kicker: string; title: string; links: CardLink[] };
}

export const BALL_START = { x: 0, z: 2.5 } as const;

export const HEADLINES: readonly Headline[] = [
  { id: "aramco", number: "99.8%", label: "Aramco", tabLabel: "extraction accuracy",
    target: "x-aramco", flash: "x-aramco", howLead: "How it was measured.",
    how: "Measured by validation pipelines on anonymized datasets, against 8+ years of production billing data.",
    pad: { x: -9, z: -1.5 },
    card: { kicker: "Aramco · Summer 2026", title: "AI invoice extraction covering 500+ active corporate lines", links: [] } },
  { id: "rag", number: "0.90", label: "Catalog RAG", tabLabel: "recall@5, from 0.61",
    target: "x-rag", flash: "x-rag", howLead: "How it was measured.",
    how: "Recall@5, up from 0.61 over a BM25 baseline on 129 hand-verified questions. Confirmed on a 14-question held-out set (0.91). The eval runs in CI on every push.",
    pad: { x: -6, z: -7 },
    card: { kicker: "Project", title: "Course catalog RAG with an eval harness", links: [
      { label: "Try the live demo", href: "/catalog-rag/", external: false },
      { label: "Code on GitHub", href: "https://github.com/FarisHittiny/catalog-rag", external: true } ] } },
  { id: "eartags", number: "89.6%", label: "Ear tags", tabLabel: "mAP@0.5",
    target: "x-research", flash: "x-research", howLead: "How it was measured.",
    how: "mAP@0.5. Best of 10+ models benchmarked on continuous field video, at 89.5% precision and 89.7% recall.",
    pad: { x: 0, z: -9.5 },
    card: { kicker: "Texas A&M research", title: "Ear-tag detection in continuous field video", links: [] } },
  { id: "riscv", number: "15.1×", label: "RISC-V", tabLabel: null,
    target: "x-riscv", flash: "x-riscv", howLead: "How it was measured.",
    how: "Fewer cycles than the software baseline on a 4 KB workload, in Verilator simulation. Not silicon.",
    pad: { x: 6, z: -7 },
    card: { kicker: "Hardware", title: "A RISC-V hardware accelerator", links: [
      { label: "Code on GitHub", href: "https://github.com/FarisHittiny/riscv-accel", external: true } ] } },
  { id: "wins", number: "Top 10", label: "Wins", tabLabel: "of 200+ teams",
    target: "wins", flash: "w-tidal", howLead: "What it was.",
    how: "Of 200+ teams at the Tidal Hackathon, October 2024.",
    pad: { x: 9, z: -1.5 },
    card: { kicker: "Wins", title: "Top 10 of 200+ teams, plus a teamwork award", links: [] } },
];

export const TABS: readonly Headline[] = HEADLINES.filter((h) => h.tabLabel !== null);
```

- Array index is the pad index everywhere (`data-pad="0..4"`).
- Three card titles differ from the prototype on purpose; see section 3.

### 1.2 Ids in `index.html`

- **Sections:** `floor`, `record` (the `.shell` wrapper, `tabindex="-1"`), `numbers`, `about`, `experience`, `projects`, `wins`, `off-the-clock`, `contact`.
- **Entries:** `x-aramco`, `x-research`, `x-rag`, `x-pos`, `x-demand`, `x-riscv`.
- **Wins rows (`<li>`):** `w-teamwork`, `w-tidal`, `w-expo`, `w-asa`, `w-aaaea`, `w-vfs`.
- **Numbers block:** `numbers-canvas`, `numbers-big`, `numbers-how`; tab buttons are `button[data-tab="<HeadlineId>"]` with `aria-pressed`.
- **Contact (unchanged, brief rule 5):** `contact-form`, `cf-name`, `cf-email`, `cf-msg`, `cf-company` (`name="_gotcha"`), `form-status`. Also `year`.
- **Scroll-spy nav order:** Numbers, About, Experience, Projects, Wins, Off the clock, Contact.
- **Sync attributes:** any element showing a headline value carries `data-num="<id>"`, `data-label="<id>"` or `data-tab-label="<id>"`. On boot, `main.ts` compares each element's text with `content.ts`, calls `console.error("content drift: …")` on a mismatch, then writes the `content.ts` value. The HTML is the first-paint and no-JS copy, so there is no layout shift, and `verify.mjs` fails on drift because it requires zero console errors.

### 1.3 Floor DOM (written once by T1, final)

```html
<a class="skip-link" href="#record">Skip to the full record</a>   <!-- first focusable element -->
<section class="floor" id="floor" aria-label="Opening screen: five headline numbers">
  <canvas id="floor-canvas" aria-hidden="true" hidden></canvas>
  <div class="floor-top">
    <div><h1>Faris Hittiny</h1><p class="floor-pitch">AI/ML engineer. I build AI systems, then measure whether they work.</p></div>
    <div class="acts"><a class="pill" href="#record">Full record ↓</a><a class="pill" href="mailto:faris@farishittiny.com">Email</a></div>
  </div>
  <nav class="floor-pads" id="floor-pads" aria-label="Headline numbers">
    <ul><li><a href="#x-aramco" data-pad="0"><b data-num="aramco">99.8%</b><span data-label="aramco">Aramco</span></a></li> … five items … </ul>
  </nav>
  <button class="pill" id="floor-enable" type="button" hidden>Turn on the 3D floor</button>
  <p class="hint" id="floor-hint" hidden>…prototype hint text (offset ~11500)…</p>
  <aside class="card" id="floor-card" aria-live="polite">
    <span class="k" id="card-kicker"></span><div class="n" id="card-number"></div>
    <p class="card-title" id="card-title"></p><p id="card-desc"></p>
    <div class="cta"><a id="card-more" href="#record">Full details ↓</a><span id="card-links"></span></div>
  </aside>
</section>
```

- `#floor-pads` is three things at once: the static fallback tiles, the no-JS content, and the screen-reader and keyboard list.
- The card title is a `<p>`, not a heading, so no empty heading exists while the card is closed.
- State classes: `floor--live` on `#floor` while the scene runs; `js` and `has-gl` on `<html>`.

### 1.4 `src/styles/tokens.css`

```css
:root {
  color-scheme: dark;
  --stage: #0B0C10;  --panel: #12141A;  --line: #272B35;
  --ink: #F2F3F5;    --soft: #C8CCD4;   --mute: #9AA1AE;
  --accent: #6C8CFF; --tint: rgba(108,140,255,0.13); --tag: #A9BCFF;
  --glass: rgba(18,20,26,0.9);  --hover: rgba(255,255,255,0.035);
  --glow: rgba(108,140,255,0.11); --flash: rgba(108,140,255,0.16);
  --font: "Manrope", "Helvetica Neue", Arial, sans-serif;
  --gutter: clamp(18px, 5vw, 72px);
  --r-s: 10px; --r-m: 14px; --r-l: 18px; --r-pill: 999px;
}
```

- `--ink` is now text; the old `--ink-0` was a surface. Every old token name must disappear: `--ink-0/1/2`, `--line-0/1`, `--text-*`, `--accent-hi`, `--accent-dim`, `--on-accent`, `--status-*`, `--font-display`, `--font-mono`, `--font-body`, `--sp-*`, `--r-0`, `--container`, `--ease-out`.
- There are no status colours. `.form-status.is-ok` uses `--accent`, `.is-error` uses `--ink` at weight 600, `.is-wait` uses `--mute`.
- The font family name in every `@font-face` must be exactly `"Manrope"`, because canvas code calls `document.fonts.load('700 100px Manrope')`.
- `base.css` (T1) holds the shared primitives: reset, body, the pointer-glow `body::before`, `:focus-visible`, `.skip-link`, `.visually-hidden`, `.pill`, `.btn`, `.label`, `.tags`, `.field`, `.hp`, `.form-status`, and the reduced-motion block.

### 1.5 Character, NPC and scene interfaces

```ts
// src/floor/character.ts  (imports three; reachable only through scene.ts)
export type CharacterState = "idle" | "walk" | "chase" | "run" | "cheer" | "watch";
export interface CharacterPose {
  state: CharacterState;
  speed: number;      // ground speed, world units/s (0 to about 6.2)
  kick: number;       // 0 = not kicking; otherwise progress 0→1 through the 0.3 s kick
  paddling: boolean;
}
export interface Character {
  root: THREE.Object3D;   // the scene sets root.position.x/z and root.rotation.y, nothing else
  update(pose: CharacterPose, now: number, dt: number): void;  // now = scene clock in ms, dt in s
  dispose(): void;
}
export function createStandInCharacter(): Character;

// src/floor/npc.ts  (pure logic: no three import, no DOM)
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
export function createNpc(pads: readonly { x: number; z: number }[], now: number, rng?: () => number): Npc;

// src/floor/scene.ts
export interface SceneOptions {
  host: HTMLElement; canvas: HTMLCanvasElement; reducedMotion: boolean;
  onPadChange(index: number): void;           // called only when the value changes; -1 = none
}
export interface FloorScene { rollTo(index: number): void; dispose(): void }
export function startScene(opts: SceneOptions): FloorScene;   // throws if the renderer cannot be created
```

- **Scene clock.** The scene accumulates `clock += dt * 1000` only while rendering. It passes that as `now` to the NPC and the character, so pausing off screen freezes him instead of skipping his timers.
- **On `out.kick`**, the scene sets `target = dest`, `vel = unit(dest − ball) × 7`, `bvy = 4.6`.
- **On any key or click steer**, the scene calls `npc.userTookBall()` (prototype `npc.passed = false`).
- **Ball-versus-body collision** (offset 42310) lives in `scene.ts`. It uses `out.x`, `out.z` and `out.pose.state !== "chase"`.
- Phase 2 replaces only `createStandInCharacter`.

### 1.6 Lazy import (`src/floor/index.ts`)

```ts
export function mountFloor(): void;   // main.ts calls this with no arguments
// inside:
async function goLive(): Promise<void> {
  try {
    const { startScene } = await import("./scene");   // the only path to three.js
    canvas.hidden = false;
    scene = startScene({ host, canvas, reducedMotion, onPadChange: showCard });
    host.classList.add("floor--live");
  } catch (err) {
    console.warn("3D floor unavailable:", err);        // warn, not error: verify needs zero errors
    canvas.hidden = true; host.classList.remove("floor--live");
  }
}
```

- Trigger `goLive` after `window` `load`, through `requestIdleCallback(cb, { timeout: 1200 })`, falling back to `setTimeout(cb, 200)`.
- Do not wait for first interaction as the old hero did: the NPC has to demo the page unprompted.
- `index.ts` and `npc.ts` may use `import type` from three-dependent modules and nothing more.
- Bundle check after build: `grep -l WebGLRenderer dist/assets/*.js` must list exactly one file, and it must not be the `main-*.js` entry.

### 1.7 Other shared signatures

```ts
// src/lib/flash.ts
export function flash(id: string): void;   // remove .flash, force reflow, add .flash

// src/particles.ts
export interface ParticleOptions { reduce?: boolean; start?: number; fit?: number; count?: number;
  radius?: number; size?: number; gap?: number; font?: string; color?: [number, number, number] }
export interface ParticleField { show(i: number, hold?: number): void; idle(): void; resize(): void;
  step(now: number): void; setColor(c: [number, number, number]): void; dispose(): void }
export function makeParticles(canvas: HTMLCanvasElement, texts: readonly string[], opts?: ParticleOptions): ParticleField | null;
```

## 2. r128 → r169 port guidance (T5 and T6)

**Why a straight port looks wrong.** The prototype renders with no colour management: hex values go straight to the screen and lighting is multiplied in display space. r169 converts colours to linear, lights them with physical units, then encodes to sRGB. Unlit colours (background, fog, grid, ring, beam, stars) come out identical. Everything lit or emissive needs retuning.

**Colour**
- Keep the r169 defaults. Do not touch `ColorManagement` or `outputColorSpace`.
- In `labelTex`, set `tex.colorSpace = THREE.SRGBColorSpace` on the `CanvasTexture`. Without it the labels look washed out.

**Lights** (legacy mode was removed in r165, so there is no switch). The unit conversion alone is ×π. The extra factor compensates for lighting now being summed in linear space.

| Light | Prototype | Start at | Expected range |
|---|---|---|---|
| `HemisphereLight(0x9fb2ff, 0x07080c)` | 0.75 | 3.8 (×5) | 2.4–4.5 |
| `DirectionalLight(0xffffff)` at (6, 12, 9) | 0.85 | 3.5 (×4) | 2.7–4.5 |
| `PointLight(0x6C8CFF)` under the ball | `(2.4, 18, 2)` | intensity 45, distance 18, decay 0.8 | intensity 25–70, decay 0.6–1.0 |

- **Point light.** r128 used `(1 − d/18)^2` falloff. r169 uses `1/d^decay` with a window at `distance`. With decay 2 the pool on the ground shrinks to almost nothing, so lower the decay rather than only raising intensity.
- Tune it until the blue pool around the ball has the same radius and brightness as the prototype.

**Emissive.** New intensity ≈ old^2.2.
- Pad disc: `0.004 + glow × 0.30` (was `0.08 + glow × 0.5`).
- Ball core: `0.46` (was `0.7`).
- Pickleball: `0.33` (was `0.6`).

**Method.** Open `docs/redesign/prototype.html` in a browser beside the build at the same window size. Compare four things: ground under the ball, an idle pad, a lit pad, and the character's shirt and skin. Record the final numbers in a comment at the top of `scene.ts`.

**Other API notes**
- `Fog(color, near, far)` and `GridHelper(size, divisions, c1, c2)` are unchanged. Keep `Fog(0x0B0C10, 16, 44)` and `GridHelper(140, 70, 0x2b3558, 0x182035)`.
- `Geometry` was removed in r125. The prototype already uses only BufferGeometry-based classes, so nothing needs converting.
- r163+ is WebGL2-only. The capability check must test `getContext("webgl2")` only (T4), and `startScene` must let a renderer constructor error propagate. The particle canvas keeps its own raw `webgl` context.
- If the pad labels look dimmer than the prototype at distance, compare with `fog: false` on the `SpriteMaterial` and keep whichever matches.
- Use named imports from `"three"`, not `import * as THREE`, for tree-shaking.
- Dispose geometries, materials, textures and the renderer in `dispose()`.

## 3. Fact-check against `resume/src/Faris_Hittiny_Resume.tex`

Supported by the résumé (use freely): every number in the brief's table except the RISC-V row; the brief's Aramco paragraph; the research entry; the RAG, POS and Demand Mapping entries; all six Wins rows; the four skills rows; May 2027; the GitHub, LinkedIn and email links.

**Not supported: leave out or use the replacement**

| Claim | Where | Action |
|---|---|---|
| "Aramco Next Gen Leaders" as the award's program | Prototype Wins row; old site | Row detail becomes "Aramco, for a 6-person capstone presented to the executive board." |
| "cattle", "livestock" | Prototype pad title and About; old site | Résumé says only "ear-tag detection in continuous field video" in the "Disease Management in Animal Systems" lab. Card title is already neutral in `content.ts`. About says "computer vision research on ear-tag detection in field video". |
| "this fall I built" the RAG system | Prototype About | The résumé gives no date. Write "I also built a course catalog RAG system with its own eval harness." |
| "500+ corporate **phone** lines" | Prototype pad title | Use "500+ active corporate lines" (already in `content.ts`). |
| "I held out 14 to confirm the fix" | Prototype `HOW[1]` | Use the brief's wording: "Confirmed on a 14-question held-out set (0.91)." |
| `C++` tag on RISC-V | Prototype | Appears in no source for this project. Drop it. |
| GroundedSAM, Cloud Run tag, ASP.NET, "Aramco Americas", "Membership Chair", "~1 B/cyc", "0xA0000000" | Current `index.html` | Do not carry over. The employer is "Aramco"; the title is "Membership and Fundraising Chair". |

**Supported by the brief or the current site, but not by the résumé: keep, with a `<!-- TODO: Faris to confirm -->` and a line in the PR**
- **The whole RISC-V project.** The résumé does not mention it. The brief sanctions "15.1× fewer cycles than the software baseline on a 4 KB workload, in Verilator simulation. Not silicon." The words "popcount", "LiteX/VexRiscv SoC", "Zephyr driver" and the repo URL come only from the prototype and the current site. Keep the prototype's entry sentence, with tags `Verilog`, `LiteX/VexRiscv`, `Zephyr RTOS`, `Verilator`.
- **"AI/ML Engineer"** as a standing title. The résumé says "AI/ML Engineering Intern"; the brief mandates the title.
- **"senior"** in About. Not in the résumé; it is in the current site.
- **"an internal telecom expense platform"** and **"Modernized"**. Brief wording; the résumé says "Streamlined carrier invoice processing … in Cellbill Manager".
- **PyTorch and OpenCV tags on the research entry.** They are in the skills rows but not tied to that job.
- **The Off the clock facts.** Faris's own words on the current site.

The résumé also has "projected to save 86 hours/year", "cutting manual work 60%+" and "GPA 3.64". The brief does not ask for them. Do not add them.

## 4. Strings to reuse from the current `index.html`

**Off the clock** (keep the substance; drop the table, the PARAMETER/MODE/NOTES headers, the "Recommended operating conditions…" line and the FIG references)
- Pickleball (line 370): "Always up for a game. Dinks are a legitimate strategy and I will not be argued out of this."
- Pickup soccer (line 375): "I play, and I'm usually the one wrangling the group chat into an actual match."
- Live matches (line 380, FIG references removed): "If there's a game on somewhere nearby, odds are decent I'm in the stands. Highlights: Jordan's first-ever World Cup in Dallas, and meeting Roberto Carlos next to the actual trophy."

**Alt text** (all `loading="lazy" decoding="async"`, `<picture>` with avif, webp, jpg)

| Image | Alt | Size |
|---|---|---|
| `portrait` | "Portrait of Faris Hittiny" | 960×1200 |
| `eartag` | "Presenting eartag-detection research at the 2025 Undergraduate Research Expo" | 960×720 |
| `roberto` | "Faris giving a thumbs-up next to Roberto Carlos and the FIFA World Cup trophy" | 960×720 |
| `jordan` | "Faris and friends in Jordan kits holding a We Are Jordan flag in a packed stadium" | 960×720 |
| `flagday` | "Aramco interns in national-team soccer jerseys at flag day, Faris in a Jordan kit" | 960×720 |
| `awards` | "Faris and three fellow interns holding Certificates of Appreciation in front of an Aramco backdrop" | 960×720 |

- The current `index.html` has no `awards` image. Its last alt text (commit `2427a7b`) was "Faris and three fellow interns holding Certificates of Appreciation at Aramco's NextGen Leaders ceremony". The version above drops the unsupported program name.
- I looked at the `awards` photo. It shows four interns with "Certificate of Appreciation" folders and small trophies. Three other interns' names are legible on the certificates, so flag that to Faris.
- `sitevisit` and `asa` are no longer used. Leave the files alone.

## 5. Tasks

### T1. Foundation and contracts (sequential, first)

**Goal.** New theme, font, content module, final page skeleton and typed stubs. The build is green and the old theme is gone.

**Files**
- **Modify**
  - `package.json`: add `@fontsource-variable/manrope`; remove `@fontsource-variable/fraunces` and `@fontsource/ibm-plex-mono`.
  - `package-lock.json`.
  - `.gitignore`: add `verify-out/`.
  - `index.html`: full rewrite.
  - `src/main.ts`.
  - `src/styles/tokens.css`, `src/styles/base.css`.
  - `src/catalog-rag.ts`: lines 1–15 only. Import `tokens.css`, `base.css`, `catalog.css`; remove the `initReveals` and `initCursor` imports and calls.
- **Create**
  - `public/fonts/manrope-latin-wght-normal.woff2`, copied from `node_modules/@fontsource-variable/manrope/files/`.
  - `src/content.ts` (section 1.1, verbatim).
  - `src/lib/flash.ts`.
  - `src/styles/home.css`: numbers-block rules only.
  - `src/styles/floor.css`: a minimal stub giving `.floor` its size and `#floor-canvas` its absolute fill.
  - Stubs:
    - `src/particles.ts`: returns `null`.
    - `src/floor/character.ts`: the types plus an empty `Group`.
    - `src/floor/npc.ts`: the types; stands idle at (−3.5, −3.5).
    - `src/floor/scene.ts`: no rendering; `rollTo(i)` calls `opts.onPadChange(i)`.
    - `src/floor/index.ts`: does nothing unless the URL has `?floor-dev`, then mounts naively per 1.6 with no gating.
- **Delete**
  - `src/hero/`, `src/diagram/`, `src/lib/cursor.ts`, `src/lib/reveal.ts`.
  - `src/styles/layout.css`, `components.css`, `motion.css`, `diagram.css`.
  - `scripts/diagram-walkthrough.mjs`.
  - `public/fonts/fraunces-*.woff2` and `ibm-plex-mono-*.woff2`.

**`index.html` contents**
- **Head**
  - Title "Faris Hittiny · AI/ML Engineer".
  - Description: "Faris Hittiny, AI/ML engineer and computer engineering student at Texas A&M (May 2027). AI invoice extraction at Aramco measured at 99.8% accuracy, a course catalog RAG system with an eval harness, computer vision research, and a RISC-V accelerator."
  - `og:title` same as the title.
  - `og:description`: "AI invoice extraction at Aramco, a course catalog RAG system with its own eval harness, computer vision research, and a RISC-V accelerator."
  - `theme-color` `#0B0C10`.
  - One preload for the Manrope woff2 (`as="font" type="font/woff2" crossorigin`).
  - Inline `@font-face { font-family:"Manrope"; src:url("/fonts/manrope-latin-wght-normal.woff2") format("woff2-variations"); font-weight:200 800; font-display:swap; }`.
  - Keep the icon links, canonical and `og:image`.
- **Body**
  - Skip link and floor DOM exactly as in 1.3.
  - `<div class="shell" id="record" tabindex="-1">`, with `<header class="side">` and `<main class="main">`.
  - Sidebar: the name as `<p class="side-name">` (not a heading), role, pitch, seven-link spy nav, and links to GitHub, LinkedIn, Email and Résumé (`/resume/Resume.pdf`).
  - `#numbers` complete: prototype markup at offset 12676 with the 1.2 ids and `data-*` attributes, four tabs, and the brief's `how` text for the first tab.
  - The other six sections as empty `<section id="…"><h2 class="label">…</h2><!-- T2 --></section>`.

**`src/main.ts` (final for these parts)**
- CSS imports: tokens, base, home, floor.
- Add `js` to `<html>`.
- Headline sync and drift check (1.2).
- Tabs: port of offset 26704–27860 reading `TABS`.
  - Build the `how` text with DOM nodes, not `innerHTML`.
  - Keep the 180 ms swap; 0 ms under reduced motion.
- Particle boot: port of `boot` at 27867, including `document.fonts.load('700 100px Manrope')` and the 1800 ms fallback timer.
- Particle loop: runs only while `#numbers .stage` intersects and `!document.hidden`. Cancel the rAF otherwise.
- `mountFloor()`, `initContact()`, year.

**Carry over.** The CSS for body, glow, focus, `.pill`, `.label`, `.tags`, tabs, `.stage`, `.big` and `.how` from offsets 357–5005, rewritten against the tokens. `.how` keeps `min-height: 3.3em`, and `.tabs button` keeps `min-height: 62px`; both prevent layout shift.

**Acceptance**
- `npm run build` passes.
- `grep -rnE "Fraunces|IBM Plex|--ink-0|--text-0|--font-mono|fonts.googleapis|cdnjs" index.html src public/fonts` returns nothing. `catalog-rag/` and `404.html` still fail this until T7; that is expected.
- `npm run dev` screenshot at 1440×900: dark page, Manrope, the floor section showing name, pitch and five plain tiles, then the sidebar and the numbers block with "99.8%" as the big static number.
- Clicking each tab swaps the big number and the text.
- The console shows no "content drift".
- `/catalog-rag/` still loads and asks, unstyled.

**Rules at risk.** One `<h1>`. No CDN or Google Fonts. Contact ids untouched. `noUnusedLocals` in the stubs: prefix unused parameters with `_`.

**Commit.** `redesign: foundation, tokens, Manrope, content module, page skeleton`

### T2. The record (parallel)

**Goal.** Every record section with final copy, photos, the form, the two-column layout, scroll spy, pointer glow and flash.

**Files.** Modify `index.html` (inside `#record` only; do not touch `<head>`, the floor section or `#numbers` markup), `src/styles/home.css`, `src/main.ts`, `src/lib/contact.ts`.

**Content**
- **About**
  - `<!-- TODO: Faris to confirm wording -->` above the prose.
  - Prototype prose (offset 13603) with the two section-3 edits (ear-tag wording; no "this fall").
  - Portrait beside the text at a modest size (about 200–240 px wide, `--r-m` radius), stacked on mobile.
  - Under the prose, a compact four-row skills list, verbatim from the résumé:
    - Languages: Python, C, C++, C#, JavaScript, SQL, Bash, Verilog, MATLAB
    - LLMs & retrieval: RAG, LLM evaluation, LLM-as-judge, BM25, sentence-transformers, Azure OpenAI, OpenAI API
    - Machine learning: PyTorch, YOLOv8, Detectron2, OpenCV, scikit-learn, NumPy, networkx
    - Software & cloud: .NET, FastAPI, React, PostgreSQL, SQL Server, Git, Linux, Docker, GitHub Actions, AWS, Copilot Studio
- **Experience**
  - `#x-aramco`: "May to Aug 2026"; "AI/ML Engineering Intern · Aramco"; "Digital & Information Technology, Houston". The paragraph is the brief's Aramco text verbatim. Prototype tags plus `Salesforce Agentforce`. Small `awards` photo.
  - `#x-research`: prototype text (offset ~15200), with a small `eartag` photo.
- **Projects** (offset 15961)
  - `#x-rag`: add two visible links, "Try the live demo" → `/catalog-rag/` and "Code on GitHub".
  - `#x-pos`, `#x-demand`: as in the prototype.
  - `#x-riscv`: tags per section 3, with the TODO comment.
- **Wins** (offset 18324): six `<li>` with the 1.2 ids. The teamwork row detail is the replacement from section 3.
- **Off the clock**: the three lines from section 4 and three photos (`roberto`, `jordan`, `flagday`) in a three-up grid, one column on mobile.
- **Contact**
  - `<h2 class="label">Contact</h2>`.
  - `<p class="contact-lead">Hiring new grads for 2027? <em>Let's talk.</em></p>`.
  - The mail link.
  - The form, with the exact ids, the honeypot, `method="POST" novalidate`, and sentence-case labels.
  - `© <span id="year">2026</span> Faris Hittiny`.
- **`contact.ts`**
  - Change only the three status strings and the `mono` class token:
    - "Sending…"
    - "Sent. I'll get back to you soon."
    - "Send failed. Email me at faris@farishittiny.com instead."
  - `FORMSPREE_ID` and the fetch logic stay untouched.

**Behaviour**
- `.shell`, `.side` (sticky), `.spy`, `.links`, `.entry`, `.group` sibling dimming, `.thumb`, `.rows`, `.contact`: from offsets 1100–7450.
- The 900 px breakpoint: offset 10487.
- `.flash` keyframes (offset ~10100), applied to `.entry.flash` and `.rows li.flash`.
- Scroll spy: port of offset 28492, `rootMargin: '-35% 0px -55% 0px'`, class `on`. Set `aria-current="true"` on the active link.
- Pointer glow: port of offset 28281, off under reduced motion.
- Section labels are `<h2>`; entry titles are `<h3>`.

**Acceptance**
- `npm run build` passes.
- Screenshots at 1440×900 and 390×844 of each section:
  - sidebar sticky on desktop and stacked on mobile;
  - hovered entry lit and siblings dimmed;
  - portrait clearly not hero-sized.
- At 390 px, `document.documentElement.scrollWidth <= 390`.
- `grep -niE "alsafa|built cellbill|aramco americas|groundedsam|next ?gen" index.html` returns nothing.
- With the network blocked, a form submit shows the sentence-case failure text. Do not send a real message.
- Every `<img>` has width, height and alt.

**Rules at risk.** Rule 2 (use the section-3 table). Rule 3 ("modernized", no app imagery). Rule 4. Contact ids. One `<h1>`.

**Commit.** `redesign: record sections, photos, contact form, scroll spy`

### T3. Particles (parallel)

**Goal.** A typed port of `makeParticles`.

**Files.** Modify `src/particles.ts` only.

**Carry over exactly** (offsets 20115–26700)
- Both shader sources.
- Count: `innerWidth < 900 ? 9000 : 17000`. `R0 = 0.4`.
- Fibonacci sphere with the `2.399963` angle.
- `shapeFor`: 900×400 canvas, weight 700, start size 300 px, `fit` (the caller passes 0.8), sample step 2, alpha > 120, z jitter 0.05.
- Additive blend `SRC_ALPHA, ONE`.
- Pointer repel: radius 0.16, force 0.05.
- Easing: `k` 0.075 in text mode, 0.05 in sphere mode, scaled by `0.55 + seed × 0.9`.
- Rotation `t × 0.5`.
- Two draw passes: size × 5 at alpha 0.045, then size at alpha 0.72.
- Base size `3.1 × dpr × clamp(clientWidth / 640, 0.7, 1.25)`. DPR capped at 2.
- `show()` gap 700 ms.
- Reduced motion: positions set straight to the text shape, with no per-frame motion.

**Add**
- `dispose()`: remove listeners, delete buffers and program.
- Return `null` on any context, compile or link failure, with no `console.error`.

**Acceptance**
- `npx tsc --noEmit` passes.
- On `npm run dev`:
  - the numbers block forms "99.8%" from a rotating sphere;
  - each tab scatters and re-forms;
  - the pointer parts the dots.
- With the canvas `getContext` forced to return null in DevTools, the plain `.big` number shows.
- Scrolling the block off screen stops `step` calls. T1's loop does this; confirm with a counter.

**Rules at risk.** Particle counts; DPR cap of 2; the plain-number fallback.

**Commit.** `redesign: typed particle field`

### T4. Floor shell: gate, fallback, card, accessibility (parallel)

**Goal.** Everything about the floor that is not three.js.

**Files.** Modify `src/floor/index.ts`, `src/styles/floor.css`, `src/lib/capabilities.ts`.

**Capabilities**
- Return `{ floor3d: boolean; motionOk: boolean; forced: boolean }`.
- Keep the `?force-fallback`, `deviceMemory <= 2` and `hardwareConcurrency <= 2` checks.
- Test `webgl2` only.

**Modes**

| Condition | Result |
|---|---|
| `?force-fallback`, low-end device, or no WebGL2 | Tiles only |
| Reduced motion, otherwise capable | Tiles plus a visible `#floor-enable`; clicking it runs `goLive()` and hides the button |
| Otherwise | `goLive()` per 1.6 |

**Fallback (default CSS, no class needed)**
- `.floor` height `100vh` (and `100svh` where supported), min 560, max 980.
- Tiles as a centred row of five linked cards: number in `--accent`, label in `--soft`. Two columns under 720 px.
- Canvas, hint and card hidden.
- This must look finished, not broken.

**Live (`.floor--live`)**
- Canvas shown. Hint shown until the first card opens.
- `.floor-pads` visually hidden unless `:focus-within`, when it appears as a compact row at the bottom left.
- `focus` on `a[data-pad]` calls `scene.rollTo(i)`.
- Canvas CSS: `touch-action: pan-y; cursor: pointer`.

**Card** (port of `show(i)` at offset 30751)
- Fill kicker, number, title and `how` from `HEADLINES[i]`.
- Set `#card-more` href to `#target`.
- Rebuild `#card-links` from `card.links`; external links get `rel="noopener"`.
- Add `.on`. `-1` removes it.
- Closed state must be `visibility: hidden`, with a delayed transition, so its links leave the tab order.
- Card CSS from offset ~8900; mobile bottom-sheet rules from offset 10294.

**Flash.** Clicking `#card-more` or any `a[data-pad]` calls `flash(HEADLINES[i].flash)`.

**Acceptance**
- `npm run build` passes.
- `?force-fallback` at 1440 and 390: tiles, no canvas, no overflow; each tile lands on the right entry and flashes it.
- With emulated reduced motion: tiles plus the button.
- Default mode (the stub scene gives a blank canvas, which is fine):
  - Tab reaches the skip link first, then the pads list appears on focus;
  - focusing pad 2 opens the "0.90" card with both links;
  - the closed card's links are not tabbable.

**Rules at risk.** "Never blank". `?force-fallback` kept. Canvas `aria-hidden`, card `aria-live="polite"`. No static three import.

**Commit.** `redesign: floor shell, capability gate, static fallback, card`

### T5. three.js scene (parallel)

**Goal.** World, pads, ball, input, camera and loop on r169, matched to the prototype by eye.

**Files.** Modify `src/floor/scene.ts` only. Develop with `?floor-dev` until T4 lands.

**Carry over** (offsets 31613–35160 and 42793–46600)
- **Renderer:** `antialias: true`, pixel ratio `min(2, dpr)`.
- **Scene:** background and fog `0x0B0C10`, fog 16 to 44.
- **Camera:** fov 48, or 62 when the host is under 720 px wide; near 0.1, far 200; start at (0, 22, 26).
- **Ground:** plane 140×140, `0x0f121a`, roughness 0.92, metalness 0.1.
- **Grid:** y 0.01.
- **Stars:** 500 points; x ±80, y 8–48, z ±80 − 20; `0x9fb2ff`, size 0.18, opacity 0.7.
- **Labels:** `labelTex` 512×256; number `700 120px Manrope` in `#6C8CFF` at y 130; name `600 44px` in `#F2F3F5` at y 200; anisotropy 4. Rebuild the labels after `document.fonts.load`.
- **Pads** (positions from `HEADLINES[i].pad`):
  - disc `Cylinder(2.3, 2.3, 0.08, 56)`, colour `0x151a2a`;
  - ring `Torus(2.3, 0.045, 8, 72)` at y 0.1;
  - beam `Cylinder(0.03, 0.03, 5, 8)`, opacity 0.22;
  - sprite scale (5.2, 2.6), y 3.3.
- **Ball:** `R = 0.62`; core `Sphere(R, 36, 24)`, `0xdfe6ff`, roughness 0.3; wire `Icosahedron(R × 1.02, 1)`, `0x0B0C10`, opacity 0.55; start at `BALL_START`.
- **Lamp:** at (ball.x, 1.8 + by, ball.z).
- **Physics:**
  - acceleration 30; damping `exp(−3.4 dt)`;
  - target steering `s = min(1, d / 2.5)`, cleared at `d < 0.25`;
  - radial clamp 17;
  - spin `rotateOnWorldAxis((vel.z, 0, −vel.x), speed × dt / R)`;
  - gravity −18; bounce `−bvy × 0.42` when `bvy < −2`;
  - `dt` capped at 0.1.
- **Pads logic:** inside at `d < 2.2`; glow lerp `min(1, dt × 6)`; ring opacity `0.55 + glow × 0.45`; ring scale `1 + glow × 0.06 + sin(now / 500 + i) × 0.01`.
- **Camera follow:** goal (ball.x × 0.85, 9.5 or 14 narrow, ball.z + 13 or 19 narrow); lerp `1 − exp(−3.2 dt)`, or 1 under `reducedMotion`; look-at (ball.x, 0.6, ball.z − 4.5 or 2.5 narrow).
- **Click:** `click` event only; raycast to y = 0; snap to the nearest pad within 3.

**Light and emissive values:** section 2.

**NPC wiring:** section 1.5.

**New relative to the prototype**
- **Keys**
  - Listen on `window`.
  - Ignore when the floor is not more than half in view.
  - Ignore when the target is `INPUT`, `TEXTAREA`, `SELECT` or contentEditable.
  - Ignore when Ctrl, Meta or Alt is held.
  - Clear held keys when the floor goes inactive and on `blur`.
- **Front edge:** clamp `ball.z <= 8`. When `ball.z >= 7.5`, ArrowDown is neither captured nor `preventDefault`ed, so the page scrolls. `KeyS` still steers.
- **Loop:** cancel the rAF when the IntersectionObserver reports not visible or `document.hidden`; restart on return and reset `prev`.
- **Resize:** use a `ResizeObserver` on `host`.

**Acceptance**
- `npx tsc --noEmit` passes.
- The bundle check from 1.6 passes.
- A side-by-side screenshot with the prototype at 1440×900 after about 2 s: same framing, with ground, pads, labels and ball glow visually matched.
- Rolling onto each pad lights it.
- A click on empty ground rolls the ball there.
- At 390×844, vertical touch-drag on the canvas scrolls the page.
- Holding ArrowDown ends with the page scrolling.
- With the floor scrolled away, an rAF counter stops rising.

**Rules at risk.** Keyboard trap. `click`, not `pointerdown`. Loop stop. DPR cap of 2. Tuning numbers changed by accident.

**Commit.** `redesign: three.js floor scene on r169`

### T6. NPC brain and stand-in body (parallel)

**Goal.** The decision logic with exact tuning, and the primitive body behind `Character`.

**Files.** Modify `src/floor/npc.ts` and `src/floor/character.ts`.

**`npc.ts`** (port of offsets 37879–41400; state is private; use `rng` for every random call, defaulting to `Math.random`)
- **Start:** state idle; position (−3.5, −3.5); `until = now + 6500`; `paddleUntil = now + 6300`; `cool = now + 8500`.
- **`idleBall`:** `!steering && ballSpeed < 1.5 && now − lastInputAt > 3000`.
- **`mayKick`:** `now > cool && ballHeight < 0.4 && idleBall && (onPad < 0 ? dist < 9 : passed && now − padSince > 6000)`.
- **Chase:** speed 6.2; kick at `dist < 0.95`.
- **Kick destination:** centre `BALL_START`, or a random other pad with probability 0.65 off a pad and 0.5 on one.
- **After a kick:** `passed = true`; kick timer 0.3 s; `cool = now + 5200`; idle for 1200 ms; `kick` output set for that frame.
- **On a pad:** stand at (p.x × 0.72, p.z × 0.72 − 0.6). Run there at 6.2 until within 0.5, resetting `cheerUntil = now + 2600` while running. Cheer until `cheerUntil`, then watch.
- **Leaving the pad states:** idle for 800 ms.
- **Wander:**
  - target x = clamp(ball.x ± 7, −14, 14);
  - target z = clamp(ball.z − 2 − rand × 6, −13, 6);
  - walk at 2.3; arrive at 0.4;
  - then idle for `1400 + rand × 2600` ms;
  - with a 40% chance, `paddleUntil = now + 4200` and `until = now + 4400`.
- **Velocity smoothing:** `min(1, dt × 7)`.
- **Facing:**
  - moving faster than 0.5: `atan2(vx, vz)`;
  - paddling, cheering or watching: 0.35 rad;
  - otherwise toward the ball;
  - turn rate `min(1, dt × 9)`.
- **`paddling`:** `state === "idle" && now < paddleUntil && speed < 0.4`.
- **`pose.kick`:** `kickT > 0 ? 1 − kickT / 0.3 : 0`.

**`character.ts`** (meshes from offsets 35164–37879; animation from 41400–42300)
- **Colours:** skin `0xc98f6a`, hair `0x17130f`, kit `0x6C8CFF`, shorts `0x161a26`, socks `0xf2f3f5`, boots `0x0d0e12`, paddle blade `0xF2C230`, pickleball `0xE9F25A`.
- Root scale 1.2. Shadow disc on the root.
- **Animation**
  - Gait: `phase += speed × dt × 2.3`; `run = min(1, speed / 5.5)`; leg swing `sin(phase) × 0.95 × run`; arms × 0.8, opposite.
  - Paddle: `bnc = |sin(t × 5.4)|`; `armR.x = −1.35 + (1 − bnc) × 0.14`; ball at (0.42, 1.52 + bnc × 0.6, 0.86).
  - Cheer: `c = now / 140`; hop `|sin c| × 0.28`; arms `π ± sin(2c) × 0.25`, z ±0.25.
  - Kick: `legR.x = −1.3 × sin(π × pose.kick)`.
  - Body bob, idle breathing `sin(now / 600) × 0.012`, and lean `0.16 × run`.

**Acceptance**
- `npx tsc --noEmit` passes.
- `grep -n "from \"three\"" src/floor/npc.ts` returns nothing.
- With `?floor-dev` and T5's scene (or after integration):
  - at about 3 s he is bouncing a ball on the paddle;
  - untouched, at about 8.5 s he runs to the ball and passes it;
  - when a pad lights he runs beside it, cheers for about 2.6 s, then stands watching;
  - while a key is held he never touches the ball;
  - after the visitor parks the ball on a pad he leaves it there indefinitely.

**Rules at risk.** The tuning numbers ("port it, keep the tuning"). Brain and body separation. No Phase 2 work.

**Commit.** `redesign: NPC state machine and stand-in character`

### T7. Catalog RAG page, 404, icons, OG image (parallel)

**Goal.** Every other surface in the new look.

**Files.** Modify `catalog-rag/index.html`, `src/styles/catalog.css`, `src/catalog-rag.ts` (display strings only), `public/404.html`, `public/favicon.svg`, `scripts/make-icons.mjs`, `scripts/make-og.mjs`, `scripts/optimize-images.mjs` (line 62 message only). Regenerate `public/favicon-16.png`, `favicon-32.png`, `favicon.ico`, `apple-touch-icon.png`, `og-image.png`. Delete `scripts/make-placeholders.mjs`: it only emits cream-theme art and the real photos are committed.

**Catalog page**
- Same head treatment as `index.html`: Manrope preload and `@font-face`, `theme-color`.
- Replace the seven-link nav with a top bar: "Faris Hittiny" → `/` and "← Projects" → `/#projects`.
- The bottom "back" link also goes to `/#projects`.
- "Catalog RAG, live" becomes the page's `<h1>`.
- Remove the "0x018 · APPLICATION NOTE" and "FIG 6.1" datasheet captions and the footer "REV 2.1" line.
- Static copy goes to sentence case.
- Keep every id and hook: `rag-form`, `rag-q`, `rag-status`, `rag-result`, `rag-answer-text`, `rag-cited`, `rag-unavailable`, `rag-fallback`, `rag-detail`, `rag-route`, `rag-retriever`, `rag-list-label`, `rag-list`, `rag-force`, `.rag-chip[data-q]`, and the submit button.
- Rewrite `catalog.css` fully against the new tokens. The script still emits `.form-status`, `.is-wait`, `.is-error`, `.rag-id` and `.rag-title`.
- In `catalog-rag.ts`, you may sentence-case user-visible string literals and drop `.toUpperCase()`. `git diff src/catalog-rag.ts` must show no change to `API_BASE`, the timeouts, the payloads, `fetch`, the status-code branches or the render flow.

**404.** Stays self-contained: inline Manrope `@font-face`, new hex values, no mono eyebrow styling, same copy and home link.

**Favicon**
- Badge rect fill `#6C8CFF`, glyph fill `#0B0C10`; update the comment.
- `make-icons.mjs` reads `--stage` instead of `--ink-0`: update the regex, the error text and the comments.
- Run `node scripts/make-icons.mjs`.

**OG image**
- Rewrite `make-og.mjs` to render with Playwright: `setContent` an HTML card with an `@font-face` pointing at the local Manrope file, then screenshot at 1200×630 to `public/og-image.png`. sharp's SVG text cannot use Manrope.
- Card content: `#0B0C10` ground, "Faris Hittiny", "AI/ML Engineer", the pitch line, and three accent numbers: `99.8%`, `0.90`, `89.6%`.

**Acceptance**
- `npm run build` passes.
- `grep -rnE "Fraunces|IBM Plex|#f2eee3|#16386f|#faf8f1|REV 2\.1|DATASHEET" catalog-rag public/404.html public/favicon.svg scripts src` returns nothing.
- Screenshots of `/catalog-rag/` (1440 and 390), `/404.html`, and the OG PNG opened as an image.
- On `localhost:5173` or `:4173`, a chip question returns an answer. Those origins are on the API's allow-list.
- `favicon-32.png` shows the blue badge.

**Rules at risk.** Rule 5 (API logic). No mono or serif left. No second accent.

**Commit.** `redesign: restyle catalog-rag, 404, favicon and OG image`

### T8. Integration and final verification (sequential, last)

**Goal.** Everything merged, tuned and proven; README current.

**Files.** `scripts/verify.mjs`, `README.md`, plus fixes anywhere.

**Steps**
1. Confirm all seven commits are on `redesign/floor-and-record`. Run `npm ci && npm run build`. Run the bundle check from 1.6. Confirm `git grep -n "floor-dev"` is empty: T4 removes the dev switch, so delete any leftover.
2. Final light pass against the prototype (section 2), now with the real character.
3. Update `verify.mjs`:
   - **Ids:** `floor`, `numbers`, `about`, `experience`, `projects`, `wins`, `off-the-clock`, `contact`.
   - **Overflow:** assert `document.documentElement.scrollWidth <= window.innerWidth` in both contexts.
   - **State shots** (desktop and iPhone 13):
     - `floor-load`: 1 s after `#floor.floor--live`.
     - `paddle`: 3 s after going live.
     - `pad-card`: focus `#floor-pads a[data-pad="1"]`, wait for `#floor-card.on`.
     - `cheer`: three frames at 1.0, 1.8 and 2.6 s after the card opens.
     - `idle-30s`: fresh page, no input; shots at 12 s and 30 s; poll up to 45 s for `#floor-card.on` and fail if it never opens.
     - `fallback`: `?force-fallback`.
     - `reduced`: a reduced-motion context, before and after clicking `#floor-enable`.
     - `/catalog-rag/` and `/404.html`.
   - **Jump check:** for every `a[href^="#"]`, assert the target id exists.
   - Repoint the `--fps` probe at the floor.
4. Run it:
   - `npm run preview` in the background.
   - `node scripts/verify.mjs http://localhost:4173/ verify-out`.
   - The same command again with `--reduced-motion`.
   - Exit code 0 with zero console errors.
   - Open and look at every PNG.
5. Lighthouse: `npx lighthouse http://localhost:4173/ --only-categories=accessibility,performance --output=json --output-path=verify-out/lh.json --chrome-flags="--headless=new"`.
   - Require accessibility ≥ 0.95 and `cumulative-layout-shift` near 0.
   - If font swap causes shift, change `font-display` to `optional` in all three HTML files; the preload stays.
   - Run it again for `/catalog-rag/`.
   - On Windows, Lighthouse may print an EPERM temp-cleanup error after writing the report. Ignore it.
6. Manual checks:
   - the résumé link opens the PDF;
   - every tile, tab, card and spy link lands on the right entry;
   - the form shows the failure text with the network blocked. Do not send a real submission without asking Faris.
7. FPS: run `--fps` at 390 px with 4× CPU throttle (CDP `Emulation.setCPUThrottlingRate`). If it is under about 55 fps, cut the particle count first, then the pad segment counts (56 and 72), and nothing else. Note that a real mid-range phone was not tested.
8. README:
   - new structure (the brief's layout plus `lib/flash.ts`);
   - how to change a headline number: edit `src/content.ts`, then the matching static copy in `index.html`; the drift check fails verify otherwise;
   - how the fallback works: the three modes, `?force-fallback`, the particle fallback;
   - the Manrope copy step;
   - remove the stale "form renders as a direct-email card" line and the placeholder text.
9. Write `docs/redesign/pr-notes.md` listing the unsure items:
   - every "keep with TODO" item from section 3;
   - the third-party names visible in the `awards` photo;
   - the unused `sitevisit` and `asa` images;
   - the catalog demo showing "could not reach the API" on `pages.dev`;
   - the yellow paddle as a non-accent colour on a 3D prop;
   - the card announcing through `aria-live` each time the NPC passes;
   - the brief's four "ask Faris" questions.

**Rules at risk.** All of them; this is the gate. In particular: never push, never open a PR, never touch `main`.

**Commits.** `redesign: verification script, README, integration fixes`, plus one commit per later fix. Leave the branch unpushed and report the screenshot directory and Lighthouse scores.

### Critical Files for Implementation
- C:\Users\faris\source\repos\personal-website\docs\redesign\prototype.html
- C:\Users\faris\source\repos\personal-website\docs\redesign\brief.md
- C:\Users\faris\source\repos\personal-website\resume\src\Faris_Hittiny_Resume.tex
- C:\Users\faris\source\repos\personal-website\index.html
- C:\Users\faris\source\repos\personal-website\scripts\verify.mjs