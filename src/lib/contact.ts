/** Contact form → Formspree (free tier). Until the endpoint ID is set, the
 *  form is replaced with a direct-email card so nothing broken ever ships. */

const FORMSPREE_ID = ""; // e.g. "mabcdefg" from https://formspree.io/forms

export function initContact(): void {
  const form = document.getElementById("contact-form") as HTMLFormElement | null;
  if (!form) return;

  if (!FORMSPREE_ID) {
    const note = document.createElement("div");
    note.className = "contact-form";
    note.innerHTML =
      '<p class="lede">The contact form is being wired up — for now, email works best:</p>' +
      '<p><a class="btn btn-ghost" href="mailto:farishittiny@tamu.edu">farishittiny@tamu.edu</a></p>';
    form.replaceWith(note);
    return;
  }

  form.action = `https://formspree.io/f/${FORMSPREE_ID}`;
  const status = document.getElementById("form-status")!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    status.className = "form-status mono";
    status.textContent = "SENDING…";
    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        status.className = "form-status mono is-ok";
        status.textContent = "SENT — I'LL GET BACK TO YOU SOON.";
        form.reset();
      } else {
        throw new Error(String(res.status));
      }
    } catch {
      status.className = "form-status mono is-error";
      status.textContent = "SEND FAILED — EMAIL ME AT FARISHITTINY@TAMU.EDU INSTEAD.";
    }
  });
}
