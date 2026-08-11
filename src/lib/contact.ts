/** Contact form → Formspree via plain fetch (their documented AJAX contract:
 *  POST FormData with `Accept: application/json`). Deliberately no
 *  @formspree/ajax — that package chains in @formspree/core and
 *  @stripe/stripe-js, a payment SDK this 3-field form will never use.
 *  All submit states are styled by the site's own design system; Formspree's
 *  default UI never loads because their script never loads. */

const FORMSPREE_ID = "xjgnqjzg";

export function initContact(): void {
  const form = document.getElementById("contact-form") as HTMLFormElement | null;
  if (!form) return;

  form.action = `https://formspree.io/f/${FORMSPREE_ID}`;
  const status = document.getElementById("form-status") as HTMLElement;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const fields = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")];
  const idleLabel = button.textContent;

  const setBusy = (busy: boolean) => {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? "SENDING…" : idleLabel;
    // Honeypot input stays enabled so bots can always fill it.
    for (const f of fields) {
      if (f.name !== "_gotcha") f.disabled = busy;
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    // Capture the payload BEFORE disabling anything — disabled fields are
    // excluded from FormData, which would submit an empty form.
    const data = new FormData(form);

    setBusy(true);
    status.className = "form-status mono";
    status.textContent = "SENDING…";

    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(String(res.status));
      status.className = "form-status mono is-ok";
      status.textContent = "SENT — I'LL GET BACK TO YOU SOON.";
      form.reset();
    } catch {
      status.className = "form-status mono is-error";
      status.textContent = "SEND FAILED — EMAIL ME AT FARIS@FARISHITTINY.COM INSTEAD.";
    } finally {
      setBusy(false);
    }
  });
}
