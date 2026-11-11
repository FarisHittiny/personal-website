/** Briefly highlight the element a jump landed on. Removing the class and
 *  forcing a reflow first lets the animation restart on repeat jumps. */
export function flash(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}
