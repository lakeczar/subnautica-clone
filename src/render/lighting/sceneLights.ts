import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { HAZARDS } from "../../content/regions/hazards.js";
import { RIFT_AXIS } from "../../content/regions/terrain.js";
import { worldFloor } from "../../content/regions/worldFloor.js";
import type { GameState } from "../../sim/types.js";
import { ArtBatch } from "../geometry.js";
import { emissiveScan, lightFromCluster, lightUniforms, selectLights, type LightCluster, type PointLight,
  type Vec3Like } from "./localLights.js";

/** The renderer's local lights (ATM-1): every emissive cel mesh in the scene
 * becomes point lights (scanned once, in bounded slices), plus authored Rift
 * vents, the piloted cockpit's instrument light and a blinking marker on
 * every parked craft. Each frame the best few go to the cel and sky
 * materials. */
export interface SceneLights {
  update(state: GameState | null, eye: Vector3, daylight: number, time: number): void;
  /** Lights sent last frame, emissive meshes known, meshes waiting for a scan. */
  readonly stats: { readonly sent: number; readonly known: number; readonly pending: number };
  dispose(): void;
}

/** Warm seeps down the Rift head and along the trench, the split chimney's
 * slot and the southern vent field. World space; the Rift reads "Ember". */
export function riftVents(): PointLight[] {
  const out: PointLight[] = [];
  const warm = { r: 1, g: 0.46, b: 0.16 };
  let along = 0;
  for (let i = 0; i < RIFT_AXIS.length - 1; i++) {
    const [ax, az] = RIFT_AXIS[i]!, [bx, bz] = RIFT_AXIS[i + 1]!, len = Math.hypot(bx - ax, bz - az);
    for (let s = (40 - along % 40) % 40; s < len; s += 40) {
      if (along + s < 12) continue;
      const x = ax + (bx - ax) * s / len, z = az + (bz - az) * s / len;
      // Alternate a little off the axis so the seeps read as a field, not a line.
      const side = (Math.round((along + s) / 40) % 2 ? 1 : -1) * 7, nx = -(bz - az) / len, nz = (bx - ax) / len;
      const px = x + nx * side, pz = z + nz * side;
      out.push({ x: px, y: worldFloor(px, pz) + 2.5, z: pz, radius: 36, strength: 1.15, ...warm });
    }
    along += len;
  }
  for (const h of HAZARDS) {
    if (h.id === "hazard.rift.chimney_plume")
      out.push({ x: -165, y: -306, z: -1065, radius: 40, strength: 1, ...warm });
    else if (h.id === "hazard.rift.vent_field") {
      const x = (h.bounds.min.x + h.bounds.max.x) / 2, z = (h.bounds.min.z + h.bounds.max.z) / 2;
      out.push({ x, y: worldFloor(x, z) + 3, z, radius: 40, strength: 0.9, ...warm });
    }
  }
  return out;
}

/** Hull-local instrument light per pilotable compartment. */
const INSTRUMENT: Readonly<Record<string, { at: Vec3Like; radius: number }>> = {
  creel: { at: { x: 0, y: 1.98, z: -2.3 }, radius: 2.1 },
  dart: { at: { x: 0.08, y: 1.08, z: -0.55 }, radius: 1.6 },
};
const MARKER_COLOR = { r: 1, g: 0.72, b: 0.32 };
/** Seconds per blink, and the lit fraction. */
const BLINK = 2.2, BLINK_ON = 0.22;
/** Vertices read per check of the scan's time slice. */
const SCAN_SLICE = 4096;
/** Markers show below this depth (the surface has daylight). */
const MARKER_DEPTH = 25;

interface Entry {
  readonly mesh: AbstractMesh;
  readonly clusters: readonly LightCluster[];
  /** Thin-instance matrices (local to the mesh), or null. */
  readonly instances: readonly Matrix[] | null;
  /** World lights, cached for frozen meshes. */
  world: PointLight[] | null;
  active: boolean;
}

export function createSceneLights(scene: Scene, cel: ShaderMaterial, targets: readonly ShaderMaterial[]): SceneLights {
  const entries = new Map<number, Entry>(), byGeometry = new Map<string, LightCluster[]>();
  const pending = new Set<AbstractMesh>();
  const vents = riftVents();
  const markers = new Map<string, Mesh>();
  const ventArt = (() => {
    const b = new ArtBatch("atmosphere.rift.seeps", scene, cel);
    for (const v of vents) {
      b.glow(b.ellipsoid([v.x, v.y - 2.4, v.z], [1.3, 0.32, 1.3], "#ff9a4a", 8));
      b.glow(b.ellipsoid([v.x + 0.9, v.y - 2.35, v.z - 0.5], [0.55, 0.22, 0.55], "#ffd27a", 6));
    }
    const mesh = b.finish();
    mesh.renderingGroupId = 1;
    mesh.metadata = { ...mesh.metadata, atmLights: "skip" };
    return mesh;
  })();
  // Meshes are announced before their material and data are set, so the
  // check waits for the scan.
  const consider = (mesh: AbstractMesh): void => {
    const known = entries.get(mesh.uniqueId);
    if (known) { known.active = true; return; }
    pending.add(mesh);
  };
  for (const m of scene.meshes) consider(m);
  const added = scene.onNewMeshAddedObservable.add(m => consider(m));
  const removed = scene.onMeshRemovedObservable.add(m => {
    pending.delete(m);
    const e = entries.get(m.uniqueId);
    if (e) e.active = false;
  });
  /** The mesh being scanned a slice at a time (CW-1: streamed chunks are large). */
  let scanning: { mesh: AbstractMesh; geometry: string; job: ReturnType<typeof emissiveScan> } | null = null;
  /** Scan for up to `until`; true when the mesh is done (or needs no scan). */
  const scan = (mesh: AbstractMesh, until: number): boolean => {
    if (mesh.isDisposed() || mesh.material !== cel || mesh.metadata?.atmLights === "skip") return true;
    const m = mesh as Mesh, geometry = m.geometry;
    let clusters = geometry ? byGeometry.get(geometry.id) : undefined;
    if (!clusters) {
      const colors = geometry ? m.getVerticesData("color", false, false) : null;
      const positions = geometry ? m.getVerticesData("position", false, false) : null;
      if (!colors || !positions) return true;
      if (scanning?.mesh !== mesh) scanning = { mesh, geometry: geometry!.id, job: emissiveScan(positions, colors) };
      while (!scanning.job.step(SCAN_SLICE)) if (performance.now() > until) return false;
      byGeometry.set(geometry!.id, clusters = scanning.job.clusters());
      scanning = null;
    }
    if (!clusters.length) return true;
    const instances = m.thinInstanceCount > 0 ? m.thinInstanceGetWorldMatrices() : null;
    entries.set(mesh.uniqueId, { mesh, clusters, instances, world: null, active: true });
    mesh.onDisposeObservable.addOnce(() => entries.delete(mesh.uniqueId));
    return true;
  };
  const toWorld = (e: Entry): PointLight[] => {
    const frozen = e.mesh.isWorldMatrixFrozen && !e.mesh.parent;
    if (frozen && e.world) return e.world;
    const world = e.mesh.computeWorldMatrix(!frozen), out: PointLight[] = [], p = new Vector3();
    for (const matrix of e.instances ?? [null]) {
      const m = matrix ? matrix.multiply(world) : world;
      for (const c of e.clusters) {
        Vector3.TransformCoordinatesFromFloatsToRef(c.x, c.y, c.z, m, p);
        out.push({ x: p.x, y: p.y, z: p.z, ...lightFromCluster(c, !frozen) });
      }
    }
    if (frozen) e.world = out;
    return out;
  };
  const hulls = new Map<string, Mesh>();
  const hullOf = (id: string): Mesh | null => {
    let h = hulls.get(id);
    if (!h || h.isDisposed()) { h = (scene.getMeshByName(id) as Mesh | null) ?? undefined; if (h) hulls.set(id, h); }
    return h ?? null;
  };
  let sent = 0;
  const send = (u: ReturnType<typeof lightUniforms>, halo: number): void => {
    for (const m of targets) {
      m.setArray4("localLightPos", u.position);
      m.setArray4("localLightColor", u.color);
      m.setFloat("localLightCount", u.count);
      m.setFloat("haloGain", halo);
    }
  };
  send(lightUniforms([]), 0);
  return {
    get stats() { return { sent, known: entries.size, pending: pending.size }; },
    update(state, eye, daylight, time) {
      // Scan new meshes in a bounded slice per frame, resuming a large one.
      const until = performance.now() + 1.5;
      for (const mesh of pending) {
        if (!scan(mesh, until)) break;
        pending.delete(mesh);
        if (performance.now() > until) break;
      }
      // The piloted hull's own glows (gauges, ceiling strip) would glare inside
      // the compartment: its soft instrument light stands in for them.
      const seated = state?.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId);
      const hull = seated ? hullOf(seated.id) : null;
      const lights: PointLight[] = [];
      // A newly streamed frozen mesh's lights (thousands of thin instances
      // for some scatter) are placed once and cached; place a bounded number
      // per frame (CW-1), so a new chunk's lights join over a few frames.
      const placeUntil = performance.now() + 2;
      for (const e of entries.values())
        if (e.active && !e.mesh.isDisposed() && e.mesh.isEnabled() && !(hull && (e.mesh === hull || e.mesh.isDescendantOf(hull)))) {
          if (!e.world && e.mesh.isWorldMatrixFrozen && !e.mesh.parent && performance.now() > placeUntil) continue;
          for (const l of toWorld(e)) lights.push(l);
        }
      for (const v of vents) lights.push(v);
      // Parked craft: a blinking marker light, always sent, nearest two.
      const blinkOn = (time % BLINK) < BLINK * BLINK_ON;
      const parked: { mesh: Mesh; d: number }[] = [];
      for (const v of state?.fleet.vehicles ?? []) {
        const hull = hullOf(v.id);
        let marker = markers.get(v.id);
        if (!hull) { marker?.setEnabled(false); continue; }
        if (!marker || marker.isDisposed()) markers.set(v.id, marker = markerFor(scene, cel, hull, v.id));
        const show = state?.player.controlledVehicleId !== v.id && v.pose.position.y < -MARKER_DEPTH && hull.isEnabled();
        marker.setEnabled(show);
        if (show) parked.push({ mesh: marker, d: Vector3.Distance(eye, hull.position) });
      }
      parked.sort((a, b) => a.d - b.d);
      for (const p of parked.slice(0, 2)) {
        const at = p.mesh.getAbsolutePosition();
        lights.push({ x: at.x, y: at.y, z: at.z, radius: 8, strength: blinkOn ? 1.4 : 0.3, reserved: true, ...MARKER_COLOR });
      }
      // The piloted cockpit's own soft instrument light.
      const inst = seated ? INSTRUMENT[seated.hull] : undefined;
      if (inst && hull) {
        const at = Vector3.TransformCoordinates(new Vector3(inst.at.x, inst.at.y, inst.at.z), hull.computeWorldMatrix(true));
        lights.push({ x: at.x, y: at.y, z: at.z, radius: inst.radius, strength: 0.2, reserved: true, noHalo: true, r: 0.78, g: 0.92, b: 1 });
      }
      const chosen = selectLights(lights, eye);
      sent = chosen.length;
      send(lightUniforms(chosen), 1 - 0.9 * daylight);
    },
    dispose() {
      scene.onNewMeshAddedObservable.remove(added);
      scene.onMeshRemovedObservable.remove(removed);
      for (const m of markers.values()) if (!m.isDisposed()) m.dispose();
      if (!ventArt.isDisposed()) ventArt.dispose();
      entries.clear(); pending.clear();
    },
  };
}

/** A small amber lamp on top of a hull, unlit art; its light is the reserved
 * marker light, so the scan skips it. */
function markerFor(scene: Scene, cel: ShaderMaterial, hull: Mesh, id: string): Mesh {
  const box = hull.getBoundingInfo().boundingBox;
  const top = box.maximum.y, cx = (box.minimum.x + box.maximum.x) / 2, cz = (box.minimum.z + box.maximum.z) / 2;
  const b = new ArtBatch(`${id}.marker`, scene, cel);
  b.glow(b.ellipsoid([cx, top + 0.16, cz], [0.16, 0.16, 0.16], "#ffc46a", 8));
  const mesh = b.finish();
  mesh.metadata = { ...mesh.metadata, atmLights: "skip" };
  mesh.unfreezeWorldMatrix(); mesh.parent = hull; mesh.renderingGroupId = 1;
  mesh.setEnabled(false);
  return mesh;
}
