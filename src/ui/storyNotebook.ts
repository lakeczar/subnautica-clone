/** S5's notebook in the panel, through S8's extension sections. Questions and
 * current readings come first; replaced readings and older records fold. The
 * story owns every word; this file only lays the view out. */
import type { HypothesisStatus } from "../sim/story/notebook.js";
import type { NotebookView } from "../sim/story/index.js";
import { storyNotebook } from "../sim/storyLink.js";
import type { PanelView, SectionKit } from "./panels.js";

const STATUS: Record<HypothesisStatus, string> = {
  open: "Open", supported: "Supported", doubtful: "Doubtful", ruled_out: "Ruled out", established: "Established",
};

function questions(view: NotebookView, kit: SectionKit): string {
  if (!view.questions.length && !view.leads.length) return "";
  let html = view.questions.map((q) => `<article class="story-question" data-question="${kit.escape(q.id)}"><h3>${kit.escape(q.title)}</h3>${
    q.answer ? `<p class="story-answer">${kit.escape(q.answer)}</p>` : ""}<ul class="hypotheses">${q.hypotheses.map((h) =>
    `<li data-status="${h.status}"><span class="status-chip">${STATUS[h.status]}</span> ${kit.escape(h.text)}</li>`).join("")}</ul></article>`).join("");
  if (view.leads.length)
    html += `<article class="story-leads"><h3>Leads</h3>${view.leads.map((l) => `<p class="lead" data-lead="${kit.escape(l.id)}"><b>${kit.escape(l.region)}</b> · ${
      kit.escape(l.text)}${l.hint ? `<small class="story-hint">Hint · ${kit.escape(l.hint)}</small>` : ""}</p>`).join("")}</article>`;
  if (view.resolution)
    html += `<article class="story-checklist"><h3>Before the return</h3><ul>${view.resolution.map((r) =>
      `<li data-met="${r.met}">${r.met ? "Done" : "To do"} · ${kit.escape(r.label)}</li>`).join("")}</ul></article>`;
  return html;
}

/** Every record stays whole: observation, the current reading (or the reread
 * that replaced it), and any earlier reading folded inside. Only the newest opens. */
function readings(view: NotebookView, kit: SectionKit): string {
  const newest = view.entries.at(-1)?.id;
  return view.entries.map((e) => {
    const reading = e.reading ? `<p><b>Hypothesis</b> · ${kit.escape(e.reading)}</p>` : "";
    const notes = e.notes.map((n) => `<p class="reread"><b>Read again</b> · ${kit.escape(n)}</p>`).join("");
    const first = e.firstRead ? kit.group(`first:${e.id}`, "First reading", `<p class="first-read">${kit.escape(e.firstRead)}</p>`) : "";
    return kit.group(`finding:${e.id}`, kit.escape(e.label),
      `<p class="provenance">Source · ${kit.escape(e.provenance)}</p><p><b>Observed</b> · ${kit.escape(e.observed)}</p>${reading}${notes}${first}`,
      e.id === newest, { id: `finding-${e.id}`, className: "finding" });
  }).join("");
}

function journals(view: NotebookView, kit: SectionKit): string {
  return view.journals.map((j) => `<article class="story-journal"><h3>${kit.escape(j.label)} · personal record</h3><p>${kit.escape(j.text)}</p>${
    j.context.map((c) => `<p class="journal-context">${kit.escape(c)}</p>`).join("")}</article>`).join("");
}

/** GameView registers these once; each renders from the current state. */
export function registerStoryNotebook(panels: PanelView): void {
  panels.addSection("notebook", { id: "story-questions", after: "question", render: (s, kit) => questions(storyNotebook(s), kit) });
  panels.addSection("notebook", { id: "story-readings", after: "findings", render: (s, kit) => readings(storyNotebook(s), kit) });
  panels.addSection("notebook", { id: "story-journals", after: "field-notes", render: (s, kit) => journals(storyNotebook(s), kit) });
}
