/** The field journal: one browsable model built from existing state plus SYS-2
 * systems. The story notebook is S5's view, reused as is; creatures and cycles
 * are slots other builders fill. The UI lays this out; it owns no words of the story. */
import { FUTURE_BLUEPRINTS, MATERIALS, RECIPES, REGIONS, SOURCE_RENEWAL, SOURCES, TECH_RECORDS, techRecord } from "../../content/registry.js";
import type { Recipe, RegionId } from "../../content/registry.js";
import { SEEDS } from "../../content/systems/cultivation.js";
import { DECODABLES, DECODE_MINUTES, LOST_SITES, placedReveals } from "../../content/systems/decodes.js";
import { SYS2_BLUEPRINTS } from "../../content/systems/items.js";
import { storyNotebook } from "../storyLink.js";
import type { NotebookView } from "../story/notebook.js";
import type { GameState } from "../types.js";
import { decodeViews, doorCodes, markedSites, readableLog } from "./decoder.js";
import { readableNotes } from "./notes.js";
import type { DecoderContext, DecodeStatus } from "./decoder.js";
import { cropViews } from "./cultivation.js";
import type { HostPower } from "./hosts.js";
import { labelOf } from "../inventory.js";
import type { SystemsState } from "./state.js";
import { FIXED_SECONDS, formatDuration as minutes } from "../clock.js";

export type JournalTabId = "materials" | "creatures" | "tech" | "notebook" | "cycles" | "decodes";
export interface JournalEntry {
  id: string;
  title: string;
  subtitle: string;
  lines: string[];
  /** Filter chips: regions, roles, statuses. */
  tags: string[];
  status?: "known" | "unknown" | "active" | "locked" | "done";
  /** Decoded record text, as the player may read it (`readableLog`). */
  logs?: string[];
}
export interface JournalSection { id: string; title: string; entries: JournalEntry[] }
export interface JournalTab { id: JournalTabId; label: string; count: number; sections: JournalSection[]; empty: string }
export interface FieldJournal { tabs: JournalTab[]; notebook: NotebookView }

/** Creature slot, filled by the ecology owner. */
export interface CreatureEntry { id: string; label: string; region: RegionId; behaviour: string; notes?: readonly string[]; danger?: "harmless" | "cue" | "den" | "hunter" }
/** Cycle slot, filled by the cycles owner: seen cycles with their timings. */
/** C4: timings are null until watched (CY's observer); `phases` lists each phase's
 * measured length or "not yet timed", and `cues` the warnings learned. */
export interface CycleEntry {
  id: string; label: string; region: RegionId; periodSeconds: number | null; windowSeconds: number | null; alternative: string;
  phases?: readonly string[]; cues?: readonly string[];
}
export interface JournalInput {
  notebook?: NotebookView;
  creatures?: readonly CreatureEntry[];
  cycles?: readonly CycleEntry[];
  decoder?: DecoderContext;
}

const region = (id: string): string => Object.hasOwn(REGIONS, id) ? REGIONS[id as RegionId].label : id;
const BLUEPRINT_LABELS: Readonly<Record<string, string>> = { ...FUTURE_BLUEPRINTS, ...SYS2_BLUEPRINTS };
const blueprintLabel = (id: string): string => BLUEPRINT_LABELS[id] ?? id.replace(/^bp_/, "").replaceAll("_", " ");
type AnyRecipe = Pick<Recipe, "label" | "cost" | "site"> & { bp: string; output: string };
/** The composed registry is the one recipe authority (SYS-2's recipes included). */
const ALL_RECIPES: Readonly<Record<string, AnyRecipe>> = RECIPES;

function knownRecipes(s: GameState): [string, AnyRecipe][] {
  const bps = s.knowledge.blueprints as readonly string[];
  return Object.entries(ALL_RECIPES).filter(([, r]) => bps.includes(r.bp));
}

function materialsTab(s: GameState, sys: SystemsState, power?: HostPower): JournalTab {
  const scanned = s.knowledge.scans.filter((id) => Object.hasOwn(SOURCES, id)) as (keyof typeof SOURCES)[];
  const held = new Set(s.inventory.items.map((i) => i.kind as string));
  const kinds = new Set<string>([...scanned.map((id) => SOURCES[id].item), ...[...held].filter((k) =>
    Object.hasOwn(MATERIALS, k) || k === "tagged_frame" || Object.hasOwn(SEEDS, k) || k === "bio_cell" || k === "field_salve")]);
  const recipes = knownRecipes(s);
  const entries = [...kinds].sort().map((kind): JournalEntry => {
    const uses = recipes.filter(([, r]) => Object.hasOwn(r.cost, kind)).map(([, r]) => r.label);
    const grows = Object.values(SEEDS).filter((seed) => seed.produce === kind).map((seed) => `${seed.label} planter`);
    const sites = scanned.filter((id) => SOURCES[id].item === kind).map((id) => {
      const src = SOURCES[id], node = s.world.resources.find((r) => r.id === id);
      const rule = Object.hasOwn(SOURCE_RENEWAL, id) ? SOURCE_RENEWAL[id as keyof typeof SOURCE_RENEWAL] : null;
      const regrowth = rule ? `regrows ${rule.quantity} every ${minutes(rule.intervalSteps * FIXED_SECONDS)} up to ${src.stock}` : node && node.stock + node.reserve > 0 ? "finite" : "exhausted";
      return `${src.label} · ${region(src.region)} · ${node?.stock ?? 0} ready · ${node?.reserve ?? 0} reserve · ${regrowth}`;
    });
    const count = s.inventory.items.filter((i) => i.kind === kind).reduce((n, i) => n + i.quantity, 0);
    const seed = Object.hasOwn(SEEDS, kind) ? SEEDS[kind as keyof typeof SEEDS] : null;
    return {
      id: `material:${kind}`, title: labelOf(kind),
      subtitle: uses.length ? `Used in ${uses.join(", ")}` : seed ? `Plant it: grows ${labelOf(seed.produce).toLowerCase()} in about ${minutes(seed.growSeconds)}` : "Use unknown. Scan more or find plans",
      lines: [...(count ? [`Carried and stored: ${count}`] : []), ...sites, ...(grows.length ? [`Also grown: ${grows.join(", ")}`] : [])],
      tags: [...new Set(scanned.filter((id) => SOURCES[id].item === kind).map((id) => region(SOURCES[id].region)))],
      status: uses.length || seed ? "known" : "unknown",
    };
  });
  const crops = cropViews(sys, s, power).map((c): JournalEntry => ({
    id: `crop:${c.moduleId}`, title: `${c.label} crop`, subtitle: c.ready ? "Ready to harvest" : c.growing ? `${Math.floor(100 * c.progress / c.growSeconds)}% grown` : "Paused: planter not socketed",
    lines: [`Yields ${c.quantity} × ${labelOf(c.produce).toLowerCase()} per harvest`,
      // LS-1: what the planter's heated grow bed does for this crop.
      ...(c.bed === "active" ? ["Heated grow bed: growing twice as fast"] : c.bed === "unpowered" ? ["Heated grow bed: needs host power to speed growth"]
        : c.bed === "no-effect" ? ["Heated grow bed: no effect on power crops"] : [])],
    tags: ["cultivation"], status: c.ready ? "done" : "active",
  }));
  return {
    id: "materials", label: "Materials", count: entries.length,
    sections: [
      { id: "known", title: "Known use", entries: entries.filter((e) => e.status === "known") },
      { id: "unknown", title: "Use unknown", entries: entries.filter((e) => e.status === "unknown") },
      ...(crops.length ? [{ id: "crops", title: "Planters", entries: crops }] : []),
    ].filter((sec) => sec.entries.length),
    empty: "Gather or scan something to start the materials log.",
  };
}

function techTab(s: GameState, sys: SystemsState): JournalTab {
  const recipes = knownRecipes(s).map(([id, r]): JournalEntry => ({
    id: `recipe:${id}`, title: r.label, subtitle: Object.entries(r.cost).map(([k, n]) => `${n} ${labelOf(k).toLowerCase()}`).join(" · "),
    lines: [`At ${r.site.replaceAll("_", " ")}`, `From ${blueprintLabel(r.bp)}`],
    tags: [r.site.replaceAll("_", " ")], status: (s.knowledge.crafted as readonly string[]).includes(id) ? "done" : "known",
  }));
  const decodedPlans = new Set(sys.decoded.flatMap((d) => DECODABLES[d].blueprints as readonly string[]));
  const plans = (s.knowledge.blueprints as readonly string[]).map((bp): JournalEntry => ({
    id: `plan:${bp}`, title: blueprintLabel(bp), subtitle: decodedPlans.has(bp) ? "Decoded plans" : "Plans",
    lines: [], tags: decodedPlans.has(bp) ? ["decoded"] : [], status: "known",
  }));
  const records = s.knowledge.scans.filter(techRecord).map((id): JournalEntry => ({
    id: `record:${id}`, title: TECH_RECORDS[id].label, subtitle: region(TECH_RECORDS[id].region), lines: [TECH_RECORDS[id].text], tags: ["record"], status: "known",
  }));
  return {
    id: "tech", label: "Tech & recipes", count: recipes.length + records.length,
    sections: [
      { id: "recipes", title: "Recipes", entries: recipes },
      { id: "plans", title: "Plans", entries: plans },
      { id: "records", title: "Technical records", entries: records },
    ].filter((sec) => sec.entries.length),
    empty: "Recover plans from records and workshops.",
  };
}

/** S5's notebook, flattened for browsing and search. The UI may still render
 * `FieldJournal.notebook` with ui/storyNotebook.ts. */
function notebookTab(view: NotebookView, sys: SystemsState): JournalTab {
  const questions = view.questions.map((q): JournalEntry => ({
    id: `question:${q.id}`, title: q.title, subtitle: q.answer ?? `${q.hypotheses.length} reading${q.hypotheses.length === 1 ? "" : "s"}`,
    lines: q.hypotheses.map((h) => `${h.status.replace("_", " ")} · ${h.text}`), tags: ["question"], status: q.answer ? "done" : "active",
  }));
  const entries = view.entries.map((e): JournalEntry => ({
    id: `finding:${e.id}`, title: e.label, subtitle: e.provenance,
    lines: [e.observed, ...(e.reading ? [e.reading] : []), ...e.notes], tags: ["finding"], status: "known",
  }));
  const journals = view.journals.map((j): JournalEntry => ({ id: `journal:${j.id}`, title: j.label, subtitle: "Personal record", lines: [j.text, ...j.context], tags: ["journal"], status: "known" }));
  const leads = view.leads.map((l): JournalEntry => ({ id: `lead:${l.id}`, title: l.region, subtitle: l.text, lines: l.hint ? [l.hint] : [], tags: ["lead", l.region], status: "active" }));
  // LS-1: CB-2's found notes, and the door codes decoded records hold (so nothing is memorised).
  const notes = readableNotes(sys).map((n): JournalEntry => ({
    id: `note:${n.id}`, title: n.label, subtitle: `${n.author} · ${n.dated}`, lines: [n.text], tags: ["note", region(n.area === "hub_spur" ? "silt_basin" : n.area)], status: "known",
  }));
  const codes = doorCodes(sys).map((c): JournalEntry => ({
    id: `code:${c.door}`, title: c.label, subtitle: c.code ? `Code ${c.code.split("").join("-")}` : "Part of the code is at the door",
    lines: c.clue ? [c.clue] : [], tags: ["code"], status: "known",
  }));
  return {
    id: "notebook", label: "Notebook", count: questions.length + entries.length + journals.length + notes.length + codes.length,
    sections: [
      { id: "questions", title: "Questions", entries: questions },
      { id: "leads", title: "Leads", entries: leads },
      { id: "findings", title: "Findings", entries: entries },
      { id: "journals", title: "Personal records", entries: journals },
      { id: "notes", title: "Found notes", entries: notes },
      { id: "codes", title: "Door codes", entries: codes },
    ].filter((sec) => sec.entries.length),
    empty: "Nothing recorded yet.",
  };
}

function decodesTab(s: GameState, sys: SystemsState, ctx: DecoderContext): JournalTab {
  const STATUS: Record<DecodeStatus, string> = {
    running: "Decoding", unpowered: "Paused: no power", "out-of-range": "Paused: out of range, needs a relay",
    "not-installed": "Paused: decoder not socketed", "host-unavailable": "Paused: host not working",
  };
  const running = decodeViews(s, sys, ctx).map((v): JournalEntry => ({
    id: `decode:${v.decodable}`, title: DECODABLES[v.decodable].label,
    subtitle: `${STATUS[v.status]} · ${Math.floor(100 * v.progress / v.required)}%${v.status === "running" ? ` · ${minutes(v.remaining)} left` : ""}`,
    lines: [`From ${siteLabel(DECODABLES[v.decodable].site)}`], tags: [region(DECODABLES[v.decodable].region)], status: "active",
  }));
  const waiting = sys.found.filter((d) => !sys.decoded.includes(d) && !sys.decodes.some((j) => j.decodable === d)).map((d): JournalEntry => ({
    id: `found:${d}`, title: DECODABLES[d].label, subtitle: `Unreadable · about ${minutes(60 * DECODE_MINUTES[DECODABLES[d].size])} to decode`,
    lines: [`From ${siteLabel(DECODABLES[d].site)}`, `${DECODABLES[d].gates.length} record${DECODABLES[d].gates.length === 1 ? "" : "s"} locked`],
    tags: [region(DECODABLES[d].region)], status: "locked",
  }));
  const done = sys.decoded.map((d): JournalEntry => {
    const def = DECODABLES[d];
    return {
      id: `decoded:${d}`, title: def.label, subtitle: "Decoded",
      lines: [...placedReveals(d).map((r) => `Revealed ${r.label}`), ...def.blueprints.map((bp) => `Plans: ${blueprintLabel(bp)}`),
        ...(def.gates.length ? [`${def.gates.length} record${def.gates.length === 1 ? "" : "s"} now readable`] : [])],
      tags: [region(def.region)], status: "done", logs: readableLog(sys, d),
    };
  });
  // Seeing is not capturing: marked from afar or by a decoded map, logger not reached yet.
  const marked = markedSites(sys).map((id): JournalEntry => ({
    id: `marked:${id}`, title: LOST_SITES[id].label, subtitle: "Marked on the chart · reach its logger to capture the data",
    lines: [], tags: [region(LOST_SITES[id].region)], status: "unknown",
  }));
  return {
    id: "decodes", label: "Decodes", count: running.length + waiting.length + done.length + marked.length,
    sections: [
      { id: "running", title: "In progress", entries: running },
      { id: "found", title: "Found, not decoded", entries: waiting },
      { id: "decoded", title: "Decoded", entries: done },
      { id: "marked", title: "Marked, not captured", entries: marked },
    ].filter((sec) => sec.entries.length),
    empty: "Lost sites hold data a decoder can read.",
  };
}
const siteLabel = (id: string): string => (LOST_SITES as Readonly<Record<string, { label: string }>>)[id]?.label ?? id;

export function buildJournal(s: GameState, sys: SystemsState, input: JournalInput = {}): FieldJournal {
  const notebook = input.notebook ?? storyNotebook(s);
  const creatures = (input.creatures ?? []).map((c): JournalEntry => ({
    id: `creature:${c.id}`, title: c.label, subtitle: region(c.region), lines: [c.behaviour, ...(c.notes ?? [])],
    tags: [region(c.region), ...(c.danger ? [c.danger] : [])], status: "known",
  }));
  const cycles = (input.cycles ?? []).map((c): JournalEntry => ({
    id: `cycle:${c.id}`, title: c.label,
    subtitle: `${region(c.region)} · ${c.periodSeconds === null ? "period not yet timed" : `every ${minutes(c.periodSeconds)}`}${c.windowSeconds === null ? "" : ` · lasts ${minutes(c.windowSeconds)}`}`,
    lines: [...(c.phases ?? []), ...(c.cues ?? []), `Otherwise: ${c.alternative}`], tags: [region(c.region)], status: "known",
  }));
  return {
    notebook,
    tabs: [
      materialsTab(s, sys, input.decoder?.power),
      { id: "creatures", label: "Creatures", count: creatures.length, sections: creatures.length ? [{ id: "seen", title: "Seen", entries: creatures }] : [], empty: "Creatures you scan or tag are logged here." },
      techTab(s, sys),
      notebookTab(notebook, sys),
      { id: "cycles", label: "Cycles", count: cycles.length, sections: cycles.length ? [{ id: "seen", title: "Seen", entries: cycles }] : [], empty: "Natural cycles appear here once you've seen one." },
      decodesTab(s, sys, input.decoder ?? {}),
    ],
  };
}

/** Case-insensitive search over every tab's titles, subtitles, lines and tags. */
export function searchJournal(journal: FieldJournal, query: string): { tab: JournalTabId; entry: JournalEntry }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return journal.tabs.flatMap((tab) => tab.sections.flatMap((sec) => sec.entries
    .filter((e) => [e.title, e.subtitle, ...e.lines, ...e.tags].some((t) => t.toLowerCase().includes(q)))
    .map((entry) => ({ tab: tab.id, entry }))));
}
