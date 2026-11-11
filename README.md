# personal-website

Personal site, deployed on Cloudflare Pages. Static build (Vite 6, vanilla
TypeScript in strict mode, three.js r169), served from the domain root, so all
paths are root-relative (`base: '/'`).

The homepage has two parts: an opening screen with a 3D floor (five glowing pads,
each a headline number, a ball you roll onto them, and a stand-in character who
plays with the ball when you leave it alone), and the full record below it.

## Develop

```
npm install
npm run dev
```

## Build

```
npm run build      # type-checks (tsc --noEmit), then emits self-contained dist/
npm run preview    # serve dist/ on http://localhost:4173
```

The floor scene (three.js) is its own chunk, about 500 kB (128 kB gzip). It is
loaded with a dynamic `import()` after the page is idle, never on first paint;
`build.chunkSizeWarningLimit` in `vite.config.ts` is raised just past it.

## Structure

```
index.html                 homepage; the static copy of every headline value
catalog-rag/index.html     the Catalog RAG live demo page
public/404.html            self-contained 404 page
public/fonts/              self-hosted Manrope (variable woff2)
src/content.ts             headline numbers, pad positions, card copy (one source of truth)
src/main.ts                headline drift check, number tabs, particles boot, scroll spy,
                           pointer glow, contact form, year
src/particles.ts           the particle number field (raw WebGL)
src/floor/index.ts         capability gate, card, fallback tiles, lazy import of the scene
src/floor/scene.ts         three.js world: ground, pads, ball, input, camera, loop
src/floor/npc.ts           the character's decisions (state machine), no meshes, no DOM
src/floor/character.ts     the stand-in body built from primitives, behind an interface
src/lib/capabilities.ts    WebGL2 / low-end / reduced-motion / ?force-fallback checks
src/lib/flash.ts           highlights the entry a jump lands on
src/lib/contact.ts         contact form → Formspree
src/catalog-rag.ts         Catalog RAG demo client
src/styles/                tokens.css, base.css, home.css, floor.css, catalog.css
scripts/verify.mjs         screenshot and console verification (below)
scripts/check-npc.mjs      simulation checks for the NPC brain (below)
scripts/make-icons.mjs     favicons from public/favicon.svg
scripts/make-og.mjs        public/og-image.png
scripts/optimize-images.mjs  photos from assets-src/ into public/img/
docs/redesign/             the brief, the build plan and the prototype
```

## Changing a headline number

The five numbers (99.8%, 0.90, 89.6%, 15.1×, Top 10) appear on the 3D pads, the
fallback tiles, the number tabs, the card and the particle field. All of them read
`src/content.ts`.

1. Edit the entry in `HEADLINES` in `src/content.ts` (`number`, `label`, `tabLabel`,
   `how`, card copy).
2. Edit the matching static copy in `index.html`: every element with
   `data-num="<id>"`, `data-label="<id>"` or `data-tab-label="<id>"`. That copy is
   what paints first and what visitors without JavaScript see.

On load, `main.ts` compares each of those elements with `content.ts`. A mismatch is
reported with `console.error("content drift: …")` and fixed on the page, so
`scripts/verify.mjs` (which requires zero console errors) fails until the HTML
matches.

Facts and numbers come from `resume/src/Faris_Hittiny_Resume.tex` only.

## How the floor falls back

The static tiles in `index.html` (`#floor-pads`) are the default opening screen:
name, pitch, and the five numbers as links to their entries. They are also the
no-JS view and the keyboard and screen-reader list of pads. `src/floor/index.ts`
upgrades from there:

| Situation | What shows |
| --- | --- |
| `?force-fallback` in the URL, a low-end device (≤ 2 GB memory or ≤ 2 cores), or no WebGL2 | tiles only |
| reduced motion requested, device otherwise capable | tiles plus a "Turn on the 3D floor" button |
| otherwise | the 3D floor, started once the page has loaded and is idle |

If the scene throws while starting (for example the renderer cannot be created),
the page logs a warning and stays on the tiles. While the 3D floor runs, the tiles
are visually hidden but stay focusable; focusing one rolls the ball to that pad.

`?force-fallback` is the testing switch: `http://localhost:4173/?force-fallback`.

The particle number block has its own fallback: if its canvas cannot get WebGL,
the plain big number in the markup shows instead.

## Fonts

Manrope is self-hosted. The file comes from the `@fontsource-variable/manrope`
package: after updating the package, copy
`node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2`
to `public/fonts/`. Each HTML page (`index.html`, `catalog-rag/index.html`,
`public/404.html`) declares it with an inline `@font-face` (family name exactly
`"Manrope"`, which canvas code relies on) and preloads it.

## Images

Originals go in `assets-src/` (not committed), named after their slot
(`portrait.jpg`, `eartag.jpg`, …). Then:

```
npm run images
```

writes AVIF, WebP and JPEG into `public/img/` under the names the markup uses.

## Checks

**NPC brain.** `node scripts/check-npc.mjs` (Node 22.18+ or 24, which strip the
TypeScript types themselves) drives `src/floor/npc.ts` with a fake clock, a fake
ball that copies the scene's physics, and a seeded random source. It checks each
behaviour in the brief (never touches the ball while you steer, passes it when
left alone, cheers beside a lit pad, the paddle routine, …) and exits 1 on any
failure.

**Pages.** With `npm run preview` running:

```
node scripts/verify.mjs http://localhost:4173/ verify-out
```

It runs at 1440×900 and on Playwright's iPhone 13 device, in headless Chromium
with SwiftShader so the 3D floor renders without a GPU. It fails on any console
error, on horizontal overflow, on an in-page link with no target, or on a jump
that does not land on (and flash) its entry, and it checks `/resume/Resume.pdf`.
It saves state screenshots (floor on load, paddle routine, pad with the card
open, cheer, 30 s idle, each record section, `?force-fallback`, reduced motion
before and after the opt-in button, the contact form's failure state,
`/catalog-rag/`, `/404.html`). Formspree and the catalog API are blocked, so
nothing is submitted.

Flags: `--reduced-motion` (run everything with reduced motion), `--fps` (floor
frame rate; on mobile at 4× CPU throttle), `--only=desktop|mobile`, and `--ipv4`
(map `localhost` to 127.0.0.1, for when something else holds `[::1]:4173`).

## Deploy (Cloudflare Pages)

Deploys are automatic: push to `main` and Cloudflare Pages builds and publishes.

| Setting          | Value           |
| ---------------- | --------------- |
| Framework preset | Vite            |
| Build command    | `npm run build` |
| Output directory | `dist`          |

Pull requests get their own preview deployment at a `*.pages.dev` URL.

### Catalog RAG demo

`/catalog-rag/` calls the catalog-rag API on Cloud Run cross-origin
(`https://catalog-rag-931113045677.us-south1.run.app`, source at
[FarisHittiny/catalog-rag](https://github.com/FarisHittiny/catalog-rag)). The API's
`DEMO_ORIGINS` allow-list is exact strings, no wildcards, so it must contain every origin the
page is served from: `https://farishittiny.com`, `http://localhost:5173` for `npm run dev`,
`http://localhost:4173` for `npm run preview`, and any `*.pages.dev` preview URL you want to
test from. On a preview URL that is not on the list, the demo shows "could not reach the
API"; that is expected. To test against a local copy of the API instead, build with
`VITE_RAG_API=http://localhost:7860 npm run build` (the API side then needs
`DEMO_ORIGINS=http://localhost:4173`).

## Contact form

Posts to Formspree (free tier: 50 submissions/month) with `FORMSPREE_ID` in
`src/lib/contact.ts`. If the request fails, the form says so and points to the
email address.
