/** C3: S4's ecology composed into the fixed step, beside the sound hunter.
 * Health and drift come only from `stepEcology`'s effects; S4's events become
 * hazard notices (their captions are the text equivalent of each cue), the
 * presentation-only `threat-damage` for strikes, and one `ecology` event that
 * S6's mapper turns into audio from the event's own fields. */
import type { Deterrent } from "../content/ecology/species.js";
import type { ProtectionId } from "../content/ecology/hazards.js";
import { HULL_COLLIDERS, PLACES } from "../content/registry.js";
import { STOP_IDS, WORKING_STOPS } from "../content/stops.js";
import { ecologyWorldFrom } from "./ecology/adapter.js";
import { DETERRENT_SECONDS, MAX_DETERRENTS, stepEcology } from "./ecology/ecology.js";
import { protectionFor } from "./ecology/hazards.js";
import { stimulusFrom } from "./ecology/stimulus.js";
import type { EcologyWorld, Stimulus } from "./ecology/types.js";
import { hullHandling } from "./fleet.js";
import { FIXED_SECONDS as DT } from "./clock.js";
import { facility, stopWorks } from "./inventory.js";
import type { GameEvent, GameState, ItemStack, Vec3, WorldQueries } from "./types.js";
import { moveHull } from "./world.js";

/** Suit fittings worn in the diver's equipment, and hull protections that work
 * for the hull whose hold carries them (like the Dart's socket modules). */
export const SUIT_PROTECTIONS = ["heat_shroud", "brine_seals"] as const satisfies readonly ProtectionId[];
export const HULL_PROTECTIONS = ["hull_heat_lining", "hull_brine_seals", "trim_vanes"] as const satisfies readonly ProtectionId[];
export const isSuitProtection = (kind: string): kind is (typeof SUIT_PROTECTIONS)[number] =>
  (SUIT_PROTECTIONS as readonly string[]).includes(kind);
const isHullProtection = (kind: string): kind is (typeof HULL_PROTECTIONS)[number] =>
  (HULL_PROTECTIONS as readonly string[]).includes(kind);

const controlled = (s: GameState) => s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId) ?? null;
export function fittedProtections(s: GameState): ProtectionId[] {
  const v = controlled(s);
  return v ? s.inventory.items.filter((i) => i.containerId === v.cargoId && isHullProtection(i.kind)).map((i) => i.kind as ProtectionId)
    : s.inventory.items.filter((i) => i.containerId === "equipment" && i.fitted === "protection" && isSuitProtection(i.kind))
      .map((i) => i.kind as ProtectionId);
}

/** Reliable comfort places no animal approaches: the three B1 refuges, every
 * working air stop and a station-keeping carrier. */
export function ecologyRefuges(s: GameState): EcologyWorld["refuges"] {
  const out: { position: Vec3; radius: number }[] = [
    { position: PLACES.home_pod.position, radius: 10 },
    ...(facility(s, "island_workshop") ? [{ position: PLACES.island_workshop.position, radius: 9 }] : []),
    { position: PLACES.canopy_lab.position, radius: 8 },
  ];
  for (const id of STOP_IDS) if (WORKING_STOPS[id].air && stopWorks(s, id)) out.push({ position: WORKING_STOPS[id].work, radius: 8 });
  const h = s.fleet.vehicles.find((v) => v.id === s.fleet.docking?.vehicleId);
  if (h && s.fleet.docking?.stationKeeping) out.push({ position: h.pose.position, radius: HULL_COLLIDERS.hearthline.radius + 2 });
  return out;
}

/** Place a deterrent in the saved ecology state, exactly as S4's deploy command does. */
export function placeDeterrent(s: GameState, kind: Deterrent, position: Vec3): void {
  const list = s.world.ecology.deterrents;
  if (list.length >= MAX_DETERRENTS) list.shift();
  list.push({ kind, position: { ...position }, seconds: DETERRENT_SECONDS[kind] });
}

const KIT = { lure: "glow_lure", ink: "startle_ink" } as const;
/** Glow lure or startle ink, from the diver hold or the controlled craft's hold. */
export function releaseKit(s: GameState, kind: "lure" | "ink"): string | null {
  if (s.player.mode === "interior" || s.player.mode === "walking") return "Release kits in open water.";
  const v = controlled(s), holds = ["diver", ...(v ? [v.cargoId] : [])];
  const item: ItemStack | undefined = s.inventory.items.find((i) => i.kind === KIT[kind] && holds.includes(i.containerId));
  if (!item) return kind === "lure" ? "No glow lure carried. Fabricate them at the pod." : "No startle ink carried. Fabricate it at the pod.";
  item.quantity--;
  if (item.quantity === 0) s.inventory.items = s.inventory.items.filter((i) => i !== item);
  const p = v?.pose.position ?? s.player.pose.position;
  placeDeterrent(s, kind, p);
  s.feedback = kind === "lure" ? "Glow lure released · it rises slowly. Sight hunters follow it; dim your lamp and move away."
    : "Startle ink released · a dark bitter cloud around you. Anything in or looking through it breaks off.";
  return null;
}

export function toggleLamp(s: GameState): string | null {
  s.player.lamp = !s.player.lamp;
  s.feedback = s.player.lamp ? "Lamp on." : "Lamp off · running dark. Light hunters see you less; you see less.";
  return null;
}

/** One ecology step, after movement and the hunter. Applies health and drift
 * from `effects` only, then reports presentation events. */
export function updateEcology(s: GameState, loudness: number, scanned: boolean, events: GameEvent[], world: WorldQueries): void {
  if (s.opening.phase < 4 || s.scenario !== "expedition") return;
  const v = controlled(s);
  const stimulus = stimulusFrom(s, loudness, { lamp: s.player.lamp, scanned });
  const result = stepEcology(s.world.ecology, {
    tick: s.tick, stimulus, protection: protectionFor(v?.hull ?? null, fittedProtections(s)), vehicleId: v?.id ?? null,
  }, ecologyWorldFrom(world, ecologyRefuges(s)));
  const { diverHealth, vehicleHealth, drift } = result.effects;
  if (v && vehicleHealth > 0) v.health = Math.max(0, v.health - vehicleHealth);
  if (!v && diverHealth > 0) s.player.vitals.health -= diverHealth;
  // Drift is another swept move of the actor, never a teleport through rock.
  const d = { x: drift.x * DT, y: drift.y * DT, z: drift.z * DT };
  if ((d.x || d.y || d.z) && [d.x, d.y, d.z].every(Number.isFinite)) {
    if (v && !v.berth) {
      const moved = moveHull(world, v.pose.position, d, HULL_COLLIDERS[v.hull]);
      v.pose.position = moved.position;
      s.player.pose.position = { ...moved.position };
    } else if (!v && s.player.mode === "swimming") {
      const moved = world.moveCapsule(s.player.pose.position, { ...d, y: Math.min(d.y, -0.5 - s.player.pose.position.y) }, { radius: 0.34, height: 0.95 });
      s.player.pose.position = moved.position;
    }
  }
  for (const e of result.events) {
    if (e.type === "ecology-cue") events.push({ type: "notice", channel: "hazard", context: "ecology", message: e.caption });
    else if (e.type === "hazard-warning") events.push({ type: "notice", channel: "hazard", context: "ecology", message: e.caption, error: e.level >= 70 });
    else events.push({
      type: "threat-damage", source: "ecology", origin: { ...e.origin }, species: e.species,
      target: e.target === "vehicle" && v ? { kind: "vehicle", vehicleId: v.id } : { kind: "diver" },
      loss: e.loss, healthAfter: e.target === "vehicle" && v ? v.health : Math.max(0, s.player.vitals.health),
    });
    events.push({ type: "ecology", event: e });
  }
}
/** Presentation-only stimulus for render, HUD and audio, which never see the
 * step's loudness: estimated from the actor's speed with step.ts's own levels.
 * The simulation always uses the step's exact loudness. */
export function presentationStimulus(s: GameState): Stimulus {
  const v = controlled(s), m = v?.velocity ?? s.player.velocity, speed = Math.hypot(m.x, m.y, m.z);
  const loudness = v ? speed > 0.5 ? hullHandling(v.hull)?.loudness.cruise ?? (v.hull === "dart" ? 0.48 : 0.3) : 0.08
    : speed > 4.5 ? 0.6 : speed > 0.5 ? 0.14 : 0;
  return stimulusFrom(s, loudness, { lamp: s.player.lamp });
}
/** The lamp actually lights: switched on, and a controlled craft has power. */
export const lampOn = (s: GameState): boolean => {
  const v = controlled(s);
  return s.player.lamp && (!v || (v.charge > 0 && !v.disabled));
};
