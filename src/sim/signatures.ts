/** SIG-1: the signature upgrades' actions in play, composed from SYS-1's pure
 * rules (`upgrades/tools.ts`). One place owns them:
 * - **Commands** (`signatureCommand`): Dart sonar and tagger, Creel grapple,
 *   reel and cargo pod, Spindle deck crane, Mantle clamp (lift or tow) and
 *   scout drone. Each returns a typed outcome (steward F17): a refusal changes
 *   nothing, and an accepted action is a `SignatureEvent` the HUD, audio and
 *   the play timeline read. None of them sets `GameState.feedback`.
 * - **Per step** (`stepSignatures`, after movement): tagger aims, timed lifts,
 *   held lines, tows and the drone's battery, tether and finds.
 * - **The craft action bar** (`craftActions`): the piloted craft's fitted
 *   actions in a stable order, bound to the number row.
 * The Creel's cutting arm composes into the tool arms (`fleet.ts` `armJob`),
 * and the berth extension into the carrier's berth refit (`carrier.ts`). */
import { HULL_COLLIDERS, HULLS, ITEMS, MATERIALS, SOURCES } from "../content/registry.js";
import type { ItemKind, SourceId } from "../content/registry.js";
import { CAVE_SOURCES } from "../content/regions/caves.js";
import { LOST_SITES, WORLD_LOST_SITES, DECODABLES } from "../content/systems/decodes.js";
import { CUE_ROSTER, CUE_SPECIES, THREAT_ROSTER, THREATS } from "../content/ecology/species.js";
import type { CueAgentId } from "../content/ecology/species.js";
import { BEACON_NAME_MAX } from "../content/systems/navigation.js";
import { FIXED_SECONDS as DT } from "./clock.js";
import { cueHome, sailPositions } from "./ecology/cues.js";
import { addItem, distance, hasRoom } from "./inventory.js";
import { pilotForward, vehicleProfile } from "./fittings.js";
import { discoverSite } from "./systems/decoder.js";
import { visitChart } from "./systems/navigation.js";
import { moveHull } from "./world.js";
import type { CraftProfile } from "./upgrades/effects.js";
import type { HostUpgradeId } from "../content/upgrades/hosts.js";
import {
  clampFrames, collectPodRefusal, DECK_CRANE, DROP_POD, dropPodRefusal, droneLaunchRefusal, droneRecall, fireGrapple,
  GRAPPLE, grappleStep, hostKind, inCone, nearestInCone, OVERDRIVE, overdriveActive, RANGE_TAGGER, SALVAGE_CLAMP, SCOUT_DRONE,
  sonarSweep, tagCandidate, TICKS_PER_SECOND, WIDE_SONAR,
} from "./upgrades/tools.js";
import type { SensedFeature } from "./upgrades/tools.js";
import type { GameEvent, GameState, Vec3, VehicleState, WorldQueries } from "./types.js";

export const SIGNATURE_ACTIONS = ["sonar", "tag", "grapple", "reel", "pod", "crane", "clamp", "drone"] as const;
export type SignatureAction = (typeof SIGNATURE_ACTIONS)[number];
export const isSignatureAction = (a: unknown): a is SignatureAction => (SIGNATURE_ACTIONS as readonly unknown[]).includes(a);

export interface SonarContact { readonly id: string; readonly label: string; readonly kind: string; readonly position: Vec3; readonly distance: number; readonly bearing: number }
export type TagKind = "source" | "site" | "creature";
/** What a signature action or its per-step work did: typed, transient, never saved. */
export type SignatureEvent =
  | { kind: "sonar"; vehicleId: string; origin: Vec3; contacts: SonarContact[] }
  | { kind: "tag"; vehicleId: string; phase: "aim" | "done" | "lost"; targetId: string; label: string; what: TagKind }
  | { kind: "grapple"; vehicleId: string; phase: "fired" | "released" | "reeling" | "holding" | "landed"; anchor: Vec3; load: string | null; reason?: string }
  | { kind: "pod"; vehicleId: string; phase: "dropped" | "collected"; position: Vec3 }
  | { kind: "lift"; vehicleId: string; tool: "crane" | "clamp"; phase: "start" | "done" | "stopped"; sourceId: string; item: ItemKind; quantity: number; reason?: string }
  | { kind: "tow"; vehicleId: string; towed: string; phase: "held" | "released"; reason?: string }
  | { kind: "drone"; vehicleId: string; phase: "launched" | "recalled" | "found"; position: Vec3; reason?: string; found?: string[] }
  /** A decoder lattice or survey array fitted to one module (`hostUpgrades.ts`). */
  | { kind: "host-upgrade"; hostId: string; itemId: string; upgrade: HostUpgradeId };
export type SignatureRefusal = "not-fitted" | "not-piloting" | "cooling" | "power" | "no-target" | "room" | "busy" | "place";
export type SignatureOutcome =
  | { ok: true; event: SignatureEvent; message: string; summary: string; cue: "collect" | "scan" | "craft" }
  | { ok: false; code: SignatureRefusal; message: string };

const ok = (event: SignatureEvent, message: string, summary: string, cue: "collect" | "scan" | "craft" = "collect"): SignatureOutcome =>
  ({ ok: true, event, message, summary, cue });
const no = (code: SignatureRefusal, message: string): SignatureOutcome => ({ ok: false, code, message });
const ticks = (seconds: number): number => Math.round(seconds * TICKS_PER_SECOND);
const has = (p: CraftProfile, tool: CraftProfile["tools"][number]): boolean => p.tools.includes(tool);
const hasContract = (p: CraftProfile, c: CraftProfile["contracts"][number]): boolean => p.contracts.includes(c);
const flat = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
const depthOf = (p: Vec3): number => Math.max(0, -p.y);
/** Compass bearing, degrees clockwise from −Z (north). */
export const bearingDeg = (from: Vec3, to: Vec3): number =>
  ((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI + 360) % 360;
const piloted = (s: GameState): VehicleState | undefined =>
  s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);

// ---------------------------------------------------------------- what the sensors know
/** Cave openings in the game, for the wide sonar and the drone: mouths and
 * skylights open to the sea; throats are the passages inside. Built once. */
export const CAVE_FEATURES: readonly (SensedFeature & { label: string })[] = CAVE_SOURCES.flatMap((c) =>
  c.portals.map((p) => ({ id: p.id, kind: p.kind === "throat" ? "passage" : "cave_mouth", position: p.center,
    label: `${c.label} · ${p.label.toLowerCase()}` })));
const CUE_IDS = Object.keys(CUE_ROSTER) as CueAgentId[];
/** A tag target: what it is, where it is now, and how the journal files it. */
interface Taggable extends SensedFeature { label: string; what: TagKind; key: string }
/** Creatures, lost sites and material sources the tagger can mark, at this tick. */
function taggables(s: GameState): Taggable[] {
  const out: Taggable[] = [];
  for (const a of s.world.ecology.agents) {
    const species = THREAT_ROSTER[a.id].species;
    out.push({ id: `agent:${a.id}`, kind: "creature", position: a.position, label: THREATS[species].label, what: "creature", key: speciesScanId(species) });
  }
  const sails = sailPositions(s.tick);
  for (const id of CUE_IDS) {
    const species = CUE_ROSTER[id].species;
    const positions = species === "brine_sails" ? sails : [cueHome(id)];
    positions.forEach((position, n) => out.push({ id: `cue:${id}:${n}`, kind: "creature", position, label: CUE_SPECIES[species].label,
      what: "creature", key: speciesScanId(species) }));
  }
  for (const id of WORLD_LOST_SITES)
    out.push({ id: `site:${id}`, kind: "site", position: LOST_SITES[id].position, label: LOST_SITES[id].label, what: "site", key: id });
  for (const id of Object.keys(SOURCES) as SourceId[])
    out.push({ id: `source:${id}`, kind: "source", position: SOURCES[id].position, label: SOURCES[id].label, what: "source", key: id });
  return out;
}
/** One tag target by ID, where it is now: what a held aim re-checks each step. */
function taggableById(s: GameState, id: string): Taggable | null {
  const [kind, key, n] = id.split(":") as [string, string, string | undefined];
  if (kind === "agent") {
    const a = s.world.ecology.agents.find((x) => x.id === key);
    if (!a) return null;
    const species = THREAT_ROSTER[a.id].species;
    return { id, kind: "creature", position: a.position, label: THREATS[species].label, what: "creature", key: speciesScanId(species) };
  }
  if (kind === "cue" && Object.hasOwn(CUE_ROSTER, key)) {
    const species = CUE_ROSTER[key as CueAgentId].species;
    const position = species === "brine_sails" ? sailPositions(s.tick)[Number(n)] : cueHome(key as CueAgentId);
    return position ? { id, kind: "creature", position, label: CUE_SPECIES[species].label, what: "creature", key: speciesScanId(species) } : null;
  }
  if (kind === "site" && Object.hasOwn(LOST_SITES, key)) {
    const site = LOST_SITES[key as keyof typeof LOST_SITES];
    return { id, kind: "site", position: site.position, label: site.label, what: "site", key };
  }
  if (kind === "source" && Object.hasOwn(SOURCES, key))
    return { id, kind: "source", position: SOURCES[key as SourceId].position, label: SOURCES[key as SourceId].label, what: "source", key };
  return null;
}
/** The species a scan or tag has filed (`knowledge.scans` holds them as `species:<id>`). */
export const speciesScanId = (species: string): string => `species:${species}`;

// ---------------------------------------------------------------- commands
/** One signature action by the piloted craft. Refusals change nothing. */
export function signatureAction(s: GameState, action: SignatureAction, world: WorldQueries): SignatureOutcome {
  const v = piloted(s);
  if (!v) return no("not-piloting", "Pilot the craft first.");
  if (v.berth) return no("place", "Launch first: the berth holds the craft.");
  const p = vehicleProfile(s, v);
  switch (action) {
    case "sonar": return sonar(s, v, p);
    case "tag": return tag(s, v, p);
    case "grapple": return grapple(s, v, p, world);
    case "reel": return reel(v);
    case "pod": return pod(v, p, world);
    case "crane": return startLift(s, v, p, "crane");
    case "clamp": return clamp(s, v, p);
    case "drone": return drone(s, v, p);
  }
}
/** The step's dispatch: the typed outcome as notice, sound and signature events. */
export function signatureCommand(s: GameState, action: SignatureAction, world: WorldQueries, events: GameEvent[]): string | null {
  const r = signatureAction(s, action, world);
  if (!r.ok) return r.message;
  events.push({ type: "notice", channel: "action", message: r.message, summary: r.summary }, { type: "sound", cue: r.cue },
    { type: "signature", event: r.event });
  return null;
}

function sonar(s: GameState, v: VehicleState, p: CraftProfile): SignatureOutcome {
  if (!hasContract(p, "wide_sonar")) return no("not-fitted", "No wide-sweep sonar is fitted.");
  const rt = v.upgrades;
  if (rt.sonar && s.tick < rt.sonar.readyAt) return no("cooling", `The sonar is recharging: ${Math.ceil((rt.sonar.readyAt - s.tick) / TICKS_PER_SECOND)} s.`);
  if (v.charge < WIDE_SONAR.charge) return no("power", `A sweep needs ${WIDE_SONAR.charge}% charge.`);
  const origin = { ...v.pose.position };
  const contacts = sonarContacts(p, origin);
  v.charge -= WIDE_SONAR.charge;
  s.metrics.powerUsed += WIDE_SONAR.charge;
  v.upgrades = { ...rt, sonar: { at: s.tick, readyAt: s.tick + ticks(WIDE_SONAR.cooldown), origin } };
  for (const c of contacts) {
    const id = `sonar:${c.id}`;
    if (!s.systems.beacons.some((b) => b.id === id))
      s.systems.beacons.push({ id, name: c.label.slice(0, BEACON_NAME_MAX), category: "landmark", position: { ...c.position }, source: "decode" });
  }
  const list = contacts.slice(0, 4).map((c) => `${c.label} ${Math.round(c.bearing)}° ${Math.round(c.distance)} m`);
  return ok({ kind: "sonar", vehicleId: v.id, origin, contacts },
    contacts.length ? `Sonar sweep · ${contacts.length} cave opening${contacts.length === 1 ? "" : "s"}: ${list.join(" · ")}${contacts.length > 4 ? " …" : ""}. Marked on the chart.`
      : `Sonar sweep · no cave openings within ${WIDE_SONAR.range} m.`,
    contacts.length ? `Sonar · ${contacts.length} opening${contacts.length === 1 ? "" : "s"}` : "Sonar · nothing", "scan");
}
/** Openings a sweep from `origin` returns, nearest first, with bearings. */
export function sonarContacts(p: CraftProfile, origin: Vec3): SonarContact[] {
  return sonarSweep(p, origin, CAVE_FEATURES).map((f) => ({ id: f.id, label: (f as typeof CAVE_FEATURES[number]).label, kind: f.kind,
    position: f.position, distance: distance(origin, f.position), bearing: bearingDeg(origin, f.position) }));
}
/** The pilot's eye line for aimed tools: the hull's position, the view's direction. */
const aimOf = (s: GameState, v: VehicleState): { origin: Vec3; aim: Vec3 } => ({ origin: v.pose.position, aim: pilotForward(s) });
function tagTarget(s: GameState, v: VehicleState, p: CraftProfile): Taggable | null {
  const { origin, aim } = aimOf(s, v);
  return tagCandidate(p, origin, aim, taggables(s));
}
function tag(s: GameState, v: VehicleState, p: CraftProfile): SignatureOutcome {
  if (!hasContract(p, "range_tagger")) return no("not-fitted", "No range tagger is fitted.");
  const target = tagTarget(s, v, p);
  if (!target) return no("no-target", `Nothing to tag within ${RANGE_TAGGER.range} m along your aim. Put the target in the middle of the view.`);
  v.upgrades = { ...v.upgrades, tag: { targetId: target.id, since: s.tick } };
  return ok({ kind: "tag", vehicleId: v.id, phase: "aim", targetId: target.id, label: target.label, what: target.what },
    `Tagging ${target.label} · hold the aim ${RANGE_TAGGER.aimSeconds} s.`, `Tagging ${target.label}`, "scan");
}
/** Records a finished tag in the journal, as a scan or a visit would. */
function fileTag(s: GameState, t: Taggable): string {
  if (t.what === "site") {
    const fresh = discoverSite(s.systems, t.key);
    return fresh.length ? `data captured: ${fresh.map((d) => DECODABLES[d].label).join(", ")}. Decode it at a decoder module.` : "already in the journal.";
  }
  if (s.knowledge.scans.includes(t.key)) return "already in the journal.";
  s.knowledge.scans.push(t.key);
  return t.what === "creature" ? "added to the creatures tab." : `scan retained · ${SOURCES[t.key as SourceId].scan}`;
}

const bow = (v: VehicleState, aim: Vec3): Vec3 => {
  const r = HULL_COLLIDERS[v.hull].radius * 0.8;
  return { x: v.pose.position.x + aim.x * r, y: v.pose.position.y + aim.y * r, z: v.pose.position.z + aim.z * r };
};
function grapple(s: GameState, v: VehicleState, p: CraftProfile, world: WorldQueries): SignatureOutcome {
  if (!has(p, "grapple")) return no("not-fitted", "No grapple is fitted.");
  const line = v.upgrades.grapple;
  if (line) {
    v.upgrades = { ...v.upgrades, grapple: null };
    return ok({ kind: "grapple", vehicleId: v.id, phase: "released", anchor: line.anchor, load: line.load }, "Grapple line released.", "Line released");
  }
  const { aim } = aimOf(s, v), origin = bow(v, aim);
  // A frame host along the aim is hooked and reeled in; otherwise the line bites rock.
  const frame = nearestInCone(origin, aim, FRAME_HOSTS.filter((f) => (s.world.resources.find((r) => r.id === f.id)?.stock ?? 0) > 0),
    GRAPPLE.range, GRAPPLE_CONE_DEG);
  if (frame && world.lineOfSight(origin, frame.position, [v.id])) {
    const hold = { anchor: { ...frame.position }, length: Math.max(GRAPPLE.minLength, distance(v.pose.position, frame.position)), reeling: true, load: frame.id };
    v.upgrades = { ...v.upgrades, grapple: hold };
    return ok({ kind: "grapple", vehicleId: v.id, phase: "fired", anchor: hold.anchor, load: frame.id },
      `Grapple hooked ${SOURCES[frame.id as SourceId].label} · reeling it in. Keep the line clear.`, "Frame hooked");
  }
  const fired = fireGrapple(p, origin, aim, world);
  if ("refusal" in fired) return no("no-target", fired.refusal);
  // The line is fired from the bow, but held (`grappleStep`) at the hull's centre: measure it there.
  const length = Math.max(GRAPPLE.minLength, distance(v.pose.position, fired.line.anchor));
  v.upgrades = { ...v.upgrades, grapple: { anchor: fired.line.anchor, length, reeling: false, load: null } };
  return ok({ kind: "grapple", vehicleId: v.id, phase: "fired", anchor: fired.line.anchor, load: null },
    `Grapple set · ${Math.round(length)} m line. It holds the hull against currents; reel to haul in.`, "Line set");
}
/** Frame hosts the grapple can hook, and how true its aim must be. */
const FRAME_HOSTS: readonly SensedFeature[] = (Object.keys(SOURCES) as SourceId[]).filter((id) => SOURCES[id].item === "tagged_frame")
  .map((id) => ({ id, kind: "frame", position: SOURCES[id].position }));
const GRAPPLE_CONE_DEG = 8;
function reel(v: VehicleState): SignatureOutcome {
  const line = v.upgrades.grapple;
  if (!line) return no("no-target", "No grapple line is out. Fire the grapple first.");
  const reeling = !line.reeling;
  v.upgrades = { ...v.upgrades, grapple: { ...line, reeling } };
  return ok({ kind: "grapple", vehicleId: v.id, phase: reeling ? "reeling" : "holding", anchor: line.anchor, load: line.load },
    reeling ? "Reeling in." : "Reel stopped · the line holds at this length.", reeling ? "Reeling" : "Holding");
}
function pod(v: VehicleState, p: CraftProfile, world: WorldQueries): SignatureOutcome {
  const out = v.upgrades.pod;
  if (out) {
    const refusal = collectPodRefusal(p, v.upgrades, v.pose.position);
    if (refusal) return no("place", refusal);
    v.upgrades = { ...v.upgrades, pod: null };
    return ok({ kind: "pod", vehicleId: v.id, phase: "collected", position: out.position }, "Cargo pod collected · its contents ride in the hold again.", "Pod collected");
  }
  const refusal = dropPodRefusal(p, v.upgrades);
  if (refusal) return no("not-fitted", refusal);
  const at = v.pose.position;
  const floor = world.supportHeight(at.x, at.z, at.y);
  const position = { x: at.x, y: Number.isFinite(floor) ? Math.min(at.y - 1, floor + 0.6) : at.y - 1, z: at.z };
  v.upgrades = { ...v.upgrades, pod: { position } };
  return ok({ kind: "pod", vehicleId: v.id, phase: "dropped", position },
    `Cargo pod dropped · ${DROP_POD.cu} CU. Load it from within ${DROP_POD.pickup} m; collect it with the Creel.`, "Pod dropped");
}

// ---------------------------------------------------------------- lifts: deck crane and salvage clamp
interface LiftJob { sourceId: SourceId; item: ItemKind; quantity: number; seconds: number; charge: number; refusal: string | null }
/** What a crane or clamp would lift from its nearest host now, or why not. */
export function liftJob(s: Readonly<GameState>, v: Readonly<VehicleState>, tool: "crane" | "clamp", only?: string): LiftJob | null {
  const p = vehicleProfile(s, v);
  const fitted = tool === "crane" ? has(p, "deck_crane") : has(p, "salvage_clamp");
  if (!fitted) return null;
  const reach = tool === "crane" ? DECK_CRANE.reach : SALVAGE_CLAMP_REACH;
  const near = (only && Object.hasOwn(SOURCES, only) ? [only as SourceId] : SOURCE_IDS).filter((id) => liftable(tool, SOURCES[id].item) &&
    (tool === "crane" ? flat(SOURCES[id].position, v.pose.position) <= reach : distance(SOURCES[id].position, v.pose.position) <= reach))
    .sort((a, b) => distance(SOURCES[a].position, v.pose.position) - distance(SOURCES[b].position, v.pose.position) || a.localeCompare(b));
  const id = near.find((n) => (s.world.resources.find((r) => r.id === n)?.stock ?? 0) > 0) ?? near[0];
  if (!id) return null;
  const def = SOURCES[id], stock = s.world.resources.find((r) => r.id === id)?.stock ?? 0, cu = ITEMS[def.item].cu;
  const quantity = tool === "crane" ? Math.min(def.bundle, stock, Math.floor(DECK_CRANE.maxCu / cu))
    : def.item === "tagged_frame" ? clampFrames(p, stock) : Math.min(stock, Math.floor(SALVAGE_CLAMP.partCu / cu));
  const seconds = tool === "crane" ? DECK_CRANE.seconds : SALVAGE_CLAMP.seconds;
  const charge = tool === "crane" ? DECK_CRANE.charge : SALVAGE_CLAMP.charge;
  const refusal = stock <= 0 ? `${def.label} · nothing left to lift.`
    : tool === "crane" && depthOf(def.position) > DECK_CRANE.depth ? `The crane reaches ${DECK_CRANE.depth} m down; ${def.label} lies at ${Math.round(depthOf(def.position))} m.`
    : tool === "crane" && depthOf(v.pose.position) > 1.5 ? "The crane works from the surface."
    : quantity < 1 ? `The crane lifts up to ${DECK_CRANE.maxCu} CU; ${def.label} is heavier.`
    : v.disabled || v.charge < charge ? `The ${tool === "crane" ? "crane" : "clamp"} needs ${charge}% charge.`
    : !hasRoom(s as GameState, v.cargoId, cu * quantity) ? `Hold full · ${cu * quantity} CU needed for this lift.`
    : null;
  return { sourceId: id, item: def.item, quantity, seconds, charge, refusal };
}
const SOURCE_IDS = Object.keys(SOURCES) as SourceId[];
/** The clamp grips within this many metres of the hull's centre. */
export const SALVAGE_CLAMP_REACH = 8;
/** The crane lifts anything that is not alive; the clamp grips frames and wreck salvage. */
const liftable = (tool: "crane" | "clamp", item: ItemKind): boolean => {
  // Only materials and frames: sheds, roe, catches and seeds are never lifted.
  if (item !== "tagged_frame" && !Object.hasOwn(MATERIALS, item)) return false;
  const kind = hostKind(item as Parameters<typeof hostKind>[0]);
  return tool === "crane" ? kind !== "living" : kind === "frame" || kind === "salvage";
};
function startLift(s: GameState, v: VehicleState, p: CraftProfile, tool: "crane" | "clamp"): SignatureOutcome {
  if (tool === "crane" && !has(p, "deck_crane")) return no("not-fitted", "No deck crane is fitted.");
  if (v.upgrades.lift) return no("busy", "A lift is already under way.");
  const job = liftJob(s, v, tool);
  if (!job) return no("no-target", tool === "crane"
    ? `Nothing to lift within ${DECK_CRANE.reach} m. Bring the Spindle over shallow salvage or stone (${DECK_CRANE.depth} m or less).`
    : `No frame or wreck salvage within ${SALVAGE_CLAMP_REACH} m of the jaw, and no disabled hull to hold.`);
  if (job.refusal) return no("place", job.refusal);
  v.upgrades = { ...v.upgrades, lift: { tool, sourceId: job.sourceId, readyAt: s.tick + ticks(job.seconds) } };
  const label = SOURCES[job.sourceId].label;
  return ok({ kind: "lift", vehicleId: v.id, tool, phase: "start", sourceId: job.sourceId, item: job.item, quantity: job.quantity },
    `${tool === "crane" ? "Deck crane" : "Salvage clamp"} on ${label} · ${job.seconds} s · hold position.`, `${tool === "crane" ? "Crane" : "Clamp"} · ${label}`);
}
/** Disabled hulls the clamp can hold: never the carrier, never one in a guided recovery. */
function towable(s: GameState, mantle: VehicleState): VehicleState | null {
  return s.fleet.vehicles.filter((o) => o.id !== mantle.id && o.disabled && !o.berth && o.hull !== "hearthline" &&
    s.recovery.operation?.vehicleId !== o.id && distance(o.pose.position, mantle.pose.position) <= SALVAGE_CLAMP_REACH + HULL_COLLIDERS[o.hull].radius)
    .sort((a, b) => distance(a.pose.position, mantle.pose.position) - distance(b.pose.position, mantle.pose.position) || a.id.localeCompare(b.id))[0] ?? null;
}
function clamp(s: GameState, v: VehicleState, p: CraftProfile): SignatureOutcome {
  if (!has(p, "salvage_clamp")) return no("not-fitted", "No salvage clamp is fitted.");
  if (v.upgrades.tow) {
    const towed = v.upgrades.tow;
    v.upgrades = { ...v.upgrades, tow: null };
    return ok({ kind: "tow", vehicleId: v.id, towed, phase: "released" }, "Clamp released · the hull rests here.", "Tow released");
  }
  const hull = towable(s, v);
  if (hull) {
    v.upgrades = { ...v.upgrades, tow: hull.id };
    return ok({ kind: "tow", vehicleId: v.id, towed: hull.id, phase: "held" },
      `Clamp holds the disabled ${HULLS[hull.hull].label} · it follows the Mantle. Release it at a service mooring or the pod to patch it.`, `Towing the ${HULLS[hull.hull].label}`);
  }
  return startLift(s, v, p, "clamp");
}
/** The Mantle's drone bay, from the hull's lower bow. */
function drone(s: GameState, v: VehicleState, p: CraftProfile): SignatureOutcome {
  const out = v.upgrades.drone;
  if (out) {
    v.upgrades = { ...v.upgrades, drone: null };
    return ok({ kind: "drone", vehicleId: v.id, phase: "recalled", position: out.position, reason: "recalled" }, "Scout drone recalled to its bay.", "Drone recalled");
  }
  const refusal = droneLaunchRefusal(p, { speed: Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z), berthed: !!v.berth, charge: v.charge });
  if (refusal) return no(p.contracts.includes("scout_drone") ? "place" : "not-fitted", refusal);
  const aim = pilotForward(s), at = v.pose.position, r = HULL_COLLIDERS.mantle.radius + 0.8;
  const position = { x: at.x + aim.x * r, y: at.y + 0.5, z: at.z + aim.z * r };
  v.charge -= DRONE_LAUNCH_CHARGE;
  s.metrics.powerUsed += DRONE_LAUNCH_CHARGE;
  v.upgrades = { ...v.upgrades, drone: { position, yaw: s.player.pose.yaw, pitch: s.player.pose.pitch, launchedAt: s.tick } };
  return ok({ kind: "drone", vehicleId: v.id, phase: "launched", position },
    `Scout drone out · ${SCOUT_DRONE.batterySeconds} s battery, ${SCOUT_DRONE.tether} m tether. It steers like the craft and scans within ${SCOUT_DRONE.scanRange} m; press its key again to recall.`, "Drone launched", "scan");
}
const DRONE_LAUNCH_CHARGE = 5;

// ---------------------------------------------------------------- the drone in the step
/** The scout drone the pilot is flying, if any. */
export function activeDrone(s: Readonly<GameState>): VehicleState | null {
  const v = piloted(s as GameState);
  return v?.upgrades.drone ? v : null;
}
const DRONE_SHAPE = { radius: SCOUT_DRONE.radius, height: SCOUT_DRONE.height } as const;
/** Fly the drone one step with the pilot's input; the Mantle holds station. */
export function steerDrone(v: VehicleState, yaw: number, pitch: number,
  input: { forward: number; right: number; vertical: number }, world: WorldQueries): void {
  const d = v.upgrades.drone!;
  const n = Math.max(1, Math.hypot(input.forward, input.right, input.vertical)), speed = SCOUT_DRONE.speed * DT / n;
  const f = input.forward, r = input.right;
  const delta = {
    x: (Math.sin(yaw) * f * Math.cos(pitch) + Math.cos(yaw) * r) * speed,
    y: (input.vertical + Math.sin(pitch) * f) * speed,
    z: (-Math.cos(yaw) * f * Math.cos(pitch) + Math.sin(yaw) * r) * speed,
  };
  const moved = world.moveCapsule(d.position, delta, DRONE_SHAPE);
  v.upgrades = { ...v.upgrades, drone: { ...d, position: { ...moved.position, y: Math.min(moved.position.y, -0.3) }, yaw, pitch } };
}

// ---------------------------------------------------------------- per step
/** Signature work after movement: tagger aims, lifts, lines, tows and the drone. */
export function stepSignatures(s: GameState, world: WorldQueries, events: GameEvent[]): void {
  const pilot = s.player.controlledVehicleId;
  for (const v of s.fleet.vehicles) {
    const rt = v.upgrades;
    if (!rt.tag && !rt.lift && !rt.grapple && !rt.tow && !rt.drone) continue;
    if (rt.tag) stepTag(s, v, v.id === pilot, events);
    if (rt.lift) stepLift(s, v, events);
    if (v.upgrades.grapple) stepLine(s, v, world, events);
    if (v.upgrades.tow) stepTow(s, v, world, events);
    if (v.upgrades.drone) stepDrone(s, v, v.id === pilot, events);
  }
}
const say = (events: GameEvent[], event: SignatureEvent, message: string, error = false): void => {
  events.push({ type: "notice", channel: "action", message, ...(error ? { error } : {}) }, { type: "signature", event });
};
function stepTag(s: GameState, v: VehicleState, piloting: boolean, events: GameEvent[]): void {
  const t = v.upgrades.tag!, target = taggableById(s, t.targetId);
  // A steady aim keeps its own target in the cone; nothing else is searched per step.
  const { origin, aim } = aimOf(s, v);
  if (!target || !piloting || v.disabled || !hasContract(vehicleProfile(s, v), "range_tagger") ||
      !inCone(origin, aim, target.position, RANGE_TAGGER.range, RANGE_TAGGER.coneDeg)) {
    v.upgrades = { ...v.upgrades, tag: null };
    const label = target?.label ?? "the target";
    say(events, { kind: "tag", vehicleId: v.id, phase: "lost", targetId: t.targetId, label, what: target?.what ?? "source" },
      `Tag lost · the aim left ${label}.`, true);
    return;
  }
  if (s.tick - t.since < ticks(RANGE_TAGGER.aimSeconds)) return;
  v.upgrades = { ...v.upgrades, tag: null };
  const filed = fileTag(s, target);
  say(events, { kind: "tag", vehicleId: v.id, phase: "done", targetId: target.id, label: target.label, what: target.what }, `Tagged ${target.label} · ${filed}`);
  events.push({ type: "sound", cue: "scan" });
}
function stepLift(s: GameState, v: VehicleState, events: GameEvent[]): void {
  const lift = v.upgrades.lift!;
  const job = liftJob(s, v, lift.tool, lift.sourceId);
  const moved = Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) > 0.6;
  if (!job || job.refusal || moved) {
    v.upgrades = { ...v.upgrades, lift: null };
    const reason = moved ? "the hull moved off the load" : job?.refusal ?? "the load is out of reach";
    say(events, { kind: "lift", vehicleId: v.id, tool: lift.tool, phase: "stopped", sourceId: lift.sourceId, item: SOURCES[lift.sourceId as SourceId].item, quantity: 0, reason },
      `${lift.tool === "crane" ? "Crane" : "Clamp"} stopped · ${reason}. Nothing lifted.`, true);
    return;
  }
  if (s.tick < lift.readyAt) return;
  const node = s.world.resources.find((r) => r.id === job.sourceId)!;
  node.stock -= job.quantity;
  addItem(s, job.item, job.quantity, v.cargoId);
  v.charge = Math.max(0, v.charge - job.charge);
  s.metrics.powerUsed += job.charge;
  s.metrics.collections++;
  if (!s.knowledge.scans.includes(job.sourceId)) s.knowledge.scans.push(job.sourceId);
  v.upgrades = { ...v.upgrades, lift: null };
  say(events, { kind: "lift", vehicleId: v.id, tool: lift.tool, phase: "done", sourceId: job.sourceId, item: job.item, quantity: job.quantity },
    `${lift.tool === "crane" ? "Deck crane" : "Salvage clamp"} · ${job.quantity} × ${ITEMS[job.item].label} → ${HULLS[v.hull].label} hold · −${job.charge}% power.`);
  events.push({ type: "sound", cue: "collect" });
}
/** Moves a hull toward `target` through the ordinary hull sweep. */
function sweepHull(s: GameState, v: VehicleState, target: Vec3, world: WorldQueries): void {
  const at = v.pose.position, delta = { x: target.x - at.x, y: target.y - at.y, z: target.z - at.z };
  if (Math.hypot(delta.x, delta.y, delta.z) < 1e-6) return;
  v.pose.position = moveHull(world, at, delta, HULL_COLLIDERS[v.hull]).position;
  if (s.player.controlledVehicleId === v.id) s.player.pose.position = { ...v.pose.position };
}
function stepLine(s: GameState, v: VehicleState, world: WorldQueries, events: GameEvent[]): void {
  const line = v.upgrades.grapple!;
  const release = (reason: string): void => {
    v.upgrades = { ...v.upgrades, grapple: null };
    say(events, { kind: "grapple", vehicleId: v.id, phase: "released", anchor: line.anchor, load: line.load, reason }, `Grapple released · ${reason}.`, true);
  };
  if (v.disabled || v.berth) { release("the hull lost power to the winch"); return; }
  if (line.load) {
    // A hooked frame: the line shortens while reeling and the frame comes aboard.
    if (!world.lineOfSight(v.pose.position, line.anchor, [v.id])) { release("something crossed the line"); return; }
    const reach = distance(v.pose.position, line.anchor);
    if (reach > GRAPPLE.range + 2) { release("the line ran out"); return; }
    if (!line.reeling) return;
    const length = Math.max(0, Math.min(line.length, reach) - GRAPPLE.reel * DT);
    if (length > GRAPPLE.minLength) { v.upgrades = { ...v.upgrades, grapple: { ...line, length } }; return; }
    const node = s.world.resources.find((r) => r.id === line.load);
    if (!node || node.stock <= 0) { release("the frame came loose"); return; }
    if (!hasRoom(s, v.cargoId, ITEMS.tagged_frame.cu)) {
      v.upgrades = { ...v.upgrades, grapple: { ...line, reeling: false } };
      say(events, { kind: "grapple", vehicleId: v.id, phase: "holding", anchor: line.anchor, load: line.load, reason: "hold full" },
        `The frame is alongside but the hold is full · make ${ITEMS.tagged_frame.cu} CU room, then reel again.`, true);
      return;
    }
    node.stock--;
    addItem(s, "tagged_frame", 1, v.cargoId);
    s.metrics.collections++;
    if (!s.knowledge.scans.includes(line.load)) s.knowledge.scans.push(line.load);
    v.upgrades = { ...v.upgrades, grapple: null };
    say(events, { kind: "grapple", vehicleId: v.id, phase: "landed", anchor: line.anchor, load: line.load }, "Frame reeled aboard · 1 × tagged frame → Creel hold.");
    events.push({ type: "sound", cue: "collect" });
    return;
  }
  const step = grappleStep(line, v.pose.position, line.reeling, DT, world, [v.id]);
  if (!step.line) { release(step.released ?? "the line parted"); return; }
  v.upgrades = { ...v.upgrades, grapple: { ...line, length: step.line.length, reeling: line.reeling && step.line.length > GRAPPLE.minLength } };
  if (step.position !== v.pose.position) {
    sweepHull(s, v, step.position, world);
    // The taut line takes the outward part of the hull's way.
    const d = distance(v.pose.position, line.anchor) || 1;
    const out = { x: (v.pose.position.x - line.anchor.x) / d, y: (v.pose.position.y - line.anchor.y) / d, z: (v.pose.position.z - line.anchor.z) / d };
    const along = v.velocity.x * out.x + v.velocity.y * out.y + v.velocity.z * out.z;
    if (along > 0) v.velocity = { x: v.velocity.x - out.x * along, y: v.velocity.y - out.y * along, z: v.velocity.z - out.z * along };
  }
}
/** A held line holds the hull against currents like an anchor (step's flow response). */
export const lineHolds = (v: Readonly<VehicleState>): boolean => !!v.upgrades.grapple && v.upgrades.grapple.load === null;
/** How far behind the Mantle a towed hull rides. */
const towGap = (mantle: VehicleState, towed: VehicleState): number =>
  HULL_COLLIDERS[mantle.hull].radius + HULL_COLLIDERS[towed.hull].radius + 1;
function stepTow(s: GameState, v: VehicleState, world: WorldQueries, events: GameEvent[]): void {
  const towed = s.fleet.vehicles.find((o) => o.id === v.upgrades.tow);
  const release = (reason: string): void => {
    const id = v.upgrades.tow!;
    v.upgrades = { ...v.upgrades, tow: null };
    say(events, { kind: "tow", vehicleId: v.id, towed: id, phase: "released", reason }, `Clamp released · ${reason}.`, true);
  };
  if (!towed || !towed.disabled || towed.berth || s.recovery.operation?.vehicleId === towed.id) { if (v.upgrades.tow) release("the hull is no longer adrift"); return; }
  if (v.disabled || v.berth) { release("the Mantle lost power to the jaw"); return; }
  const gap = towGap(v, towed), back = { x: -Math.sin(v.pose.yaw), z: Math.cos(v.pose.yaw) };
  const target = { x: v.pose.position.x + back.x * gap, y: v.pose.position.y, z: v.pose.position.z + back.z * gap };
  sweepHull(s, towed, target, world);
  towed.velocity = { ...v.velocity };
  towed.pose.yaw = v.pose.yaw;
  if (distance(towed.pose.position, v.pose.position) > gap + 8) release("the towed hull snagged on rock");
}
function stepDrone(s: GameState, v: VehicleState, piloting: boolean, events: GameEvent[]): void {
  const d = v.upgrades.drone!, out = (s.tick - d.launchedAt) / TICKS_PER_SECOND;
  const recall = !piloting ? "the pilot left the helm" : v.disabled ? "the Mantle lost power"
    : droneRecall(d.position, v.pose.position, out) ? (out >= SCOUT_DRONE.batterySeconds ? "its battery ran low" : "it reached the end of its tether") : null;
  if (recall) {
    v.upgrades = { ...v.upgrades, drone: null };
    say(events, { kind: "drone", vehicleId: v.id, phase: "recalled", position: d.position, reason: recall }, `Scout drone recalled · ${recall}.`);
    return;
  }
  // The drone maps what it passes and scans within its short range.
  visitChart(s.systems, d.position);
  const found: string[] = [];
  const cx = Math.floor(d.position.x / SCAN_CELL), cz = Math.floor(d.position.z / SCAN_CELL);
  for (let i = cx - 1; i <= cx + 1; i++) for (let k = cz - 1; k <= cz + 1; k++)
    for (const f of SCAN_GRID.get(`${i}:${k}`) ?? []) {
      if (distance(f.position, d.position) > SCOUT_DRONE.scanRange) continue;
      if (f.what === "site") { if (discoverSite(s.systems, f.key).length) found.push(f.label); }
      else if (f.what === "source") {
        if (!s.knowledge.scans.includes(f.key)) { s.knowledge.scans.push(f.key); found.push(f.label); }
      } else if (!s.systems.beacons.some((b) => b.id === f.key)) {
        s.systems.beacons.push({ id: f.key, name: f.label.slice(0, BEACON_NAME_MAX), category: "landmark", position: { ...f.position }, source: "decode" });
        found.push(f.label);
      }
    }
  if (found.length) {
    say(events, { kind: "drone", vehicleId: v.id, phase: "found", position: { ...d.position }, found }, `Drone scan · ${found.join(" · ")}.`);
    events.push({ type: "sound", cue: "scan" });
  }
}

/** Static things the drone scans (sites, sources, cave openings) in coarse cells,
 * built once, so a step reads only the nine cells around the drone. */
const SCAN_CELL = 50;
interface ScanPoint { position: Vec3; label: string; what: "site" | "source" | "opening"; key: string }
const SCAN_GRID: ReadonlyMap<string, readonly ScanPoint[]> = (() => {
  const grid = new Map<string, ScanPoint[]>();
  const put = (f: ScanPoint): void => {
    const key = `${Math.floor(f.position.x / SCAN_CELL)}:${Math.floor(f.position.z / SCAN_CELL)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(f);
  };
  for (const id of WORLD_LOST_SITES) put({ position: LOST_SITES[id].position, label: LOST_SITES[id].label, what: "site", key: id });
  for (const id of SOURCE_IDS) put({ position: SOURCES[id].position, label: SOURCES[id].label, what: "source", key: id });
  for (const f of CAVE_FEATURES) put({ position: f.position, label: f.label, what: "opening", key: `sonar:${f.id}` });
  return grid;
})();

// ---------------------------------------------------------------- loudness
/** A sonar sweep is a loud ping for a second after it fires. */
export function signatureLoudness(s: Readonly<GameState>, v: Readonly<VehicleState>): number {
  const sweep = v.upgrades.sonar;
  return sweep && s.tick - sweep.at < TICKS_PER_SECOND ? WIDE_SONAR.loudness : 0;
}

// ---------------------------------------------------------------- the craft action bar
export type CraftActionId = "overdrive" | "flare" | "ballast" | "listen" | "sample" | "anchor" | SignatureAction;
export interface CraftAction {
  readonly key: number;
  readonly action: CraftActionId;
  readonly label: string;
  /** `active`: running or out now; `waiting`: cooling or charging; `ready`. */
  readonly state: "ready" | "active" | "waiting";
  readonly detail: string | null;
}
/** The piloted craft's fitted actions, numbered 1–9 in a fixed order per craft. */
export function craftActions(s: Readonly<GameState>): CraftAction[] {
  const v = piloted(s as GameState);
  if (!v || v.berth) return [];
  const p = vehicleProfile(s, v), rt = v.upgrades, tick = s.tick, out: Omit<CraftAction, "key">[] = [];
  const add = (action: CraftActionId, label: string, state: CraftAction["state"] = "ready", detail: string | null = null): void => {
    out.push({ action, label, state, detail });
  };
  const secs = (until: number): string => `${Math.ceil((until - tick) / TICKS_PER_SECOND)} s`;
  if (has(p, "overdrive"))
    add("overdrive", "Overdrive", overdriveActive(rt, tick) ? "active" : tick < rt.overdrive.readyAt ? "waiting" : "ready",
      tick < rt.overdrive.readyAt && !overdriveActive(rt, tick) ? secs(rt.overdrive.readyAt) : `${OVERDRIVE.speed} m/s`);
  if (hasContract(p, "wide_sonar")) add("sonar", "Sonar", rt.sonar && tick < rt.sonar.readyAt ? "waiting" : "ready",
    rt.sonar && tick < rt.sonar.readyAt ? secs(rt.sonar.readyAt) : `${WIDE_SONAR.range} m`);
  if (hasContract(p, "range_tagger")) add("tag", rt.tag ? "Tagging" : "Tag", rt.tag ? "active" : "ready", `${RANGE_TAGGER.range} m`);
  if (has(p, "grapple")) {
    add("grapple", rt.grapple ? "Release line" : "Grapple", rt.grapple ? "active" : "ready", rt.grapple ? `${Math.round(rt.grapple.length)} m` : `${GRAPPLE.range} m`);
    if (rt.grapple) add("reel", rt.grapple.reeling ? "Stop reel" : "Reel in", rt.grapple.reeling ? "active" : "ready");
  }
  if (has(p, "drop_pod")) add("pod", rt.pod ? "Collect pod" : "Drop pod", rt.pod ? "active" : "ready", rt.pod ? `${Math.round(distance(rt.pod.position, v.pose.position))} m` : `${DROP_POD.cu} CU`);
  if (has(p, "deck_crane")) add("crane", "Crane lift", rt.lift?.tool === "crane" ? "active" : "ready", rt.lift?.tool === "crane" ? secs(rt.lift.readyAt) : null);
  if (has(p, "salvage_clamp")) add("clamp", rt.tow ? "Release tow" : "Clamp", rt.tow || rt.lift?.tool === "clamp" ? "active" : "ready",
    rt.lift?.tool === "clamp" ? secs(rt.lift.readyAt) : null);
  if (hasContract(p, "scout_drone")) add("drone", rt.drone ? "Recall drone" : "Drone", rt.drone ? "active" : "ready",
    rt.drone ? `${Math.max(0, Math.ceil(SCOUT_DRONE.batterySeconds - (tick - rt.drone.launchedAt) / TICKS_PER_SECOND))} s` : null);
  if (has(p, "flare")) add("flare", "Flare", rt.flares > 0 ? "ready" : "waiting", `${rt.flares} left`);
  if (has(p, "ballast")) add("ballast", "Ballast", rt.ascent !== null ? "active" : rt.ballastArmed ? "ready" : "waiting", rt.ballastArmed ? null : "spent");
  if (hasContract(p, "listening_array")) add("listen", "Listen");
  if (has(p, "specimen_bay")) add("sample", "Sample");
  if (has(p, "mooring_anchor")) add("anchor", rt.anchored ? "Raise anchor" : "Anchor", rt.anchored ? "active" : "ready");
  return out.slice(0, 9).map((a, n) => ({ ...a, key: n + 1 }));
}
