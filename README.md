# personal-website

Personal site for [people.tamu.edu/~farishittiny](https://people.tamu.edu/~farishittiny/).
Static build (Vite + vanilla TypeScript + three.js), served from a subdirectory —
all paths are relative (`base: './'`).

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

## Deploy (TAMU OAL webspace, U: drive)

```
.\scripts\deploy.ps1            # Stage A: preview deploy to U:\v2\
.\scripts\deploy.ps1 -Promote   # Stage B: archive old site, go live at root
```

The script never mirrors or blind-deletes; stale-file removal is a separate
typed confirmation. `resume/Resume.pdf` keeps its historical URL.

## Contact form

Posts to Formspree (free tier: 50 submissions/month). Set `FORMSPREE_ID` in
`src/lib/contact.ts`; until it is set, the form renders as a direct-email card.
