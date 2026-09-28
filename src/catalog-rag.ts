import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/motion.css";
import "./styles/catalog.css";

import { initReveals } from "./lib/reveal";
import { initCursor } from "./lib/cursor";

// Signal JS is alive — motion.css only hides .reveal elements under html.js.
document.documentElement.classList.add("js");

initReveals();
initCursor();

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

/* ============ Live demo against the catalog-rag API ============
   POST /ask {question, generate, route_override?}. Retrieval is always on;
   generation only when the switch is set. Everything from the API lands in
   the DOM through textContent, never innerHTML. */

// Build-time override for local testing (VITE_RAG_API=http://localhost:7860 npm run build);
// production builds use the Cloud Run service.
const API_BASE = import.meta.env.VITE_RAG_API || "https://catalog-rag-931113045677.us-south1.run.app";
const WAKE_NOTE_AFTER_MS = 3000;
const REQUEST_TIMEOUT_MS = 60_000;

interface Retrieved {
  course_id: string;
  title: string;
  rank: number;
}

interface AskResponse {
  route: "prereq" | "other";
  retriever_used: string;
  retrieved: Retrieved[];
  context_course_ids: string[];
  answer: string | null;
  cited_course_ids: string[];
  abstained: boolean;
  cached: boolean;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const form = $<HTMLFormElement>("rag-form");
const input = $<HTMLInputElement>("rag-q");
const status = $<HTMLElement>("rag-status");
const result = $<HTMLElement>("rag-result");
const routeEl = $<HTMLElement>("rag-route");
const retrieverEl = $<HTMLElement>("rag-retriever");
const list = $<HTMLOListElement>("rag-list");
const answerBox = $<HTMLElement>("rag-answer");
const answerText = $<HTMLElement>("rag-answer-text");
const cited = $<HTMLUListElement>("rag-cited");
const abstained = $<HTMLElement>("rag-abstained");
const generateSwitch = $<HTMLButtonElement>("rag-generate");
const prereqSwitch = $<HTMLButtonElement>("rag-prereq");

if (form && input && status && result && routeEl && retrieverEl && list && answerBox
    && answerText && cited && abstained && generateSwitch && prereqSwitch) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const idleLabel = button.textContent;
  const isOn = (sw: HTMLButtonElement) => sw.getAttribute("aria-checked") === "true";

  for (const sw of [generateSwitch, prereqSwitch]) {
    sw.addEventListener("click", () => sw.setAttribute("aria-checked", String(!isOn(sw))));
  }

  for (const chip of form.querySelectorAll<HTMLButtonElement>(".rag-chip")) {
    chip.addEventListener("click", () => {
      input.value = chip.dataset.q ?? chip.textContent ?? "";
      form.requestSubmit();
    });
  }

  const setStatus = (text: string, kind: "" | "is-wait" | "is-error" | "is-ok" = "") => {
    status.className = `form-status mono ${kind}`.trim();
    status.textContent = text;
  };

  const setBusy = (busy: boolean) => {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? "ASKING…" : idleLabel;
    input.disabled = busy;
  };

  const tag = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  };

  const render = (data: AskResponse, generate: boolean) => {
    routeEl.textContent = `ROUTE · ${data.route}`;
    retrieverEl.textContent = `RETRIEVER · ${data.retriever_used}${data.cached ? " · CACHED ANSWER" : ""}`;

    list.replaceChildren();
    for (const r of data.retrieved) {
      const li = document.createElement("li");
      const id = document.createElement("span");
      id.className = "rag-id mono";
      id.textContent = r.course_id;
      const title = document.createElement("span");
      title.className = "rag-title";
      title.textContent = r.title;
      li.append(id, title);
      list.append(li);
    }
    if (data.retrieved.length === 0) list.append(tag("NO RECORDS RETRIEVED"));

    abstained.hidden = !(generate && data.abstained);
    const showAnswer = generate && !data.abstained && data.answer !== null;
    answerBox.hidden = !showAnswer;
    if (showAnswer) {
      answerText.textContent = data.answer;
      cited.replaceChildren(...data.cited_course_ids.map(tag));
      cited.hidden = data.cited_course_ids.length === 0;
    }
    result.hidden = false;
  };

  const messageFor = async (res: Response): Promise<string> => {
    if (res.status === 429) return "RATE LIMIT REACHED, TRY LATER";
    if (res.status === 502 || res.status === 503) return "GENERATION OFFLINE, RETRIEVAL STILL WORKS";
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") return body.detail.toUpperCase();
    } catch {
      /* non-JSON body: fall through to the status code */
    }
    return `REQUEST FAILED (HTTP ${res.status})`;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = input.value.trim().slice(0, 300);
    if (!question) {
      input.focus();
      return;
    }
    const generate = isOn(generateSwitch);
    const payload: Record<string, unknown> = { question, generate };
    if (isOn(prereqSwitch)) payload.route_override = "prereq";

    setBusy(true);
    setStatus(generate ? "RETRIEVING AND GENERATING…" : "RETRIEVING…");
    const wakeNote = window.setTimeout(
      () => setStatus("WAKING SERVER · ~20 S ON FIRST REQUEST", "is-wait"),
      WAKE_NOTE_AFTER_MS,
    );
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        setStatus(await messageFor(res), "is-error");
        return;
      }
      render((await res.json()) as AskResponse, generate);
      setStatus("");
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setStatus(aborted ? "THE SERVER DID NOT ANSWER IN 60 S, TRY AGAIN" : "COULD NOT REACH THE API", "is-error");
    } finally {
      window.clearTimeout(wakeNote);
      window.clearTimeout(deadline);
      setBusy(false);
    }
  });
}
