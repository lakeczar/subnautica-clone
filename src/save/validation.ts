import { WORLD_CYCLE_BY_ID, WORLD_CYCLES } from "../content/currents/cycles.js";
import { validObservation } from "../sim/cycles/observe.js";
import {
  BLUEPRINTS,
  EVIDENCE,
  HULLS,
  isMountKind,
  ITEMS,
  MATERIALS,
  MODULES,
  PLACES,
  RECIPES,
  REFIT_TIERS,
  RENEWABLE_SOURCE_IDS,
  renewable,
  SOURCE_RENEWAL,
  SOURCES,
  SUIT_RATINGS,
  SUIT_REFITS,
  TECH_RECORDS,
  techRecord,
} from "../content/registry.js";
import type { HullId, RecipeId } from "../content/registry.js";
import { parseEcology } from "../sim/ecology/persist.js";
import { isSuitProtection } from "../sim/ecologyLink.js";
import { CREEL_CABIN, fittedMount, holdCapacity, hullToWorld } from "../sim/fleet.js";
import { CANISTER_CU, recoverableHull, recoveryRouteFor } from "../sim/recovery.js";
import { renewalCap } from "../sim/renewal.js";
import { RECOVERY_ROUTES, WORLD_VERTICAL_BOUNDS } from "../content/routes.js";
import { deepRoute, recoveryRouteIds } from "../content/recoveryRoutes.js";
import type { GameState } from "../sim/types.js";
import { carrierCompartment, containerAccepts, usedCapacity } from "../sim/inventory.js";
import { installedModuleValid, moduleItem } from "../sim/modules.js";
import { WORLD_BOUNDS } from "../sim/world.js";
import { atCarrierSupport, BERTH_LOCAL, CARRIER_LAYOUT, carrierCompartmentContainers, localToWorld } from "../sim/carrier.js";
import { HEARTHLINE_SOCKETS } from "../content/fleet/hearthlineInterior.js";
import { blueprints, validStory } from "../sim/story/index.js";
import { registryEvidence, storyView } from "../sim/storyLink.js";
import { createGame } from "../sim/state.js";
import { isRestBase } from "../content/bases.js";
import { UPGRADES, upgradeId } from "../content/upgrades/catalogue.js";
import type { UpgradeId } from "../content/upgrades/catalogue.js";
import { slotCapacity, slotOf } from "../sim/upgrades/fitting.js";
import { craftProfile } from "../sim/upgrades/effects.js";
import { FLARE } from "../sim/upgrades/tools.js";
import { BIO_CELL } from "../sim/power/charging.js";
import { MAX_FLARES } from "../sim/fittings.js";
import { validSystems } from "../sim/systems/state.js";
import { instanceProblems } from "../sim/systems/instances.js";
import { MODULES as SYS2_MODULES, OUTPOST_TIERS } from "../content/systems/hosts.js";
import { DECODABLES } from "../content/systems/decodes.js";
/** SYS-1 per-vehicle runtime: flares, ballast, overdrive and the carrier anchor.
 * Grapple and pod stay null until those tools are composed. */
function validRuntime(v: unknown, hull: string): boolean {
  return exact(v, ["flares", "ballastArmed", "ascent", "overdrive", "grapple", "pod", "anchored"]) &&
    int(v.flares, 0, FLARE.magazine) && bool(v.ballastArmed) && (v.ascent === null || n(v.ascent, 0, 40)) &&
    exact(v.overdrive, ["activeUntil", "readyAt"]) && int(v.overdrive.activeUntil, 0, 2147483647) &&
    int(v.overdrive.readyAt, 0, 2147483647) && v.grapple === null && v.pod === null && bool(v.anchored) &&
    (!v.anchored || hull === "hearthline");
}
const isSuit = (kind: string): boolean => Object.hasOwn(SUIT_RATINGS, kind);
/** The one fitted suit is the highest refit tier crafted, or the 150 m suit. */
const expectedSuit = (crafted: readonly string[]): string =>
  (Object.keys(SUIT_REFITS) as (keyof typeof SUIT_REFITS)[]).filter((id) => crafted.includes(id)).at(-1) ?? "suit_150";
export const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  record(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const n = (v: unknown, a: number, b: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
const int = (v: unknown, a: number, b: number): v is number =>
  n(v, a, b) && Number.isInteger(v);
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
/** Any finite vector inside the 2.0 x 1.8 km world frame (|x|, |z| <= 1632). */
const vec = (v: unknown): boolean =>
  exact(v, ["x", "y", "z"]) &&
  ["x", "y", "z"].every((k) => n(v[k], -2048, 2048));
const worldVec = (v: unknown): boolean =>
  vec(v) &&
  record(v) &&
  n(v.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX) &&
  n(v.y, WORLD_VERTICAL_BOUNDS.minY, WORLD_VERTICAL_BOUNDS.maxY) &&
  n(v.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
const pose = (v: unknown): boolean =>
  exact(v, ["frame", "position", "yaw", "pitch"]) &&
  v.frame === "world" &&
  worldVec(v.position) &&
  n(v.yaw, 0, Math.PI * 2) &&
  n(v.pitch, -1.35, 1.35);
const oneOf = (v: unknown, options: readonly string[]): boolean =>
  typeof v === "string" && options.includes(v);
const bool = (v: unknown): boolean => typeof v === "boolean";
const text = (v: unknown, max = 2000): v is string =>
  typeof v === "string" && v.length <= max;
const array = (
  v: unknown,
  max: number,
  check: (a: unknown) => boolean,
): v is unknown[] => Array.isArray(v) && v.length <= max && v.every(check);
const unique = (a: readonly unknown[]): boolean => new Set(a).size === a.length;
/** Every distinct scan a save can hold: each source, each technical record and the reef filter flow. */
const SCANNABLE_COUNT = Object.keys(SOURCES).length + Object.keys(TECH_RECORDS).length + 1;
/** The recipes whose paid costs make up each campaign hull's frame. */
const HULL_BUILD_RECIPES = {
  dart: ["dart_base"], creel: ["creel_base"], hush: ["hush_base"], spindle: ["spindle_base"], mantle: ["mantle_base"],
  hearthline: ["hearthline_keel", "hearthline_base"],
} as const satisfies Record<HullId, readonly RecipeId[]>;
/** B1's routes keep their exact indices; a deep S2 branch counts its own. */
function validRecoveryWaypoint(routeId: string, phase: string, waypoint: unknown): boolean {
  const deep = deepRoute(routeId);
  if (deep) return int(waypoint, 0, deep.attachmentIndex) && (phase === "ready" ? waypoint === deep.attachmentIndex
    : phase === "approach" ? waypoint >= 1 : waypoint <= deep.attachmentIndex - 1);
  const legacy = RECOVERY_ROUTES[routeId as keyof typeof RECOVERY_ROUTES];
  return int(waypoint, 0, legacy.attachmentIndex) && (routeId === "canopy" || (phase === "ready" ? waypoint === 5 :
    phase === "approach" ? n(waypoint, 1, 5) : n(waypoint, 0, 4)));
}
const stringSet = (
  v: unknown,
  max: number,
  check: (a: unknown) => boolean,
): v is string[] => array(v, max, check) && unique(v);
const known =
  (registry: object) =>
  (v: unknown): boolean =>
    typeof v === "string" && Object.hasOwn(registry, v);
const sameKeys = (v: unknown, template: object): v is Record<string, unknown> =>
  exact(v, Object.keys(template));
export function validState(value: unknown): value is GameState {
  // New Game's rosters define the complete facility and fixed-container sets.
  const fresh = createGame();
  if (
    !exact(value, [
      "tick",
      "sequence",
      "scenario",
      "player",
      "opening",
      "inventory",
      "knowledge",
      "world",
      "fleet",
      "systems",
      "story",
      "recovery",
      "metrics",
      "feedback",
      "migration",
    ]) ||
    !int(value.tick, 0, 2147483647) ||
    !int(value.sequence, 0, 2147483647) ||
    !oneOf(value.scenario, ["expedition", "carrier-fixture"]) ||
    !text(value.feedback) ||
    !(value.migration === null || text(value.migration))
  )
    return false;
  const p = value.player;
  if (
    !exact(p, [
      "pose",
      "velocity",
      "mode",
      "vitals",
      "refugeId",
      "controlledVehicleId",
      "interiorId",
      "starvationSeconds",
      "graceSeconds",
      "interiorPose",
      "mobileRefuge",
      "lamp",
    ]) ||
    typeof p.lamp !== "boolean" ||
    !pose(p.pose) ||
    !vec(p.velocity) ||
    !Object.values(p.velocity as Record<string, unknown>).every((v) =>
      n(v, -30, 30),
    ) ||
    !oneOf(p.mode, ["walking", "swimming", "piloting", "interior"]) ||
    !isRestBase(p.refugeId) ||
    !(p.controlledVehicleId === null || id(p.controlledVehicleId)) ||
    !(p.interiorId === null || id(p.interiorId)) ||
    !n(p.starvationSeconds, 0, 100000) ||
    !n(p.graceSeconds, 0, 180) ||
    !(p.mobileRefuge === null || (exact(p.mobileRefuge, ["vehicleId", "moduleId"]) &&
      id(p.mobileRefuge.vehicleId) && id(p.mobileRefuge.moduleId)))
  )
    return false;
  if (
    !exact(p.vitals, ["health", "oxygen", "food"]) ||
    !Object.values(p.vitals).every((v) => n(v, 0, 100))
  )
    return false;
  if (
    !(
      p.interiorPose === null ||
      (exact(p.interiorPose, ["frame", "position"]) &&
        (p.interiorPose.frame === "carrier-local" || p.interiorPose.frame === "hull-local") &&
        vec(p.interiorPose.position))
    )
  )
    return false;
  if (
    !exact(value.opening, ["phase", "phaseTicks"]) ||
    !int(value.opening.phase, 0, 4) ||
    !int(value.opening.phaseTicks, 0, 2147483647)
  )
    return false;
  const inventory = value.inventory;
  if (!exact(inventory, ["items", "containers", "buoy"])) return false;
  if (
    !array(
      inventory.items,
      256,
      (v) =>
        exact(v, [
          "id",
          "kind",
          "quantity",
          "containerId",
          "fitted",
          "charge",
          "provenance",
        ]) &&
        id(v.id) &&
        known(ITEMS)(v.kind) &&
        int(v.quantity, 1, 1000) &&
        id(v.containerId) &&
        [null, "tools", "suit", "recovery", "buoy", "mount", "protection"].includes(
          v.fitted as null,
        ) &&
        [null, "public", "maintenance"].includes(v.provenance as null) &&
        v.provenance !== null &&
        (v.charge === null || n(v.charge, 0, 100)),
    )
  )
    return false;
  if (
    !array(
      inventory.containers,
      100,
      (v) =>
        exact(v, ["id", "kind", "capacity", "ownerId"]) &&
        id(v.id) &&
        oneOf(v.kind, [
          "diver",
          "locker",
          "buoy",
          "vehicle",
          "cache",
          "equipment",
        ]) &&
        int(v.capacity, 0, 512) &&
        id(v.ownerId),
    )
  )
    return false;
  if (
    !exact(inventory.buoy, ["itemId", "deployed", "position"]) ||
    !(inventory.buoy.itemId === null || id(inventory.buoy.itemId)) ||
    !bool(inventory.buoy.deployed) ||
    !worldVec(inventory.buoy.position)
  )
    return false;
  const k = value.knowledge;
  if (
    !exact(k, [
      "blueprints",
      "scans",
      "evidence",
      "journals",
      "markers",
      "crafted",
      "hintLevel",
      "cycles",
    ]) ||
    // CY's validObservation per world cycle, each cycle once, never ahead of the clock.
    !array(k.cycles, WORLD_CYCLES.length, (v) => {
      const c = WORLD_CYCLE_BY_ID.get((v as { cycleId?: string })?.cycleId ?? "");
      return !!c && validObservation(c, v) && (v as { firstSeen: number }).firstSeen <= (value.tick as number);
    }) || new Set((k.cycles as { cycleId: string }[]).map((c) => c.cycleId)).size !== (k.cycles as unknown[]).length ||
    !stringSet(k.blueprints, BLUEPRINTS.length, (v) =>
      BLUEPRINTS.includes(v as (typeof BLUEPRINTS)[number]),
    ) ||
    // Unique, known IDs only, so the bound is every scannable thing in the build.
    !stringSet(k.scans, SCANNABLE_COUNT, (v) => v === "filter_flow" || known(SOURCES)(v) || techRecord(v)) ||
    !array(
      k.evidence,
      Object.keys(EVIDENCE).length,
      (v) =>
        exact(v, ["id", "tick", "provenance"]) &&
        known(EVIDENCE)(v.id) &&
        int(v.tick, 0, value.tick as number) &&
        // The saved provenance is the text shown at discovery; display reads the
        // registry by ID, so editing prose never invalidates a save.
        text(v.provenance, 200),
    ) ||
    !stringSet(k.journals, 1, (v) => v === "mara_reef_note") ||
    !stringSet(k.markers, Object.keys(PLACES).length, known(PLACES)) ||
    !stringSet(k.crafted, Object.keys(RECIPES).length, known(RECIPES)) ||
    !int(k.hintLevel, 0, 3)
  )
    return false;
  // S5's strict story guard, then the composed split: C01–C06 and the reef
  // journal live only in knowledge; the pod buffer repair is its paid recipe.
  const story = value.story;
  if (
    !validStory(story, value.tick as number) ||
    story.discoveries.some((d) => registryEvidence(d.id) || d.id === "mara_reef_note") ||
    story.works.repairs.includes("pod_buffer") !== (k.crafted as string[]).includes("pod_buffer")
  )
    return false;
  const w = value.world;
  if (!exact(w, ["resources", "renewal", "facilities", "maintenance", "ecology", "threat", "flares", "action"]))
    return false;
  // C4: burning flares (SYS-1), each a timed light in the world.
  if (!array(w.flares, MAX_FLARES, (v) => exact(v, ["position", "litAt", "until"]) && worldVec(v.position) &&
      int(v.litAt, 0, value.tick as number) && int(v.until, v.litAt as number, (value.tick as number) + 60 * 60)))
    return false;
  // S4's strict parser: whole roster, bounded values, hull exposures only for this save's fleet.
  const fleetIds = record(value.fleet) && Array.isArray(value.fleet.vehicles)
    ? value.fleet.vehicles.map((v) => (record(v) ? v.id : null)).filter((x): x is string => typeof x === "string") : [];
  if (typeof parseEcology(w.ecology, { vehicleIds: fleetIds }) === "string") return false;
  if (
    !array(
      w.renewal,
      RENEWABLE_SOURCE_IDS.length,
      (v) =>
        exact(v, ["id", "progress"]) &&
        renewable(v.id) &&
        int(v.progress, 0, SOURCE_RENEWAL[v.id].intervalSteps - 1),
    ) ||
    w.renewal.length !== RENEWABLE_SOURCE_IDS.length ||
    !w.renewal.every((v, i) => record(v) && v.id === RENEWABLE_SOURCE_IDS[i])
  )
    return false;
  if (
    !array(
      w.resources,
      Object.keys(SOURCES).length,
      (v) =>
        exact(v, ["id", "stock", "reserve"]) &&
        known(SOURCES)(v.id) &&
        int(
          v.stock,
          0,
          SOURCES[v.id as keyof typeof SOURCES].item === "meal"
            ? 32
            : SOURCES[v.id as keyof typeof SOURCES].stock +
                SOURCES[v.id as keyof typeof SOURCES].reserve,
        ) &&
        int(v.reserve, 0, SOURCES[v.id as keyof typeof SOURCES].reserve),
    )
  )
    return false;
  if (
    !array(
      w.facilities,
      fresh.world.facilities.length,
      (v) =>
        exact(v, ["id", "repaired"]) &&
        oneOf(v.id, fresh.world.facilities.map((f) => f.id)) &&
        bool(v.repaired),
    )
  )
    return false;
  if (
    !exact(w.maintenance, ["alloy", "glass", "membrane"]) ||
    !int(w.maintenance.alloy, 0, 16) ||
    !int(w.maintenance.glass, 0, 1) ||
    !int(w.maintenance.membrane, 0, 10)
  )
    return false;
  if (
    !(
      w.action === null ||
      (exact(w.action, ["sourceId", "seconds", "kind"]) &&
        known(SOURCES)(w.action.sourceId) &&
        n(w.action.seconds, 0, 20) &&
        oneOf(w.action.kind, ["sort", "food", "maintenance", "lift", "arm"]))
    )
  )
    return false;
  const t = w.threat;
  if (
    !exact(t, [
      "mode",
      "position",
      "interest",
      "modeSeconds",
      "distraction",
      "distractionSeconds",
    ]) ||
    !oneOf(t.mode, ["idle", "warn", "investigate", "pursue", "disengage"]) ||
    !worldVec(t.position) ||
    !n(t.interest, 0, 12) ||
    !n(t.modeSeconds, 0, 1000000) ||
    !(t.distraction === null || worldVec(t.distraction)) ||
    !n(t.distractionSeconds, 0, 12)
  )
    return false;
  const f = value.fleet;
  if (
    !exact(f, ["vehicles", "docking"]) ||
    !array(f.vehicles, 5, (v) => {
      if (
        !exact(v, [
          "id",
          "hull",
          "pose",
          "velocity",
          "charge",
          "health",
          "disabled",
          "emergencyAir",
          "cargoId",
          "modules",
          "investment",
          "rating",
          "boundRepairs",
          "berth",
          "upgrades",
          "bioFeed",
        ]) ||
        !id(v.id) ||
        !known(HULLS)(v.hull) ||
        !pose(v.pose) ||
        !vec(v.velocity) ||
        !Object.values(v.velocity as Record<string, unknown>).every((a) =>
          n(a, -30, 30),
        ) ||
        !n(v.charge, 0, 100) ||
        !n(v.health, 0, 100) ||
        !bool(v.disabled) ||
        !n(v.emergencyAir, 0, 120) ||
        !id(v.cargoId) ||
        !stringSet(v.modules, 16, id) ||
        !validRuntime(v.upgrades, v.hull as string) ||
        !(v.bioFeed === null || (exact(v.bioFeed, ["remaining"]) && n(v.bioFeed.remaining, 0, BIO_CELL.units))) ||
        !record(v.investment) ||
        !Object.entries(v.investment).every(
          ([a, b]) =>
            a in ITEMS &&
            (Object.hasOwn(MATERIALS, a) || a === "tagged_frame") &&
            int(b, 1, 50),
        ) ||
        !int(v.rating, 0, 800) ||
        !int(v.boundRepairs, 0, 7)
      )
        return false;
      return (
        v.berth === null ||
        (exact(v.berth, ["carrierId", "slot", "pose"]) &&
          id(v.berth.carrierId) &&
          int(v.berth.slot, 0, 1) &&
          exact(v.berth.pose, ["frame", "position", "yaw"]) &&
          v.berth.pose.frame === "carrier-local" &&
          vec(v.berth.pose.position) &&
          n(v.berth.pose.yaw, -Math.PI, Math.PI))
      );
    })
  )
    return false;
  if (f.docking !== null) {
    const d = f.docking;
    if (
      !exact(d, [
        "vehicleId",
        "configuration",
        "stationKeeping",
        "supportedDock",
        "transaction",
        "sequence",
        "completed",
        "launchBlocked",
        "sockets",
      ]) ||
      // Every interior socket, empty or holding one kind it accepts.
      !exact(d.sockets, HEARTHLINE_SOCKETS.map((socket) => socket.id)) ||
      !HEARTHLINE_SOCKETS.every((socket) => {
        const held = (d.sockets as Record<string, unknown>)[socket.id];
        return held === null || (typeof held === "string" && socket.accepts.includes(held));
      }) ||
      !id(d.vehicleId) ||
      !oneOf(d.configuration, ["compact", "medium"]) ||
      !bool(d.stationKeeping) ||
      !bool(d.supportedDock) ||
      !bool(d.launchBlocked) ||
      !int(d.sequence, 0, 1000000) ||
      !stringSet(d.completed, 64, id)
    )
      return false;
    if (
      !(
        d.transaction === null ||
        (exact(d.transaction, [
          "id",
          "type",
          "vehicleId",
          "slot",
          "phase",
          "ticks",
        ]) &&
          id(d.transaction.id) &&
          oneOf(d.transaction.type, ["capture", "launch"]) &&
          id(d.transaction.vehicleId) &&
          int(d.transaction.slot, 0, 1) &&
          oneOf(d.transaction.phase, ["prepared", "lock"]) &&
          int(d.transaction.ticks, 0, 30))
      )
    )
      return false;
  }
  const r = value.recovery;
  if (
    !exact(r, ["operation", "caches", "losses"]) ||
    !array(
      r.caches,
      80,
      (v) =>
        exact(v, ["id", "position", "containerId"]) &&
        id(v.id) &&
        worldVec(v.position) &&
        id(v.containerId),
    ) ||
    !array(
      r.losses,
      5,
      (v) =>
        exact(v, ["vehicleId", "position", "visited"]) &&
        id(v.vehicleId) &&
        worldVec(v.position) &&
        v.visited === true,
    )
  )
    return false;
  if (
    !(
      r.operation === null ||
      (exact(r.operation, [
        "vehicleId",
        "routeId",
        "method",
        "phase",
        "position",
        "waypoint",
      ]) &&
        id(r.operation.vehicleId) &&
        oneOf(r.operation.routeId, recoveryRouteIds()) &&
        r.operation.method === "tow" &&
        oneOf(r.operation.phase, ["approach", "ready", "tow"]) &&
        worldVec(r.operation.position) &&
        validRecoveryWaypoint(r.operation.routeId as string, r.operation.phase as string, r.operation.waypoint))
    )
  )
    return false;
  // C4: SYS-2's strict shape, then its identity and serviceability checks.
  if (!validSystems(value.systems)) return false;
  const metrics = value.metrics;
  if (
    !sameKeys(metrics, {
      swimMetres: 0,
      pilotMetres: 0,
      oxygenUsed: 0,
      powerUsed: 0,
      collections: 0,
      failures: 0,
      rescues: 0,
      minOxygen: 0,
      minPower: 0,
    }) ||
    !Object.values(metrics).every((v) => n(v, 0, 1e9))
  )
    return false;
  return semantic(value as unknown as GameState, fresh);
}
function semantic(s: GameState, fresh: GameState): boolean {
  const { items, containers, buoy } = s.inventory,
    k = s.knowledge,
    f = s.fleet;
  if (
    [
      ...items.map((i) => i.id),
      ...f.vehicles.map((v) => v.id),
      ...s.recovery.caches.map((c) => c.id),
    ].some((id) => {
      const m = /_(\d+)$/.exec(id);
      return m && Number(m[1]) > s.sequence;
    })
  )
    return false;
  if (
    !unique(items.map((i) => i.id)) ||
    !unique(containers.map((c) => c.id)) ||
    !unique(f.vehicles.map((v) => v.id)) ||
    !unique(s.recovery.caches.map((c) => c.id)) ||
    !unique(s.recovery.losses.map((c) => c.vehicleId)) ||
    !unique(k.evidence.map((e) => e.id)) ||
    !unique(s.world.resources.map((r) => r.id)) ||
    s.world.resources.length !== Object.keys(SOURCES).length ||
    !unique(s.world.facilities.map((a) => a.id)) ||
    s.world.facilities.length !== fresh.world.facilities.length
  )
    return false;
  for (const r of s.world.resources) {
    const d = SOURCES[r.id];
    if (d.item !== "meal" && r.stock + r.reserve > d.stock + d.reserve)
      return false;
  }
  const expected = [
    ...fresh.inventory.containers.map((c) => [c.id, c.kind, c.capacity, c.ownerId]),
    // Hold size follows hull and fitted mount; a stale capacity is invalid.
    ...f.vehicles.map((v) => [v.cargoId, "vehicle", holdCapacity(s, v), v.id]),
    // The carrier's pantry and fabrication compartments beside its stores.
    ...f.vehicles.filter((v) => v.hull === "hearthline").flatMap(carrierCompartmentContainers).map((c) => [c.id, c.kind, c.capacity, c.ownerId]),
    ...s.recovery.caches.map((c) => [c.containerId, "cache", c.id.startsWith("canister_") ? CANISTER_CU : 8, c.id]),
    // Each cabin package owns one persistent locker, fitted or stowed.
    ...items.filter((i) => i.kind === "creel_cabin").map((i) => [`${i.id}_locker`, "locker", MODULES.creel_cabin.lockerCu, i.id]),
    // C4 (SYS-2): each deployed outpost's locker; each locker module's own locker, carried or installed.
    ...s.systems.outposts.map((o) => [`${o.id}_locker`, "locker", OUTPOST_TIERS[o.tier].lockerCu, o.id]),
    ...[...items.filter((i) => i.kind === "mod_locker").map((i) => i.id), ...s.systems.sockets.filter((e) => e.kind === "mod_locker").map((e) => e.itemId)]
      .map((itemId) => [`${itemId}_locker`, "locker", SYS2_MODULES.locker.lockerCu, itemId]),
  ];
  if (
    expected.length !== containers.length ||
    !expected.every(([id, kind, capacity, ownerId]) =>
      containers.some(
        (c) =>
          c.id === id &&
          c.kind === kind &&
          c.capacity === capacity &&
          c.ownerId === ownerId,
      ),
    )
  )
    return false;
  if (containers.some((c) => usedCapacity(s, c.id) > c.capacity)) return false;
  if (items.some((i) => carrierCompartment(s, i.containerId) && !containerAccepts(s, i.containerId, i.kind))) return false;
  const fit = {
    tools: "essential_tools",
    suit: "suit_150",
    recovery: "bobbin_kit",
    buoy: "salvage_buoy",
  };
  const mountHolds = new Map(f.vehicles.map((v) => [v.cargoId, v]));
  for (const i of items) {
    if (i.fitted === "mount") {
      // A fitted non-socket module is in its own hull's hold and referenced by that hull only.
      const v = mountHolds.get(i.containerId);
      const slot = v && upgradeId(i.kind) ? slotOf(v.hull, i.kind) : null;
      if (!v || !slot || slot === "socket" || slot === "refit" || !v.modules.includes(i.id) ||
          i.quantity !== 1 || i.charge !== null || i.provenance !== "public") return false;
      continue;
    }
    if (
      !containers.some((c) => c.id === i.containerId) ||
      (i.containerId === "equipment") !== !!i.fitted ||
      (i.fitted && (i.fitted === "suit" ? !isSuit(i.kind) : i.fitted === "protection" ? !isSuitProtection(i.kind)
        : fit[i.fitted] !== i.kind)) ||
      (i.fitted && i.quantity !== 1) ||
      (i.kind === "reserve_cell" || i.kind === "bio_cell") !== (i.charge !== null) ||
      (i.charge !== null && i.quantity !== 1) ||
      (i.provenance === "maintenance" && i.kind !== "bobbin_kit")
    )
      return false;
    if ((upgradeId(i.kind) || isMountKind(i.kind)) && !moduleItem(i)) return false;
    // An upgrade module exists only once its recipe was paid.
    if (upgradeId(i.kind) && Object.hasOwn(RECIPES, i.kind) && !k.crafted.includes(i.kind as RecipeId)) return false;
    if (upgradeId(i.kind) && !Object.hasOwn(RECIPES, i.kind)) return false;
    if (i.kind === "tagged_frame" && i.provenance !== "public") return false;
  }
  // A cabin locker is open only while its cabin is fitted; a stowed cabin's is empty.
  for (const cabin of items.filter((i) => i.kind === "creel_cabin"))
    if (cabin.fitted !== "mount" && items.some((i) => i.containerId === `${cabin.id}_locker`)) return false;
  for (const v of f.vehicles) {
    const mounts = v.modules.filter((m) => isMountKind(items.find((i) => i.id === m)?.kind));
    if (mounts.length > 1 || (mounts.length && v.hull !== "creel")) return false;
    // SYS-1 slot limits: each slot holds at most its capacity; one tier per line.
    const kinds = v.modules.flatMap((m): UpgradeId[] => { const k: string | undefined = items.find((i) => i.id === m)?.kind; return k && upgradeId(k) ? [k] : []; });
    if (kinds.length !== v.modules.length) return false;
    const profile = craftProfile(v.hull, v.rating, kinds);
    for (const slot of ["socket", "hull", "major", "tool", "structure", "system"] as const)
      if (kinds.filter((k) => slotOf(v.hull, k) === slot).length > slotCapacity(v.hull, slot, profile)) return false;
    if (!unique(kinds.map((k) => UPGRADES[k].line))) return false;
    if (v.upgrades.anchored && v.hull !== "hearthline") return false;
  }
  const moduleReferences = new Set<string>();
  for (const v of f.vehicles) {
    const kinds = new Set<string>();
    for (const itemId of v.modules) {
      if (moduleReferences.has(itemId) || !installedModuleValid(s, v, itemId)) return false;
      const kind = items.find((i) => i.id === itemId)!.kind;
      if (kinds.has(kind)) return false;
      kinds.add(kind);
      moduleReferences.add(itemId);
    }
  }
  for (const kind of [
    "essential_tools",
    "salvage_buoy",
    "bobbin_kit",
    "reserve_cell",
    "dart_acoustic_trim",
    "creel_cargo_rack",
    "creel_cabin",
  ] as const) {
    const n = items
      .filter((i) => i.kind === kind)
      .reduce((n, i) => n + i.quantity, 0);
    if (n > (kind === "reserve_cell" ? 2 : 1)) return false;
    if (
      n > 0 &&
      !k.crafted.includes(kind === "reserve_cell" ? "reserve_cells" : kind)
    )
      return false;
    if (k.crafted.includes(kind === "reserve_cell" ? "reserve_cells" : kind) && n !== (kind === "reserve_cell" ? 2 : 1))
      return false;
  }
  // S4 protections: suit fittings one of each; hull protections one per fitted hull
  // (C4), each only once its plans are paid. Suit fittings are always worn.
  for (const kind of ["heat_shroud", "brine_seals", "hull_heat_lining", "hull_brine_seals", "trim_vanes"] as const) {
    const n = items.filter((i) => i.kind === kind).reduce((a, i) => a + i.quantity, 0);
    if ((isSuitProtection(kind) && n > 1) || (n > 0 && !k.crafted.includes(kind))) return false;
  }
  if (items.some((i) => isSuitProtection(i.kind) !== (i.fitted === "protection"))) return false;
  const suits = items.filter(i => isSuit(i.kind));
  if (suits.length !== (k.crafted.includes("suit_150") ? 1 : 0) ||
      suits.some(i => i.quantity !== 1 || i.fitted !== "suit" || i.kind !== expectedSuit(k.crafted))) return false;
  if (items.some((i) => (i.kind === "essential_tools" && i.fitted !== "tools") ||
    (isSuit(i.kind) && i.fitted !== "suit") ||
    (i.kind === "bobbin_kit" && (i.fitted !== "recovery" || i.provenance !== "maintenance")))) return false;
  if (k.crafted.some((r) => !k.blueprints.includes(RECIPES[r].bp) || RECIPES[r].needs.some((id) => !k.crafted.includes(id as keyof typeof RECIPES)))) return false;
  for (const node of s.world.resources) {
    const def = SOURCES[node.id];
    if (node.stock + node.reserve > def.stock + def.reserve) return false;
  }
  // Progress exists only below the cap, and only after active post-opening expedition steps.
  for (const r of s.world.renewal)
    if (r.progress !== 0 && (s.scenario !== "expedition" || s.opening.phase < 4 ||
        s.world.resources.find((n) => n.id === r.id)!.stock >= renewalCap(r.id)))
      return false;
  // Plans follow from every story discovery (C01–C06, records, journals) plus technical records.
  const expectedBlueprints = new Set<string>(blueprints(storyView(s).discoveries));
  for (const scan of k.scans) if (techRecord(scan)) for (const bp of TECH_RECORDS[scan].blueprints) expectedBlueprints.add(bp);
  // C4: decoded lost-site data grants its plans.
  for (const d of s.systems.decoded) for (const bp of DECODABLES[d].blueprints) expectedBlueprints.add(bp);
  if (k.blueprints.length !== expectedBlueprints.size || k.blueprints.some((bp) => !expectedBlueprints.has(bp))) return false;
  const bi = items.find((i) => i.id === buoy.itemId);
  if (
    (buoy.itemId !== null && (!bi || bi.kind !== "salvage_buoy")) ||
    (buoy.itemId === null && items.some((i) => i.kind === "salvage_buoy")) ||
    (buoy.deployed && (!bi || bi.fitted !== "buoy")) ||
    (!buoy.deployed &&
      (items.some((i) => i.containerId === "buoy_hold") ||
        bi?.fitted === "buoy"))
  )
    return false;
  if (!s.world.facilities.find((f) => f.id === "home_pod")!.repaired)
    return false;
  if (
    s.world.facilities.find((f) => f.id === "pod_fabricator")!.repaired !==
      k.crafted.includes("pod_repair") ||
    s.world.facilities.find((f) => f.id === "island_workshop")!.repaired !==
      k.crafted.includes("restore_workshop") ||
    s.world.facilities.find((f) => f.id === "canopy_stop")!.repaired !==
      k.crafted.includes("restore_canopy_stop") ||
    s.world.facilities.find((f) => f.id === "rift_station")!.repaired !==
      k.crafted.includes("restore_rift_station") ||
    s.world.facilities.find((f) => f.id === "divide_dock")!.repaired !==
      k.crafted.includes("restore_divide_stop")
  )
    return false;
  // Frame hosts have no reserve; timed lifts/arms work only their own host kinds.
  const a = s.world.action;
  if (a) {
    const def = SOURCES[a.sourceId], frame = def.item === "tagged_frame";
    if (a.kind === "lift" ? !frame || a.seconds > 10 : a.kind === "arm"
      ? !(def.region === "silt_basin" && (frame || def.item === "structural_alloy")) || a.seconds > 6 ||
        f.vehicles.find((v) => v.id === s.player.controlledVehicleId)?.hull !== "creel"
      : frame) return false;
  }
  if (
    s.opening.phase < 4 &&
    (k.evidence.length || k.crafted.length || items.length || f.vehicles.length)
  )
    return false;
  // Campaign fleets: at most one earned hull of each kind; a docking interface
  // exactly when the earned carrier exists.
  if (
    s.scenario === "expedition" &&
    (!unique(f.vehicles.map((v) => v.hull)) ||
      !!f.docking !== f.vehicles.some((v) => v.hull === "hearthline"))
  )
    return false;
  for (const v of f.vehicles) {
    if (
      v.disabled !== (v.health === 0) ||
      (v.disabled !== s.recovery.losses.some((l) => l.vehicleId === v.id))
    )
      return false;
    if (s.scenario !== "expedition") {
      if (v.rating !== HULLS[v.hull].initialDepth) return false;
      continue;
    }
    // Investment is exactly the paid build, plus every paid refit tier up to its rating.
    const hull = v.hull, builds = HULL_BUILD_RECIPES[hull];
    const tiers: (keyof typeof REFIT_TIERS)[] = [];
    for (let rating: number = HULLS[hull].initialDepth; rating !== v.rating;) {
      const next = (Object.keys(REFIT_TIERS) as (keyof typeof REFIT_TIERS)[])
        .find((id) => REFIT_TIERS[id].hull === hull && REFIT_TIERS[id].from === rating);
      if (!next || REFIT_TIERS[next].rating > v.rating) return false;
      tiers.push(next);
      rating = REFIT_TIERS[next].rating;
    }
    if (tiers.some((id) => !k.crafted.includes(id))) return false;
    const expectedInvestment: Record<string, number> = {};
    for (const id of builds) for (const [m, q] of Object.entries(RECIPES[id].cost)) expectedInvestment[m] = (expectedInvestment[m] ?? 0) + q;
    for (const id of tiers) for (const [m, q] of Object.entries(RECIPES[id].cost)) expectedInvestment[m] = (expectedInvestment[m] ?? 0) + q;
    const actual = v.investment as Record<string, number>;
    if (Object.keys(actual).length !== Object.keys(expectedInvestment).length ||
        Object.entries(expectedInvestment).some(([m, q]) => actual[m] !== q)) return false;
  }
  // The registered refuge names a Creel and its fitted cabin, in a campaign.
  const r = s.player.mobileRefuge;
  if (r) {
    const host = f.vehicles.find((v) => v.id === r.vehicleId);
    if (s.scenario !== "expedition" || !host || host.hull !== "creel" || fittedMount(s, host)?.id !== r.moduleId ||
        items.find((i) => i.id === r.moduleId)?.kind !== "creel_cabin") return false;
  }
  const p = s.player,
    v = f.vehicles.find((v) => v.id === p.controlledVehicleId);
  if (
    (p.mode === "piloting") !== !!p.controlledVehicleId ||
    (p.controlledVehicleId && !v) ||
    v?.berth ||
    (v &&
      Math.hypot(
        v.pose.position.x - p.pose.position.x,
        v.pose.position.y - p.pose.position.y,
        v.pose.position.z - p.pose.position.z,
      ) > 0.01)
  )
    return false;
  if (
    (p.mode === "interior") !== !!p.interiorId ||
    !!p.interiorId !== !!p.interiorPose ||
    (p.interiorId && p.controlledVehicleId)
  )
    return false;
  // A Creel cabin occupant stands in the fitted cabin of an unberthed Creel.
  if (p.interiorPose?.frame === "hull-local") {
    const h = f.vehicles.find((v) => v.id === p.interiorId), w = CREEL_CABIN.walk, local = p.interiorPose.position;
    if (!h || h.hull !== "creel" || h.berth || fittedMount(s, h)?.kind !== "creel_cabin" ||
        local.x < w.minX || local.x > w.maxX || local.z < w.minZ || local.z > w.maxZ || local.y !== CREEL_CABIN.floorY ||
        Math.hypot(h.velocity.x, h.velocity.y, h.velocity.z) > 0.6) return false;
    const pos = hullToWorld(local, h);
    if (Math.hypot(p.pose.position.x - pos.x, p.pose.position.y - pos.y, p.pose.position.z - pos.z) > 0.01) return false;
  }
  const d = f.docking,
    h = f.vehicles.find((v) => v.id === d?.vehicleId);
  if (d) {
    if (
      !h ||
      h.hull !== "hearthline" ||
      !unique(f.vehicles.filter((v) => v.berth).map((v) => v.berth!.slot))
    )
      return false;
    if (d.supportedDock !== atCarrierSupport(h)) return false;
    if (p.interiorPose) {
      const pos = localToWorld(p.interiorPose.position, h);
      if (Math.hypot(p.pose.position.x - pos.x, p.pose.position.y - pos.y, p.pose.position.z - pos.z) > 0.01) return false;
    }
    for (const a of f.vehicles)
      if (a.berth) {
        if (
          a.berth.carrierId !== h.id ||
          HULLS[a.hull].berth !== d.configuration ||
          (d.configuration === "medium" && a.berth.slot !== 0) ||
          a.berth.pose.yaw !== 0 ||
          Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > 0.001 ||
          Math.hypot(a.berth.pose.position.x - BERTH_LOCAL[a.berth.slot]!.x, a.berth.pose.position.y - BERTH_LOCAL[a.berth.slot]!.y, a.berth.pose.position.z - BERTH_LOCAL[a.berth.slot]!.z) > 0.001
        )
          return false;
        const pos = localToWorld(a.berth.pose.position, h);
        if (
          Math.hypot(
            a.pose.position.x - pos.x,
            a.pose.position.y - pos.y,
            a.pose.position.z - pos.z,
          ) > 0.01
        )
          return false;
      }
    if (
      p.interiorId &&
      (!d.stationKeeping ||
        p.interiorId !== h.id ||
        !p.interiorPose ||
        p.interiorPose.position.x < CARRIER_LAYOUT.interior.minX ||
        p.interiorPose.position.x > CARRIER_LAYOUT.interior.maxX ||
        p.interiorPose.position.y !== CARRIER_LAYOUT.interior.y ||
        p.interiorPose.position.z < CARRIER_LAYOUT.interior.minZ ||
        p.interiorPose.position.z > CARRIER_LAYOUT.interior.maxZ ||
        p.interiorPose.frame !== "carrier-local")
    )
      return false;
    const tx = d.transaction;
    if (tx) {
      const a = f.vehicles.find((v) => v.id === tx.vehicleId);
      if (
        !a ||
        !d.stationKeeping ||
        d.completed.includes(tx.id) ||
        tx.slot > (d.configuration === "medium" ? 0 : 1) ||
        HULLS[a.hull].berth !== d.configuration ||
        (tx.type === "launch" && (!a.berth || a.berth.slot !== tx.slot)) ||
        (tx.type === "capture" && (!!a.berth || f.vehicles.some((v) => v.berth?.slot === tx.slot)))
      )
        return false;
    }
  } else if ((p.interiorId && p.interiorPose?.frame !== "hull-local") || f.vehicles.some((v) => v.berth)) return false;
  if (
    s.recovery.losses.some(
      (l) => !f.vehicles.some((v) => v.id === l.vehicleId && v.disabled),
    )
  )
    return false;
  if (
    s.recovery.operation &&
    !f.vehicles.some(
      (v) => v.id === s.recovery.operation?.vehicleId && v.disabled,
    )
  )
    return false;
  // C4: SYS-2 identity (each module, kit and job exactly once, every installed
  // module serviceable where it sits) and SYS-1's powered carrier sockets.
  if (instanceProblems(s, s.systems).length) return false;
  for (const h of f.vehicles.filter((v) => v.hull === "hearthline"))
    if (s.systems.sockets.filter((e) => e.hostId === `carrier:${h.id}`).length > craftProfile(h.hull, h.rating,
      h.modules.map((m) => items.find((i) => i.id === m)!.kind as UpgradeId)).systemSockets) return false;
  const op = s.recovery.operation;
  if (op) {
    const target = f.vehicles.find(v => v.id === op.vehicleId), loss = s.recovery.losses.find(l => l.vehicleId === op.vehicleId);
    if (!target || !recoverableHull(target.hull) || target.berth || !loss) return false;
    // The route is the one chosen from the visited loss, never from the tow position.
    if (op.routeId !== recoveryRouteFor(loss.position)) return false;
  }
  return true;
}
