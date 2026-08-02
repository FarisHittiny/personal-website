/** Data model for the RISC-V accelerator data-path diagram.
 *  Every number here is verified against the riscv-accel repo:
 *  rtl/accel_regs.vh (register map) and docs/benchmark.md (cycle counts). */

export interface Stage {
  id: string;
  label: string;
  sub: string;
  detail: string;
}

export const STAGES: Stage[] = [
  {
    id: "ram",
    label: "main_ram",
    sub: "bench app @ 0x40000000",
    detail:
      "The bare-metal benchmark app lives in main RAM and is jumped to from the LiteX BIOS console. It runs both the software baseline and the hardware path on the same 4 KB pseudo-random buffer, then verifies the results match.",
  },
  {
    id: "cpu",
    label: "VexRiscv",
    sub: "rv32im · 1 MHz sys clock",
    detail:
      "A VexRiscv soft core (standard config) executes the benchmark. On the software path it runs a byte-wise popcount loop (~38 cycles/byte — a libgcc call per byte on rv32im without Zbb). On the hardware path it drives the accelerator through MMIO.",
  },
  {
    id: "bridge",
    label: "Wishbone2AXILite",
    sub: "bus bridge",
    detail:
      "The CPU's Wishbone bus is bridged to AXI-Lite for the accelerator. Every 32-bit MMIO access crosses here at ~6.1 cycles/word — the region is uncached, which is why the buffer copy dominates hardware time (~60% at 4 KB).",
  },
  {
    id: "regs",
    label: "Register file",
    sub: "0xA0000000 · AXI-Lite",
    detail:
      "Five memory-mapped registers control the accelerator: CONTROL (START, SOFTRESET), STATUS (DONE, ERROR, BUSY), LENGTH, CONFIG, and RESULT. The window is 8 KB; the driver polls STATUS until DONE.",
  },
  {
    id: "buf",
    label: "Data buffer",
    sub: "4 KB @ +0x1000",
    detail:
      "A 4 KB on-device buffer at offset 0x1000 inside the accelerator window (address bit 12 selects it). The CPU fills it with 32-bit MMIO writes before starting a job — this copy is the hardware path's main cost.",
  },
  {
    id: "core",
    label: "popcount_core",
    sub: "~1 byte/cycle",
    detail:
      "The compute core consumes the buffer at its design rate of ~1 byte per cycle, plus 30–50 cycles of start/poll overhead. For 4 KB it finishes in 4,126 cycles — the same work takes the software loop 157,583.",
  },
];

export interface RegRow {
  offset: string;
  name: string;
  bits: string;
  reset: string;
}

export const REGISTERS: RegRow[] = [
  { offset: "0x000", name: "CONTROL", bits: "START · SOFTRESET", reset: "0x00000000" },
  { offset: "0x004", name: "STATUS", bits: "DONE · ERROR · BUSY", reset: "0x00000000" },
  { offset: "0x010", name: "LENGTH", bits: "bytes, max 4096", reset: "0x00000000" },
  { offset: "0x014", name: "CONFIG", bits: "reserved", reset: "0x00000000" },
  { offset: "0x018", name: "RESULT", bits: "popcount", reset: "0x00000000" },
];

export interface Step {
  title: string;
  desc: string;
  /** stage ids lit during this step */
  stages: string[];
  /** trace ids lit during this step (token travels the first one) */
  traces: string[];
  /** register name -> new displayed value */
  regs: Record<string, string>;
}

export const STEPS: Step[] = [
  {
    title: "Copy payload",
    desc: "The CPU streams the 4 KB input into the device buffer at 0xA0001000 as 32-bit MMIO writes — uncached, through the bridge, ~6.1 cycles per word. 6,252 cycles of the 10,403-cycle total go here.",
    stages: ["cpu", "bridge", "buf"],
    traces: ["t-cpu-bridge", "t-bridge-buf"],
    regs: {},
  },
  {
    title: "Write LENGTH",
    desc: "One MMIO write sets LENGTH = 0x1000 (4,096 bytes) — the job size the core will consume.",
    stages: ["cpu", "bridge", "regs"],
    traces: ["t-cpu-bridge", "t-bridge-regs"],
    regs: { LENGTH: "0x00001000" },
  },
  {
    title: "Set CONTROL.START",
    desc: "Writing the START bit hands the job to hardware. From here the CPU's only role is to poll.",
    stages: ["cpu", "bridge", "regs"],
    traces: ["t-cpu-bridge", "t-bridge-regs"],
    regs: { CONTROL: "0x00000001" },
  },
  {
    title: "STATUS.BUSY — core runs",
    desc: "The core raises BUSY and consumes the buffer at ~1 byte/cycle. For 4 KB: 4,126 cycles of compute, including 30–50 cycles of start/poll overhead.",
    stages: ["regs", "buf", "core"],
    traces: ["t-buf-core"],
    regs: { STATUS: "0x00000004", CONTROL: "0x00000000" },
  },
  {
    title: "STATUS.DONE",
    desc: "The count is complete: DONE goes high, BUSY drops, and RESULT holds the popcount of all 4,096 bytes — about half of the 32,768 bits for pseudo-random data.",
    stages: ["core", "regs"],
    traces: ["t-core-regs"],
    regs: { STATUS: "0x00000001", RESULT: "≈0x4000" },
  },
  {
    title: "Read RESULT",
    desc: "The CPU reads RESULT back over the bridge and clears DONE. The app verifies it equals the software answer — every size matches. Total: 10,403 cycles vs 157,583 in software. 15.1× fewer.",
    stages: ["cpu", "bridge", "regs"],
    traces: ["t-bridge-regs", "t-cpu-bridge"],
    regs: { STATUS: "0x00000000" },
  },
];

export interface Bench {
  label: string;
  bytes: number;
  sw: number;
  hwTotal: number;
  hwCopy: number;
  hwCompute: number;
  speedup: string;
}

export const BENCHMARKS: Bench[] = [
  { label: "64 B", bytes: 64, sw: 2605, hwTotal: 342, hwCopy: 184, hwCompute: 112, speedup: "7.6×" },
  { label: "1 KB", bytes: 1024, sw: 39527, hwTotal: 2643, hwCopy: 1561, hwCompute: 1057, speedup: "15.0×" },
  { label: "4 KB", bytes: 4096, sw: 157583, hwTotal: 10403, hwCopy: 6252, hwCompute: 4126, speedup: "15.1×" },
];

export const CAVEAT =
  "Cycle-accurate LiteX/Verilator RTL simulation — not silicon. Software baseline is the shipped byte-wise loop; an optimized SWAR popcount would narrow the gap.";
