/** Headline numbers, pad positions and card copy. The one source both the
 *  3D floor and the number tabs read. No DOM, no three.js.
 *  The static copies in index.html must match; main.ts reports drift. */

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
