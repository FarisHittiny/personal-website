/** Benchmark mode: cycle bars comparing the software loop against the
 *  hardware path, with the hardware bar split into copy vs compute. */

import { BENCHMARKS, type Bench } from "./data";

export function renderBenchmark(el: HTMLElement, motionOk: boolean): void {
  el.innerHTML = `
    <div class="dp-bench-sizes mono" role="group" aria-label="Benchmark size">
      ${BENCHMARKS.map(
        (b, i) =>
          `<button type="button" class="dp-size${i === 2 ? " is-active" : ""}" data-i="${i}" aria-pressed="${i === 2}">${b.label}</button>`,
      ).join("")}
    </div>
    <div class="dp-bench-readout">
      <span class="dp-speedup" id="dp-speedup"></span>
      <span class="mono dim">FEWER CYCLES, HW VS SW</span>
    </div>
    <div class="dp-bars" id="dp-bars"></div>
  `;

  const bars = el.querySelector<HTMLElement>("#dp-bars")!;
  const speedup = el.querySelector<HTMLElement>("#dp-speedup")!;

  const show = (b: Bench) => {
    speedup.textContent = b.speedup;
    const copyPct = ((b.hwCopy / b.sw) * 100).toFixed(2);
    const computePct = ((b.hwCompute / b.sw) * 100).toFixed(2);
    const overheadPct = (((b.hwTotal - b.hwCopy - b.hwCompute) / b.sw) * 100).toFixed(2);
    bars.innerHTML = `
      <div class="dp-bar-row">
        <span class="dp-bar-label mono">SW LOOP</span>
        <div class="dp-bar-track">
          <div class="dp-bar dp-bar-sw" style="width:${motionOk ? "0" : "100%"}"></div>
        </div>
        <span class="dp-bar-val mono">${b.sw.toLocaleString()} CYC</span>
      </div>
      <div class="dp-bar-row">
        <span class="dp-bar-label mono">HW PATH</span>
        <div class="dp-bar-track">
          <div class="dp-bar dp-bar-copy" style="width:${motionOk ? "0" : copyPct + "%"}" title="MMIO copy: ${b.hwCopy.toLocaleString()} cycles"></div>
          <div class="dp-bar dp-bar-compute" style="width:${motionOk ? "0" : computePct + "%"}" title="Compute: ${b.hwCompute.toLocaleString()} cycles"></div>
          <div class="dp-bar dp-bar-overhead" style="width:${motionOk ? "0" : overheadPct + "%"}"></div>
        </div>
        <span class="dp-bar-val mono">${b.hwTotal.toLocaleString()} CYC</span>
      </div>
      <p class="dp-bar-legend mono">
        <span class="key key-copy"></span>MMIO COPY ${b.hwCopy.toLocaleString()}
        <span class="key key-compute"></span>COMPUTE ${b.hwCompute.toLocaleString()}
        <span class="key key-sw"></span>SW ${b.sw.toLocaleString()}
      </p>
    `;
    if (motionOk) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          bars.querySelector<HTMLElement>(".dp-bar-sw")!.style.width = "100%";
          bars.querySelector<HTMLElement>(".dp-bar-copy")!.style.width = copyPct + "%";
          bars.querySelector<HTMLElement>(".dp-bar-compute")!.style.width = computePct + "%";
          bars.querySelector<HTMLElement>(".dp-bar-overhead")!.style.width = overheadPct + "%";
        }),
      );
    }
  };

  el.querySelectorAll<HTMLButtonElement>(".dp-size").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".dp-size").forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
      show(BENCHMARKS[Number(btn.dataset.i)]);
    });
  });

  show(BENCHMARKS[2]);
}
