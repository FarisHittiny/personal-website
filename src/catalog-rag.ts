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
   POST /ask {question, generate, route_override?}. Every ask requests an
   answer; when generation is unavailable (rate limit, budget, LLM down) the
   page asks again for retrieval only and shows those courses instead.
   Everything from the API lands in the DOM through textContent, never innerHTML. */

// Build-time override for local testing (VITE_RAG_API=http://localhost:7860 npm run build);
// production builds use the Cloud Run service.
const API_BASE = import.meta.env.VITE_RAG_API || "https://catalog-rag-931113045677.us-south1.run.app";
const WAKE_NOTE_AFTER_MS = 3000;
const REQUEST_TIMEOUT_MS = 60_000;
const ABSTAINED = "The catalog doesn't cover that (or the model wasn't sure). Retrieved courses are under HOW IT GOT THERE.";

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
const answerText = $<HTMLElement>("rag-answer-text");
const cited = $<HTMLUListElement>("rag-cited");
const unavailable = $<HTMLElement>("rag-unavailable");
const fallbackList = $<HTMLOListElement>("rag-fallback");
const routeEl = $<HTMLElement>("rag-route");
const retrieverEl = $<HTMLElement>("rag-retriever");
const listLabel = $<HTMLElement>("rag-list-label");
const list = $<HTMLOListElement>("rag-list");
const force = $<HTMLInputElement>("rag-force");

if (form && input && status && result && answerText && cited && unavailable && fallbackList
    && routeEl && retrieverEl && listLabel && list && force) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const idleLabel = button.textContent;
  let lastQuestion = "";

  const setStatus = (text: string, kind: "" | "is-wait" | "is-error" = "") => {
    status.className = `form-status mono ${kind}`.trim();
    status.textContent = text;
  };

  const setBusy = (busy: boolean) => {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? "ASKING…" : idleLabel;
    input.disabled = busy;
    force.disabled = busy;
  };

  const tag = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  };

  const fillList = (ol: HTMLOListElement, rows: Retrieved[]) => {
    ol.replaceChildren();
    for (const r of rows) {
      const li = document.createElement("li");
      const id = document.createElement("span");
      id.className = "rag-id mono";
      id.textContent = r.course_id;
      const title = document.createElement("span");
      title.className = "rag-title";
      title.textContent = r.title;
      li.append(id, title);
      ol.append(li);
    }
    if (rows.length === 0) ol.append(tag("NO RECORDS RETRIEVED"));
  };

  const renderDetail = (data: AskResponse) => {
    routeEl.textContent = `ROUTE · ${data.route}`;
    retrieverEl.textContent = `RETRIEVER · ${data.retriever_used}${data.cached ? " · CACHED ANSWER" : ""}`;
    if (data.retriever_used === "graph") {
      // For a prereq-routed question the API prepends the asked course(s) to the context.
      const got = new Set(data.retrieved.map((r) => r.course_id));
      const asked = data.context_course_ids.filter((c) => !got.has(c));
      listLabel.textContent = `COURSES THAT REQUIRE ${asked.join(" / ") || "THE ASKED COURSE"}`;
    } else {
      listLabel.textContent = "TOP MATCHES";
    }
    fillList(list, data.retrieved);
  };

  const renderAnswer = (data: AskResponse) => {
    answerText.textContent = data.abstained ? ABSTAINED : (data.answer ?? ABSTAINED);
    answerText.hidden = false;
    cited.replaceChildren(...data.cited_course_ids.map(tag));
    cited.hidden = data.abstained || data.cited_course_ids.length === 0;
    unavailable.hidden = true;
    fallbackList.hidden = true;
    renderDetail(data);
    result.hidden = false;
  };

  const renderUnavailable = (data: AskResponse) => {
    answerText.hidden = true;
    cited.hidden = true;
    unavailable.hidden = false;
    fillList(fallbackList, data.retrieved);
    fallbackList.hidden = false;
    renderDetail(data);
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

  const post = (payload: Record<string, unknown>, signal: AbortSignal) =>
    fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

  const ask = async (question: string) => {
    if (button.disabled) return; // one request in flight at a time (chips call requestSubmit)
    lastQuestion = question;
    const payload: Record<string, unknown> = { question, generate: true };
    if (force.checked) payload.route_override = "prereq";

    setBusy(true);
    setStatus("ASKING…");
    const wakeNote = window.setTimeout(
      () => setStatus("WAKING SERVER · ~20 S ON FIRST REQUEST", "is-wait"),
      WAKE_NOTE_AFTER_MS,
    );
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await post(payload, controller.signal);
      if (res.ok) {
        renderAnswer((await res.json()) as AskResponse);
        setStatus("");
        return;
      }
      const generationDown = res.status === 429 || res.status === 502 || res.status === 503;
      if (generationDown) {
        // The error body carries no courses: ask once more for retrieval only.
        const retry = await post({ ...payload, generate: false }, controller.signal);
        if (retry.ok) {
          renderUnavailable((await retry.json()) as AskResponse);
          setStatus("");
          return;
        }
      }
      setStatus(await messageFor(res), "is-error");
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setStatus(aborted ? "THE SERVER DID NOT ANSWER IN 60 S, TRY AGAIN" : "COULD NOT REACH THE API", "is-error");
    } finally {
      window.clearTimeout(wakeNote);
      window.clearTimeout(deadline);
      setBusy(false);
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const question = input.value.trim().slice(0, 300);
    if (!question) {
      input.focus();
      return;
    }
    void ask(question);
  });

  for (const chip of form.querySelectorAll<HTMLButtonElement>(".rag-chip")) {
    chip.addEventListener("click", () => {
      input.value = chip.dataset.q ?? chip.textContent ?? "";
      form.requestSubmit();
    });
  }

  // Flipping the override re-runs the question that is on screen.
  force.addEventListener("change", () => {
    if (lastQuestion) void ask(lastQuestion);
  });
}
