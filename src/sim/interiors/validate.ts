// FORK(interior-swim-speed): sim/step.ts's ordinary swim speed (3.4 m/s) and jump (5.4 m/s under 13 m/s²) as constants
// here; retire in ENV-1 stage 2 once step exports them (CW-1 owns step.ts until it merges). tests/interiors-swim.test.ts
// measures the real step against both.
/** ENV-1: the interior validator. It proves, from the sim's own rules, that a
 * definition is a safe place to explore:
 * - **static checks:** templates, collision classes, portals kept clear, exits,
 *   captions, lights, hosts, and nothing heaped;
 * - **configuration space:** a lattice of diver poses (the 0.95 m swim capsule,
 *   or the 1.75 m walking capsule on dry floors), joined only where the world's
 *   own capsule move gets from one pose to the next. Moves are directed, so a
 *   drop with no way back is a trap;
 * - **ways out by crossing:** a portal is a way out only where a capsule of the
 *   right shape actually moves through it to the far side;
 * - **each first visit as a round trip:** from where the diver starts (the
 *   parked craft's real exit pose, or a proven shore or surface origin) to the
 *   interior and back to where they're safe (a boardable pose beside the craft,
 *   the origin, or a clear rise to the surface). Every room lies on that trip.
 *   Every pose reachable from the start or from any doorway, inside the shell or
 *   outside it, must get back: a dead end is a trap wherever it is;
 * - **the air proof, per first visit:** the one craft that route brings, parked
 *   at one staging with its hull in the world, the save's suit and the active air
 *   rooms. Every pose on the trip is covered (the craft's basic air line at the
 *   reserve charge, an air room, the open air) or lies within a timed return that
 *   keeps EXPEDITION_INTEGRATION's 25% reserve. The craft must also approach its
 *   parking, let the diver out (the sim's exit rule) and take them back aboard
 *   (the sim's boarding rule).
 *
 * It answers with problems, never throws on a bad definition. */
import { AIR_ROOM_LIST, type AirRoom } from "../../content/airRooms.js";
import { boxesMeet, interiorBounds, placementBox, portalWorld, toWorld } from "../../content/interiors/geometry.js";
import { FLAT_PROP, isTemplate, SMALL_PROP, TEMPLATES, type TemplateId } from "../../content/interiors/templates.js";
import { MAX_INTERIOR_LIGHTS, OUTSIDE, type FirstAccess, type InteriorDef, type InteriorStaging } from "../../content/interiors/types.js";
import { CRAFT_PROFILES } from "../../content/regions/passages.js";
import { BERTH_ENVELOPES, EVIDENCE, HULL_COLLIDERS } from "../../content/registry.js";
import { PLACED_HOSTS } from "../../content/story/placements.js";
import { CB_LOST_SITES } from "../../content/systems/lostSites.js";
import type { Aabb, Rect } from "../../world/types.js";
import { airRoomActive, airRoomAt } from "../airRooms.js";
import { personalDepth, personalLimit } from "../capabilities.js";
import { vehicleProfile } from "../fittings.js";
import { airLineSupply, type AirLineCraft } from "../power/airline.js";
import { SUIT_OXYGEN_DRAIN_PER_SECOND } from "../survival.js";
import type { Capsule, GameState, Vec3, WorldQueries } from "../types.js";
import { board, exit, exitBlock } from "../vehicles.js";
import { AUTHORED_CAVE_SOURCES } from "../../content/regions/caves.js";
import { CANOPY_BASIN_GROUPS } from "../../content/regions/caves/index.js";
import { interiorBoxes, interiorWorld, type IdBox, type InteriorExterior } from "./world.js";

export type ProblemCode =
  | "id" | "template" | "class" | "portal" | "exits" | "caption" | "lights" | "heap" | "host" | "staging"
  | "room" | "trap" | "air" | "depth" | "headroom" | "approach" | "exit" | "board" | "scenario" | "visual" | "origin" | "exterior";
export interface Problem { readonly code: ProblemCode; readonly message: string; readonly at?: Vec3 }

/** Lattice pitch, metres (the cave collision voxel). */
export const LATTICE = 0.5;
/** Lattice margin around portals and the staging's way in, metres. */
export const MARGIN = 2;
export const SWIM: Capsule = { ...CRAFT_PROFILES.diver };
export const WALK: Capsule = { radius: 0.34, height: 1.75 };
export const ORDINARY_SWIM_SPEED = 3.4;
/** The highest step a walker climbs by jumping, metres (the step's jump reaches 1.12 m; see the FORK above). */
export const JUMP = 1;
/** Oxygen and power left on return (EXPEDITION_INTEGRATION's 25% reserve). */
export const RESERVE = 0.25;
/** The craft's charge, percent, assumed while it feeds the line: the reserve. */
export const LINE_CHARGE = 25;
/** The suit's full supply, seconds. */
export const SUIT_SECONDS = 100 / SUIT_OXYGEN_DRAIN_PER_SECOND;
/** The longest out-and-back an uncovered pose may need, path metres. */
export const RETURN_BUDGET_M = (1 - RESERVE) * SUIT_SECONDS * ORDINARY_SWIM_SPEED;
/** How far above a host's resting point it is sighted from, metres. */
const HOST_SIGHT = 0.15;
/** Within this of a portal's plane (along its normal), a pose is at the portal. */
const PORTAL_SLAB = 1;

/** One route's first visit with the state it is played from. */
export interface ResolvedAccess { readonly access: FirstAccess; readonly state: GameState }
export interface ValidationInput {
  readonly def: InteriorDef;
  /** The world around the interior: terrain and box solids (`world.ts`' contract). */
  readonly exterior: InteriorExterior;
  readonly scenarios: readonly ResolvedAccess[];
  /** The air-room table (fixtures pass their own). */
  readonly airRooms?: readonly AirRoom[];
}

// --- Static checks -----------------------------------------------------------

function hostPosition(h: InteriorDef["hosts"][number]): Vec3 | null {
  if (h.kind === "evidence") return Object.hasOwn(EVIDENCE, h.id) ? EVIDENCE[h.id as keyof typeof EVIDENCE].position : null;
  if (h.kind === "story") return Object.hasOwn(PLACED_HOSTS, h.id) ? PLACED_HOSTS[h.id as keyof typeof PLACED_HOSTS] : null;
  return Object.hasOwn(CB_LOST_SITES, h.id) ? CB_LOST_SITES[h.id as keyof typeof CB_LOST_SITES].position : null;
}

export function staticProblems(def: InteriorDef): Problem[] {
  const out: Problem[] = [], rooms = new Set([...def.rooms.map((r) => r.id), OUTSIDE]);
  const ids = [...def.rooms, ...def.portals, ...def.shell, ...def.dressing, ...def.staging, ...def.lights, ...def.sounds].map((x) => x.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) out.push({ code: "id", message: `duplicate id ${id}` });
  for (const p of def.dressing) {
    if (!isTemplate(p.template)) { out.push({ code: "template", message: `${p.id}: unknown template ${p.template}` }); continue; }
    if (p.stack && !def.stacks.some((s) => s.id === p.stack)) out.push({ code: "heap", message: `${p.id}: undeclared stack ${p.stack}` });
  }
  for (const [id, spec] of Object.entries(TEMPLATES)) {
    const [x, y, z] = spec.size;
    if (spec.collision === "small" && Math.max(x, y, z) >= SMALL_PROP) out.push({ code: "class", message: `template ${id}: "small" needs every side under ${SMALL_PROP} m` });
    if (spec.collision === "flat" && Math.min(x, y, z) > FLAT_PROP) out.push({ code: "class", message: `template ${id}: "flat" needs a side of at most ${FLAT_PROP} m` });
  }
  const placed = def.dressing.filter((p) => isTemplate(p.template));
  const solid: IdBox[] = interiorBoxes({ ...def, dressing: placed });
  for (const portal of def.portals) {
    for (const r of portal.between) if (!rooms.has(r)) out.push({ code: "portal", message: `${portal.id}: unknown room ${r}` });
    if (!portal.admits.includes("diver") && portal.kind !== "window") out.push({ code: "portal", message: `${portal.id}: only a window may be daylight-only; this portal must admit the diver` });
    const { box } = portalWorld(def, portal);
    const blocker = solid.find((b) => boxesMeet(box, b, 1e-6));
    if (blocker) out.push({ code: "portal", message: `${portal.id}: ${blocker.id} stands in its clear rectangle`, at: portalWorld(def, portal).center });
  }
  for (const s of def.sounds) if (!s.caption.trim()) out.push({ code: "caption", message: `${s.id}: a sound tell needs a caption` });
  if (def.lights.length > MAX_INTERIOR_LIGHTS) out.push({ code: "lights", message: `${def.lights.length} emissive clusters; at most ${MAX_INTERIOR_LIGHTS}` });
  for (const l of def.lights) if (!rooms.has(l.room)) out.push({ code: "lights", message: `${l.id}: unknown room ${l.room}` });
  for (const p of placed) if ((TEMPLATES[p.template as TemplateId] as { emissive?: true }).emissive &&
    !def.lights.some((l) => Math.hypot(l.at.x - p.at.x, l.at.y - p.at.y, l.at.z - p.at.z) < 1)) out.push({ code: "lights", message: `${p.id}: emissive art with no declared light` });
  for (const h of def.hosts) if (!hostPosition(h)) out.push({ code: "host", message: `unknown ${h.kind} host ${h.id}` });
  for (const a of def.firstAccess) {
    if ((a.craft === null) !== (a.staging === null)) out.push({ code: "scenario", message: `${a.route}@${a.milestone}: a craft needs a staging and a staging needs a craft` });
    if (a.staging && !def.staging.some((s) => s.id === a.staging)) out.push({ code: "scenario", message: `${a.route}@${a.milestone}: unknown staging ${a.staging}` });
  }
  out.push(...heapProblems(def));
  return out;
}

/** Nothing heaped: belongings touch only inside one declared stack, and a
 * stack is neat: each member rests on the floor or squarely on one below. */
function heapProblems(def: InteriorDef): Problem[] {
  const out: Problem[] = [], tol = 0.01;
  const belongings = def.dressing.filter((p) => isTemplate(p.template) && (TEMPLATES[p.template as TemplateId] as { belonging?: true }).belonging);
  const boxes = belongings.map((p) => placementBox(def, p));
  for (let i = 0; i < belongings.length; i++) for (let j = i + 1; j < belongings.length; j++) {
    const a = belongings[i]!, b = belongings[j]!;
    if (!boxesMeet(grow(boxes[i]!, tol), boxes[j]!)) continue;
    if (!a.stack || a.stack !== b.stack) out.push({ code: "heap", message: `${a.id} and ${b.id} touch outside one stack: belongings are never heaped`, at: toWorld(def, a.at) });
  }
  const solids = interiorBoxes(def);
  for (const [i, p] of belongings.entries()) {
    if (!p.stack) continue;
    const b = boxes[i]!, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const onSomething = Math.abs(p.at.y) < 0.02 || solids.some((s) => !s.id.endsWith(`.${p.id}`) && Math.abs(s.max.y - b.min.y) < 0.02 &&
      s.min.x <= cx && cx <= s.max.x && s.min.z <= cz && cz <= s.max.z);
    if (!onSomething) out.push({ code: "heap", message: `${p.id}: a stacked belonging rests squarely on the floor or on the one below`, at: toWorld(def, p.at) });
  }
  return out;
}
const grow = (b: Aabb, d: number): Aabb => ({ min: { x: b.min.x - d, y: b.min.y - d, z: b.min.z - d }, max: { x: b.max.x + d, y: b.max.y + d, z: b.max.z + d } });

// --- Configuration space -----------------------------------------------------

export interface PoseGraph {
  readonly poses: Vec3[];
  readonly walking: boolean[];
  /** Directed edges, CSR: `next[first[i] .. first[i + 1])`. */
  readonly first: Int32Array;
  readonly next: Int32Array;
  readonly problems: Problem[];
}

/** The lattice of diver poses in `box` and the capsule moves between them. */
export function poseGraph(world: WorldQueries, regions: readonly Aabb[], state: Readonly<GameState>, airRooms: readonly AirRoom[], floors: readonly Aabb[]): PoseGraph {
  const box = union(regions);
  const nx = Math.floor((box.max.x - box.min.x) / LATTICE) + 1, ny = Math.floor((box.max.y - box.min.y) / LATTICE) + 1;
  const nz = Math.floor((box.max.z - box.min.z) / LATTICE) + 1, water = world.waterHeight;
  const poses: Vec3[] = [], walking: boolean[] = [], cell = new Int32Array(nx * ny * nz).fill(-1), problems: Problem[] = [];
  const at = (i: number, j: number, k: number): Vec3 => ({ x: box.min.x + i * LATTICE, y: box.min.y + j * LATTICE, z: box.min.z + k * LATTICE });
  const inside = (p: Vec3, b: Aabb): boolean => p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
  let headroom = 0, headroomAt: Vec3 | undefined;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = at(i, j, k);
    if (!regions.some((r) => inside(p, r))) continue;
    const support = world.supportHeight(p.x, p.z, p.y + LATTICE / 2);
    const onFloor = support > -Infinity && Math.abs(support - p.y) <= LATTICE / 2;
    const foot = { x: p.x, y: onFloor ? support : p.y, z: p.z };
    // The step's mode rule: walking on support at or above the water's edge, or in a dry room.
    const dry = onFloor && (support >= water - 0.55 || airRoomAt(state, foot, airRooms) !== null);
    if (dry) {
      if (world.clearance(foot, WALK)) { cell[i + nx * (j + ny * k)] = poses.length; poses.push(foot); walking.push(true); }
      // Too low to stand, on a floor the building means you to stand on (not a shelf's top).
      else if (world.clearance(foot, SWIM) && floors.some((f) => Math.abs(f.max.y - foot.y) < 0.02 && foot.x >= f.min.x && foot.x <= f.max.x && foot.z >= f.min.z && foot.z <= f.max.z)) {
        headroom++; headroomAt ??= foot;
      }
      continue;
    }
    if (p.y > water - 0.5 || airRoomAt(state, p, airRooms) !== null) continue;
    if (world.clearance(p, SWIM)) { cell[i + nx * (j + ny * k)] = poses.length; poses.push(p); walking.push(false); }
  }
  // Walking poses by lattice column, for jumps and drops between floors.
  const columns = new Map<number, number[]>();
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = cell[i + nx * (j + ny * k)]!;
    if (c >= 0 && walking[c]) { const key = i + nx * k; (columns.get(key) ?? columns.set(key, []).get(key)!).push(c); }
  }
  if (headroom) problems.push({ code: "headroom", message: `${headroom} dry floor poses fit a swimmer but not a walker (1.75 m)`, ...(headroomAt ? { at: headroomAt } : {}) });
  const first = new Int32Array(poses.length + 1), next: number[] = [];
  const steps: readonly [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = cell[i + nx * (j + ny * k)]!;
    if (a < 0) continue;
    first[a] = next.length;
    for (const [di, dj, dk] of steps) {
      const ii = i + di, jj = j + dj, kk = k + dk;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
      const b = cell[ii + nx * (jj + ny * kk)]!;
      if (b < 0) continue;
      const ok = walking[a] === walking[b] ? reachable(world, poses[a]!, poses[b]!, walking[a]!) : stepAcross(world, poses[a]!, poses[b]!, SWIM);
      if (!ok) continue;
      next.push(b);
    }
    // A walker also jumps up onto, or drops down to, a floor in the next column.
    if (walking[a]) for (const [di, , dk] of steps) {
      if (di === 0 && dk === 0) continue;
      const col = columns.get((i + di) + nx * (k + dk));
      if (!col) continue;
      const y = poses[a]!.y, up = col.filter((b) => poses[b]!.y > y + LATTICE && poses[b]!.y <= y + JUMP);
      const below = col.filter((b) => poses[b]!.y < y - LATTICE).sort((p, q) => poses[q]!.y - poses[p]!.y).slice(0, 1);
      for (const b of [...up, ...below]) if (stepAcross(world, poses[a]!, poses[b]!, WALK)) next.push(b);
    }
  }
  // Rows are filled in lattice order, the order poses were pushed in, so the CSR is in pose order.
  first[poses.length] = next.length;
  return { poses, walking, first, next: Int32Array.from(next), problems };
}

/** From a to b by rising (or staying) to the higher of the two, crossing, then
 * settling: a walker's jump up or drop down to the next floor, and a swimmer
 * climbing out onto a dry floor or slipping back into the water. */
function stepAcross(world: WorldQueries, a: Vec3, b: Vec3, shape: Capsule): boolean {
  const at = (m: { position: Vec3 }, p: Vec3): boolean => Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z) < 0.02;
  const top = Math.max(a.y, b.y) + 0.02, near = (m: { position: Vec3; hitSolid: boolean }, p: Vec3): boolean => !m.hitSolid && at(m, p);
  const lift = { x: a.x, y: top, z: a.z }, over = { x: b.x, y: top, z: b.z };
  return near(world.moveCapsule(a, { x: 0, y: top - a.y, z: 0 }, shape), lift) &&
    near(world.moveCapsule(lift, { x: b.x - a.x, y: 0, z: b.z - a.z }, shape), over) &&
    // Settling ends on b's floor, so touching it there is the landing, not a block.
    at(world.moveCapsule(over, { x: 0, y: b.y - top, z: 0 }, shape), b);
}

/** The world's own capsule move gets from a to b. */
function reachable(world: WorldQueries, a: Vec3, b: Vec3, walk: boolean): boolean {
  if (walk) {
    // A walker steps across, up to half a lattice up or down.
    if (Math.abs(b.y - a.y) > LATTICE) return false;
    const top = Math.max(a.y, b.y) + 0.02;
    const m = world.moveCapsule({ x: a.x, y: top, z: a.z }, { x: b.x - a.x, y: 0, z: b.z - a.z }, WALK);
    return !m.hitSolid && Math.hypot(m.position.x - b.x, m.position.z - b.z) < 0.02 && world.clearance({ x: a.x, y: top, z: a.z }, WALK);
  }
  const m = world.moveCapsule(a, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, SWIM);
  return !m.hitSolid && Math.hypot(m.position.x - b.x, m.position.y - b.y, m.position.z - b.z) < 0.02;
}

/** Breadth-first set from `seeds`, forward or along reversed edges. */
function spread(g: PoseGraph, seeds: Iterable<number>, reverse: Int32Array[] | null): Uint8Array {
  const seen = new Uint8Array(g.poses.length), queue: number[] = [];
  for (const s of seeds) if (!seen[s]) { seen[s] = 1; queue.push(s); }
  for (let q = 0; q < queue.length; q++) {
    const a = queue[q]!;
    const out = reverse ? reverse[a]! : g.next.subarray(g.first[a]!, g.first[a + 1]!);
    for (const b of out) if (!seen[b]) { seen[b] = 1; queue.push(b); }
  }
  return seen;
}
function reversed(g: PoseGraph): Int32Array[] {
  const lists: number[][] = g.poses.map(() => []);
  for (let a = 0; a < g.poses.length; a++) for (let e = g.first[a]!; e < g.first[a + 1]!; e++) lists[g.next[e]!]!.push(a);
  return lists.map((l) => Int32Array.from(l));
}
/** Shortest path metres from `start` (pose → initial metres), forward or reversed. */
function distances(g: PoseGraph, start: Map<number, number>, reverse: Int32Array[] | null): Float64Array {
  const d = new Float64Array(g.poses.length).fill(Infinity);
  // Unit edges plus fractional starts: a bucketed Dijkstra over sorted starts is exact here.
  const order = [...start.entries()].sort((a, b) => a[1] - b[1]);
  const heap: [number, number][] = [];
  const push = (n: number, m: number): void => {
    heap.push([m, n]);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p]![0] <= heap[i]![0]) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i]!, heap[m]!]; i = m;
      }
    }
    return top;
  };
  for (const [n, m] of order) if (m < d[n]!) { d[n] = m; push(n, m); }
  while (heap.length) {
    const [m, a] = pop();
    if (m > d[a]!) continue;
    const out = reverse ? reverse[a]! : g.next.subarray(g.first[a]!, g.first[a + 1]!);
    for (const b of out) { const c = m + LATTICE; if (c < d[b]!) { d[b] = c; push(b, c); } }
  }
  return d;
}

// --- The whole validation ----------------------------------------------------

/** A way out: a portal to OUTSIDE the diver fits through, other than a sump (which leads on into a cave). */
const isWayOut = (p: InteriorDef["portals"][number]): boolean => p.between.includes(OUTSIDE) && p.kind !== "sump" && p.admits.includes("diver");

/** Poses that actually get out through each way out: a pose on the inner side,
 * at the aperture, whose own capsule (swimming or walking) moves along the
 * portal's normal until its whole shape is past the plane, without touching
 * anything. A pose merely standing by an impassable door is not out. */
function crossings(def: InteriorDef, world: WorldQueries, g: PoseGraph): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const portal of def.portals.filter(isWayOut)) {
    const w = portalWorld(def, portal), n = w.normal, ax = Math.abs(n.x) > 0.5 ? "x" : Math.abs(n.y) > 0.5 ? "y" : "z";
    const hit: number[] = [];
    g.poses.forEach((p, i) => {
      const d = (p.x - w.center.x) * n.x + (p.y - w.center.y) * n.y + (p.z - w.center.z) * n.z;
      if (d >= 0 || d < -PORTAL_SLAB) return;
      if (!(["x", "y", "z"] as const).every((k) => k === ax || (p[k] >= w.box.min[k] - LATTICE && p[k] <= w.box.max[k] + LATTICE))) return;
      // A walker doesn't climb out through a hatch overhead, and nobody leaves down through the floor.
      if (ax === "y" && (g.walking[i] || n.y < 0)) return;
      const shape = g.walking[i] ? WALK : SWIM;
      // Past the plane: the datum clears an up-facing aperture; a side aperture by the capsule's radius.
      const go = ax === "y" ? -d + 0.05 : -d + shape.radius + 0.1;
      const target = { x: p.x + n.x * go, y: p.y + n.y * go, z: p.z + n.z * go };
      const m = world.moveCapsule(p, { x: target.x - p.x, y: target.y - p.y, z: target.z - p.z }, shape);
      if (!m.hitSolid && Math.hypot(m.position.x - target.x, m.position.y - target.y, m.position.z - target.z) < 0.02) hit.push(i);
    });
    out.set(portal.id, hit);
  }
  return out;
}

/** Where the lattice is laid: each room, the water around each portal, each
 * staging (hull, exit pose and the water just above) and each craftless origin,
 * with the stretch between it and the nearest way in. Not the whole bounding
 * box: a long interior would pay for water nobody crosses. */
function graphRegions(def: InteriorDef): Aabb[] {
  const room = def.rooms.map((r) => grow(boxOf(toWorld(def, r.bounds.min), toWorld(def, r.bounds.max)), LATTICE));
  const ways = def.portals.map((p) => grow(portalWorld(def, p).box, MARGIN + PORTAL_SLAB));
  const toNearest = (k: Vec3): Aabb[] => {
    const nearest = def.portals.filter(isWayOut).map((p) => portalWorld(def, p).center)
      .sort((p, q) => Math.hypot(p.x - k.x, p.y - k.y, p.z - k.z) - Math.hypot(q.x - k.x, q.y - k.y, q.z - k.z))[0];
    return nearest ? [grow(boxOf(k, nearest), MARGIN)] : [];
  };
  const staging = def.staging.flatMap((s) => {
    const k = toWorld(def, s.position), r = Math.max(s.radius, 4);
    return [boxOf({ x: k.x - r, y: k.y - MARGIN, z: k.z - r }, { x: k.x + r, y: k.y + 5, z: k.z + r }), ...toNearest(k)];
  });
  const origins = def.firstAccess.flatMap((a) => {
    if (!a.origin) return [];
    const o = toWorld(def, a.origin);
    return [grow(boxOf(o, o), MARGIN), ...toNearest(o)];
  });
  return [...room, ...ways, ...staging, ...origins];
}
const boxOf = (a: Vec3, b: Vec3): Aabb => ({ min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
  max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) } });
const union = (boxes: readonly Aabb[]): Aabb => ({
  min: { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)), z: Math.min(...boxes.map((b) => b.min.z)) },
  max: { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)), z: Math.max(...boxes.map((b) => b.max.z)) },
});
/** The area terrain joins the sweep over: every region, and every staging's approach column. */
function sweepArea(def: InteriorDef, regions: readonly Aabb[]): Rect {
  const b = union([...regions, ...def.staging.map((s) => grow(boxOf(toWorld(def, s.approach), toWorld(def, s.position)), 5))]);
  return { minX: b.min.x - MARGIN, maxX: b.max.x + MARGIN, minZ: b.min.z - MARGIN, maxZ: b.max.z + MARGIN };
}

/** The parked hull as an obstacle: its authored bounds (`BERTH_ENVELOPES`: the
 * drawn hull, bow along local -Z), turned to the parking heading. The piloting
 * proxy is wider than the art, and the sim lets a diver out inside it. */
function hullBox(def: InteriorDef, staging: InteriorStaging, hull: keyof typeof HULL_COLLIDERS): IdBox {
  const k = toWorld(def, staging.position), yaw = staging.yaw + def.quarter * Math.PI / 2;
  const env = (BERTH_ENVELOPES as Partial<Record<string, { halfWidth: number; halfLength: number; height: number }>>)[hull];
  const c = HULL_COLLIDERS[hull], bottom = "bottom" in c ? c.bottom : 0;
  const hw = env?.halfWidth ?? c.radius, hl = env?.halfLength ?? c.radius, h = env?.height ?? c.height;
  const ex = Math.abs(Math.cos(yaw)) * hw + Math.abs(Math.sin(yaw)) * hl, ez = Math.abs(Math.sin(yaw)) * hw + Math.abs(Math.cos(yaw)) * hl;
  return { id: `${def.id}.parked.${hull}`, min: { x: k.x - ex, y: k.y + bottom, z: k.z - ez }, max: { x: k.x + ex, y: k.y + h, z: k.z + ez } };
}

/** A state with the scenario's craft parked at the staging, piloted. */
function parked(state: GameState, def: InteriorDef, staging: InteriorStaging, vehicleId: string): GameState {
  const s = structuredClone(state), v = s.fleet.vehicles.find((x) => x.id === vehicleId)!;
  v.pose = { frame: "world", position: toWorld(def, staging.position), yaw: staging.yaw + def.quarter * Math.PI / 2, pitch: 0 };
  v.velocity = { x: 0, y: 0, z: 0 }; v.berth = null; v.disabled = false; v.charge = Math.max(v.charge, LINE_CHARGE);
  s.player.controlledVehicleId = v.id; s.player.interiorId = null; s.player.interiorPose = null; s.player.mode = "piloting";
  s.player.pose = { frame: "world", position: { ...v.pose.position }, yaw: v.pose.yaw, pitch: 0 };
  return s;
}

/** Each declared first visit with the state it is played from: `pick` returns
 * the route's milestone state (a SAVE-1 library save, or a test's stand-in). */
export function resolveAccess(def: InteriorDef, pick: (kind: string) => GameState): ResolvedAccess[] {
  return def.firstAccess.map((access) => ({ access, state: pick(`${access.route}@${access.milestone}`) }));
}

/** Cave footprints: ground the exterior contract can't represent until stage 2 composes the game's world. */
const CAVE_FOOTPRINTS: readonly Rect[] = [...AUTHORED_CAVE_SOURCES, ...CANOPY_BASIN_GROUPS.map((g) => g.source)].map((c) => c.footprint);

/** Everything wrong with an interior, static and per first visit. */
export function validateInterior(input: ValidationInput): Problem[] {
  const { def, exterior } = input, airRooms = input.airRooms ?? AIR_ROOM_LIST;
  const out = staticProblems(def);
  if (out.some((p) => p.code === "template")) return out;
  const regions = graphRegions(def), area = sweepArea(def, regions);
  const floors = def.shell.filter((p) => p.module === "floor").map((p) => boxOf(toWorld(def, p.min), toWorld(def, p.max)));
  for (const f of CAVE_FOOTPRINTS) if (f.minX < area.maxX && f.maxX > area.minX && f.minZ < area.maxZ && f.maxZ > area.minZ)
    out.push({ code: "exterior", message: `${def.id}: a cave owns ground the validator samples; its exterior (terrain and box solids) can't represent a cave until stage 2` });
  // One graph per distinct (craft, staging or origin, suit, dry rooms): first visits that share them share it.
  const done = new Set<string>();
  for (const sc of input.scenarios) {
    const { access, state } = sc, tag = `${access.route}@${access.milestone}`;
    const staging = access.staging ? def.staging.find((s) => s.id === access.staging) ?? null : null;
    const vehicle = access.craft ? state.fleet.vehicles.find((v) => v.hull === access.craft && !v.disabled) ?? null : null;
    if (access.craft && !vehicle) { out.push({ code: "scenario", message: `${tag}: the route has no working ${access.craft} here` }); continue; }
    if (!access.craft && !access.origin) { out.push({ code: "origin", message: `${tag}: a visit without a craft needs a shore or surface origin` }); continue; }
    const active = airRooms.filter((r) => airRoomActive(state, r)).map((r) => r.id).join(",");
    const key = `${access.craft}|${access.staging}|${JSON.stringify(access.origin ?? null)}|${personalLimit(state)}|${active}`;
    if (done.has(key)) continue;
    done.add(key);
    out.push(...scenarioProblems(def, exterior, regions, area, floors, sc, staging, vehicle?.id ?? null, airRooms, tag));
  }
  return out;
}

function scenarioProblems(def: InteriorDef, exterior: InteriorExterior, regions: readonly Aabb[], area: Rect, floors: readonly Aabb[], sc: ResolvedAccess,
  staging: InteriorStaging | null, vehicleId: string | null, airRooms: readonly AirRoom[], tag: string): Problem[] {
  const out: Problem[] = [], state = sc.state;
  const vehicle = vehicleId ? state.fleet.vehicles.find((v) => v.id === vehicleId)! : null;
  const plain = interiorWorld(def, exterior, area);
  const world = vehicle && staging ? interiorWorld(def, exterior, area, [hullBox(def, staging, vehicle.hull)]) : plain;
  const g = poseGraph(world, regions, state, airRooms, floors), water = world.waterHeight;
  out.push(...g.problems.map((p) => ({ ...p, message: `${tag}: ${p.message}` })));
  const nearest = (p: Vec3): number => {
    let best = -1, bd = Infinity;
    g.poses.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); if (d < bd) { bd = d; best = i; } });
    return bd <= LATTICE * 1.5 ? best : -1;
  };
  const rev = reversed(g);
  // Ways out, by an actual crossing.
  const ways = def.portals.filter(isWayOut), cross = crossings(def, world, g);
  for (const [id, poses] of cross) if (!poses.length) out.push({ code: "exits", message: `${tag}: no capsule gets out through ${id}` });
  if (ways.length < 2) {
    if (!ways.length) out.push({ code: "exits", message: `${def.id}: no way out` });
    else for (const r of def.rooms) {
      const c = toWorld(def, { x: (r.bounds.min.x + r.bounds.max.x) / 2, y: r.bounds.min.y + 1, z: (r.bounds.min.z + r.bounds.max.z) / 2 });
      if (!world.lineOfSight(c, portalWorld(def, ways[0]!).center)) out.push({ code: "exits", message: `${def.id}: one way out, not visible from ${r.id}` });
    }
  }
  // A clear straight rise to the surface: open air, attached by a checked move.
  const rises = (i: number): boolean => {
    if (g.walking[i]) return false;
    const p = g.poses[i]!, rise = water - 0.85 - p.y;
    if (rise <= 0) return true;
    const m = world.moveCapsule(p, { x: 0, y: rise, z: 0 }, SWIM);
    return !m.hitSolid && Math.abs(m.position.y - (p.y + rise)) < 0.02;
  };
  // Where the trip starts, and where the diver is safe again.
  let start = -1;
  const home: number[] = [];
  if (vehicle && staging) {
    const keel = toWorld(def, staging.position), from = toWorld(def, staging.approach), c = HULL_COLLIDERS[vehicle.hull];
    const m = plain.moveCapsule(from, { x: keel.x - from.x, y: keel.y - from.y, z: keel.z - from.z }, { ...c });
    if (Math.hypot(m.position.x - keel.x, m.position.y - keel.y, m.position.z - keel.z) > 0.1)
      out.push({ code: "approach", message: `${tag}: the ${vehicle.hull} can't reach ${staging.id} from its approach`, at: m.position });
    // The sim's own exit rule: a suit too shallow for the parking depth keeps the diver aboard (a depth problem).
    const s = parked(state, def, staging, vehicle.id), refused = exitBlock(s, plain), why = refused ? refused.message : exit(s, plain);
    if (why) out.push({ code: refused?.code === "depth" ? "depth" : "exit", message: `${tag}: leaving the ${vehicle.hull} at ${staging.id}: ${why}`, at: keel });
    else {
      // The exit pose joins the lattice by a checked move to its nearest pose.
      const p = s.player.pose.position, e = nearest(p);
      let joined = false;
      if (e >= 0) {
        const q = g.poses[e]!, mv = world.moveCapsule(p, { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z }, SWIM);
        joined = !mv.hitSolid && Math.hypot(mv.position.x - q.x, mv.position.y - q.y, mv.position.z - q.z) < 0.02;
      }
      if (!joined) out.push({ code: "exit", message: `${tag}: the ${vehicle.hull}'s exit pose doesn't join the diver lattice`, at: p });
      else start = e;
    }
    // Home: poses that pass the sim's boarding rule beside the craft.
    const near = g.poses.map((p, i) => ({ i, d: Math.hypot(p.x - keel.x, p.y - keel.y, p.z - keel.z) })).filter((x) => x.d < 8).sort((a, b) => a.d - b.d).slice(0, 200);
    for (const { i } of near) {
      const b = parked(state, def, staging, vehicle.id);
      b.player.controlledVehicleId = null; b.player.mode = "swimming"; b.player.pose = { frame: "world", position: { ...g.poses[i]! }, yaw: 0, pitch: 0 };
      if (board(b, vehicle.id) === null) home.push(i);
    }
    if (!home.length) out.push({ code: "board", message: `${tag}: no pose lets the diver board the ${vehicle.hull} at ${staging.id}`, at: keel });
  } else {
    const o = toWorld(def, sc.access.origin!), i = nearest(o);
    if (i < 0) out.push({ code: "origin", message: `${tag}: the origin is not a diver pose`, at: o });
    else if (!g.walking[i] && !rises(i)) out.push({ code: "origin", message: `${tag}: a water origin needs a clear rise to the surface`, at: o });
    else { start = i; home.push(i); }
  }
  // Craftless swimmers are also safe at any clear rise to the surface.
  if (!vehicle) g.poses.forEach((_, i) => { if (i !== start && !g.walking[i] && rises(i)) home.push(i); });
  if (start < 0) return out;
  const trip = spread(g, [start], null), back = spread(g, home, rev);
  // Traps: anything reachable from the start or from any doorway, inside the shell or out, that can't get home.
  const entries = spread(g, [...cross.values()].flat(), null);
  let traps = 0, trapAt: Vec3 | undefined;
  g.poses.forEach((p, i) => { if ((trip[i] || entries[i]) && !back[i]) { traps++; trapAt ??= p; } });
  if (traps) out.push({ code: "trap", message: `${tag}: ${traps} reachable poses have no way back to ${vehicle ? "the craft" : "the origin or the surface"}`, ...(trapAt ? { at: trapAt } : {}) });
  const onTrip = (i: number): boolean => trip[i] === 1 && back[i] === 1;
  for (const r of def.rooms) {
    const wb = boxOf(toWorld(def, r.bounds.min), toWorld(def, r.bounds.max));
    if (!g.poses.some((p, i) => onTrip(i) && p.x >= wb.min.x && p.x <= wb.max.x && p.y >= wb.min.y && p.y <= wb.max.y && p.z >= wb.min.z && p.z <= wb.max.z))
      out.push({ code: "room", message: `${tag}: ${r.id} is not on a round trip from ${vehicle ? `the ${vehicle.hull}` : "the origin"}` });
  }
  // Air: covered poses, then the round trip from coverage for the rest.
  const crafts: AirLineCraft[] = vehicle && staging ? [{
    id: vehicle.id, profile: { ...vehicleProfile(state, vehicle), airLine: "basic" }, position: toWorld(def, staging.position),
    speed: 0, charge: LINE_CHARGE, disabled: false, emergencyAir: 0, berthed: false,
  }] : [];
  const air = new Map<number, number>();
  g.poses.forEach((p, i) => {
    const airway = p.y + (g.walking[i] ? 1.55 : 0.85);
    if (airway >= water || airRoomAt(state, p, airRooms) || (!g.walking[i] && crafts.length && airLineSupply(p, crafts))) air.set(i, 0);
  });
  // The open surface: a swimmer outside the building rises straight up to air.
  const foot = interiorBounds(def), columns = new Map<string, number>();
  g.poses.forEach((p, i) => {
    if (g.walking[i] || (p.x >= foot.min.x && p.x <= foot.max.x && p.z >= foot.min.z && p.z <= foot.max.z)) return;
    const key = `${p.x},${p.z}`, j = columns.get(key);
    if (j === undefined || g.poses[j]!.y < p.y) columns.set(key, i);
  });
  for (const i of columns.values()) if (!air.has(i) && rises(i)) air.set(i, Math.max(0, water - 0.85 - g.poses[i]!.y));
  const dOut = distances(g, air, null), dBack = distances(g, air, rev);
  let short = 0, worst = 0, worstAt: Vec3 | undefined, deep = 0, deepAt: Vec3 | undefined;
  const limit = personalLimit(state);
  trip.forEach((r, i) => {
    if (!r) return;
    const t = dOut[i]! + dBack[i]!;
    if (t > RETURN_BUDGET_M) { short++; if (t > worst) { worst = t; worstAt = g.poses[i]; } }
    if (personalDepth(g.poses[i]!) > limit) { deep++; deepAt ??= g.poses[i]; }
  });
  if (short) out.push({ code: "air", message: `${tag}: ${short} reachable poses are beyond air: neither covered nor within a ${RETURN_BUDGET_M.toFixed(0)} m round trip (worst ${Number.isFinite(worst) ? `${worst.toFixed(0)} m` : "no route to air"})`, ...(worstAt ? { at: worstAt } : {}) });
  if (deep) out.push({ code: "depth", message: `${tag}: ${deep} reachable poses are deeper than the ${limit} m suit`, ...(deepAt ? { at: deepAt } : {}) });
  // Hosts: a floor within 4 m below, and seen from a pose on the trip within 3 m
  // (sighted a hand above its resting point: a host is an object, not a point in the floor).
  for (const h of def.hosts) {
    const p = hostPosition(h);
    if (!p) continue;
    if (world.supportHeight(p.x, p.z, p.y) < p.y - 4) out.push({ code: "host", message: `${h.id}: no floor within 4 m below`, at: p });
    const seen = g.poses.some((q, i) => onTrip(i) && Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 3 && world.lineOfSight({ x: q.x, y: q.y + 0.5, z: q.z }, { x: p.x, y: p.y + HOST_SIGHT, z: p.z }));
    if (!seen) out.push({ code: "host", message: `${tag}: ${h.id} is not in view from the round trip within 3 m`, at: p });
  }
  // `visual` props: no reachable swimmer passes through one.
  for (const pl of def.dressing) {
    if (!isTemplate(pl.template) || TEMPLATES[pl.template].collision !== "visual") continue;
    const b = placementBox(def, pl);
    const through = g.poses.some((q, i) => (trip[i] || entries[i]) && boxesMeet(b, { min: { x: q.x - SWIM.radius, y: q.y, z: q.z - SWIM.radius }, max: { x: q.x + SWIM.radius, y: q.y + SWIM.height, z: q.z + SWIM.radius } }));
    if (through) out.push({ code: "visual", message: `${pl.id}: a reachable diver pose passes through this non-colliding prop`, at: toWorld(def, pl.at) });
  }
  return out;
}
