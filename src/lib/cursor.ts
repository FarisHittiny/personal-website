/** Custom cursor: gold dot follows the pointer directly, hairline ring lags
 *  behind via lerp and tightens over interactive elements. Overlay only —
 *  the native cursor is never hidden, so nothing breaks if this fails. */

export function initCursor(): void {
  const fine = window.matchMedia("(pointer: fine)").matches;
  const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  if (!fine || !motionOk) return;

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  document.body.append(dot, ring);
  document.documentElement.classList.add("cursor-on");

  let x = -100;
  let y = -100;
  let rx = -100;
  let ry = -100;
  let raf = 0;

  const tick = () => {
    rx += (x - rx) * 0.16;
    ry += (y - ry) * 0.16;
    dot.style.transform = `translate(${x - 3}px, ${y - 3}px)`;
    ring.style.transform = `translate(${rx - 14}px, ${ry - 14}px)`;
    raf = requestAnimationFrame(tick);
  };

  window.addEventListener(
    "pointermove",
    (e) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    { passive: true },
  );

  const interactive = "a, button, input, textarea, select, [tabindex]";
  document.addEventListener("pointerover", (e) => {
    ring.classList.toggle("is-active", !!(e.target as Element).closest?.(interactive));
  });

  document.addEventListener("pointerleave", () => {
    dot.style.opacity = "0";
    ring.style.opacity = "0";
  });
  document.addEventListener("pointerenter", () => {
    dot.style.opacity = "1";
    ring.style.opacity = "1";
  });
}
