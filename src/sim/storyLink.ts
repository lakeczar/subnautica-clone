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
import { advanceWorks, beginResolution, completeResolution, found, gateOpen, gatePanel, mergeDiscoveries, notebook, openLeads, reachable,
  recordDiscovery, requestHint, worksAction } from "./story/index.js";
import type { Capabilities, NotebookView, StoryState, WorksContext, WorksOutcome } from "./story/index.js";
import { applySpend, available, containerAccessible, facility, planSpend, removeQuantity } from "./inventory.js";
import { PLACED_HOSTS, WORKS_FACES, type PlacedHostId, type WorksFaceId } from "../content/story/placements.js";
import { STORY_RECIPES, type StorySiteId } from "../content/story/evidence.js";
import { RESOLUTION_ROSTER, WORKS_TEXT, type RosterId, type WorksAction } from "../content/story/works.js";
import type { ItemKind } from "../content/registry.js";
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
  const stops = [...(facility(s, "canopy_stop") ? ["stop_canopy" as const] : []), ...(facility(s, "divide_dock") ? ["stop_divide_lee" as const] : [])];
  return { suit: personalLimit(s), hulls, stops: new Set(stops) };
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
  // C3: every later discovery at its S2 site (content/story/placements.ts).
  ...Object.fromEntries((Object.keys(PLACED_HOSTS) as PlacedHostId[]).map((id) =>
    [id, { position: PLACED_HOSTS[id], kind: /^C\d\d$/.test(id) ? "evidence" as const : "record" as const }])) as
    Record<PlacedHostId, { position: { x: number; y: number; z: number }; kind: "record" | "evidence" }>,
} as const satisfies Partial<Record<DiscoveryId, { position: { x: number; y: number; z: number }; kind: "record" | "evidence" }>>;
export type StoryHostId = keyof typeof STORY_HOSTS;
export const storyHost = (id: string): id is StoryHostId => Object.hasOwn(STORY_HOSTS, id);
export function storyHostVisible(s: GameState, id: StoryHostId): boolean {
  const site = siteOf(id);
  if (!placedSite(site)) return false;
  // The inner hall opens only once the return gate is open.
  if (STORY_SITES[site].afterGate && !gateOpen(s.story.works)) return false;
  return id !== "C14" || s.story.works.repairs.includes("pod_buffer");
}
/** Interaction targets for the visible story fixtures and the upper hall's work faces. */
export const storyInteractions = (s: GameState) => [
  ...(Object.keys(STORY_HOSTS) as StoryHostId[])
    .filter((id) => storyHostVisible(s, id))
    .map((id) => ({ id, label: labelOf(id), position: { ...STORY_HOSTS[id].position }, kind: STORY_HOSTS[id].kind })),
  ...(Object.keys(WORKS_FACES) as WorksFaceId[]).map((id) =>
    ({ id, label: WORKS_FACES[id].label, position: { ...WORKS_FACES[id].position }, kind: "service" as const })),
];

/** S5's works context from the diver's real surroundings: assemblies carried in
 * the diver hold; stock from the diver hold, a deployed buoy and any craft hold
 * within reach. */
/** A craft moored within this of a works host lends its hold to the works, as a
 * moored hold does at a restored stop's bench: the hall's restoration stock (22 CU)
 * is more than a diver carries. */
export const WORKS_MOORING_RADIUS = 30;
function worksContext(s: GameState, site: StorySiteId): { ctx: WorksContext; bins: string[] } {
  const hosts = site === "meridian_upper_hall" ? BAY : GATE;
  const moored = s.fleet.vehicles.filter((v) => !v.berth && s.fleet.docking?.transaction?.vehicleId !== v.id &&
    hosts.some((p) => Math.hypot(v.pose.position.x - p.x, v.pose.position.y - p.y, v.pose.position.z - p.z) < WORKS_MOORING_RADIUS))
    .map((v) => v.cargoId);
  const bins = [...new Set(["diver", ...s.inventory.containers.filter((c) => c.kind === "buoy" || c.kind === "vehicle").map((c) => c.id)
    .filter((id) => containerAccessible(s, id)), ...moored])];
  return {
    bins,
    ctx: {
      site,
      carries: (a) => s.inventory.items.some((i) => i.kind === a && i.containerId === "diver"),
      canPay: (r) => Object.entries(STORY_RECIPES[r].cost).every(([k, q]) => available(s, k as ItemKind, bins) >= q),
      blueprints: new Set(s.knowledge.blueprints),
    },
  };
}
function applyWorks(s: GameState, outcome: WorksOutcome, bins: string[]): string {
  if (outcome.ok && outcome.consume) {
    if (outcome.consume === "service_power_assembly" || outcome.consume === "service_air_assembly")
      removeQuantity(s, s.inventory.items.find((i) => i.kind === outcome.consume && i.containerId === "diver")!, 1);
    else applySpend(s, planSpend(s, STORY_RECIPES[outcome.consume].cost, bins, "oldest").lines);
  }
  return outcome.message;
}
/** The live gate panel: each use performs the next step of the readable procedure
 * (stage power, stage air, isolate, equalize, open, route power to the hall). */
export function useGatePanel(s: GameState): string | null {
  const w = s.story.works, { ctx, bins } = worksContext(s, "meridian_gate_hall");
  const next: WorksAction | null = !w.power && ctx.carries("service_power_assembly") ? "install_power"
    : !w.air && ctx.carries("service_air_assembly") ? "install_air"
    : w.gate === "sealed" && w.power && w.air ? "isolate" : w.gate === "isolated" ? "equalize"
    : w.gate === "equalized" ? "open" : w.gate === "open" && w.hall && !w.hallPower ? "route_power" : null;
  const panel = gatePanel(w);
  if (!next) {
    s.feedback = `${panel.status} ${panel.lines.join(" · ")}.${!w.power ? ` ${WORKS_TEXT.install_power.missing}` : !w.air ? ` ${WORKS_TEXT.install_air.missing}` : ""}`;
    return null;
  }
  const outcome = worksAction(s.story, next, ctx);
  if (!outcome.ok) return outcome.message;
  s.feedback = applyWorks(s, outcome, bins);
  return null;
}
/** The upper hall's restoration faces, from carried stock. */
export function useWorksFace(s: GameState, id: WorksFaceId): string | null {
  const { ctx, bins } = worksContext(s, "meridian_upper_hall");
  const outcome = worksAction(s.story, WORKS_FACES[id].action, ctx);
  if (!outcome.ok) return outcome.message;
  s.feedback = applyWorks(s, outcome, bins);
  return null;
}
/** The district controller: once its record is read, it begins the closing
 * scene when every requirement is met (default roster), then the epilogue. */
export function useController(s: GameState): string | null {
  if (s.story.resolution.phase === "first") {
    const done = completeResolution(s.story, { mastRestored: false });
    if (!done.ok) return "The closing scene has already ended.";
    s.feedback = done.lines.join(" ");
    return null;
  }
  if (s.story.resolution.phase === "complete") { s.feedback = "The district rests. The controller's work is done."; return null; }
  const begun = beginResolution(s.story, "meridian_service_window", s.tick);
  if (!begun.ok) return begun.message;
  s.feedback = [begun.message, ...begun.lines].join(" ");
  return null;
}

/** Where each works action is performed: the gate panel, or the hall's faces. */
const GATE = [PLACED_HOSTS.gate_panel], BAY = [WORKS_FACES["works:hall"].position, WORKS_FACES["works:food"].position];
/** The upper hall's two faces are one restoration bay: either restoration works from either. */
const WORKS_HOST: Readonly<Record<WorksAction, readonly Vec3Like[]>> = {
  install_power: GATE, install_air: GATE, isolate: GATE, equalize: GATE, open: GATE, route_power: GATE,
  restore_hall: BAY, restore_food: BAY,
};
interface Vec3Like { readonly x: number; readonly y: number; readonly z: number }
const WORKS_REACH = 4;
const atHost = (s: GameState, p: Vec3Like): boolean => !s.player.controlledVehicleId &&
  Math.hypot(s.player.pose.position.x - p.x, s.player.pose.position.y - p.y, s.player.pose.position.z - p.z) <= WORKS_REACH;
/** `{type:"works", action}`: one named S5 works action at its own host. */
export function worksCommand(s: GameState, action: WorksAction): string | null {
  if (!Object.hasOwn(WORKS_HOST, action)) return "Unknown works action.";
  if (!WORKS_HOST[action].some((p) => atHost(s, p))) return action.startsWith("restore_") ? "Work at the upper hall's restoration bay." : "Use the gate panel in the gate hall.";
  const site = action === "restore_hall" || action === "restore_food" ? "meridian_upper_hall" : "meridian_gate_hall";
  const { ctx, bins } = worksContext(s, site);
  const outcome = worksAction(s.story, action, ctx);
  if (!outcome.ok) return outcome.message;
  s.feedback = applyWorks(s, outcome, bins);
  return null;
}
/** `{type:"resolution", action, roster?}`: the controller, once its record is read. */
export function resolutionCommand(s: GameState, action: "begin" | "complete", roster?: RosterId): string | null {
  if (!atHost(s, PLACED_HOSTS.district_controller)) return "Use the district controller at the lower service window.";
  if (!storyKnown(s, "district_controller")) return "Read the district controller first.";
  if (action === "complete") {
    const done = completeResolution(s.story, { mastRestored: false });
    if (!done.ok) return "The closing scene has not begun, or has already ended.";
    s.feedback = done.lines.join(" ");
    return null;
  }
  if (roster !== undefined && !Object.hasOwn(RESOLUTION_ROSTER, roster)) return "Choose someone on the controller's roster.";
  const begun = beginResolution(s.story, "meridian_service_window", s.tick, roster);
  if (!begun.ok) return begun.message;
  s.feedback = [begun.message, ...begun.lines].join(" ");
  return null;
}
