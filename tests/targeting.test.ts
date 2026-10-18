import test from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE, RECIPES, SOURCES, type ItemKind, type SourceId } from "../src/content/registry.js";
import { aimRay, aimedInteraction, interactionHost } from "../src/sim/targeting.js";
import { interactions, discover, craft } from "../src/sim/progression.js";
import { createWorldQueries, RIB_SEGMENTS, SOLIDS, type Solid } from "../src/sim/world.js";
import { addItem, distance } from "../src/sim/inventory.js";
import { createGame, eyeHeight, makeVehicle } from "../src/sim/state.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { board } from "../src/sim/vehicles.js";
import { RECOVERY_NOTICES } from "../src/sim/recovery.js";
import { createEnvelope, encodeSave, decodeSave } from "../src/save/codec.js";
import type { GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { faceTarget, NORMAL_VIEWS, readyState } from "./targeting-support.js";

const world = createWorldQueries(), empty = createWorldQueries([], () => -200);
const panels = (events: GameEvent[]) => events.filter(e => e.type === "interaction-panel");
function saved(s: GameState): GameState {
  const encoded = encodeSave(createEnvelope(s, { sessionId: "polish-1a", createdAt: "2026-10-18T06:00:00.000Z", savedAt: "2026-10-18T06:00:00.000Z" }));
  assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.error);
  assert.deepEqual(decoded.value.state, s);
  return decoded.value.state;
}
function viewAt(s: GameState, id: string): void {
  const v = NORMAL_VIEWS.find(v => v.id === id)!;
  s.player.pose.position = { ...v.position }; s.player.mode = v.mode; faceTarget(s, id);
}
function cache(s: GameState, id: string, position: Vec3): void {
  const containerId = id + "_hold";
  s.inventory.containers.push({ id: containerId, kind: "cache", ownerId: id, capacity: 64 });
  s.recovery.caches.push({ id, position, containerId }); addItem(s, "structural_alloy", 1, containerId);
}

test("ray matches semantic look and instantaneous eye height; opening/pilot/interior and invalid views have none", () => {
  const s = readyState(); s.player.pose.yaw = Math.PI / 2; s.player.pose.pitch = 0.3;
  const r = aimRay(s)!;
  assert.deepEqual(r.origin, { ...s.player.pose.position, y: s.player.pose.position.y + eyeHeight(s) });
  assert.ok(Math.abs(Math.hypot(r.dir.x, r.dir.y, r.dir.z) - 1) < 1e-12);
  assert.ok(r.dir.x > 0.95 && r.dir.y > 0 && Math.abs(r.dir.z) < 1e-12);
  s.player.mode = "swimming"; assert.equal(aimRay(s)!.origin.y, s.player.pose.position.y + 0.65);
  for (const mode of ["piloting", "interior"] as const) { s.player.mode = mode; assert.equal(aimRay(s), null); }
  assert.equal(aimRay(createGame()), null);
  s.player.mode = "walking"; s.player.pose.yaw = NaN; assert.equal(aimedInteraction(s, world), null);
  s.player.pose.yaw = 0; s.player.pose.position.x = Infinity; assert.equal(aimRay(s), null);
});

test("ahead/side/behind, inside host and zero-distance never produce a fallback or skip LOS", () => {
  const s = readyState(); s.player.mode = "swimming";
  s.player.pose.position = { x: 60, y: -20.35, z: -30 };
  cache(s, "near", { x: 60, y: -20, z: -30.25 });
  faceTarget(s, "near");
  assert.equal(aimedInteraction(s, empty)?.id, "near", "eye is inside this 0.65 m host");
  s.player.pose.yaw += Math.PI / 3; assert.equal(aimedInteraction(s, empty), null, "positive forward projection alone is not deliberate side aim");
  faceTarget(s, "near");
  s.player.pose.yaw += Math.PI; assert.equal(aimedInteraction(s, empty), null);
  s.player.pose.yaw -= Math.PI / 2; assert.equal(aimedInteraction(s, empty), null, "side host is not an aimed host");
  faceTarget(s, "near");
  const wall = createWorldQueries([{ id: "near furniture", min: { x: 59, y: -21, z: -30.15 }, max: { x: 61, y: -19, z: -30.1 } }], () => -200);
  assert.equal(aimedInteraction(s, wall), null, "inside the sphere still traces the entire line to the host");
  s.recovery.caches[0]!.position.z = -30;
  assert.equal(aimedInteraction(s, empty), null, "coincident eye/center has no forward direction");
});

test("body reach remains exclusive at 4 m; eye/host radii cannot extend it", () => {
  const s = readyState(); s.player.mode = "swimming"; s.player.pose.position = { x: 60, y: -20, z: -30 };
  cache(s, "edge", { x: 60, y: -20, z: -34 }); faceTarget(s, "edge");
  assert.equal(aimedInteraction(s, empty), null);
  s.recovery.caches[0]!.position.z = -33.999; faceTarget(s, "edge");
  assert.equal(aimedInteraction(s, empty)?.id, "edge");
});

test("very narrow adjacent hosts resolve to deliberate center aim, stably across roster ordering", () => {
  const s = readyState(); s.player.mode = "swimming"; s.player.pose.position = { x: 60, y: -20, z: -30 };
  cache(s, "left", { x: 59.85, y: -20, z: -32 }); cache(s, "right", { x: 60.15, y: -20, z: -32 });
  for (const id of ["left", "right", "left"]) {
    faceTarget(s, id); assert.equal(aimedInteraction(s, empty)?.id, id);
    s.recovery.caches.reverse(); assert.equal(aimedInteraction(s, empty)?.id, id);
    assert.deepEqual(panels(executeCommand(s, { type: "interact" }, empty).events), [{ type: "interaction-panel", panel: "inventory", targetId: id }]);
  }
});

test("all sources, food, C01–C04, optional note and services retain collision-valid normal views and matching actions", () => {
  assert.equal(NORMAL_VIEWS.length, interactions(readyState()).length);
  for (const v of NORMAL_VIEWS) {
    const s = readyState(); viewAt(s, v.id);
    assert.ok(world.clearance(s.player.pose.position, { radius: 0.34, height: v.mode === "walking" ? 1.75 : 0.95 }), v.id + " body clearance");
    const target = aimedInteraction(s, world); assert.equal(target?.id, v.id, v.id);
    const result = executeCommand(s, { type: "interact" }, world);
    assert.ok(!result.events.some(e => e.type === "notice" && e.error), v.id);
    if (v.id in SOURCES) {
      assert.equal(result.state.metrics.collections, 1, v.id);
      const id = v.id as SourceId;
      assert.equal(result.state.world.resources.find(n => n.id === id)!.stock, SOURCES[id].stock - SOURCES[id].bundle);
    } else if (v.id in EVIDENCE) assert.ok(result.state.knowledge.evidence.some(e => e.id === v.id));
    else if (v.id === "mara_reef_note") assert.ok(result.state.knowledge.journals.includes(v.id));
    else assert.deepEqual(panels(result.events), [{ type: "interaction-panel", panel: v.id === "rescue_staging" ? "inventory" : "craft", targetId: v.id }]);
    saved(result.state);
  }
});

test("intake scrap and filter-box aims stay distinct; known ledger wins deliberate aim beside reachable new stock", () => {
  const s = readyState();
  for (const id of ["reef_service_scraps_east", "C02"]) {
    viewAt(s, id); assert.equal(aimedInteraction(s, world)?.id, id);
    assert.ok(!executeCommand(s, { type: "interact", target: id }, world).events.some(e => e.type === "notice" && e.error));
  }
  discover(s, "C03"); viewAt(s, "C03");
  assert.ok(distance(s.player.pose.position, SOURCES.island_workshop_scraps.position) < 4);
  assert.equal(aimedInteraction(s, world)?.verb, "review");
  assert.deepEqual(panels(executeCommand(s, { type: "interact" }, world).events), [{ type: "interaction-panel", panel: "notebook", targetId: "C03" }]);
  faceTarget(s, "island_workshop_scraps"); assert.equal(aimedInteraction(s, world)?.id, "island_workshop_scraps");
});

test("LOS checks walls, origin containment and exact own-host ignores; water and empty/local worlds stay transparent", () => {
  const furniture: Solid = { id: "pod.bench", min: { x: 0, y: -1, z: -2 }, max: { x: 1, y: 1, z: -1 } };
  const other: Solid = { id: "pod.locker", min: { x: 0, y: -1, z: -4 }, max: { x: 1, y: 1, z: -3 } };
  const local = createWorldQueries([furniture, other], () => -200);
  const a = { x: 0.5, y: 0, z: 0 }, b = { x: 0.5, y: 0, z: -2 };
  assert.equal(local.lineOfSight(a, b), false);
  assert.equal(local.lineOfSight(a, b, ["pod.bench"]), true);
  assert.equal(local.lineOfSight(a, { ...b, z: -5 }, ["pod.bench"]), false);
  assert.equal(local.lineOfSight({ ...a, z: -1.5 }, b), false);
  assert.equal(empty.lineOfSight({ x: 60, y: 1, z: -10 }, { x: 60, y: -1, z: -10 }), true);
  assert.equal(empty.lineOfSight(a, a), true);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(empty.lineOfSight({ ...a, x: invalid }, b), false);
    assert.equal(empty.lineOfSight(a, { ...b, z: invalid }), false);
  }
  assert.equal(createWorldQueries([], () => NaN).lineOfSight(a, b), false);
});

test("actual rib volume blocks but a real gap inside its old movement box transmits; local queries inherit neither ribs nor terrain", () => {
  const r = RIB_SEGMENTS[6]!, c = { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2, z: (r.a.z + r.b.z) / 2 };
  const a = { ...c, z: c.z - 3 }, b = { ...c, z: c.z + 3 };
  assert.equal(world.lineOfSight(a, b), false);
  assert.equal(empty.lineOfSight(a, b), true);
  const gapA = { x: -7.257114716865711, y: -8.99, z: -10.12 }, gapB = { ...gapA, z: -5.688987004566377 };
  const box = SOLIDS.find(s => s.id === "reef.rib.0")!;
  assert.ok(gapA.x > box.min.x && gapA.x < box.max.x && gapA.y > box.min.y && gapA.y < box.max.y);
  assert.equal(createWorldQueries([{ ...box, id: "diagnostic.rib-box" }], () => -200).lineOfSight(gapA, gapB), false, "box-only control");
  assert.equal(createWorldQueries([{ ...box, min: { ...box.min }, max: { ...box.max } }], () => -200).lineOfSight(gapA, gapB), true, "detached registered geometry uses the same optical rib");
  assert.equal(world.lineOfSight(gapA, gapB), true, "actual cylinder gap");
  assert.equal(world.lineOfSight(c, c), false, "point inside the rib");
  const acrossIsland = [{ x: -20, y: 1, z: -60 }, { x: 40, y: 1, z: -60 }] as const;
  assert.equal(world.lineOfSight(...acrossIsland), false);
  assert.equal(world.lineOfSight({ ...acrossIsland[0], y: 50 }, { ...acrossIsland[1], y: 50 }), true);
  assert.equal(empty.lineOfSight(...acrossIsland), true);
  assert.equal(createWorldQueries([], () => 2).lineOfSight({ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }), false);
});

test("service targeting ignores only its own bench, and never a locker or enclosing wall", () => {
  const s = readyState(); viewAt(s, "pod_services");
  const p = aimRay(s)!.origin, h = aimedInteraction(s, world)!.host.center;
  const center = { x: (p.x + h.x) / 2, y: (p.y + h.y) / 2, z: (p.z + h.z) / 2 };
  const furniture: Solid = { id: "pod.bench", min: { x: center.x - 0.1, y: center.y - 0.1, z: center.z - 0.1 }, max: { x: center.x + 0.1, y: center.y + 0.1, z: center.z + 0.1 } };
  assert.equal(aimedInteraction(s, createWorldQueries([furniture], () => -200))?.id, "pod_services");
  for (const id of ["pod.locker", "pod.east", "unrelated chair"]) {
    const blocked = createWorldQueries([{ ...furniture, id }], () => -200);
    assert.equal(aimedInteraction(s, blocked), null, id);
    const out = executeCommand(s, { type: "interact", target: "pod_services" }, blocked);
    assert.equal(out.state, s); assert.equal(panels(out.events).length, 0);
  }
  viewAt(s, "C01"); s.player.pose.position.x = -4; faceTarget(s, "C01");
  assert.equal(aimedInteraction(s, world), null, "the regulator never ignores its pod wall");
});

test("wall/rib-through and explicit target bypasses refuse atomically with no panel intents", () => {
  const s = readyState(); viewAt(s, "C01");
  const snapshot = structuredClone(s);
  for (const command of [{ type: "interact", target: "pod_services" }, { type: "interact", target: "" }] as const) {
    const out = executeCommand(s, command, world); assert.equal(out.state, s); assert.equal(panels(out.events).length, 0);
    assert.ok(out.events.some(e => e.type === "notice" && e.error));
  }
  const h = interactionHost(s, interactions(s).find(t => t.id === "C01")!);
  const midway = (h.center.x + s.player.pose.position.x) / 2;
  const blocked = createWorldQueries([{ id: "unrelated cupboard", min: { x: midway - 0.05, y: 0, z: 19 }, max: { x: midway + 0.05, y: 3, z: 23 } }], () => -200);
  const out = executeCommand(s, { type: "interact", target: "C01" }, blocked);
  assert.equal(out.state, s); assert.equal(panels(out.events).length, 0); assert.deepEqual(s, snapshot);
  const close = readyState(); viewAt(close, "C02");
  // A real rib is placed between the diagnostic cache and its valid view, not
  // ignored by selecting a source whose sphere happens to contain the eye.
  const r = RIB_SEGMENTS[6]!, x = (r.a.x + r.b.x) / 2, y = (r.a.y + r.b.y) / 2, z = (r.a.z + r.b.z) / 2;
  close.player.mode = "swimming"; close.player.pose.position = { x, y: y - 0.65, z: z + 1.5 };
  cache(close, "rib-cache", { x, y: y - 0.3, z: z - 1.5 }); faceTarget(close, "rib-cache");
  assert.equal(aimedInteraction(close, empty)?.id, "rib-cache");
  assert.notEqual(aimedInteraction(close, world)?.id, "rib-cache");
  assert.equal(panels(executeCommand(close, { type: "interact", target: "rib-cache" }, world).events).length, 0);
});

test("known evidence E repeats are informative, saveable and idempotent without replaying protected recovery feedback", () => {
  let s = readyState(); viewAt(s, "C01"); s.feedback = RECOVERY_NOTICES.completed;
  const original = structuredClone(s);
  for (let i = 0; i < 3; i++) {
    const out = executeCommand(s, { type: "interact" }, world);
    assert.deepEqual(out.state, original);
    assert.deepEqual(out.events, [{ type: "interaction-panel", panel: "notebook", targetId: "C01" }, { type: "notice", channel: "action", message: "Scored regulator · in notebook." }]);
    s = saved(out.state);
  }
  const stepped = stepGame(s, [{ type: "interact" }, { type: "interact" }], world);
  assert.equal(panels(stepped.events).length, 2); assert.equal(stepped.state.feedback, RECOVERY_NOTICES.completed);
  assert.ok(!stepped.events.some(e => e.type === "notice" && e.message === RECOVERY_NOTICES.completed));
});

test("Q keeps equipment and acoustic rules on the same target; known scans repeat without a panel or recovery rewrite", () => {
  const s = readyState(); viewAt(s, "C01"); s.feedback = RECOVERY_NOTICES.blocked;
  const no = executeCommand(s, { type: "scan" }, world);
  assert.equal(no.state, s); assert.ok(no.events.some(e => e.type === "notice" && e.error && /scanner/.test(e.message)));
  for (const id of ["pod_repair", "essential_tools"] as const) {
    for (const [kind, n] of Object.entries(RECIPES[id].cost)) addItem(s, kind as ItemKind, n, "pod_locker");
    assert.equal(craft(s, id, world), null);
  }
  s.feedback = RECOVERY_NOTICES.blocked;
  const known = executeCommand(s, { type: "scan" }, world);
  assert.equal(known.state.world.threat.interest, s.world.threat.interest + 2);
  assert.equal(known.state.feedback, s.feedback); assert.deepEqual(known.state.knowledge, s.knowledge);
  assert.equal(panels(known.events).length, 0); assert.ok(known.events.some(e => e.type === "sound" && e.cue === "scan"));
  saved(known.state);
  viewAt(s, "reef_service_scraps_east");
  for (let i = 0; i < 2; i++) {
    const out = executeCommand(s, { type: "scan" }, world); Object.assign(s, out.state);
    assert.equal(s.knowledge.scans.filter(id => id === "reef_service_scraps_east").length, 1);
    assert.equal(s.feedback, RECOVERY_NOTICES.blocked);
    assert.ok(out.events.some(e => e.type === "notice" && /Service tags/.test(e.message)));
    saved(out.state);
  }
  viewAt(s, "C02");
  const discovered = executeCommand(s, { type: "scan" }, world);
  assert.ok(discovered.state.knowledge.evidence.some(e => e.id === "C02"));
  assert.equal(panels(discovered.events).length, 0); saved(discovered.state);
  const wall = createWorldQueries([{ id: "scanner-wall", min: { x: -18, y: -9, z: -6.5 }, max: { x: -16, y: -5, z: -6.4 } }], () => -200);
  const blocked = executeCommand(s, { type: "scan" }, wall);
  assert.deepEqual(blocked.state, s); assert.equal(panels(blocked.events).length, 0);
  assert.deepEqual(blocked.events, [{ type: "notice", channel: "action", message: "Nothing within reach." }]);
  s.player.pose.yaw += Math.PI;
  const away = executeCommand(s, { type: "scan" }, world);
  assert.equal(away.state.world.threat.interest, s.world.threat.interest); assert.equal(panels(away.events).length, 0);
  assert.deepEqual(away.events, [{ type: "notice", channel: "action", message: "Nothing within reach." }]);
});

test("depleted hosts sort finite stock, tend food, retain recovery-only constraints, or say Empty", () => {
  for (const id of ["island_workshop_scraps", "island_headland_scraps", "island_glass_ledge_west", "reef_service_scraps_east"] as const) {
    const s = readyState(); viewAt(s, id); const node = s.world.resources.find(n => n.id === id)!; node.stock = 0;
    assert.equal(aimedInteraction(s, world)?.verb, "sort");
    const out = executeCommand(s, { type: "interact" }, world);
    assert.deepEqual(out.state.world.action, { sourceId: id, seconds: 20, kind: "sort" });
    assert.equal(out.state.metrics.collections, 0); assert.equal(out.state.world.resources.find(n => n.id === id)!.reserve, node.reserve);
    node.reserve = 0; assert.equal(aimedInteraction(s, world)?.verb, "empty");
    assert.deepEqual(executeCommand(s, { type: "interact" }, world).state, s);
  }
  for (const id of ["reef_edible_school_north", "island_shore_crop_east", "island_shore_crop_west"] as const) {
    const s = readyState(); viewAt(s, id); s.world.resources.find(n => n.id === id)!.stock = 0;
    assert.equal(aimedInteraction(s, world)?.verb, "sort");
    assert.deepEqual(executeCommand(s, { type: "interact" }, world).state.world.action, { sourceId: id, seconds: 20, kind: "food" });
  }
  const s = readyState(), id = "reef_service_scraps_east"; viewAt(s, id);
  const node = s.world.resources.find(n => n.id === id)!; node.stock = node.reserve = 0;
  s.world.maintenance.alloy = 0; s.world.maintenance.membrane = 0;
  const out = executeCommand(s, { type: "interact" }, world);
  assert.deepEqual(out.state.world.action, { sourceId: id, seconds: 20, kind: "maintenance" });
  assert.deepEqual(out.state.inventory, s.inventory); assert.deepEqual(out.state.world.maintenance, s.world.maintenance);
  viewAt(s, "island_workshop_scraps");
  const before = structuredClone(s), refused = executeCommand(s, { type: "sort", sourceId: "island_workshop_scraps", maintenance: true }, world);
  assert.equal(refused.state, s); assert.deepEqual(s, before); assert.equal(panels(refused.events).length, 0);
  assert.ok(refused.events.some(e => e.type === "notice" && e.error && /shallow reef/.test(e.message)));
});

test("disabled and unpowered craft use validated inventory intent while explicit boarding still refuses", () => {
  for (const disabled of [true, false]) {
    const s = readyState(); s.player.mode = "swimming"; s.player.pose.position = { x: 60, y: -20, z: -30 };
    const v = makeVehicle("diagnostic-dart", "dart", { x: 60, y: -20, z: -32 }, "dart_hold");
    v.disabled = disabled; v.charge = disabled ? 40 : 0; s.fleet.vehicles.push(v); faceTarget(s, v.id);
    const before = structuredClone(s); assert.match(board(s, v.id)!, /disabled|power/); assert.deepEqual(s, before);
    assert.equal(aimedInteraction(s, empty)?.verb, "recover");
    const out = executeCommand(s, { type: "interact" }, empty);
    assert.deepEqual(out.state, before); assert.deepEqual(panels(out.events), [{ type: "interaction-panel", panel: "inventory", targetId: v.id }]);
    s.player.pose.yaw += Math.PI;
    const refused = executeCommand(s, { type: "interact", target: v.id }, empty);
    assert.equal(refused.state, s); assert.equal(panels(refused.events).length, 0);
  }
});

test("target values are detached and selection recomputes across same-state mutation, replacement and draft commands", () => {
  const s = readyState(); viewAt(s, "reef_service_scraps_east"); const before = structuredClone(s);
  const t = aimedInteraction(s, world)!; t.position.x = 900; t.host.center.y = 900;
  assert.deepEqual(s, before); assert.equal(aimedInteraction(s, world)?.id, "reef_service_scraps_east");
  s.world.resources.find(n => n.id === "reef_service_scraps_east")!.stock = 4;
  assert.equal(aimedInteraction(s, world)?.verb, "collect");
  const out = stepGame(s, [{ type: "interact" }, { type: "interact" }], world);
  assert.equal(out.state.metrics.collections, 1); assert.equal(out.state.world.action?.kind, "sort");
  const replacement = readyState(); viewAt(replacement, "C03"); assert.equal(aimedInteraction(replacement, world)?.id, "C03");
  s.player.mode = "piloting"; assert.equal(aimedInteraction(s, world), null);
});
