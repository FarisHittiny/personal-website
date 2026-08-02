/** Transaction sequencer: drives stage/trace highlighting, live register
 *  values, and the traveling token through the 6-step MMIO transaction. */

import { STEPS, REGISTERS } from "./data";

export class Stepper {
  private svg: SVGSVGElement;
  private motionOk: boolean;
  private tokenRaf = 0;
  index = -1; // -1 = idle

  constructor(svg: SVGSVGElement, motionOk: boolean) {
    this.svg = svg;
    this.motionOk = motionOk;
  }

  /** Apply step i (0-based); -1 resets to idle. Returns the step or null. */
  go(i: number) {
    cancelAnimationFrame(this.tokenRaf);
    const token = this.svg.querySelector<SVGCircleElement>("#dp-token")!;
    token.classList.remove("is-visible");

    this.svg.querySelectorAll(".dp-stage.is-lit").forEach((el) => el.classList.remove("is-lit"));
    this.svg.querySelectorAll(".dp-trace.is-lit").forEach((el) => el.classList.remove("is-lit"));

    if (i < 0 || i >= STEPS.length) {
      this.index = -1;
      this.resetRegs();
      return null;
    }

    this.index = i;
    const step = STEPS[i];
    for (const id of step.stages) {
      this.svg.querySelector(`#stg-${id}`)?.classList.add("is-lit");
    }
    for (const id of step.traces) {
      this.svg.querySelector(`#${id}`)?.classList.add("is-lit");
    }

    // Registers: replay all steps up to i so values are cumulative.
    this.resetRegs();
    for (let k = 0; k <= i; k++) {
      for (const [name, val] of Object.entries(STEPS[k].regs)) {
        this.setReg(name, val, k === i);
      }
    }

    // Token travels the first lit trace.
    const path = this.svg.querySelector<SVGPathElement>(`#${step.traces[0]}`);
    if (path) this.runToken(token, path);

    return step;
  }

  private resetRegs() {
    for (const r of REGISTERS) this.setReg(r.name, r.reset, false);
  }

  private setReg(name: string, value: string, flash: boolean) {
    const row = this.svg.querySelector(`.dp-regrow[data-reg="${name}"]`);
    if (!row) return;
    const cell = row.querySelector<SVGTextElement>(".dp-reg-value")!;
    cell.textContent = value;
    row.classList.toggle("is-changed", flash);
  }

  private runToken(token: SVGCircleElement, path: SVGPathElement) {
    token.classList.add("is-visible");
    const len = path.getTotalLength();
    if (!this.motionOk) {
      const p = path.getPointAtLength(len);
      token.setAttribute("cx", String(p.x));
      token.setAttribute("cy", String(p.y));
      return;
    }
    const dur = 900;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const p = path.getPointAtLength(eased * len);
      token.setAttribute("cx", String(p.x));
      token.setAttribute("cy", String(p.y));
      if (t < 1) this.tokenRaf = requestAnimationFrame(tick);
    };
    this.tokenRaf = requestAnimationFrame(tick);
  }
}
