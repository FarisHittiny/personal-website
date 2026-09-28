# personal-website

Personal site, deployed on Cloudflare Pages.
Static build (Vite + vanilla TypeScript + three.js), served from the domain root —
all paths are root-relative (`base: '/'`).

## Develop

```
npm install
npm run dev
```

## Build

```
npm run build      # type-checks, then emits self-contained dist/
npm run preview    # serve dist/ locally
```

## Images

Photo slots are placeholder-generated until real photos land. Drop originals into
`assets-src/` named after their slot (`portrait.jpg`, `eartag.jpg`) and run:

```
npm run images
```

Output filenames match what the markup references — swapping photos never
requires a markup change.

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
test from. The page needs no configuration in production. To test against a local copy of the
API instead, build with `VITE_RAG_API=http://localhost:7860 npm run build` (the API side then
needs `DEMO_ORIGINS=http://localhost:4173`).

## Contact form

Posts to Formspree (free tier: 50 submissions/month). Set `FORMSPREE_ID` in
`src/lib/contact.ts`; until it is set, the form renders as a direct-email card.
