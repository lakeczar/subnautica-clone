/** Derived knowledge: facts, plans and leads follow from the set of discoveries.
 * Recording is idempotent and order-independent; nothing is ever un-learned. */
import { EVIDENCE, EVIDENCE_BLUEPRINTS, OPTIONAL_RECORD } from "../../content/registry.js";
import type { EvidenceId } from "../../content/registry.js";
import {
  EVIDENCE_META, JOURNALS, RECORDS, STORY_EVIDENCE, STORY_GRANTS,
} from "../../content/story/evidence.js";
import type { DiscoveryId, JournalId, RecordId, StoryEvidenceId } from "../../content/story/evidence.js";
import { FACT_IDS, FACTS } from "../../content/story/facts.js";
import type { FactId } from "../../content/story/facts.js";
import { LEAD_IDS, LEADS } from "../../content/story/leads.js";
import type { LeadId } from "../../content/story/leads.js";
import type { Conditions } from "../../content/story/questions.js";
import type { AnyBlueprint } from "../../content/story/strategies.js";
import type { Discovery, StoryState } from "./state.js";

/** Each known fact with the tick it was first learned. */
export type Learned = ReadonlyMap<FactId, number>;

export const found = (s: StoryState, id: DiscoveryId): boolean =>
  s.discoveries.some((d) => d.id === id);

export function learned(discoveries: readonly Discovery[]): Map<FactId, number> {
  const tick = new Map<DiscoveryId, number>();
  for (const d of discoveries) tick.set(d.id, Math.min(d.tick, tick.get(d.id) ?? Infinity));
  const out = new Map<FactId, number>();
  for (const id of FACT_IDS) {
    const t = Math.min(...FACTS[id].sources.map((src) => tick.get(src) ?? Infinity));
    if (t < Infinity) out.set(id, t);
  }
  return out;
}

export const holds = (known: Learned, all: readonly FactId[]): boolean => all.every((f) => known.has(f));
export const anyHolds = (known: Learned, conds: Conditions | undefined): boolean =>
  !!conds && conds.some((c) => holds(known, c));
/** Tick at which an all-of condition first held. */
export const heldSince = (known: Learned, all: readonly FactId[]): number =>
  Math.max(...all.map((f) => known.get(f) ?? Infinity));

export function blueprints(discoveries: readonly Discovery[]): Set<AnyBlueprint> {
  const out = new Set<AnyBlueprint>();
  for (const { id } of discoveries) {
    if (Object.hasOwn(EVIDENCE_BLUEPRINTS, id)) for (const bp of EVIDENCE_BLUEPRINTS[id as EvidenceId]) out.add(bp);
    if (Object.hasOwn(STORY_GRANTS, id)) for (const bp of STORY_GRANTS[id as keyof typeof STORY_GRANTS]) out.add(bp);
  }
  return out;
}

export function openLeads(s: StoryState): LeadId[] {
  return LEAD_IDS
    .filter((id) => LEADS[id].offeredBy.some((o) => found(s, o)) && !LEADS[id].targets.some((t) => found(s, t)))
    .sort((a, b) => LEADS[a].order - LEADS[b].order);
}

export function labelOf(id: DiscoveryId): string {
  if (Object.hasOwn(EVIDENCE, id)) return EVIDENCE[id as EvidenceId].label;
  if (Object.hasOwn(STORY_EVIDENCE, id)) return STORY_EVIDENCE[id as keyof typeof STORY_EVIDENCE].label;
  if (Object.hasOwn(RECORDS, id)) return RECORDS[id as RecordId].label;
  return id === OPTIONAL_RECORD.id ? OPTIONAL_RECORD.label : JOURNALS[id as JournalId].label;
}
export const isEvidence = (id: DiscoveryId): id is StoryEvidenceId => Object.hasOwn(EVIDENCE_META, id);
export const isJournal = (id: DiscoveryId): id is JournalId => Object.hasOwn(JOURNALS, id);

export interface DiscoveryOutcome {
  added: boolean;
  facts: FactId[];
  blueprints: AnyBlueprint[];
  leads: LeadId[];
  /** One concise notice line for the HUD. */
  message: string;
}

export function recordDiscovery(s: StoryState, id: DiscoveryId, tick: number): DiscoveryOutcome {
  if (found(s, id)) return { added: false, facts: [], blueprints: [], leads: [], message: `${labelOf(id)} · already in the notebook.` };
  const beforeFacts = learned(s.discoveries), beforePlans = blueprints(s.discoveries), beforeLeads = new Set(openLeads(s));
  s.discoveries.push({ id, tick });
  const facts = [...learned(s.discoveries).keys()].filter((f) => !beforeFacts.has(f));
  const plans = [...blueprints(s.discoveries)].filter((bp) => !beforePlans.has(bp));
  const leads = openLeads(s).filter((l) => !beforeLeads.has(l));
  const lead = leads[0] ? ` ${LEADS[leads[0]].text}` : "";
  const message = isJournal(id)
    ? `${labelOf(id)} · personal record.`
    : `${labelOf(id)} recorded.${lead}`;
  return { added: true, facts, blueprints: plans, leads, message };
}

/** Merge discovery lists from several saved sources (e.g. knowledge.evidence and
 * story.discoveries) into one, keeping each ID's earliest tick. */
export function mergeDiscoveries(...lists: readonly (readonly Discovery[])[]): Discovery[] {
  const first = new Map<DiscoveryId, number>();
  for (const list of lists) for (const d of list) first.set(d.id, Math.min(d.tick, first.get(d.id) ?? Infinity));
  return [...first].map(([id, tick]) => ({ id, tick })).sort((a, b) => a.tick - b.tick);
}
