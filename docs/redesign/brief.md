# farishittiny.com redesign: build brief for Claude Code

You are rebuilding the homepage of this repo (`FarisHittiny/personal-website`: Vite 6, vanilla TypeScript in strict mode, `three@^0.169`, deployed to Cloudflare Pages from `main`).

The design is already settled and prototyped. Your job is to port the prototype into this codebase properly. Do not redesign it.

**Reference file: `docs/redesign/prototype.html`.** It is one self-contained page with all the CSS, the particle code, and the 3D floor code inline. Open it in a browser before you write anything. Where this brief and the prototype disagree, the brief wins.

## Rules that are not negotiable

1. Work on a new branch (`redesign/floor-and-record`). **Never push to `main`**: it auto-deploys to the live site. Commit as you go; push the branch and open a PR only when Faris says so (PRs get a `*.pages.dev` preview).
2. `resume/src/Faris_Hittiny_Resume.tex` is the source of truth for every fact and number. Do not invent, round up, or embellish. If a claim is not in the résumé or this brief, leave it out.
3. Nothing from Aramco's internal app may be shown: no screenshots, no UI recreations, no internals. Say he "modernized" Cellbill Manager, never "built" it.
4. Do not mention the Alsafa retail job anywhere.
5. These must keep working exactly as they do now:
   - `/catalog-rag/` live demo (`catalog-rag/index.html`, `src/catalog-rag.ts`). Restyle it to the new look, do not touch its API logic.
   - The contact form: Formspree via `src/lib/contact.ts` (`FORMSPREE_ID = "xjgnqjzg"`), with ids `contact-form`, `cf-name`, `cf-email`, `cf-msg`, honeypot `cf-company` (`name="_gotcha"`), status `form-status`.
   - The résumé link: `/resume/Resume.pdf`.
6. Do not spend Higgsfield credits or generate anything paid without asking Faris first (see Phase 2).

## What the page is

**Part 1, the opening screen: a 3D floor.** Dark stage, five glowing pads in an arc, each labeled with a headline number. The visitor rolls a soccer ball with arrow keys / WASD, or by clicking or tapping a spot. When the ball sits on a pad, a card opens with that project's summary and a "Full details ↓" link that jumps to the entry below and flashes it.

**A background character of Faris lives on the floor as an NPC.** The visitor never controls him. He:
- wanders near the ball and faces it when standing still;
- never touches the ball while the visitor is steering (no input for 3 s, ball nearly stopped, no click target pending);
- when the ball is left alone, runs to it and passes it to a random pad or back to center, so the page demos itself;
- runs beside a lit pad and cheers for about 2.6 s, then just watches;
- only kicks the ball off a pad if he was the one who passed it there, and only after 6 s;
- sometimes pulls out a pickleball paddle and bounces a ball on it (once shortly after load, then on about 40% of idles).

All of this logic, with its exact numbers, is in the prototype's second `<script>` block. Port it, keep the tuning.

**Part 2, below the floor: the full record.** Two columns. Left column is sticky: name, role, one-line pitch, scroll-spy nav, links. Right column: particle number block, About, Experience, Projects, Wins and leadership, Off the clock, Contact. Hovering an entry dims its siblings. A soft blue glow follows the cursor.

**Look.** Background `#0B0C10`, panels `#12141A`, lines `#272B35`, text `#F2F3F5` / `#C8CCD4` / `#9AA1AE`, one accent `#6C8CFF` (tint `rgba(108,140,255,0.13)`, tag text `#A9BCFF`). Manrope for everything, tight negative tracking on headings. No second accent color, no serif, no mono. The old cream "datasheet" theme goes away completely.

## Content

Use the prototype's copy as written, with these changes and additions.

**Headline numbers (pads and tabs).** Keep them in one module (`src/content.ts`) that both the floor and the tabs read:

| Number | Label | Jumps to | How it was measured |
|---|---|---|---|
| 99.8% | Aramco | Aramco entry | Measured by validation pipelines on anonymized datasets, against 8+ years of production billing data. |
| 0.90 | Catalog RAG | RAG entry | Recall@5, up from 0.61 over a BM25 baseline on 129 hand-verified questions. Confirmed on a 14-question held-out set (0.91). The eval runs in CI on every push. |
| 89.6% | Ear tags | Research entry | mAP@0.5. Best of 10+ models benchmarked on continuous field video, at 89.5% precision and 89.7% recall. |
| 15.1× | RISC-V | RISC-V entry | Fewer cycles than the software baseline on a 4 KB workload, in Verilator simulation. Not silicon. (Pad only, not a tab.) |
| Top 10 | Wins | Wins section | Of 200+ teams at the Tidal Hackathon, October 2024. |

The Catalog RAG card and entry get two links: "Try the live demo" → `/catalog-rag/` and the GitHub repo.

**Aramco entry** (replace the prototype paragraph): Modernized Cellbill Manager, an internal telecom expense platform (C#, .NET, Entity Framework Core, SQL Server), and added AI invoice extraction on Azure OpenAI for AT&T, Verizon and T-Mobile bills covering 500+ active corporate lines. Validation pipelines on anonymized datasets measured 99.8% extraction accuracy against 8+ years of production billing data. Halved a bulk employee-status refresh (6.5 to 3.3 minutes) by benchmarking HR API concurrency and capping parallel lookups at 12. Co-captained a 6-person capstone on an AI interview scheduling agent (Copilot Studio, SAP SuccessFactors), presented to the executive board; it won the Excellence in Teamwork Award. Also prototyped agents on Salesforce Agentforce.

**About.** Add the portrait (`/img/portrait-960.*`) at a normal, modest size next to the text. It must not be a hero image. Add a compact skills list under the prose, taken from the résumé's four rows (Languages, LLMs & retrieval, Machine learning, Software & cloud). The About prose in the prototype is a draft; keep it but leave a `<!-- TODO: Faris to confirm wording -->` comment above it.

**Photos.** Reuse what is already in `public/img/` with `<picture>` (avif, webp, jpg), `loading="lazy"`, explicit width/height, and real alt text (the current `index.html` has good alt text for each, reuse it):
- `awards` in the Aramco entry, `eartag` in the research entry, small.
- New section **Off the clock**, after Wins: three photos (`roberto`, `jordan`, `flagday`) and three short lines about pickleball, pickup soccer, and live matches. The current site's "Off the Clock" table has his own wording for these; reuse the substance, drop the datasheet jokes.

**Contact.** Keep the prototype's heading and email link, and add the working contact form beside or below it. Change the form's status strings in `contact.ts` from all-caps to sentence case.

**Meta.** Title "Faris Hittiny · AI/ML Engineer". Rewrite the description and OG text to lead with AI/ML (Aramco invoice extraction, Catalog RAG, computer vision research), RISC-V last. `theme-color` `#0B0C10`. Recolor `public/favicon.svg` to the new palette and rerun `scripts/make-icons.mjs` (it reads a color from `tokens.css`; update it for the new token name). Regenerate `public/og-image.png` at 1200×630 in the new look. Restyle `public/404.html` (it is self-contained, hard-coded old colors and fonts).

## How to build it

**Fonts.** Self-host Manrope the way the repo self-hosts fonts now: add `@fontsource-variable/manrope`, copy `manrope-latin-wght-normal.woff2` into `public/fonts/`, declare it with an inline `@font-face` in each HTML head, preload it. Remove the Fraunces and IBM Plex Mono files, packages and declarations. No Google Fonts request, no CDN scripts.

**Suggested layout.**
```
src/content.ts            headline numbers, pad positions, card copy
src/particles.ts          typed port of makeParticles()
src/floor/index.ts        capability gate, card and fallback DOM, lazy import of the scene
src/floor/scene.ts        three.js world: ground, pads, ball, input, camera, loop
src/floor/npc.ts          the character's decisions (state machine), no meshes
src/floor/character.ts    the stand-in body built from primitives, behind an interface
src/main.ts               tabs, particles boot, scroll spy, pointer glow, contact, year
src/styles/               tokens.css, base.css, home.css, floor.css, catalog.css
```
Delete what the new page no longer uses (`src/hero`, `src/diagram`, `src/lib/cursor.ts`, `src/lib/reveal.ts`, the old layout/components/motion/diagram CSS, `scripts/diagram-walkthrough.mjs`). `tsc --noEmit` runs with `noUnusedLocals`, so leave nothing dangling.

**Character interface.** Keep the brain and the body separate. `character.ts` exports something like `{ root: THREE.Object3D; update(pose, now, dt): void }` where `pose` carries state (`idle | walk | chase | run | cheer | watch`), speed, kick progress and whether he is paddling. The stand-in implements it with the prototype's procedural limb animation. Phase 2 swaps in a rigged GLB behind the same interface without touching `npc.ts`.

**three.js version.** The prototype loads r128 from a CDN; the repo has r169 as an ES module. Two things changed in between and will make a straight port look wrong: color management (r152: set `colorSpace = SRGBColorSpace` on the canvas label textures) and physical light units (r155: the old intensities render much darker, and the point light under the ball falls off faster). Retune the lights by eye against the prototype until the floor, pads and character match. Lazy-load the scene with a dynamic `import()` so three.js stays out of the main bundle.

**Fallbacks.** The floor section must never be blank. Default to a static version of the opening screen: name, pitch, and the five numbers as tiles that link to their entries. Upgrade to the 3D floor only when WebGL works, the device is not low-end (reuse the checks in `src/lib/capabilities.ts`), and the visitor has not asked for reduced motion. With reduced motion, show the tiles plus a "Turn on the 3D floor" button. Keep the `?force-fallback` switch for testing. If the particle canvas cannot get WebGL, show the plain big number that is already in the prototype markup.

**Input and accessibility.**
- One `<h1>` on the page (the floor's). Section labels become `<h2>`.
- Skip link to the record as the first focusable element.
- Arrow keys and WASD steer only while the floor is more than half in view and focus is not in a form field. Do not trap keyboard scrollers: once the ball is at the front edge of the floor, let ArrowDown scroll the page.
- Keep `touch-action: pan-y` on the canvas and use `click`, not `pointerdown`, so phones can scroll past the floor.
- Give keyboard and screen-reader users the pads as a real list of links. When the 3D floor is live, visually hide the list until it has focus; focusing a link rolls the ball to that pad.
- Canvas is `aria-hidden`; the card is `aria-live="polite"`.

**Performance.** Stop the floor's render loop when it is off screen or the tab is hidden, and the particle loop the same way. Cap pixel ratio at 2. Particle count: 9,000 under 900 px wide, 17,000 above. Check it holds 60 fps on a mid-range phone; if not, drop the particle count and the pad segment counts before touching anything else.

**Catalog RAG page.** Same tokens, same font, a simple top bar (name → `/`, link back to `/#projects`). Update its nav anchors to the new section ids. Its API only allows exact origins, so the demo will show "could not reach the API" on a `pages.dev` preview; that is expected, mention it in the PR.

## Done means

- `npm run build` passes clean (type check included).
- Update `scripts/verify.mjs` for the new section ids and run it against `npm run preview` at 1440×900 and iPhone 13: zero console errors, no horizontal overflow at 390 px.
- Checked by actually looking at screenshots: floor on load, ball on a pad with the card open, the character cheering, the paddle routine, the page left idle for 30 s (the character should pass the ball and a card should open on its own), each record section, the fallback (`?force-fallback`), reduced motion, the Catalog RAG page, the 404 page.
- Contact form submits (ask Faris before sending a real test message), résumé link opens, every in-page jump lands on the right entry.
- Lighthouse on the built site: accessibility ≥ 95, no layout shift from late-loading fonts or the tabs.
- README updated: new structure, how to change a headline number, how the fallback works.
- Open a PR only when told to. In the PR description list anything you were unsure about.

## Phase 2: the real character (ask first)

Replace the stand-in with a stylized, non-realistic full-body model of Faris made with the Higgsfield plugin (image → rigged 3D, GLB). Its animation library has a soccer kick (`Kick_a_Soccer_Ball`) and several cheers (`Victory_Cheer`, `Cheer_with_Both_Hands_Up`); it has no pickleball or racket clip, so keep the paddle motion code-driven on the arm bone. Before generating anything: run a cost check only, tell Faris the credit cost, and wait for a yes. Keep the GLB small (Draco or Meshopt, under about 1.5 MB), load it after first paint, and keep the stand-in as the fallback if it fails to load.

## Ask Faris before this goes live

1. Is the About wording right? It was drafted for him.
2. Keep the particle number block? The floor now shows the same numbers, so it may be one thing too many. Default: keep it.
3. Does he want the research poster on the page? He has it and can add it to `public/img/`.
4. Is `public/resume/Resume.pdf` the current résumé?
