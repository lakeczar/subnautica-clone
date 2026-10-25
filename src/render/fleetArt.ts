import type { Mesh, Scene, ShaderMaterial } from "@babylonjs/core";
import { SOURCES, TECH_RECORDS } from "../content/registry.js";
import { usedCapacity } from "../sim/inventory.js";
import { CANOPY_MARGIN_RIBS, CANOPY_STOP, CREEL_SLIP_SOLIDS } from "../content/routes.js";
import { terrainHeight } from "../sim/world.js";
import type { RenderRegion } from "./regions.js";
import type { GameState, VehicleState } from "../sim/types.js";
import { CREEL_CABIN, fittedMount } from "../sim/fleet.js";
import { ArtBatch, type Point } from "./geometry.js";
import type { GeometryCache } from "./geometryCache.js";
import { label, type LabelMaterials } from "./landmarks.js";
import { createObservationPane, wallWithOpening } from "./materials.js";
import { PALETTE as P } from "./palette.js";

/** Hull-local metres, keel reference, -Z bow. Every part stays inside the medium
 * berth envelope (±2.9 × ±3.3 × 3.6 m); the cabin room is CREEL_CABIN.outer itself,
 * so the walking solids, fixtures and the visible room are one authority. */
const BODY = { bow: -2.95, stern: 3.25, half: 1.95, deck: 1.38 } as const;
const COCKPIT = { min: { x: -1.15, y: BODY.deck, z: -2.75 }, max: { x: 1.15, y: 2.78, z: -0.6 } } as const;
/** Rack visual: at most five tagged frames show on the open rack. */
export const RACK_VISIBLE_FRAMES = 5;

function batchFor(scene: Scene, cel: ShaderMaterial, cache: GeometryCache | undefined, name: string, part: string): ArtBatch {
  return new ArtBatch(name, scene, cel, cache ? { owner: cache, key: `fleet:creel:v1:${part}` } : undefined);
}
function child(mesh: Mesh, parent: Mesh): Mesh {
  mesh.unfreezeWorldMatrix(); mesh.parent = parent; mesh.renderingGroupId = 1; return mesh;
}

/** A flat-fronted workboat: low wide hull, raised sealed pilot compartment, two
 * guarded tool arms and one aft major-mount deck. Mount variants are children
 * toggled from state; nothing here is a collider or saved pose. */
export function creelArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, id: string,
  _labels?: LabelMaterials, cache?: GeometryCache): Mesh {
  const b = batchFor(scene, cel, cache, id, "hull");
  b.loft([
    { z: BODY.bow, w: 1.72, low: .32, high: 1.18 },
    { z: BODY.bow + .42, w: BODY.half, low: .06, high: BODY.deck },
    { z: 2.7, w: BODY.half, low: 0, high: BODY.deck },
    { z: BODY.stern, w: 1.55, low: .34, high: 1.28 },
  ], P.metal);
  // Flat working bow: hazard plate and two chevrons, not a scout's needle.
  b.box([0, .76, BODY.bow - .02], [3.1, .78, .05], P.ochre);
  for (const x of [-.8, .8]) b.face([[x - .35, .48, BODY.bow - .05], [x, 1.02, BODY.bow - .05], [x + .35, .48, BODY.bow - .05]], P.ink);
  // Deck plate and rub rails on both sides.
  b.box([0, BODY.deck + .015, .2], [3.7, .03, 6.1], P.porcelain);
  for (const side of [-1, 1]) {
    b.tube([[side * 1.98, .78, BODY.bow + .3], [side * 2.02, .82, 0], [side * 1.9, .8, BODY.stern - .2]], .07, P.ochre, 6);
    b.box([side * 1.96, .42, .2], [.06, .26, 5.6], P.petrol);
  }
  // Raised, pressure-sealed pilot compartment. Thin walls with real openings:
  // the shared cel material is double-sided, so a closed box would blind the pilot.
  const c = COCKPIT, t = .06, cx = 0, cz = (c.min.z + c.max.z) / 2, h = c.max.y - c.min.y, midY = (c.min.y + c.max.y) / 2;
  wallWithOpening(b, [cx, midY, c.min.z], [c.max.x - c.min.x, h, t], { center: [0, 2.08, c.min.z], width: 1.9, height: .74, normal: "z" }, P.porcelain);
  for (const x of [c.min.x, c.max.x])
    wallWithOpening(b, [x, midY, cz], [t, h, c.max.z - c.min.z], { center: [x, 2.12, cz - .25], width: 1.05, height: .48, normal: "x" }, P.porcelain);
  wallWithOpening(b, [cx, midY, c.max.z], [c.max.x - c.min.x, h, t], { center: [0, 2.15, c.max.z], width: .8, height: 1.5, normal: "z" }, P.porcelain);
  b.box([0, c.max.y + .03, cz], [c.max.x - c.min.x + .1, .06, c.max.z - c.min.z + .1], P.shade);
  b.box([0, c.max.y + .07, cz], [1.6, .03, .18], P.ochre);
  b.glow(b.box([0, c.max.y - .04, cz], [1.1, .015, .08], P.warm));
  // Guarded tool arms: shoulders, two-segment arms and open claws ahead of the bow.
  for (const side of [-1, 1]) {
    const x = side * 1.42;
    b.box([x, .95, -2.55], [.42, .38, .5], P.petrol);
    b.tube([[x, .95, -2.6], [x * .95, .82, -2.98], [x * .8, .72, -3.18]], .085, P.ochre, 6);
    for (const finger of [-1, 1])
      b.tube([[x * .8, .72, -3.18], [x * .8 + finger * .14, .62, -3.28], [x * .8 + finger * .06, .52, -3.26]], .035, P.metal, 5);
    b.tube([[side * 1.88, .72, -2.95], [side * 1.88, 1.18, -2.95], [side * 1.6, 1.25, -2.4]], .045, P.steelLight, 5);
    // Stern thrusters and a pale service collar for the Bobbin rescue fitting.
    b.ring([side * 1.05, .66, BODY.stern + .02], [1, 0, 0], [0, 1, 0], .36, .24, P.steelLight, 12);
    b.ellipsoid([side * 1.05, .66, BODY.stern - .05], [.22, .22, .12], P.ink, 8);
  }
  b.ring([0, 1.0, BODY.stern + .03], [1, 0, 0], [0, 1, 0], .2, .12, P.shell, 10);
  // Major-mount sockets on the aft deck.
  for (const x of [-1.5, 1.5]) for (const z of [-.35, 3.0]) b.box([x, BODY.deck + .05, z], [.2, .06, .2], P.ochre);
  const hull = b.finish(.45);
  hull.unfreezeWorldMatrix();
  for (const [name, points] of [
    [`${id}.pane.forward`, [[-.95, 1.71, c.min.z - .035], [.95, 1.71, c.min.z - .035], [.95, 2.45, c.min.z - .035], [-.95, 2.45, c.min.z - .035]]],
    [`${id}.pane.port`, [[c.min.x - .035, 1.88, cz - .775], [c.min.x - .035, 1.88, cz + .275], [c.min.x - .035, 2.36, cz + .275], [c.min.x - .035, 2.36, cz - .775]]],
    [`${id}.pane.starboard`, [[c.max.x + .035, 1.88, cz - .775], [c.max.x + .035, 1.88, cz + .275], [c.max.x + .035, 2.36, cz + .275], [c.max.x + .035, 2.36, cz - .775]]],
  ] as [string, Point[]][]) createObservationPane(scene, glass, name, points, hull);

  // Bare mount: a socket frame and tie-down rails only.
  const bare = batchFor(scene, cel, cache, `${id}.mount.bare`, "mount-bare");
  for (const side of [-1, 1]) bare.box([side * 1.55, BODY.deck + .07, 1.32], [.08, .08, 3.4], P.petrol);
  for (const z of [-.2, 1.3, 2.9]) bare.box([0, BODY.deck + .07, z], [3.1, .05, .06], P.steelLight);
  child(bare.finish(.2), hull);

  // Cargo rack: an open frame lattice with ochre straps. Carried frames appear as
  // separate stacked members so the hold load is visible before the next tier.
  const rack = batchFor(scene, cel, cache, `${id}.mount.rack`, "mount-rack");
  for (const x of [-1.66, 1.66]) for (const z of [-.42, 3.1]) rack.box([x, 2.25, z], [.1, 1.72, .1], P.ochre);
  for (const x of [-1.66, 1.66]) for (const y of [2.1, 3.08]) rack.box([x, y, 1.34], [.07, .07, 3.56], P.petrol);
  for (const z of [-.42, 3.1]) rack.box([0, 3.08, z], [3.4, .07, .07], P.petrol);
  for (const z of [.5, 1.34, 2.2]) rack.tube([[-1.66, 3.08, z], [0, 3.15, z], [1.66, 3.08, z]], .03, P.ochre, 5);
  for (let i = 0; i < 9; i++) rack.box([0, BODY.deck + .06, -.3 + i * .4], [3.2, .03, .05], P.metal);
  child(rack.finish(.3), hull);
  for (let i = 0; i < RACK_VISIBLE_FRAMES; i++) {
    const f = batchFor(scene, cel, cache, `${id}.cargo.frame.${i}`, `cargo-frame-${i}`), y = BODY.deck + .2 + i * .27;
    f.box([0, y, 1.34], [2.7, .2, .42], i % 2 ? P.steelLight : P.metal);
    f.box([-.9, y + .11, 1.34], [.36, .02, .3], P.porcelain);
    for (const x of [-1.1, 1.1]) f.box([x, y, 1.34], [.06, .24, .5], P.ochre);
    child(f.finish(.15), hull);
  }

  // Refuge cabin: the actual walkable room. Walls with windows, a closed aft
  // hatch, bunk, galley, locker and warm ceiling light, all on CREEL_CABIN.
  const o = CREEL_CABIN.outer, cab = batchFor(scene, cel, cache, `${id}.mount.cabin`, "mount-cabin");
  const ocx = (o.min.x + o.max.x) / 2, ocz = (o.min.z + o.max.z) / 2, oh = o.max.y - o.min.y, oy = (o.min.y + o.max.y) / 2;
  wallWithOpening(cab, [o.min.x + t / 2, oy, ocz], [t, oh, o.max.z - o.min.z], { center: [o.min.x, 2.45, 1.4], width: 1.0, height: .5, normal: "x" }, P.porcelain);
  wallWithOpening(cab, [o.max.x - t / 2, oy, ocz], [t, oh, o.max.z - o.min.z], { center: [o.max.x, 2.5, 1.55], width: 1.3, height: .45, normal: "x" }, P.porcelain);
  wallWithOpening(cab, [ocx, oy, o.min.z + t / 2], [o.max.x - o.min.x, oh, t], { center: [0, 2.22, o.min.z], width: .8, height: 1.6, normal: "z" }, P.porcelain);
  wallWithOpening(cab, [ocx, oy, o.max.z - t / 2], [o.max.x - o.min.x, oh, t], { center: [0, 2.22, o.max.z], width: .9, height: 1.6, normal: "z" }, P.porcelain);
  cab.box([0, 2.22, o.max.z - .03], [.86, 1.56, .04], P.petrol);
  cab.ring([0, 2.55, o.max.z - .06], [1, 0, 0], [0, 1, 0], .18, .12, P.steelLight, 12);
  cab.box([.33, 2.15, o.max.z - .07], [.07, .2, .04], P.ochre);
  cab.box([0, o.max.y - .03, ocz], [o.max.x - o.min.x, .06, o.max.z - o.min.z], P.shade);
  cab.box([0, CREEL_CABIN.floorY - .02, ocz], [o.max.x - o.min.x - .1, .04, o.max.z - o.min.z - .1], P.shell);
  for (const z of [.3, 1.3, 2.3]) cab.glow(cab.box([0, o.max.y - .08, z], [1.4, .02, .1], P.warm));
  for (const f of CREEL_CABIN.fittings) {
    cab.bounds(f, f.id === "cabin.bunk" ? P.petrol : f.id === "cabin.galley" ? P.metal : P.shade);
    if (f.id === "cabin.bunk") {
      cab.box([(f.min.x + f.max.x) / 2, f.max.y + .06, (f.min.z + f.max.z) / 2], [f.max.x - f.min.x - .08, .12, f.max.z - f.min.z - .08], P.porcelain);
      cab.box([(f.min.x + f.max.x) / 2, f.max.y + .14, f.max.z - .3], [.6, .1, .38], P.shell);
      cab.box([(f.min.x + f.max.x) / 2, f.max.y + .13, (f.min.z + f.max.z) / 2 - .2], [.74, .05, 1.2], P.coral);
    } else if (f.id === "cabin.galley") {
      cab.box([f.max.x - .01, f.max.y - .05, (f.min.z + f.max.z) / 2], [.03, .06, f.max.z - f.min.z - .1], P.ochre);
      cab.ring([(f.min.x + f.max.x) / 2, f.max.y + .005, .2], [1, 0, 0], [0, 0, 1], .14, .08, P.ink, 10);
      cab.glow(cab.box([(f.min.x + f.max.x) / 2, f.max.y + .004, .2], [.07, .005, .07], P.amber));
    } else {
      for (const z of [2.35, 2.8]) cab.box([f.max.x + .005, 2.25, z], [.01, 1.3, .4], P.steelLight);
      cab.box([f.max.x + .02, 2.25, 2.58], [.03, .18, .05], P.ochre);
    }
  }
  const cabin = child(cab.finish(.3), hull);
  for (const [name, points] of [
    [`${id}.cabin.pane.port`, [[o.min.x - .04, 2.2, .9], [o.min.x - .04, 2.2, 1.9], [o.min.x - .04, 2.7, 1.9], [o.min.x - .04, 2.7, .9]]],
    [`${id}.cabin.pane.starboard`, [[o.max.x + .04, 2.28, .9], [o.max.x + .04, 2.28, 2.2], [o.max.x + .04, 2.72, 2.2], [o.max.x + .04, 2.72, .9]]],
  ] as [string, Point[]][]) createObservationPane(scene, glass, name, points, cabin);

  // View-only pilot fittings, visible in control only: console, two arm levers,
  // power/hull bars and a hold gauge. The accurate HUD remains the fallback.
  const cockpit = batchFor(scene, cel, cache, `${id}.cockpit`, "cockpit");
  cockpit.box([0, 1.66, -2.42], [1.7, .36, .4], P.petrol);
  cockpit.face([[-.82, 1.86, -2.62], [.82, 1.86, -2.62], [.82, 1.8, -2.24], [-.82, 1.8, -2.24]], P.metal);
  for (const x of [-.55, .55]) {
    cockpit.tube([[x, 1.62, -2.1], [x, 1.86, -2.16]], .025, P.metal, 6);
    cockpit.ellipsoid([x, 1.89, -2.17], [.05, .05, .05], P.ochre, 8);
  }
  cockpit.box([0, 1.5, -1.6], [.6, .5, .5], P.shade);
  const fittings = child(cockpit.finish(), hull);
  for (const [kind, left] of [["charge", -.7], ["health", -.18], ["hold", .34]] as const) {
    const gauge = batchFor(scene, cel, cache, `${id}.instrument.${kind}`, `gauge-${kind}`);
    gauge.glow(gauge.box([.17, 0, 0], [.34, .012, .07], kind === "charge" ? P.amber : kind === "health" ? P.mint : P.reflection));
    const bar = child(gauge.finish(), fittings);
    bar.position.set(left, 1.865, -2.5);
  }
  return hull;
}

/** Reconcile mount variant, rack load, cockpit and gauges from state. */
export function updateCreelArt(mesh: Mesh, state: GameState | null, v: VehicleState): void {
  const mount = state ? fittedMount(state, v) : null;
  const frames = state ? state.inventory.items.filter((i) => i.kind === "tagged_frame" && i.containerId === v.cargoId)
    .reduce((n, i) => n + i.quantity, 0) : 0;
  const capacity = state?.inventory.containers.find((c) => c.id === v.cargoId)?.capacity ?? 64;
  const cu = state ? usedCapacity(state, v.cargoId) : 0;
  for (const c of mesh.getChildMeshes(true)) {
    const name = c.name;
    if (name === `${v.id}.mount.bare`) c.setEnabled(!mount);
    else if (name === `${v.id}.mount.rack`) c.setEnabled(mount?.kind === "creel_cargo_rack");
    else if (name === `${v.id}.mount.cabin`) c.setEnabled(mount?.kind === "creel_cabin");
    else if (name.startsWith(`${v.id}.cargo.frame.`)) c.setEnabled(mount?.kind === "creel_cargo_rack" && Number(name.slice(name.lastIndexOf(".") + 1)) < Math.min(frames, RACK_VISIBLE_FRAMES));
    else if (name === `${v.id}.cockpit`) {
      c.setEnabled(state?.player.controlledVehicleId === v.id);
      for (const g of c.getChildMeshes(true))
        if (g.name === `${v.id}.instrument.charge`) g.scaling.x = Math.max(0, Math.min(1, v.charge / 100));
        else if (g.name === `${v.id}.instrument.health`) g.scaling.x = Math.max(0, Math.min(1, v.health / 100));
        else if (g.name === `${v.id}.instrument.hold`) g.scaling.x = Math.max(0, Math.min(1, cu / capacity));
    }
  }
}

// ---------------------------------------------------------------- M2-B1 world sites

export const FRAME_HOSTS = ["basin_frame_ridge", "basin_frame_terrace", "basin_frame_fracture"] as const;
export const MARGIN_HOSTS = ["canopy_ribbon_margin_north", "canopy_ribbon_margin_south"] as const;
export const b1Source = (id: string): boolean =>
  (FRAME_HOSTS as readonly string[]).includes(id) || (MARGIN_HOSTS as readonly string[]).includes(id);

/** Stock-driven B1 work faces. `source.<id>` is the first stock unit; frame stacks
 * add `source.<id>.unit.<n>` members so the remaining count reads on site. */
export function b1SourceArt(scene: Scene, cel: ShaderMaterial, id: string, cache?: GeometryCache): Mesh[] {
  const s = SOURCES[id as keyof typeof SOURCES], { x, y, z } = s.position, meshes: Mesh[] = [];
  const key = (part: string) => cache ? { owner: cache, key: `fleet:b1-source:v1:${id}:${part}` } : undefined;
  if (s.item === "tagged_frame") {
    for (let n = 0; n < s.stock; n++) {
      const b = new ArtBatch(n === 0 ? `source.${id}` : `source.${id}.unit.${n}`, scene, cel, key(`unit-${n}`));
      // Long tagged members laid across the host cradle, one per finite unit.
      const yy = y + .32 + Math.floor(n / 2) * .24, zz = z - .32 + (n % 2) * .64;
      b.box([x, yy, zz], [2.4, .2, .36], n % 2 ? P.steelLight : P.metal);
      for (const dx of [-.9, .9]) b.box([x + dx, yy + .005, zz], [.08, .22, .4], P.ochre);
      b.box([x - .4, yy + .105, zz], [.34, .01, .22], P.porcelain);
      b.box([x - .48, yy + .112, zz], [.06, .01, .12], P.petrol);
      meshes.push(b.finish(.15));
    }
  } else {
    const b = new ArtBatch(`source.${id}`, scene, cel, key("ribbons"));
    for (let i = 0; i < 6; i++) {
      const dx = (i % 3 - 1) * .55, dz = (Math.floor(i / 3) - .5) * .9;
      b.face([[x + dx - .3, y + .05, z + dz - .2], [x + dx + .35, y + .12, z + dz - .1], [x + dx + .25, y + .55, z + dz + .25], [x + dx - .2, y + .3, z + dz + .3]], i % 2 ? P.coral : P.jade);
      b.tube([[x + dx - .3, y + .06, z + dz - .2], [x + dx, y + .3, z + dz + .05], [x + dx + .25, y + .55, z + dz + .25]], .018, P.coralRim, 4);
    }
    meshes.push(b.finish(.12));
  }
  return meshes;
}

/** Persistent, stock-independent B1 sites for one render region. */
export function createB1Sites(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, region: RenderRegion | undefined,
  labels?: LabelMaterials, cache?: GeometryCache): { meshes: Mesh[]; update(state: GameState | null): void } {
  const include = (r: RenderRegion) => !region || region === r, meshes: Mesh[] = [];
  const batch = (name: string) => new ArtBatch(name, scene, cel, cache ? { owner: cache, key: `fleet:b1-site:v1:${name}` } : undefined);
  let restoredLight: Mesh | null = null, darkLight: Mesh | null = null;
  void glass;
  if (include("island_chain")) {
    const slip = batch("workshop.slip.markings");
    for (const rail of CREEL_SLIP_SOLIDS) slip.bounds(rail, P.ochre);
    for (let z = -30; z <= -22; z += 2) {
      const ground = terrainHeight(-6, z) + .03;
      slip.face([[-7.2, ground, z], [-6, ground, z - .8], [-4.8, ground, z], [-6, ground, z - .35]], P.ochre);
    }
    for (const x of [-11.25, -0.75]) slip.box([x, -1.12, -26], [.42, .16, 9.4], P.petrol);
    meshes.push(slip.finish(.2));
    const sign = label(scene, "MEDIUM SLIP", [-11.25, 1.25, -31.32], 1.4, 0, labels);
    meshes.push(sign);
  }
  if (include("suspended_garden")) {
    const stop = batch("canopy.stop.site");
    for (const solid of CANOPY_STOP.solids)
      stop.bounds(solid, solid.id.endsWith("deck") ? P.petrol : solid.id.endsWith("mast") ? P.metal : P.shade);
    const w = CANOPY_STOP.work;
    // Deck grating and edge paint follow the physical slab; no rail blocks the diver.
    for (let x = 200.4; x < 208; x += .6) stop.box([x, -137.99, -148], [.05, .01, 5.8], P.steelLight);
    stop.box([204, -137.985, -145.05], [8, .015, .1], P.ochre);
    for (const y of [-150, -142, -134]) stop.box([204, y, -151.2], [1.32, .14, 1.32], P.porcelain);
    // Charging collar and service socket at the work face; locker door lines.
    stop.ring([w.x, w.y + 1.1, -150.55], [1, 0, 0], [0, 1, 0], .42, .28, P.ochre, 14);
    stop.panel([w.x, w.y + .45, -150.56], [.7, .5], .06, P.petrol, 0, .06);
    for (const x of [205.9, 206.9]) stop.box([x, -137.2, -149.98], [.02, 1.4, .02], P.steelLight);
    stop.box([206.4, -137.2, -149.96], [.12, .05, .03], P.ochre);
    // Mooring tether from the mast head to the marker float above.
    stop.tube([[204, -126, -151.2], [204.2, -112, -151.1], [204, CANOPY_STOP.marker.y, CANOPY_STOP.marker.z]], .04, P.steelLight, 5);
    stop.ellipsoid([CANOPY_STOP.marker.x, CANOPY_STOP.marker.y, CANOPY_STOP.marker.z], [.75, .55, .75], P.ochre, 10);
    meshes.push(stop.finish(.25));
    const sign = label(scene, "OUTER-CROWN MOORING", [204, -136.6, -150.52], 1.8, Math.PI, labels);
    meshes.push(sign);
    const lit = batch("canopy.stop.light.restored");
    lit.glow(lit.ellipsoid([CANOPY_STOP.marker.x, CANOPY_STOP.marker.y + .55, CANOPY_STOP.marker.z], [.28, .28, .28], P.warm, 8));
    for (const [dx, dy] of [[-.34, 0], [.34, 0], [0, .34], [0, -.34]] as const)
      lit.glow(lit.box([w.x + dx, w.y + 1.1 + dy, -150.6], [.1, .1, .02], P.amber));
    for (let x = 200.6; x < 208; x += 1.8) lit.glow(lit.box([x, -137.97, -145.12], [.3, .012, .08], P.warm));
    restoredLight = lit.finish(); meshes.push(restoredLight);
    const dark = batch("canopy.stop.light.dark");
    dark.box([CANOPY_STOP.marker.x, CANOPY_STOP.marker.y + .55, CANOPY_STOP.marker.z], [.4, .3, .4], P.ink);
    darkLight = dark.finish(); meshes.push(darkLight);
    // Margin ribs: faceted mineral columns with an old tether net on each ledge.
    const ribs = batch("canopy.margin.ribs");
    for (const solid of CANOPY_MARGIN_RIBS) {
      if (solid.id.includes(".rib.")) {
        ribs.bounds(solid, P.basalt);
        for (let y = solid.min.y + 6; y < solid.max.y; y += 9)
          ribs.box([(solid.min.x + solid.max.x) / 2, y, (solid.min.z + solid.max.z) / 2], [solid.max.x - solid.min.x + .2, .5, solid.max.z - solid.min.z + .2], P.stoneLight);
      } else {
        ribs.bounds(solid, P.stoneLight);
        const cy = solid.max.y + .02;
        for (let i = 0; i <= 4; i++) {
          const t = i / 4;
          ribs.tube([[solid.min.x, cy, solid.min.z + (solid.max.z - solid.min.z) * t], [solid.max.x, cy + .05, solid.min.z + (solid.max.z - solid.min.z) * t]], .018, P.shell, 4);
          ribs.tube([[solid.min.x + (solid.max.x - solid.min.x) * t, cy, solid.min.z], [solid.min.x + (solid.max.x - solid.min.x) * t, cy + .05, solid.max.z]], .018, P.shell, 4);
        }
        ribs.tube([[solid.max.x, cy + .05, (solid.min.z + solid.max.z) / 2], [solid.max.x + .2, cy + 6, (solid.min.z + solid.max.z) / 2]], .03, P.steelLight, 4);
      }
    }
    meshes.push(ribs.finish(.2));
  }
  if (include("silt_basin")) {
    const basin = batch("basin.b1.sites");
    for (const id of FRAME_HOSTS) {
      const { x, y, z } = SOURCES[id].position;
      // Two crossbeams and a tag post: the host stays recognizable when empty.
      for (const dz of [-.55, .55]) basin.box([x, y + .12, z + dz], [2.8, .16, .2], P.petrol);
      for (const dx of [-1.1, 1.1]) basin.box([x + dx, y + .1, z], [.2, .14, 1.5], P.ochre);
      basin.tube([[x + 1.6, y, z + .9], [x + 1.6, y + 1.6, z + .9]], .045, P.steelLight, 5);
      basin.box([x + 1.6, y + 1.5, z + .9], [.5, .3, .03], P.porcelain);
    }
    // Fallen dish keel ring and its pressure plate, low on the south terrace floor.
    const k = TECH_RECORDS.basin_keel_plate.position, ring: Point[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = -1.2 + i / 14 * 2.4, px = k.x + Math.cos(a) * 2.6, pz = k.z - 1.8 + Math.sin(a) * 2.6;
      ring.push([px, terrainHeight(px, pz) + .2, pz]);
    }
    basin.tube(ring, .16, P.metal, 7);
    basin.panel([k.x, terrainHeight(k.x, k.z) + .14, k.z], [.9, .55], .05, P.steelLight, 0, .05);
    for (let i = 0; i < 4; i++) basin.box([k.x, terrainHeight(k.x, k.z) + .175, k.z - .18 + i * .12], [.6, .005, .02], P.petrol);
    // Boundary-fracture survey stakes along the lip: the slope break C06 recorded.
    for (let x = 160; x <= 232; x += 12) {
      const pz = -276, ground = terrainHeight(x, pz);
      basin.tube([[x, ground - .2, pz], [x, ground + 2.4, pz]], .05, P.steelLight, 5);
      basin.box([x + .25, ground + 2.2, pz], [.45, .28, .02], x % 24 === 4 ? P.ochre : P.coral);
    }
    // Spilled gantry bay below the fracture frames.
    const f = SOURCES.basin_frame_fracture.position;
    for (const [dx, dz, yaw] of [[-3.5, 2, .4], [3.2, -1.5, -.7], [-1, -3.2, 1.2]] as const)
      basin.box([f.x + dx, terrainHeight(f.x + dx, f.z + dz) + .2, f.z + dz], [3, .3, .35], P.metal, [0, yaw, .05]);
    meshes.push(basin.finish(.2));
    const sign = label(scene, "FRACTURE LIP · 230 m", [196, terrainHeight(196, -276) + 2.9, -276], 1.6, 0, labels);
    meshes.push(sign);
  }
  return {
    meshes,
    update(state) {
      const restored = !!state?.world.facilities.some((f) => f.id === "canopy_stop" && f.repaired);
      restoredLight?.setEnabled(restored); darkLight?.setEnabled(!restored);
    },
  };
}
