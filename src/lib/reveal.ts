/** Subtle scroll reveals: a quick fade, no slide, no stagger.
 *  Base CSS state is visible; html.js + motion-ok opts into hidden-then-fade,
 *  so content is never invisible without JS or under reduced motion. */

export function initReveals(): void {
  const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  const els = document.querySelectorAll<HTMLElement>(".reveal");
  if (!motionOk || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-revealed"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add("is-revealed");
          io.unobserve(entry.target);
        }
      }
    },
    // Fire as soon as the first pixels enter; the fade is quick enough to
    // never lag the scroll.
    { rootMargin: "0px 0px -5% 0px", threshold: 0 },
  );

  els.forEach((el) => io.observe(el));
}
