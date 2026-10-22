import type { Capsule, Vec3 } from "../src/sim/types.js";
import { actorBox } from "../src/sim/ribCollision.js";
import { CaveAdmission, CaveArbiter, CaveGate, CavePins, caveSafetyBytes, COVERAGE_REACH, coverageProblems, shownLods, type CaveArtCost, type CaveMap } from "../src/world/caves/large/streaming.js";
import { boxTouchesOwned } from "../src/world/caves/large/ownership.js";
import { createResidency, type ChunkLoader, type PreparedArt, type ResidentArt } from "../src/world/residency.js";

/** LC streaming simulation (Babylon-free): an actor follows a path at a
 * fixed speed while a shared-budget arbiter, a cave's coarse safety set and
 * its opportunistic fine residency run as the lab runs them. Chunk builds
 * cost time in proportion to their bytes on a fake clock; other owners make
 * scheduled requests of the arbiter.
 *
 * Each frame: admission (reserve the fixed bytes and the coarse safety set,
 * all or nothing), safety-set building, fine pins and residency, then the
 * gate against what this frame draws, then the move. A metre moved while
 * the drawn frame leaves the actor uncovered is unsafe. */

export interface ShareEvent { readonly frame: number; readonly otherBytes: number; readonly owner?: string }
export interface SimOptions {
  readonly cm: CaveMap;
  readonly cost: CaveArtCost;
  /** The whole shared budget, CPU and GPU alike. */
  readonly budgetBytes: number;
  /** The cave's fixed bytes (colliders, bake, windows): reserved at load. */
  readonly fixedBytes: number;
  readonly path: readonly Vec3[];
  readonly speed: number;
  readonly shape: Capsule;
  /** Enforce the gate (false: a control that moves regardless). */
  readonly gate: boolean;
  /** Use the coarse safety set (false: a control with fine art only). */
  readonly safety?: boolean;
  readonly shareEvents?: readonly ShareEvent[];
  readonly maxFrames?: number;
  /** An arbiter shared with another simulation (two biomes). */
  readonly arbiter?: CaveArbiter;
  readonly id?: string;
}
export interface SimResult {
  /** Frame the biome was admitted (fixed and safety reserved, set built), or -1. */
  readonly admittedFrame: number;
  readonly frames: number;
  readonly finished: boolean;
  /** Frames the gate held the actor while it stood in or touching the cave. */
  readonly heldInside: number;
  /** Frames the gate held the actor outside (not admitted). */
  readonly heldOutside: number;
  /** Metres moved while the drawn frame left the actor uncovered. */
  readonly unsafeMetres: number;
  readonly unsafeFrames: number;
  /** Frames the actor touched owned space while the biome was not admitted. */
  readonly insideUnadmitted: number;
  /** Frames moved with some touched chunk drawn only coarse (fine is opportunistic). */
  readonly coarseFrames: number;
  readonly final: Vec3;
  readonly firstUnsafe: string;
  readonly reason: string;
  /** Frames spent loading (simulation clock paused), and relocations to a mouth. */
  readonly holdingFrames: number;
  readonly rescues: number;
}

/** Builds take 2.5 ms per 128 KiB step; the recipe costs `cost`. */
function costLoader(clock: { t: number }, cost: CaveArtCost): ChunkLoader {
  return {
    *build(chunk, lod) {
      const bytes = cost(chunk.id)[lod];
      for (let i = 0; i < Math.max(1, Math.ceil(bytes / 131072)); i++) { clock.t += 2.5; yield; }
      const art: PreparedArt = {
        cpuBytes: bytes, gpuBytes: bytes, discard() {},
        upload(): ResidentArt { clock.t += 0.5; return { cpuBytes: bytes, gpuBytes: bytes, setVisible() {}, dispose() {} }; },
      };
      return art;
    },
  };
}

/** One simulated biome visit, stepped a frame at a time (so two can share an arbiter). */
export function createSim(o: SimOptions) {
  const clock = { t: 0 }, pins = new CavePins(o.cm), gate = new CaveGate(o.cm), id = o.id ?? o.cm.cave.id;
  const arbiter = o.arbiter ?? new CaveArbiter({ cpu: o.budgetBytes, gpu: o.budgetBytes });
  const loader = costLoader(clock, o.cost), safetyBytes = caveSafetyBytes(o.cm, o.cost), useSafety = o.safety ?? true;
  const fine = createResidency({ map: pins.view, loader, now: () => clock.t,
    budget: { cpuBytes: arbiter.total.cpu, gpuBytes: arbiter.total.gpu, buildMsPerFrame: 4, uploadMsPerFrame: 4 } });
  arbiter.opportunistic(`${id}.fine`);
  // The admission controller (fixed + coarse safety, priority when inside, loading and rescue);
  // the no-safety control reserves only the fixed bytes.
  const admission = useSafety ? new CaveAdmission(o.cm, arbiter, loader, { id, fixed: { cpu: o.fixedBytes, gpu: 0 }, safety: safetyBytes }) : null;
  const fixedHeld = useSafety ? false : arbiter.reserve(`${id}.fixed`, { cpu: o.fixedBytes, gpu: 0 });
  let holding = 0, rescues = 0, fineCpu = 0;
  let p = { ...o.path[0]! }, wp = 1, frame = 0, admittedFrame = -1, heldIn = 0, heldOut = 0, unsafeMetres = 0, unsafeFrames = 0, inside = 0, coarse = 0;
  let firstUnsafe = "";
  const own = o.cm.cave.field.ownership;
  const result = (): SimResult => ({ admittedFrame, frames: frame, finished: wp >= o.path.length, heldInside: heldIn, heldOutside: heldOut,
    unsafeMetres, unsafeFrames, insideUnadmitted: inside, coarseFrames: coarse, final: p, firstUnsafe, reason: gate.stats.reason, holdingFrames: holding, rescues });
  return {
    get done() { return wp >= o.path.length || frame >= (o.maxFrames ?? 30000); },
    release() { admission?.release(); arbiter.release(`${id}.fixed`); arbiter.release(`${id}.fine`); fine.dispose(); },
    /** The fine residency's own accounted bytes (excluding its external share). */
    get fineBytes() { return fineCpu; },
    result,
    step(): void {
      frame++; clock.t += 16.7;
      for (const e of o.shareEvents ?? []) if (e.frame === frame) arbiter.request(e.owner ?? "other", { cpu: e.otherBytes, gpu: e.otherBytes });
      const g = o.path[wp]!, dx = g.x - p.x, dy = g.y - p.y, dz = g.z - p.z, l = Math.hypot(dx, dy, dz);
      if (l < 0.5) { wp++; return; }
      const s = Math.min(o.speed / 60, l), next = { x: p.x + dx / l * s, y: p.y + dy / l * s, z: p.z + dz / l * s };
      // 1. Admission: the fixed bytes and the coarse safety set, all or nothing.
      const eye = { x: p.x, y: p.y + 1.4, z: p.z };
      const adm = admission?.update(actorBox(p, o.shape), eye, clock.t, 4, () => clock.t);
      if (adm?.rescue) { p = { ...adm.rescue }; rescues++; return; }
      if (adm?.holding) { holding++; return; } // loading: the simulation clock is paused
      const safety = admission?.safety ?? null;
      const admitted = admission ? admission.admitted : fixedHeld;
      if (admitted && admittedFrame < 0) admittedFrame = frame;
      // 2. Opportunistic fine art in this owner's exclusive share of the remainder.
      pins.update(eye, actorBox(p, o.shape), o.speed * 0.5);
      const ext = arbiter.externalFor(`${id}.fine`);
      fine.setExternalBytes(ext);
      const st = fine.update(eye);
      fineCpu = st.cpuBytes - ext.cpu;
      const fineShown = shownLods(fine.units());
      const drawn = safety ? safety.drawn(fineShown) : fineShown;
      // 3. The gate against what this frame draws, then move or hold.
      const allowed = !o.gate || gate.allows(drawn, actorBox(next, o.shape), admitted);
      const touching = (q: Vec3): boolean => boxTouchesOwned(own, actorBox(q, o.shape));
      const zone = (q: Vec3): number => { const z = o.cm.cave.field.zoneAt(q.x, q.y + 1.4, q.z); return z >= 0 ? z : pins.current.zone; };
      if (allowed) {
        p = next;
        if (touching(p) && !admitted) inside++;
        if (touching(p)) {
          const box = actorBox(p, o.shape);
          const problems = coverageProblems(o.cm, drawn, box, COVERAGE_REACH, zone(p), "any");
          if (problems.length) { unsafeMetres += s; unsafeFrames++; firstUnsafe ||= `frame ${frame} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}): ${problems[0]}`; }
          else if (coverageProblems(o.cm, drawn, box, COVERAGE_REACH, zone(p), "fine").length) coarse++;
        }
      } else if (admitted || touching(p)) heldIn++;
      else heldOut++;
    },
  };
}

export function simulate(o: SimOptions): SimResult {
  const sim = createSim(o);
  while (!sim.done) sim.step();
  return sim.result();
}

/** True when the actor's box is clear of the cave's owned space (exterior water). */
export function outside(cm: CaveMap, p: Vec3, shape: Capsule): boolean {
  return !boxTouchesOwned(cm.cave.field.ownership, actorBox(p, shape));
}

/** Deterministic, uneven synthetic chunk costs: 60-900 KiB fine, a quarter coarse. */
export function syntheticCost(id: string): { fine: number; coarse: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const fine = Math.round((60 + ((h >>> 0) % 841)) * 1024);
  return { fine, coarse: Math.round(fine / 4) };
}
