/** The notebook as a structured view. Everything except `firstRead` depends only on
 * the set of discoveries, so any discovery order yields the same notes. `firstRead`
 * preserves an earlier reading the player actually saw before later facts replaced it. */
import { EVIDENCE, OPTIONAL_RECORD, REGIONS } from "../../content/registry.js";
import type { EvidenceId } from "../../content/registry.js";
import { JOURNALS, RECORDS, STORY_EVIDENCE } from "../../content/story/evidence.js";
import type { DiscoveryId, JournalId, RecordId } from "../../content/story/evidence.js";
import { FACTS } from "../../content/story/facts.js";
import type { FactId } from "../../content/story/facts.js";
import { LEADS } from "../../content/story/leads.js";
import type { LeadId } from "../../content/story/leads.js";
import { JOURNAL_LINKS, QUESTIONS, REREADS } from "../../content/story/questions.js";
import type { HypothesisDefinition, QuestionDefinition, QuestionId, Reread } from "../../content/story/questions.js";
import { anyHolds, heldSince, holds, isJournal, labelOf, learned, openLeads } from "./knowledge.js";
import type { Learned } from "./knowledge.js";
import { requirements, resolutionVisible } from "./resolution.js";
import type { RequirementView } from "./resolution.js";
import type { StoryState } from "./state.js";

export type HypothesisStatus = "open" | "supported" | "doubtful" | "ruled_out" | "established";
export interface HypothesisView { id: string; text: string; status: HypothesisStatus }
export interface QuestionView { id: QuestionId; title: string; answer: string | null; hypotheses: HypothesisView[] }
export interface EntryView {
  id: DiscoveryId;
  label: string;
  provenance: string;
  observed: string;
  /** The first reading while it is still current, labelled as hypothesis. */
  reading: string | null;
  /** A replaced reading the player saw before the facts that replaced it. */
  firstRead: string | null;
  /** Later rereadings, one per axis. */
  notes: string[];
}
export interface JournalView { id: JournalId; label: string; text: string; context: string[] }
export interface LeadView { id: LeadId; region: string; text: string; hint: string | null }
export interface NotebookView {
  questions: QuestionView[];
  entries: EntryView[];
  journals: JournalView[];
  leads: LeadView[];
  learned: { id: FactId; text: string }[];
  /** The final checklist, present only once its question is open. */
  resolution: RequirementView[] | null;
}

export function hypothesisStatus(h: HypothesisDefinition, known: Learned): HypothesisStatus {
  if (anyHolds(known, h.established)) return "established";
  if (anyHolds(known, h.ruledOut)) return "ruled_out";
  if (anyHolds(known, h.weakened)) return "doubtful";
  if (anyHolds(known, h.supported)) return "supported";
  return "open";
}

export function questionView(id: QuestionId, known: Learned): QuestionView | null {
  const q: QuestionDefinition = QUESTIONS[id];
  if (!anyHolds(known, q.appears)) return null;
  const hypotheses: HypothesisView[] = [];
  for (const [hid, h] of Object.entries(q.hypotheses) as [string, HypothesisDefinition][]) {
    if (!anyHolds(known, h.appears)) continue;
    const status = hypothesisStatus(h, known);
    const settled = (status === "established" || status === "ruled_out") && h.settled;
    hypotheses.push({ id: hid, text: settled || h.text, status });
  }
  return { id, title: q.title, answer: q.answer && holds(known, q.answer.when) ? q.answer.text : null, hypotheses };
}

function entryText(id: DiscoveryId): { observed: string; provenance: string; reading: string } {
  if (Object.hasOwn(EVIDENCE, id)) {
    const e = EVIDENCE[id as EvidenceId];
    return { observed: e.observation, provenance: e.provenance, reading: e.hypothesis };
  }
  const e = Object.hasOwn(STORY_EVIDENCE, id) ? STORY_EVIDENCE[id as keyof typeof STORY_EVIDENCE] : RECORDS[id as RecordId];
  return { observed: e.observation, provenance: e.provenance, reading: e.reading };
}

export function entryView(id: DiscoveryId, foundTick: number, known: Learned): EntryView {
  const base = entryText(id);
  const rereads: readonly Reread[] = Object.hasOwn(REREADS, id) ? REREADS[id as keyof typeof REREADS] : [];
  const winners = new Map<string, Reread>();
  for (const r of rereads) if (holds(known, r.when)) winners.set(r.axis, r);
  const current = [...winners.values()];
  const replacing = current.filter((r) => r.replaces);
  const replacedAt = replacing.length ? Math.min(...replacing.map((r) => heldSince(known, r.when))) : Infinity;
  return {
    id,
    label: labelOf(id),
    provenance: base.provenance,
    observed: base.observed,
    reading: replacing.length ? null : base.reading,
    firstRead: replacing.length && foundTick < replacedAt ? base.reading : null,
    notes: current.map((r) => r.text),
  };
}

export function notebook(s: StoryState): NotebookView {
  const known = learned(s.discoveries);
  const questions = (Object.keys(QUESTIONS) as QuestionId[])
    .map((id) => questionView(id, known))
    .filter((q): q is QuestionView => q !== null);
  const entries: EntryView[] = [], journals: JournalView[] = [];
  for (const d of [...s.discoveries].sort((a, b) => a.tick - b.tick)) {
    if (isJournal(d.id)) {
      const text = d.id === OPTIONAL_RECORD.id ? OPTIONAL_RECORD.text : JOURNALS[d.id].text ?? "";
      const context = JOURNAL_LINKS[d.id].filter((f) => known.has(f)).map((f) => FACTS[f].text);
      journals.push({ id: d.id, label: labelOf(d.id), text, context });
    } else entries.push(entryView(d.id, d.tick, known));
  }
  const leads = openLeads(s).map((id) => {
    const tier = s.hints[id];
    return { id, region: REGIONS[LEADS[id].region].label, text: LEADS[id].text, hint: tier ? LEADS[id].hints[tier - 1]! : null };
  });
  return {
    questions,
    entries,
    journals,
    leads,
    learned: [...known.keys()].map((id) => ({ id, text: FACTS[id].text })),
    resolution: resolutionVisible(s) ? requirements(s) : null,
  };
}
