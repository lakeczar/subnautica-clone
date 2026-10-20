import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { LabelMaterials } from "../src/render/landmarks.js";
import { GeometryCache } from "../src/render/geometryCache.js";
import { fleetHullArt, hearthlineShellArt, setFleetPose, updateFleetHullArt } from "../src/render/fleet/index.js";
import { formatFit, hullFit, interiorFit, type FitReport } from "../src/render/fleet/fit.js";
import { S3_HULLS, SPINDLE, type ContactPart, type S3HullId } from "../src/content/fleet/hulls.js";
import { HEARTHLINE_FIXTURES, HEARTHLINE_SOCKETS, hearthlineInteriorSolids } from "../src/content/fleet/hearthlineInterior.js";
import { carrierRooms, carrierStructure } from "../src/sim/carrier.js";
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
/** The open ramp lies forward over the forefoot; only that part's proxy moves. */
const RAMP_OPEN: ContactPart = { id: "spindle.ramp.open", min: [-.67, .2, -3.96], max: [.67, .55, -3.08] };

test("visible geometry matches the piloting proxy, berth envelope and contact parts for every hull state", () => {
  withScene((scene, cel, glass, labels) => {
    const build = (hull: S3HullId): Mesh => fleetHullArt(scene, cel, glass, `t.${hull}`, hull, labels);
    for (const hull of ["hush", "mantle"] as const) {
      const m = build(hull);
      // Largest state: pilot fittings shown.
      setFleetPose(m, hull, `t.${hull}`, { cockpit: true });
      clean(hullFit([m], S3_HULLS[hull], "cockpit shown, berth aligned", { berth: true }));
      m.dispose(false, false);
    }
    const s = build("spindle");
    setFleetPose(s, "spindle", "t.spindle", { cockpit: true, fold: 0, ramp: 0 });
    clean(hullFit([s], SPINDLE, "deployed"));
    setFleetPose(s, "spindle", "t.spindle", { cockpit: true, fold: 1, ramp: 0 });
    clean(hullFit([s], SPINDLE, "folded for a berth", { berth: true, contact: SPINDLE.contactStowed! }));
    setFleetPose(s, "spindle", "t.spindle", { cockpit: true, fold: 0, ramp: 1 });
    clean(hullFit([s], SPINDLE, "ramp lowered at a shore", {
      contact: [...SPINDLE.contact.filter((p) => p.id !== "spindle.ramp"), RAMP_OPEN] }));
    // Half folded: the knee's highest point still clears the proxy top.
    setFleetPose(s, "spindle", "t.spindle", { cockpit: true, fold: .5, ramp: 0 });
    const half = hullFit([s], SPINDLE, "half folded");
    assert.deepEqual(half.issues.filter((i) => i.check.startsWith("piloting")), [], `\n${formatFit(half)}`);
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
    state.player.controlledVehicleId = v.id;
    state.inventory.items.push({ id: "t.item", kind: state.inventory.items[0]?.kind ?? "kelp_fiber" as never, quantity: 2,
      containerId: v.cargoId, fitted: null, charge: null, provenance: "public" });
    updateFleetHullArt(m, state, v);
    assert.equal(cargo.isEnabled(), true);
    assert.equal(cockpit.isEnabled(), true);
    // Name-only identity check: never let assert format a Babylon object.
    assert.ok(cargo.parent === m, `cargo parent is ${cargo.parent?.name ?? "none"}, expected ${m.name}`);
    m.dispose(false, false);
  });
});
