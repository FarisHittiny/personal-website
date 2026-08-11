/** Hand-authored SVG schematic of the accelerator data path.
 *  Geometry is deliberate: one bus spine left→right, the accelerator's
 *  internals grouped inside a dashed boundary, register table below.
 *  On narrow screens the whole SVG scrolls horizontally inside .dp-scroll. */

import { STAGES, REGISTERS } from "./data";

const BOX: Record<string, { x: number; y: number; w: number; h: number }> = {
  ram: { x: 30, y: 130, w: 150, h: 84 },
  cpu: { x: 240, y: 130, w: 160, h: 84 },
  bridge: { x: 470, y: 130, w: 180, h: 84 },
  regs: { x: 760, y: 84, w: 180, h: 66 },
  buf: { x: 760, y: 196, w: 180, h: 66 },
  core: { x: 1000, y: 130, w: 160, h: 84 },
};

/** Trace paths, drawn along the schematic. The transaction token follows
 *  these with getPointAtLength, so direction matters (source → dest). */
const TRACES: Record<string, string> = {
  "t-ram-cpu": "M 180 172 H 240",
  "t-cpu-bridge": "M 400 172 H 470",
  "t-bridge-regs": "M 650 150 H 706 V 117 H 760",
  "t-bridge-buf": "M 650 194 H 706 V 229 H 760",
  "t-buf-core": "M 940 229 H 970 V 190 H 1000",
  "t-core-regs": "M 1000 155 H 970 V 117 H 940",
};

function stageBox(id: string): string {
  const s = STAGES.find((st) => st.id === id)!;
  const b = BOX[id];
  return `<g class="dp-stage" id="stg-${id}" tabindex="0" role="button"
      aria-label="${s.label}: ${s.sub}. Press Enter for details.">
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2"/>
    <text class="dp-stage-label" x="${b.x + b.w / 2}" y="${b.y + b.h / 2 - 6}" text-anchor="middle">${s.label}</text>
    <text class="dp-stage-sub" x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 16}" text-anchor="middle">${s.sub}</text>
  </g>`;
}

export function buildDatapathSvg(): string {
  const traces = Object.entries(TRACES)
    .map(([id, d]) => `<path class="dp-trace" id="${id}" d="${d}" fill="none"/>`)
    .join("");

  const stages = Object.keys(BOX).map(stageBox).join("");

  const regRows = REGISTERS.map((r, i) => {
    const y = 330 + i * 34;
    return `<g class="dp-regrow" data-reg="${r.name}">
      <rect x="30" y="${y}" width="1130" height="34" class="dp-regbg ${i % 2 ? "odd" : ""}"/>
      <text class="dp-regtext dp-reg-offset" x="48" y="${y + 22}">${r.offset}</text>
      <text class="dp-regtext dp-reg-name" x="150" y="${y + 22}">${r.name}</text>
      <text class="dp-regtext dp-reg-bits" x="330" y="${y + 22}">${r.bits}</text>
      <text class="dp-regtext dp-reg-value" x="1140" y="${y + 22}" text-anchor="end">${r.reset}</text>
    </g>`;
  }).join("");

  return `<svg viewBox="0 0 1190 510" role="group"
      aria-label="Block diagram of the accelerator data path: main RAM to VexRiscv CPU over the system bus, through a Wishbone-to-AXI-Lite bridge into the accelerator's register file and 4-kilobyte buffer, feeding the popcount core. A register table below shows live values during the stepped transaction.">
    <!-- accelerator boundary -->
    <rect class="dp-boundary" x="730" y="48" width="450" height="240" rx="2"/>
    <text class="dp-boundary-label" x="746" y="72">ACCELERATOR · 0xA0000000 · 8 KB WINDOW</text>
    <!-- bus labels -->
    <text class="dp-bus-label" x="435" y="158" text-anchor="middle">WISHBONE</text>
    <text class="dp-bus-label" x="688" y="100" text-anchor="middle">AXI-LITE</text>
    ${traces}
    ${stages}
    <!-- register table -->
    <text class="dp-table-title" x="30" y="318">REGISTER MAP · LIVE VALUES</text>
    ${regRows}
    <!-- transaction token -->
    <circle class="dp-token" id="dp-token" r="5" cx="-20" cy="-20"/>
  </svg>`;
}
