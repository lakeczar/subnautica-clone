import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { LabelMaterials } from "../src/render/landmarks.js";
import { GeometryCache } from "../src/render/geometryCache.js";
import { fleetContactPose, fleetHullArt, hearthlineShellArt, setFleetPose, updateFleetHullArt } from "../src/render/fleet/index.js";
import { formatFit, hullFit, interiorFit, localVertices, type FitReport } from "../src/render/fleet/fit.js";
import { createExpeditionActors } from "../src/render/expedition.js";
import { DART_BERTH } from "../src/content/fleet/dart.js";
import { S3_HULLS, SPINDLE, contactParts, type S3HullId } from "../src/content/fleet/hulls.js";
import { HEARTHLINE_FIXTURES, HEARTHLINE_SOCKETS, hearthlineInteriorSolids } from "../src/content/fleet/hearthlineInterior.js";
import { carrierRooms, carrierStructure, fixtureGame } from "../src/sim/carrier.js";
import { makeVehicle, createGame } from "../src/sim/state.js";

/** Only the label canvas is stubbed; meshes and materials run on NullEngine. */
function withScene(run: (scene: Scene, cel: ReturnType<typeof createCelMaterial>, glass: ReturnType<typeof createGlassMaterial>, labels: LabelMaterials) => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  class TextCanvas {
    width = 512; height = 128;
    getContext() {
      return { fillStyle: "", font: "", textAlign: "", textBaseline: "", clearRect() {}, fillRect() {}, fillText() {},
        measureText(text: string) { return { width: text.length * 24 }; } };
    }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: TextCanvas });
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    try { run(scene, createCelMaterial(scene), createGlassMaterial(scene), new LabelMaterials(scene)); }
    finally { scene.dispose(); }
  } finally {
    engine.dispose();
    if (previous) Object.defineProperty(globalThis, "OffscreenCanvas", previous);
    else delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  }
}

const clean = (r: FitReport): void => assert.equal(r.issues.length, 0, `\n${formatFit(r)}`);
const allSockets = HEARTHLINE_SOCKETS.map((s) => s.id);

test("visible geometry matches the piloting proxy, berth envelope and contact parts for every hull state", () => {
  withScene((scene, cel, glass, labels) => {
    const build = (hull: S3HullId): Mesh => fleetHullArt(scene, cel, glass, `t.${hull}`, hull, labels);
    for (const hull of ["hush", "mantle"] as const) {
      const m = build(hull);
      for (const cockpit of [false, true]) {
        setFleetPose(m, hull, `t.${hull}`, { cockpit });
        clean(hullFit([m], S3_HULLS[hull], `cockpit ${cockpit ? "shown" : "hidden"}, berth aligned`, { berth: true }));
      }
      m.dispose(false, false);
    }
    // Spindle: the complete report in every supported pose, each checked
    // against contactParts for that exact pose. The berth envelope applies
    // only when fully folded with the ramp closed.
    const s = build("spindle");
    for (const fold of [0, .25, .5, .75, 1]) for (const ramp of [0, .5, 1]) for (const cargo of [false, true]) for (const cockpit of [false, true]) {
      setFleetPose(s, "spindle", "t.spindle", { fold, ramp, cargo, cockpit });
      const pose = fleetContactPose(s);
      assert.deepEqual(pose, { fold, ramp, cargoLoaded: cargo }, "the art reports the pose it shows");
      clean(hullFit([s], SPINDLE, `fold ${fold}, ramp ${ramp}, cargo ${cargo ? "loaded" : "empty"}, cockpit ${cockpit}`,
        { berth: fold === 1 && ramp === 0, pose }));
    }
    s.dispose(false, false);

    const h = build("hearthline");
    setFleetPose(h, "hearthline", "t.hearthline", { occupied: allSockets });
    for (const [configuration, slot] of [["compact", undefined], ["compact", 0], ["compact", 1], ["medium", undefined], ["medium", 0]] as const) {
      const shell = hearthlineShellArt(scene, cel, glass, "t.hearthline", configuration, slot, labels);
      clean(hullFit([h, shell], S3_HULLS.hearthline, `${configuration}${slot === undefined ? "" : ` slot ${slot} open`}, sockets full`));
      shell.dispose(false, false);
    }
    h.dispose(false, false);
  });
});

test("Hearthline interior: nothing visible stands in walking space without a solid, and every fixture is drawn", () => {
  withScene((scene, cel, glass, labels) => {
    const h = fleetHullArt(scene, cel, glass, "t.hl", "hearthline", labels);
    for (const occupied of [[], allSockets]) {
      setFleetPose(h, "hearthline", "t.hl", { occupied });
      for (const configuration of ["compact", "medium"] as const) {
        const shell = hearthlineShellArt(scene, cel, glass, "t.hl", configuration, undefined, labels);
        const solids = [...carrierStructure(configuration), ...carrierRooms(configuration), ...hearthlineInteriorSolids(occupied)];
        const issues = interiorFit([h, shell], solids, HEARTHLINE_FIXTURES);
        assert.deepEqual(issues, [], `${configuration}, ${occupied.length} sockets occupied`);
        shell.dispose(false, false);
      }
    }
    h.dispose(false, false);
  });
});

test("Adverse: a protruding part and a mis-staged hull are reported by mesh name", () => {
  withScene((scene, cel, glass, labels) => {
    const m = fleetHullArt(scene, cel, glass, "t.hush", "hush", labels);
    const cockpit = m.getChildMeshes(true).find((c) => c.name === "t.hush.cockpit")! as Mesh;
    cockpit.setEnabled(true);
    cockpit.position.x = 3;
    const report = hullFit([m], S3_HULLS.hush, "cockpit pushed out");
    for (const check of ["piloting radius", "outside contact parts"])
      assert.ok(report.issues.some((i) => i.mesh === "t.hush.cockpit" && i.check === check), `${check} names the mesh\n${formatFit(report)}`);
    m.dispose(false, false);

    // Contact chosen for the wrong pose is caught: half-folded struts against
    // the deployed set, a lowered ramp against the closed set, and a cargo
    // stack against an empty-hold set (R1's three reproductions).
    const p = fleetHullArt(scene, cel, glass, "t.pose", "spindle", labels);
    for (const [art, assumed, mesh] of [
      [{ fold: .5 }, { fold: 0 }, "t.pose.strut.port.0.lower"],
      [{ ramp: 1 }, { ramp: 0 }, "t.pose.ramp"],
      [{ cargo: true }, { cargoLoaded: false }, "t.pose.cargo"],
    ] as const) {
      setFleetPose(p, "spindle", "t.pose", { ...{ fold: 0, ramp: 0, cargo: false }, ...art });
      const r = hullFit([p], SPINDLE, "mismatched pose", { pose: assumed });
      assert.ok(r.issues.some((i) => i.mesh === mesh && i.check === "outside contact parts"), `${mesh}\n${formatFit(r)}`);
    }
    // And the converse: a cargo part assumed while the stack is hidden is unfilled.
    setFleetPose(p, "spindle", "t.pose", { fold: 0, ramp: 0, cargo: false });
    const phantom = hullFit([p], SPINDLE, "phantom cargo", { pose: { cargoLoaded: true } });
    assert.ok(phantom.issues.some((i) => i.mesh === "spindle.cargo" && i.check === "unfilled contact part"), formatFit(phantom));
    p.dispose(false, false);

    // Berthing a Spindle with its outriggers out is caught on the floats.
    const s = fleetHullArt(scene, cel, glass, "t.sp", "spindle", labels);
    setFleetPose(s, "spindle", "t.sp", { fold: 0 });
    const wide = hullFit([s], SPINDLE, "deployed against the berth", { berth: true });
    assert.ok(wide.issues.some((i) => i.mesh === "t.sp.outrigger.port" && i.check === "berth envelope"), formatFit(wide));
    s.dispose(false, false);

    // An unregistered prop in the galley is a ghost obstacle.
    const h = fleetHullArt(scene, cel, glass, "t.hl", "hearthline", labels);
    const prop = CreateBox("t.prop", { size: .5 }, scene);
    prop.parent = h; prop.position.set(-3, 4.5, 6.6);
    const ghost = interiorFit([h], [...carrierStructure("compact"), ...carrierRooms("compact"), ...hearthlineInteriorSolids()], []);
    assert.ok(ghost.some((i) => i.mesh === "t.prop" && i.check === "visible in walking space without a solid"));
    // A solid with no art is an invisible wall.
    const invisible = interiorFit([h], [], [{ id: "t.invisible", min: { x: 0, y: 4, z: 0 }, max: { x: 1, y: 5, z: 1 } }]);
    assert.ok(invisible.some((i) => i.mesh === "t.invisible" && i.check === "solid without matching art"));
    h.dispose(false, false);
  });
});

test("fleet art rebuilds without leaking, replays from the geometry cache and never mutates state", () => {
  withScene((scene, cel, glass, labels) => {
    const cache = new GeometryCache();
    const counts = (): number[] => [scene.meshes.length, scene.materials.length, scene.geometries.length, scene.textures.length];
    const before = counts();
    let first: number[] | undefined;
    for (let round = 0; round < 3; round++) {
      const roots = (["hush", "spindle", "mantle", "hearthline"] as const).map((h) => fleetHullArt(scene, cel, glass, `r.${h}`, h, labels, cache));
      roots.push(hearthlineShellArt(scene, cel, glass, "r.hearthline", "compact", undefined, labels));
      const vertices = roots.map((r) => r.getTotalVertices() + r.getChildMeshes(false).reduce((n, c) => n + c.getTotalVertices(), 0));
      first ??= vertices;
      assert.deepEqual(vertices, first, "cached replay builds identical geometry");
      for (const r of roots) r.dispose(false, false);
      assert.deepEqual(counts(), before, `round ${round} releases every mesh, material, geometry and texture`);
    }
    assert.ok(cache.stats.hits > 0, "deterministic batches replay from the cache");

    const state = createGame(), v = makeVehicle("t_spindle", "spindle", { x: 0, y: -.4, z: 0 }, "t_spindle_hold");
    state.fleet.vehicles.push(v);
    const m = fleetHullArt(scene, cel, glass, v.id, "spindle", labels);
    const input = structuredClone(state);
    updateFleetHullArt(m, state, v);
    assert.deepEqual(state, input, "presentation never changes simulation state");
    const cargo = m.getChildMeshes(true).find((c) => c.name === `${v.id}.cargo`)!;
    const cockpit = m.getChildMeshes(true).find((c) => c.name === `${v.id}.cockpit`)!;
    assert.equal(cargo.isEnabled(), false, "empty hold hides the cargo stack");
    assert.equal(cockpit.isEnabled(), false, "fittings hidden unless piloted");
    // The state-driven pose selects matching contact: no cargo part when empty.
    assert.ok(!contactParts("spindle", fleetContactPose(m)).some((p) => p.id === "spindle.cargo"));
    clean(hullFit([m], SPINDLE, "frame update, empty hold", { pose: fleetContactPose(m) }));
    // A ramp lowered by another owner survives ordinary frame updates.
    setFleetPose(m, "spindle", v.id, { ramp: 1 });
    for (let frame = 0; frame < 3; frame++) updateFleetHullArt(m, state, v);
    assert.equal(fleetContactPose(m).ramp, 1, "update leaves the ramp as set");
    clean(hullFit([m], SPINDLE, "frame update, ramp lowered", { pose: fleetContactPose(m) }));
    setFleetPose(m, "spindle", v.id, { ramp: 0 });
    state.player.controlledVehicleId = v.id;
    state.inventory.items.push({ id: "t.item", kind: state.inventory.items[0]?.kind ?? "kelp_fiber" as never, quantity: 2,
      containerId: v.cargoId, fitted: null, charge: null, provenance: "public" });
    updateFleetHullArt(m, state, v);
    assert.equal(cargo.isEnabled(), true);
    assert.equal(cockpit.isEnabled(), true);
    clean(hullFit([m], SPINDLE, "frame update, loaded hold, piloted", { pose: fleetContactPose(m) }));
    v.berth = { carrierId: "t_carrier", slot: 1, pose: { frame: "carrier-local", position: { x: 3, y: 4, z: 1 }, yaw: 0 } };
    updateFleetHullArt(m, state, v);
    assert.equal(fleetContactPose(m).fold, 1, "berthed Spindle folds");
    clean(hullFit([m], SPINDLE, "frame update, berthed and loaded", { berth: true, pose: fleetContactPose(m) }));
    // Name-only identity check: never let assert format a Babylon object.
    assert.ok(cargo.parent === m, `cargo parent is ${cargo.parent?.name ?? "none"}, expected ${m.name}`);
    m.dispose(false, false);
  });
});

test("Hearthline socket occupants survive ordinary frame updates unless occupancy is passed explicitly", () => {
  withScene((scene, cel, glass, labels) => {
    const state = createGame(), v = makeVehicle("t_carrier", "hearthline", { x: 65, y: -24, z: 12 }, "t_carrier_hold");
    state.fleet.vehicles.push(v);
    const m = fleetHullArt(scene, cel, glass, v.id, "hearthline", labels);
    const shown = (): number => m.getChildMeshes(true).filter((c) => c.name.startsWith(`${v.id}.socket.`) && c.isEnabled()).length;
    assert.equal(shown(), 0, "a new carrier shows no occupants");
    setFleetPose(m, "hearthline", v.id, { occupied: allSockets });
    for (let frame = 0; frame < 5; frame++) updateFleetHullArt(m, state, v);
    assert.equal(shown(), allSockets.length, "omitted occupancy keeps every occupant across frames");
    const two = allSockets.slice(0, 2);
    updateFleetHullArt(m, state, v, two);
    assert.equal(shown(), 2, "explicit occupancy sets exactly those sockets");
    for (let frame = 0; frame < 5; frame++) updateFleetHullArt(m, state, v);
    assert.equal(shown(), 2, "and is kept afterwards");
    updateFleetHullArt(m, state, v, []);
    assert.equal(shown(), 0, "an explicit empty list clears them");
    m.dispose(false, false);
  });
});

test("S3-02: the Dart's real expedition art reaches its 2.5 m envelope half width", () => {
  withScene((scene, cel, glass, labels) => {
    const art = createExpeditionActors(scene, cel, glass, () => true, labels);
    const state = fixtureGame(), dart = state.fleet.vehicles.find((v) => v.hull === "dart")!;
    art.update(state);
    const mesh = scene.getMeshByName(dart.id) as Mesh;
    assert.ok(mesh, "the Dart actor exists");
    let hw = 0, minZ = Infinity, maxZ = -Infinity, top = 0, bottom = Infinity;
    for (const { points } of localVertices([mesh]))
      for (let i = 0; i < points.length; i += 3) {
        hw = Math.max(hw, Math.abs(points[i]!)); top = Math.max(top, points[i + 1]!); bottom = Math.min(bottom, points[i + 1]!);
        minZ = Math.min(minZ, points[i + 2]!); maxZ = Math.max(maxZ, points[i + 2]!);
      }
    console.log(`dart art: half width ${hw.toFixed(3)}, y ${bottom.toFixed(3)}..${top.toFixed(3)}, z ${minZ.toFixed(3)}..${maxZ.toFixed(3)}`);
    const m = DART_BERTH.measured;
    for (const [name, got, want] of [["half width", hw, m.halfWidth], ["min z", minZ, m.minZ], ["max z", maxZ, m.maxZ], ["height", top, m.height]] as const)
      assert.ok(Math.abs(got - want) < .006, `${name} ${got.toFixed(3)} vs recorded ${want}`);
    assert.ok(bottom > -.006, "nothing hangs below the keel datum");
    art.dispose();
  });
});
