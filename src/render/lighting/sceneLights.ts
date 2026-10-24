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
import { emissiveScan, LIGHT_RANGE, lightFromCluster, lightUniforms, MAX_LIGHT_RADIUS, selectLights, type LightCluster, type PointLight,
  type Vec3Like } from "./localLights.js";

/** The renderer's local lights (ATM-1): every emissive cel mesh in the scene
 * becomes point lights (scanned once, in bounded slices), plus authored Rift
 * vents, the piloted cockpit's instrument light and a blinking marker on
 * every parked craft. Each frame the best few go to the cel and sky
 * materials. */
export interface SceneLights {
  update(state: GameState | null, eye: Vector3, daylight: number, time: number): void;
  /** Lights sent last frame, emissive meshes known, meshes waiting for a scan. */
  readonly stats: { readonly sent: number; readonly known: number; readonly pending: number;
    /** Last update's time scanning new meshes, placing lights, and choosing them, ms. */
    readonly scanMs: number; readonly placeMs: number; readonly selectMs: number; readonly placed: number;
    /** Lights the selection considered this frame, and the frame's slowest entry to place. */
    readonly considered: number;
    /** Entries the placement walked this frame (measurement: a long placement with few is not our work). */
    readonly walked: number;
    /** Placement by kind this frame: cached copy, moving refresh, frozen placement (ms), lights moved, moving meshes. */
    readonly placing: { readonly cachedMs: number; readonly movingMs: number; readonly placingMs: number; readonly moved: number; readonly moving: number;
      /** Worst lag of any moving light and of a sent one (frames); nearest moving mesh with any lag (m, Infinity if none). */
      readonly lagWorst: number; readonly sentLag: number; readonly lagNearest: number };
    /** Every known mesh is scanned and its lights placed: the candidate set
     * is complete, so selection from here depends only on the pose. */
    readonly settled: boolean;
    /** The scanned-cluster cache: geometries held by live meshes, estimated bytes. */
    readonly cache: { readonly geometries: number; readonly bytes: number };
    readonly slowest: { readonly name: string; readonly ms: number; readonly instances: number; readonly clusters: number; readonly frozen: boolean } | null;
  };
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
/** Estimated bytes of one cached light cluster (its numbers and object). */
const CLUSTER_BYTES = 120;
/** Markers show below this depth (the surface has daylight). */
const MARKER_DEPTH = 25;

/** A moving mesh's light, moved in place, with the frame it was last moved. */
type MovingLight = { -readonly [K in keyof PointLight]: PointLight[K] } & { stamp: number };
interface Entry {
  readonly mesh: AbstractMesh;
  readonly clusters: readonly LightCluster[];
  /** Thin-instance matrices (local to the mesh), or null. */
  readonly instances: readonly Matrix[] | null;
  /** World lights, cached for frozen meshes. */
  world: PointLight[] | null;
  /** A frozen mesh's lights being placed over several frames: those so far,
   * and the next thin instance. */
  placing: { readonly out: PointLight[]; next: number; cluster: number } | null;
  /** Each cluster's reach, strength and colour (instance-independent), by
   * whether the mesh is attached (moving) or frozen. */
  params: { attached: boolean; list: readonly Omit<PointLight, "x" | "y" | "z">[] } | null;
  /** A moving mesh's lights, one mutable light per cluster and instance,
   * made once and moved in place each frame (R2-4), and where the
   * round-robin refresh of a large one resumes. */
  moving: { lights: MovingLight[]; next: number } | null;
  active: boolean;
  /** Where the entry sits in the dense per-frame list. */
  index: number;
}

export function createSceneLights(scene: Scene, cel: ShaderMaterial, targets: readonly ShaderMaterial[]): SceneLights {
  // By mesh, for lookup; and the same entries in a dense list the frame walks
  // by index (no iterator objects per frame: the walk is per entry). Removal
  // swaps the last entry in; order is irrelevant to selection (R2-3).
  const entries = new Map<number, Entry>(), list: Entry[] = [];
  const drop = (e: Entry): void => {
    if (entries.get(e.mesh.uniqueId) !== e) return;
    entries.delete(e.mesh.uniqueId);
    const last = list.pop()!;
    if (last !== e) { list[e.index] = last; last.index = e.index; }
  };
  // Scanned clusters by geometry, owned by the live meshes using them (CW-1
  // R2-5): each mesh that consulted a geometry holds a reference until it is
  // disposed, and the last release frees the entry, so streamed chunks that
  // come and go never leave clusters behind. Bytes are estimated per cluster.
  const byGeometry = new Map<string, { clusters: LightCluster[]; refs: number; bytes: number }>();
  let cacheBytes = 0;
  const retain = (mesh: AbstractMesh, id: string, clusters?: LightCluster[]): LightCluster[] => {
    let c = byGeometry.get(id);
    if (!c) { c = { clusters: clusters!, refs: 0, bytes: 64 + clusters!.length * CLUSTER_BYTES }; byGeometry.set(id, c); cacheBytes += c.bytes; }
    c.refs++;
    mesh.onDisposeObservable.addOnce(() => release(id));
    return c.clusters;
  };
  const release = (id: string): void => {
    const c = byGeometry.get(id);
    if (c && --c.refs <= 0) { byGeometry.delete(id); cacheBytes -= c.bytes; }
  };
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
    let clusters = geometry && byGeometry.has(geometry.id) ? retain(mesh, geometry.id) : undefined;
    if (!clusters) {
      const colors = geometry ? m.getVerticesData("color", false, false) : null;
      const positions = geometry ? m.getVerticesData("position", false, false) : null;
      if (!colors || !positions) return true;
      if (scanning?.mesh !== mesh) scanning = { mesh, geometry: geometry!.id, job: emissiveScan(positions, colors) };
      while (!scanning.job.step(SCAN_SLICE)) if (performance.now() > until) return false;
      clusters = retain(mesh, geometry!.id, scanning.job.clusters());
      scanning = null;
    }
    if (!clusters.length) return true;
    const instances = m.thinInstanceCount > 0 ? m.thinInstanceGetWorldMatrices() : null;
    const e: Entry = { mesh, clusters, instances, world: null, placing: null, params: null, moving: null, active: true, index: list.length };
    entries.set(mesh.uniqueId, e); list.push(e);
    mesh.onDisposeObservable.addOnce(() => drop(e));
    return true;
  };
  const scratch = new Matrix(), p = new Vector3();
  /** Moving lights made or refreshed per frame across every moving mesh
   * (CW-1: a per-mesh cap let many moving meshes add up to 24-31 ms). Moving
   * meshes are refreshed nearest the eye first, each taking what it needs from
   * the frame's budget, so lag falls on the farthest; past the budget each
   * still refreshes MOVING_MIN of its lights (a round-robin window). Every
   * light stays sent. Distance, not the view frustum: a light behind the
   * camera still lights what is on screen. Each light carries the frame it
   * was last moved (`stamp`), so the lag of what selection sends is measured. */
  const MOVING_PER_FRAME = 2048, MOVING_MIN = 32;
  /** This frame: lights moved, moving meshes; the worst lag (frames) of any moving
   * light and of a sent one, and the nearest moving mesh with lagging lights (m). */
  let moved = 0, movingNow = 0, frameNo = 0, lagWorst = 0, sentLag = 0, lagNearest = Infinity;
  const moveLights = (e: Entry, world: Matrix, instances: readonly (Matrix | null)[], params: readonly Omit<PointLight, "x" | "y" | "z">[]): PointLight[] => {
    const clusters = e.clusters, total = instances.length * clusters.length;
    if (!e.moving || e.moving.lights.length > total) e.moving = { lights: [], next: 0 };
    const lights = e.moving.lights;
    movingNow++;
    // What is left of the frame's budget (at least MOVING_MIN): nearest first,
    // a frame moves at most MOVING_PER_FRAME + MOVING_MIN per moving mesh.
    const allowance = Math.max(MOVING_MIN, MOVING_PER_FRAME - moved);
    if (lights.length < total) {
      // Made a bounded number a frame (only lights made so far are sent).
      for (let made = 0; made < allowance && lights.length < total; made++) {
        const i = lights.length;
        lights.push({ x: 0, y: 0, z: 0, stamp: frameNo, ...params[i % clusters.length]! });
        moveOne(e, i, world, instances);
        moved++;
      }
      return lights;
    }
    const count = Math.min(total, allowance);
    for (let k = 0; k < count; k++) { moveOne(e, e.moving.next, world, instances); e.moving.next = (e.moving.next + 1) % total; }
    moved += count;
    return e.moving.lights;
  };
  /** Frames since this moving mesh's oldest light was moved (0: all current).
   * Round-robin keeps the oldest next in line; while lights are still being
   * made, none is refreshed, so the first made is the oldest. */
  const lagOf = (e: Entry, total: number): number => {
    const m = e.moving;
    if (!m || !m.lights.length) return 0;
    return frameNo - m.lights[m.lights.length < total ? 0 : m.next]!.stamp;
  };
  const moveOne = (e: Entry, i: number, world: Matrix, instances: readonly (Matrix | null)[]): void => {
    const clusters = e.clusters, n = Math.floor(i / clusters.length), c = clusters[i % clusters.length]!, matrix = instances[n];
    const m = matrix ? matrix.multiplyToRef(world, scratch) : world;
    Vector3.TransformCoordinatesFromFloatsToRef(c.x, c.y, c.z, m, p);
    const l = e.moving!.lights[i]!;
    l.x = p.x; l.y = p.y; l.z = p.z; l.stamp = frameNo;
  };
  /** Lights placed between checks of the placement budget. */
  const PLACE_CHECK = 256;
  /** The entry's world lights. A frozen mesh's are placed once and cached,
   * resuming across frames until `until` (CW-1: one streamed scatter mesh can
   * hold thousands of thin instances, each with many clusters); null while
   * still being placed. The budget is checked by lights placed, not by
   * instances, and each cluster's parameters are derived once per entry. */
  /** Each cluster's parameters, for a moving (attached) or frozen mesh (no closure: called per entry). */
  const paramsOf = (clusters: readonly LightCluster[], attached: boolean): Omit<PointLight, "x" | "y" | "z">[] => {
    const out: Omit<PointLight, "x" | "y" | "z">[] = new Array(clusters.length);
    for (let i = 0; i < clusters.length; i++) out[i] = lightFromCluster(clusters[i]!, attached);
    return out;
  };
  const SINGLE: readonly (Matrix | null)[] = [null];
  const toWorld = (e: Entry, until = Infinity): PointLight[] | null => {
    const frozen = e.mesh.isWorldMatrixFrozen && !e.mesh.parent;
    if (frozen && e.world) return e.world;
    if (!e.params || e.params.attached === frozen) e.params = { attached: !frozen, list: paramsOf(e.clusters, !frozen) };
    const params = e.params.list, clusters = e.clusters;
    const world = e.mesh.computeWorldMatrix(!frozen), instances = e.instances ?? SINGLE;
    if (!frozen) return moveLights(e, world, instances, params);
    const job = (e.placing ??= { out: [], next: 0, cluster: 0 });
    let sinceCheck = 0;
    for (; job.next < instances.length; job.next++, job.cluster = 0) {
      const matrix = instances[job.next];
      const m = matrix ? matrix.multiplyToRef(world, scratch) : world;
      for (; job.cluster < clusters.length; job.cluster++) {
        if (++sinceCheck >= PLACE_CHECK) { sinceCheck = 0; if (performance.now() > until) return null; }
        const c = clusters[job.cluster]!;
        Vector3.TransformCoordinatesFromFloatsToRef(c.x, c.y, c.z, m, p);
        job.out.push({ x: p.x, y: p.y, z: p.z, ...params[job.cluster]! });
      }
    }
    e.world = job.out; e.placing = null;
    return job.out;
  };
  const hulls = new Map<string, Mesh>();
  const hullOf = (id: string): Mesh | null => {
    let h = hulls.get(id);
    if (!h || h.isDisposed()) { h = (scene.getMeshByName(id) as Mesh | null) ?? undefined; if (h) hulls.set(id, h); }
    return h ?? null;
  };
  const frameLights: PointLight[] = [];
  /** Metres from the eye to the mesh's world bounds (0 inside). */
  const boxDistance = (mesh: AbstractMesh, eye: Vector3): number => {
    const box = mesh.getBoundingInfo().boundingBox, lo = box.minimumWorld, hi = box.maximumWorld;
    const dx = Math.max(lo.x - eye.x, 0, eye.x - hi.x), dy = Math.max(lo.y - eye.y, 0, eye.y - hi.y), dz = Math.max(lo.z - eye.z, 0, eye.z - hi.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  // Slack for a moving mesh's bounds, refreshed at render (a frame behind here).
  const outOfRange = (mesh: AbstractMesh, eye: Vector3): boolean => boxDistance(mesh, eye) > LIGHT_RANGE + MAX_LIGHT_RADIUS + 8;
  /** The frame's moving entries and their distances, reused (sorted nearest first). */
  const movers: Entry[] = [], moverDistance: number[] = [];
  let unplaced = 0;
  let sent = 0, scanMs = 0, placeMs = 0, selectMs = 0, placed = 0, considered = 0, walked = 0;
  /** Placement by kind this frame, ms: cached lights copied in, moving meshes refreshed, frozen meshes placed. */
  let cachedMs = 0, movingMs = 0, placingMs = 0;
  /** The frame's slowest entry to place (measurement: which mesh a long placement was). */
  let slowest: { name: string; ms: number; instances: number; clusters: number; frozen: boolean } | null = null;
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
    get stats() { return { sent, known: entries.size, pending: pending.size, scanMs, placeMs, selectMs, placed, considered, walked, slowest,
      placing: { cachedMs, movingMs, placingMs, moved, moving: movingNow, lagWorst, sentLag, lagNearest }, settled: pending.size === 0 && unplaced === 0,
      cache: { geometries: byGeometry.size, bytes: cacheBytes } }; },
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
      scanMs = performance.now() - (until - 1.5);
      const placeStart = performance.now();
      // The frame's candidates, in one array reused frame to frame (never
      // retained by selection), written by index and cut to length once at the
      // end: emptying it each frame would drop its storage and regrow it.
      const lights = frameLights;
      let n = 0;
      // A newly streamed frozen mesh's lights (thousands of thin instances
      // for some scatter) are placed once and cached; place a bounded number
      // per frame (CW-1), so a new chunk's lights join over a few frames.
      const placeUntil = performance.now() + 2;
      slowest = null; unplaced = 0; walked = list.length; moved = 0; movingNow = 0; cachedMs = 0; movingMs = 0; placingMs = 0;
      frameNo++; lagWorst = 0; sentLag = 0; lagNearest = Infinity;
      let movers_n = 0;
      for (let k = 0; k < list.length; k++) {
        const e = list[k]!;
        if (e.active && !e.mesh.isDisposed() && e.mesh.isEnabled() && !(hull && (e.mesh === hull || e.mesh.isDescendantOf(hull)))) {
          const frozen = e.mesh.isWorldMatrixFrozen && !e.mesh.parent;
          if (!e.world && frozen && performance.now() > placeUntil) { unplaced++; continue; }
          // A non-instanced mesh's lights all lie in its world bounds, each
          // reaching at most MAX_LIGHT_RADIUS: a mesh whose bounds are beyond
          // LIGHT_RANGE of that can give selection nothing, so its lights are
          // not placed this frame (CW-1: a far creature field re-placed 1,201
          // moving lights a frame for nothing).
          if (!e.instances && outOfRange(e.mesh, eye)) continue;
          // Placed and cached: copied in, untimed (most entries, most frames).
          const cached = frozen ? e.world : null;
          if (cached) {
            const tc = performance.now();
            for (let i = 0; i < cached.length; i++) lights[n++] = cached[i]!;
            cachedMs += performance.now() - tc;
            continue;
          }
          // Moving: placed after this pass, nearest first.
          if (!frozen) {
            const d = boxDistance(e.mesh, eye);
            let j = movers_n++;
            for (; j > 0 && moverDistance[j - 1]! > d; j--) { movers[j] = movers[j - 1]!; moverDistance[j] = moverDistance[j - 1]!; }
            movers[j] = e; moverDistance[j] = d;
            continue;
          }
          const t0 = performance.now();
          const placedLights = toWorld(e, placeUntil);
          if (!placedLights) unplaced++;
          if (placedLights) for (let i = 0; i < placedLights.length; i++) lights[n++] = placedLights[i]!;
          const ms = performance.now() - t0;
          placingMs += ms;
          if (ms > (slowest?.ms ?? 0)) slowest = { name: e.mesh.name, ms, instances: e.instances?.length ?? 1, clusters: e.clusters.length, frozen };
        }
      }
      // Moving meshes, nearest first, from the frame's budget; record their lag.
      for (let k = 0; k < movers_n; k++) {
        const e = movers[k]!, t0 = performance.now();
        const placedLights = toWorld(e, placeUntil)!;
        for (let i = 0; i < placedLights.length; i++) lights[n++] = placedLights[i]!;
        const ms = performance.now() - t0;
        movingMs += ms;
        if (ms > (slowest?.ms ?? 0)) slowest = { name: e.mesh.name, ms, instances: e.instances?.length ?? 1, clusters: e.clusters.length, frozen: false };
        const lag = lagOf(e, (e.instances?.length ?? 1) * e.clusters.length);
        if (lag > 0) { lagWorst = Math.max(lagWorst, lag); lagNearest = Math.min(lagNearest, moverDistance[k]!); }
      }
      movers.length = movers_n; moverDistance.length = movers_n;
      placeMs = performance.now() - placeStart; placed = n;
      for (let i = 0; i < vents.length; i++) lights[n++] = vents[i]!;
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
        lights[n++] = { x: at.x, y: at.y, z: at.z, radius: 8, strength: blinkOn ? 1.4 : 0.3, reserved: true, ...MARKER_COLOR };
      }
      // The piloted cockpit's own soft instrument light.
      const inst = seated ? INSTRUMENT[seated.hull] : undefined;
      if (inst && hull) {
        const at = Vector3.TransformCoordinates(new Vector3(inst.at.x, inst.at.y, inst.at.z), hull.computeWorldMatrix(true));
        lights[n++] = { x: at.x, y: at.y, z: at.z, radius: inst.radius, strength: 0.2, reserved: true, noHalo: true, r: 0.78, g: 0.92, b: 1 };
      }
      const selectStart = performance.now();
      lights.length = n;
      considered = n;
      const chosen = selectLights(lights, eye);
      // What reaches the screen: the oldest position among the sent moving lights.
      for (let i = 0; i < chosen.length; i++) {
        const st = (chosen[i] as { stamp?: number }).stamp;
        if (st !== undefined) sentLag = Math.max(sentLag, frameNo - st);
      }
      selectMs = performance.now() - selectStart;
      sent = chosen.length;
      send(lightUniforms(chosen), 1 - 0.9 * daylight);
    },
    dispose() {
      scene.onNewMeshAddedObservable.remove(added);
      scene.onMeshRemovedObservable.remove(removed);
      for (const m of markers.values()) if (!m.isDisposed()) m.dispose();
      if (!ventArt.isDisposed()) ventArt.dispose();
      entries.clear(); list.length = 0; pending.clear(); byGeometry.clear(); cacheBytes = 0;
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
