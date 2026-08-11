/** Scroll-triggered staggered reveals via IntersectionObserver.
 *  Base CSS state is visible; html.js + motion-ok opts into hidden-then-reveal,
 *  so content is never invisible without JS or under reduced motion. */

export function initReveals(): void {
  const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  const els = document.querySelectorAll<HTMLElement>(".reveal");
  if (!motionOk || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-revealed"));
    return;
  }

  // Stagger siblings that reveal together: index within their section.
  const bySection = new Map<Element, number>();
  els.forEach((el) => {
    const section = el.closest("section") ?? document.body;
    const i = bySection.get(section) ?? 0;
    el.style.setProperty("--stagger-i", String(Math.min(i, 6)));
    bySection.set(section, i + 1);
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add("is-revealed");
          io.unobserve(entry.target);
        }
      }
    },
    // threshold 0 + a shallow bottom margin: reveal starts as soon as the first
    // pixels enter, so tall elements (photo cards) don't lag behind the scroll.
    { rootMargin: "0px 0px -5% 0px", threshold: 0 },
  );

  els.forEach((el) => io.observe(el));
}
