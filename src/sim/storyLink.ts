/** Composition of S5's story rules with the game. The single discovery adapter:
 * every evidence, record and journal discovery passes through recordStory.
 *
 * Saved homes, all with their original ticks: C01–C06 stay in knowledge.evidence
 * (with blueprints, markers and their existing side effects), the reef journal in
 * knowledge.journals, and every later discovery in story.discoveries. storyView
 * joins them so S5's pure rules see one discovery list. */
import { BLUEPRINTS, EVIDENCE, EVIDENCE_BLUEPRINTS, HULLS, OPTIONAL_RECORD } from "../content/registry.js";
import type { BlueprintId, EvidenceId, HullId } from "../content/registry.js";
import { siteOf } from "../content/story/evidence.js";
import { labelOf } from "./story/knowledge.js";
import type { DiscoveryId } from "../content/story/evidence.js";
import { LEADS } from "../content/story/leads.js";
import type { LeadId } from "../content/story/leads.js";
import { placedSite, STORY_SITES } from "../content/story/sites.js";
import { advanceWorks, found, mergeDiscoveries, notebook, openLeads, reachable, recordDiscovery, requestHint } from "./story/index.js";
import type { Capabilities, NotebookView, StoryState } from "./story/index.js";
import { facility } from "./inventory.js";
import { personalLimit } from "./capabilities.js";
import type { GameState } from "./types.js";

export const registryEvidence = (id: string): id is EvidenceId => Object.hasOwn(EVIDENCE, id);
/** The reef journal was saved without a tick; it sorts first among journals. */
const JOURNAL_TICK = 0;

/** S5's view of the game's story: one merged discovery list over the shared
 * hints, works and resolution objects, so S5 rules that mutate those persist. */
export function storyView(s: GameState): StoryState {
  return {
    ...s.story,
    discoveries: mergeDiscoveries(
      s.knowledge.evidence.map(({ id, tick }) => ({ id, tick })),
      s.knowledge.journals.filter((id) => id === OPTIONAL_RECORD.id).map(() => ({ id: OPTIONAL_RECORD.id, tick: JOURNAL_TICK })),
      s.story.discoveries,
    ),
  };
}
export const storyKnown = (s: GameState, id: DiscoveryId): boolean => found(storyView(s), id);

/** Records one discovery in its saved home and grants its plans. Returns the
 * player feedback line. Idempotent; the first tick is kept. */
export function recordStory(s: GameState, id: DiscoveryId): string {
  const view = storyView(s);
  const outcome = recordDiscovery(view, id, s.tick);
  if (!outcome.added) return outcome.message;
  if (registryEvidence(id)) {
    const def = EVIDENCE[id];
    s.knowledge.evidence.push({ id, tick: s.tick, provenance: def.provenance });
    for (const bp of EVIDENCE_BLUEPRINTS[id]) grant(s, bp);
    if (id === "C02" && !s.knowledge.scans.includes("filter_flow")) s.knowledge.scans.push("filter_flow");
    if (id === "C04") s.world.facilities.find((f) => f.id === "canopy_lab")!.repaired = true;
    if (!s.knowledge.markers.includes(def.place)) s.knowledge.markers.push(def.place);
    // The C04 field sheet's service log names the dark mooring: a known place
    // after the laboratory, exactly as migration appends it. Not a pin to new evidence.
    if (id === "C04" && !s.knowledge.markers.includes("canopy_stop")) s.knowledge.markers.push("canopy_stop");
  } else if (id === OPTIONAL_RECORD.id) s.knowledge.journals.push(id);
  else s.story.discoveries.push({ id, tick: s.tick });
  for (const bp of outcome.blueprints) grant(s, bp);
  if (id === OPTIONAL_RECORD.id) return OPTIONAL_RECORD.text;
  // Name a newly opened lead only where the world already has its site.
  const lead = outcome.leads.find((l) => placedSite(LEADS[l].site));
  const next = lead ? LEADS[lead].text : registryEvidence(id) ? EVIDENCE[id].lead : "";
  return outcome.message.replace(/recorded\..*$/s, `recorded.${next ? ` ${next}` : ""}`);
}
function grant(s: GameState, bp: string): void {
  if ((BLUEPRINTS as readonly string[]).includes(bp) && !s.knowledge.blueprints.includes(bp as BlueprintId))
    s.knowledge.blueprints.push(bp as BlueprintId);
}

/** The return-gate machinery runs once per active simulation step. */
export function advanceStory(s: GameState): void {
  advanceWorks(s.story, 1);
}

/** Capability snapshot for S5's reachability: suit, best rating per working hull,
 * and restored service stops. */
export function storyCapabilities(s: GameState): Capabilities {
  const hulls: Partial<Record<HullId, number>> = {};
  for (const v of s.fleet.vehicles) if (!v.disabled) hulls[v.hull] = Math.max(hulls[v.hull] ?? 0, v.rating);
  return { suit: personalLimit(s), hulls, stops: new Set(facility(s, "canopy_stop") ? ["stop_canopy"] : []) };
}
const leadReachable = (s: GameState, id: LeadId): boolean => reachable(STORY_SITES[LEADS[id].site], storyCapabilities(s));

/** The notebook view, offering only leads whose sites the world has. */
export function storyNotebook(s: GameState): NotebookView {
  const view = notebook(storyView(s));
  return { ...view, leads: view.leads.filter((l) => placedSite(LEADS[l.id].site)) };
}

/** Practical preparation steps between story leads. Each replaces one branch of
 * the old single-text hint; the story branches became S5's graduated leads. */
function practicalHint(s: GameState): string | null {
  const has = (id: EvidenceId): boolean => s.knowledge.evidence.some((e) => e.id === id);
  const crafted = (id: string): boolean => (s.knowledge.crafted as string[]).includes(id);
  const creel = s.fleet.vehicles.find((v) => v.hull === "creel");
  if ((has("C02") || has("C03")) && !crafted("dart_base") && !crafted("creel_base"))
    return "Prepare at the pod: tools, 150 m suit, buoy, a meal and charged reserve cells. Recharge local cells at its restored bench. Restore the island workshop, then build the Dart in its clear launch cradle.";
  if (has("C04") && !crafted("suit_350"))
    return `Bring four crust and four cured resin from the Canopy to the restored workshop for a 350 m suit refit, with two alloy and two membrane. ${HULLS.dart.label}'s 180 m hull reaches the first Basin shelf; your suit must protect the exit.`;
  if (has("C05") && !crafted("creel_base"))
    return "The dormitory rack's Creel plans are at the workshop bench: ten alloy, four glass, four membrane, four fin crust and two cured resin. It builds in the medium slip west of the landing; no Dart is required.";
  if (creel && !s.inventory.items.some((i) => i.kind === "creel_cargo_rack" || i.kind === "creel_cabin"))
    return "Make a cargo rack for bulk hauling or a refuge cabin for staying out, then fit it from Cargo with the Creel moored in its slip. Only one fits the major mount at a time.";
  if (creel && !facility(s, "canopy_stop"))
    return "Tagged frames rest on the Basin ridge beside the fallen dish. A Creel's tool arms load them without leaving the helm. One frame, two glass and two crust restore the dark mooring on the eastern Canopy margin.";
  return null;
}
/** What lies past today's world once every placed lead is closed. */
export const FRONTIER_HINT =
  "Both Basin observations are retained. The fracture below the boundary station holds more frames past a 240 m hull; a 350 m refit or a suited lift from the lip reaches them. The upper return and local rescue guides remain available.";

/** H: a graduated story hint for a lead you can reach now; otherwise the
 * practical preparation that opens one; otherwise the nearest placed lead's
 * graduated hint, whose third tier names the preparation; otherwise the frontier. */
export function storyHint(s: GameState): string {
  const view = storyView(s);
  const placed = openLeads(view).filter((l) => placedSite(LEADS[l].site));
  if (placed.some((l) => leadReachable(s, l)))
    return requestHint(view, { reachable: (site) => placedSite(site) && reachable(STORY_SITES[site], storyCapabilities(s)) }).text;
  const practical = practicalHint(s);
  if (practical) {
    s.knowledge.hintLevel = Math.min(3, s.knowledge.hintLevel + 1);
    return practical;
  }
  if (placed.length) return requestHint(view, { reachable: placedSite }).text;
  return FRONTIER_HINT;
}

/** Discoveries placed at existing sites but new to the game, with their record
 * fixtures. C14 exists only once its pod repair is made. */
export const STORY_HOSTS = {
  // Clipped to the pod locker's door, as its record says; clear of the door handle.
  pod_checklist: { position: { x: -1.45, y: 1.15, z: 22.55 }, kind: "record" },
  mara_specimen_tray: { position: { x: 117.1, y: -116.9, z: -128.1 }, kind: "record" },
  C14: { position: { x: -2.78, y: 1.2, z: 20.2 }, kind: "evidence" },
} as const satisfies Partial<Record<DiscoveryId, { position: { x: number; y: number; z: number }; kind: "record" | "evidence" }>>;
export type StoryHostId = keyof typeof STORY_HOSTS;
export const storyHost = (id: string): id is StoryHostId => Object.hasOwn(STORY_HOSTS, id);
export function storyHostVisible(s: GameState, id: StoryHostId): boolean {
  if (!placedSite(siteOf(id))) return false;
  return id !== "C14" || s.story.works.repairs.includes("pod_buffer");
}
/** Interaction targets for the visible story fixtures. */
export const storyInteractions = (s: GameState) => (Object.keys(STORY_HOSTS) as StoryHostId[])
  .filter((id) => storyHostVisible(s, id))
  .map((id) => ({ id, label: labelOf(id), position: { ...STORY_HOSTS[id].position }, kind: STORY_HOSTS[id].kind }));
