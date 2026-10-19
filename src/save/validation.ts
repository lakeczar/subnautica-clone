import {
  BLUEPRINTS,
  EVIDENCE,
  EVIDENCE_BLUEPRINTS,
  HULLS,
  ITEMS,
  PLACES,
  RECIPES,
  SOURCES,
} from "../content/registry.js";
import { LEGACY_WORLD_BOUNDS, RECOVERY_ROUTES, WORLD_VERTICAL_BOUNDS } from "../content/routes.js";
import type { GameState } from "../sim/types.js";
import { usedCapacity } from "../sim/inventory.js";
import { installedModuleValid, moduleItem, SMALL_CRAFT_SOCKETS } from "../sim/modules.js";
import { WORLD_BOUNDS } from "../sim/world.js";
import { atCarrierSupport, BERTH_LOCAL, CARRIER_LAYOUT, localToWorld } from "../sim/carrier.js";
// Compatibility export for historical callers; decode additionally runs the frozen full validator.
export { validExpedition2Domain } from "./legacy/validation.js";
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
const vec = (v: unknown): boolean =>
  exact(v, ["x", "y", "z"]) &&
  ["x", "y", "z"].every((k) => n(v[k], -1000, 1000));
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
    ]) ||
    !pose(p.pose) ||
    !vec(p.velocity) ||
    !Object.values(p.velocity as Record<string, unknown>).every((v) =>
      n(v, -30, 30),
    ) ||
    !oneOf(p.mode, ["walking", "swimming", "piloting", "interior"]) ||
    !known(PLACES)(p.refugeId) ||
    !(p.controlledVehicleId === null || id(p.controlledVehicleId)) ||
    !(p.interiorId === null || id(p.interiorId)) ||
    !n(p.starvationSeconds, 0, 100000) ||
    !n(p.graceSeconds, 0, 180)
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
        p.interiorPose.frame === "carrier-local" &&
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
        [null, "tools", "suit", "recovery", "buoy"].includes(
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
    ]) ||
    !stringSet(k.blueprints, BLUEPRINTS.length, (v) =>
      BLUEPRINTS.includes(v as (typeof BLUEPRINTS)[number]),
    ) ||
    !stringSet(k.scans, 40, (v) => v === "filter_flow" || known(SOURCES)(v)) ||
    !array(
      k.evidence,
      Object.keys(EVIDENCE).length,
      (v) =>
        exact(v, ["id", "tick", "provenance"]) &&
        known(EVIDENCE)(v.id) &&
        int(v.tick, 0, value.tick as number) &&
        text(v.provenance, 200) &&
        v.provenance === EVIDENCE[v.id as keyof typeof EVIDENCE].provenance,
    ) ||
    !stringSet(k.journals, 1, (v) => v === "mara_reef_note") ||
    !stringSet(k.markers, Object.keys(PLACES).length, known(PLACES)) ||
    !stringSet(k.crafted, Object.keys(RECIPES).length, known(RECIPES)) ||
    !int(k.hintLevel, 0, 3)
  )
    return false;
  const w = value.world;
  if (!exact(w, ["resources", "facilities", "maintenance", "threat", "action"]))
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
      4,
      (v) =>
        exact(v, ["id", "repaired"]) &&
        oneOf(v.id, [
          "home_pod",
          "pod_fabricator",
          "island_workshop",
          "canopy_lab",
        ]) &&
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
        oneOf(w.action.kind, ["sort", "food", "maintenance"]))
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
          "boundRepairs",
          "berth",
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
        !stringSet(v.modules, SMALL_CRAFT_SOCKETS, id) ||
        !record(v.investment) ||
        !Object.entries(v.investment).every(
          ([a, b]) =>
            a in ITEMS &&
            ["structural_alloy", "silica_glass", "flex_membrane"].includes(a) &&
            int(b, 0, 50),
        ) ||
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
      ]) ||
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
        oneOf(r.operation.routeId, ["canopy", "basin"]) &&
        r.operation.method === "tow" &&
        oneOf(r.operation.phase, ["approach", "ready", "tow"]) &&
        worldVec(r.operation.position) &&
        int(r.operation.waypoint, 0, RECOVERY_ROUTES[r.operation.routeId as keyof typeof RECOVERY_ROUTES].attachmentIndex) &&
        (r.operation.routeId === "canopy" || (r.operation.phase === "ready" ? r.operation.waypoint === 5 :
          r.operation.phase === "approach" ? n(r.operation.waypoint, 1, 5) : n(r.operation.waypoint, 0, 4))))
    )
  )
    return false;
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
  return semantic(value as unknown as GameState);
}
function semantic(s: GameState): boolean {
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
    s.world.facilities.length !== 4
  )
    return false;
  for (const r of s.world.resources) {
    const d = SOURCES[r.id];
    if (d.item !== "meal" && r.stock + r.reserve > d.stock + d.reserve)
      return false;
  }
  const expected = [
    ["diver", "diver", 16, "player"],
    ["equipment", "equipment", 0, "player"],
    ["pod_locker", "locker", 160, "home_pod"],
    ["workshop_locker", "locker", 160, "island_workshop"],
    ["buoy_hold", "buoy", 24, "salvage_buoy"],
    ...f.vehicles.map((v) => [
      v.cargoId,
      "vehicle",
      v.hull === "hearthline"
        ? 256
        : v.hull === "spindle"
          ? 96
          : v.hull === "creel"
            ? 64
            : 32,
      v.id,
    ]),
    ...s.recovery.caches.map((c) => [c.containerId, "cache", 8, c.id]),
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
  const fit = {
    tools: "essential_tools",
    suit: "suit_150",
    recovery: "bobbin_kit",
    buoy: "salvage_buoy",
  };
  for (const i of items) {
    if (
      !containers.some((c) => c.id === i.containerId) ||
      (i.containerId === "equipment") !== !!i.fitted ||
      (i.fitted && (i.fitted === "suit" ? i.kind !== "suit_150" && i.kind !== "suit_350" : fit[i.fitted] !== i.kind)) ||
      (i.fitted && i.quantity !== 1) ||
      (i.kind === "reserve_cell") !== (i.charge !== null) ||
      (i.charge !== null && i.quantity !== 1) ||
      (i.provenance === "maintenance" && i.kind !== "bobbin_kit")
    )
      return false;
    if (i.kind === "dart_acoustic_trim" && !moduleItem(i)) return false;
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
  const suits = items.filter(i => i.kind === "suit_150" || i.kind === "suit_350");
  if (suits.length !== (k.crafted.includes("suit_150") ? 1 : 0) ||
      suits.some(i => i.quantity !== 1 || i.fitted !== "suit" ||
        (i.kind === "suit_350") !== k.crafted.includes("suit_350"))) return false;
  if (items.some((i) => (i.kind === "essential_tools" && i.fitted !== "tools") ||
    ((i.kind === "suit_150" || i.kind === "suit_350") && i.fitted !== "suit") ||
    (i.kind === "bobbin_kit" && (i.fitted !== "recovery" || i.provenance !== "maintenance")))) return false;
  if (k.crafted.some((r) => !k.blueprints.includes(RECIPES[r].bp) || RECIPES[r].needs.some((id) => !k.crafted.includes(id as keyof typeof RECIPES)))) return false;
  for (const node of s.world.resources) {
    const def = SOURCES[node.id];
    if (node.stock + node.reserve > def.stock + def.reserve) return false;
  }
  const expectedBlueprints = new Set<string>();
  for (const e of k.evidence) {
    for (const bp of EVIDENCE_BLUEPRINTS[e.id]) expectedBlueprints.add(bp);
  }
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
      k.crafted.includes("restore_workshop")
  )
    return false;
  if (
    s.opening.phase < 4 &&
    (k.evidence.length || k.crafted.length || items.length || f.vehicles.length)
  )
    return false;
  if (
    s.scenario === "expedition" &&
    (f.docking ||
      f.vehicles.some((v) => v.hull !== "dart") ||
      f.vehicles.length > 1)
  )
    return false;
  for (const v of f.vehicles) {
    if (
      v.disabled !== (v.health === 0) ||
      (v.disabled !== s.recovery.losses.some((l) => l.vehicleId === v.id))
    )
      return false;
    if (
      s.scenario === "expedition" &&
      JSON.stringify(v.investment) !== JSON.stringify(RECIPES.dart_base.cost)
    )
      return false;
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
  const d = f.docking,
    h = f.vehicles.find((v) => v.id === d?.vehicleId);
  if (d) {
    if (
      !h ||
      h.hull !== "hearthline" ||
      s.scenario !== "carrier-fixture" ||
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
        p.interiorPose.position.z > CARRIER_LAYOUT.interior.maxZ)
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
  } else if (p.interiorId || f.vehicles.some((v) => v.berth)) return false;
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
  const op = s.recovery.operation;
  if (op) {
    const target = f.vehicles.find(v => v.id === op.vehicleId), loss = s.recovery.losses.find(l => l.vehicleId === op.vehicleId);
    if (!target || target.hull !== "dart" || target.berth || !loss) return false;
    const basin = loss.position.x > LEGACY_WORLD_BOUNDS.maxX || loss.position.z < LEGACY_WORLD_BOUNDS.minZ;
    if ((op.routeId === "basin") !== basin) return false;
  }
  return true;
}
