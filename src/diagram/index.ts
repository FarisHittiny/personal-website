/** RISC-V accelerator data-path diagram: mount, mode switching, hover/focus
 *  detail panel, keyboard navigation. */

import { buildDatapathSvg } from "./datapath.svg";
import { STAGES, STEPS } from "./data";
import { Stepper } from "./stepper";
import { renderBenchmark } from "./benchmark";

export function mountDiagram(el: HTMLElement | null): void {
  if (!el) return;
  const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

  el.innerHTML = `
    <p class="visually-hidden">
      Interactive block diagram. Data path: main RAM feeds the VexRiscv CPU;
      the CPU talks over Wishbone through a Wishbone-to-AXI-Lite bridge into
      the accelerator at address 0xA0000000, which contains a register file,
      a 4 KB data buffer, and the popcount core. A typical job: the CPU copies
      data into the buffer, writes LENGTH, sets CONTROL.START, polls STATUS
      until DONE, then reads RESULT. At 4 KB this takes 10,403 cycles against
      157,583 for the software loop: 15.1 times fewer.
    </p>
    <div class="dp-toolbar" role="group" aria-label="Diagram modes">
      <button type="button" class="btn btn-ghost dp-mode" id="dp-mode-step" aria-pressed="false">Step transaction</button>
      <button type="button" class="btn btn-ghost dp-mode" id="dp-mode-bench" aria-pressed="false">Run benchmark</button>
      <span class="mono dim dp-hint" id="dp-hint">HOVER OR FOCUS A BLOCK, OR STEP THE TRANSACTION</span>
    </div>
    <div class="dp-scroll">
      <div class="dp-svg" id="dp-svg">${buildDatapathSvg()}</div>
    </div>
    <div class="dp-lower">
      <aside class="dp-panel" id="dp-panel" aria-live="polite">
        <p class="dp-panel-title mono" id="dp-panel-title">DATA PATH</p>
        <p class="dp-panel-body" id="dp-panel-body">
          Hover or focus any block to see what it does. "Step transaction"
          walks one 4 KB popcount job through the full MMIO sequence;
          "Run benchmark" shows where the cycles actually go.
        </p>
        <div class="dp-stepctl" id="dp-stepctl" hidden>
          <button type="button" class="btn btn-ghost" id="dp-prev" aria-label="Previous step">← Prev</button>
          <span class="mono" id="dp-stepnum"></span>
          <button type="button" class="btn btn-ghost" id="dp-next" aria-label="Next step">Next →</button>
        </div>
      </aside>
      <div class="dp-bench" id="dp-bench" hidden></div>
    </div>
  `;

  const svg = el.querySelector<SVGSVGElement>("svg")!;
  const panelTitle = el.querySelector<HTMLElement>("#dp-panel-title")!;
  const panelBody = el.querySelector<HTMLElement>("#dp-panel-body")!;
  const stepCtl = el.querySelector<HTMLElement>("#dp-stepctl")!;
  const stepNum = el.querySelector<HTMLElement>("#dp-stepnum")!;
  const benchEl = el.querySelector<HTMLElement>("#dp-bench")!;
  const btnStep = el.querySelector<HTMLButtonElement>("#dp-mode-step")!;
  const btnBench = el.querySelector<HTMLButtonElement>("#dp-mode-bench")!;
  const hint = el.querySelector<HTMLElement>("#dp-hint")!;

  const stepper = new Stepper(svg, motionOk);
  let mode: "idle" | "step" | "bench" = "idle";

  const showStage = (id: string) => {
    const s = STAGES.find((st) => st.id === id);
    if (!s) return;
    panelTitle.textContent = `${s.label.toUpperCase()} · ${s.sub.toUpperCase()}`;
    panelBody.textContent = s.detail;
  };

  const showStep = (i: number) => {
    const step = stepper.go(i);
    if (!step) return;
    panelTitle.textContent = `STEP ${i + 1}/${STEPS.length} · ${step.title.toUpperCase()}`;
    panelBody.textContent = step.desc;
    stepNum.textContent = `${i + 1} / ${STEPS.length}`;
  };

  const setMode = (next: "idle" | "step" | "bench") => {
    mode = next;
    btnStep.classList.toggle("is-active", mode === "step");
    btnStep.setAttribute("aria-pressed", String(mode === "step"));
    btnBench.classList.toggle("is-active", mode === "bench");
    btnBench.setAttribute("aria-pressed", String(mode === "bench"));
    stepCtl.hidden = mode !== "step";
    benchEl.hidden = mode !== "bench";
    hint.textContent =
      mode === "step"
        ? "←/→ TO STEP · ESC TO EXIT"
        : mode === "bench"
          ? "PICK A SIZE · ESC TO EXIT"
          : "HOVER OR FOCUS A BLOCK, OR STEP THE TRANSACTION";
    if (mode === "step") {
      showStep(0);
    } else {
      stepper.go(-1);
      if (mode === "bench") {
        renderBenchmark(benchEl, motionOk);
        panelTitle.textContent = "BENCHMARK · CYCLES, MEASURED";
        panelBody.textContent =
          "Both paths run in the same binary on the same buffer, timed with the LiteX timer (cycle-exact under Verilator). The hardware bar splits into the MMIO buffer copy and the core's compute time; the copy dominates.";
      } else {
        panelTitle.textContent = "DATA PATH";
        panelBody.textContent =
          'Hover or focus any block to see what it does. "Step transaction" walks one 4 KB popcount job through the full MMIO sequence; "Run benchmark" shows where the cycles actually go.';
      }
    }
  };

  btnStep.addEventListener("click", () => setMode(mode === "step" ? "idle" : "step"));
  btnBench.addEventListener("click", () => setMode(mode === "bench" ? "idle" : "bench"));

  el.querySelector("#dp-prev")!.addEventListener("click", () => {
    if (stepper.index > 0) showStep(stepper.index - 1);
  });
  el.querySelector("#dp-next")!.addEventListener("click", () => {
    if (stepper.index < STEPS.length - 1) showStep(stepper.index + 1);
  });

  // Stage hover/focus → detail panel (outside step mode).
  svg.querySelectorAll<SVGGElement>(".dp-stage").forEach((g) => {
    const id = g.id.replace("stg-", "");
    const activate = () => {
      if (mode === "idle") showStage(id);
    };
    g.addEventListener("pointerenter", activate);
    g.addEventListener("focus", activate);
    g.addEventListener("click", activate);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showStage(id);
      }
    });
  });

  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode !== "idle") {
      setMode("idle");
      return;
    }
    if (mode !== "step") return;
    if (e.key === "ArrowRight" && stepper.index < STEPS.length - 1) {
      e.preventDefault();
      showStep(stepper.index + 1);
    } else if (e.key === "ArrowLeft" && stepper.index > 0) {
      e.preventDefault();
      showStep(stepper.index - 1);
    }
  });
}
