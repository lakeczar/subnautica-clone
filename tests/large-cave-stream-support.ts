import type { Capsule, Vec3 } from "../src/sim/types.js";
import { actorBox } from "../src/sim/ribCollision.js";
import { CaveGate, CavePins, COVERAGE_REACH, coverageProblems, shownLods, type CaveArtCost, type CaveMap } from "../src/world/caves/large/streaming.js";
import { createResidency, type ChunkLoader, type PreparedArt, type ResidentArt } from "../src/world/residency.js";

/** LC streaming simulation (Babylon-free): an actor follows a path at a
 * fixed speed through S1 residency over a cave map, with chunk builds that
 * cost time in proportion to their bytes on a fake clock, fixed cave bytes
 * counted as external, and scheduled changes to other owners' share.
 *
 * Each frame runs in the lab's order: pins and residency update first, then
 * the movement gate against what this frame will draw, then the move. A
 * metre moved while the drawn frame does not cover the actor is unsafe. */

export interface ShareEvent { readonly frame: number; readonly otherBytes: number }
export interface SimOptions {
  readonly cm: CaveMap;
  readonly cost: CaveArtCost;
  /** The whole residency budget, CPU and GPU alike. */
  readonly budgetBytes: number;
  /** Fixed cave bytes counted as external from the start. */
  readonly fixedBytes: number;
  readonly path: readonly Vec3[];
  readonly speed: number;
  readonly shape: Capsule;
  /** Enforce the gate after entry (cold entry is always gated). */
  readonly gate: boolean;
  readonly shareEvents?: readonly ShareEvent[];
  readonly maxFrames?: number;
}
export interface SimResult {
  readonly readyFrame: number;
  readonly frames: number;
  readonly finished: boolean;
  /** Frames the gate held the actor after entry. */
  readonly heldAfterEntry: number;
  /** Metres moved while the drawn frame left the actor uncovered. */
  readonly unsafeMetres: number;
  readonly unsafeFrames: number;
  /** Frames the actor stood still beside undrawn rock (share loss while held). */
  readonly exposedStillFrames: number;
  /** Frames after entry where residency cut or demoted a wanted chunk. */
  readonly cutFrames: number;
  readonly maxAccountedBytes: number;
  readonly firstUnsafe: string;
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

export function simulate(o: SimOptions): SimResult {
  const clock = { t: 0 }, pins = new CavePins(o.cm), gate = new CaveGate(o.cm);
  const residency = createResidency({ map: pins.view, loader: costLoader(clock, o.cost), now: () => clock.t,
    budget: { cpuBytes: o.budgetBytes, gpuBytes: o.budgetBytes, buildMsPerFrame: 4, uploadMsPerFrame: 4 } });
  let other = 0;
  const external = (): void => residency.setExternalBytes({ cpu: o.fixedBytes + other, gpu: other });
  external();
  let p = { ...o.path[0]! }, wp = 1, frame = 0, readyFrame = -1, held = 0, unsafeMetres = 0, unsafeFrames = 0, still = 0, cuts = 0, maxBytes = 0;
  let firstUnsafe = "";
  const step = o.speed / 60;
  while (wp < o.path.length && frame < (o.maxFrames ?? 30000)) {
    frame++; clock.t += 16.7;
    for (const e of o.shareEvents ?? []) if (e.frame === frame) { other = e.otherBytes; external(); }
    const g = o.path[wp]!, dx = g.x - p.x, dy = g.y - p.y, dz = g.z - p.z, l = Math.hypot(dx, dy, dz);
    if (l < 0.5) { wp++; continue; }
    const s = Math.min(step, l), next = { x: p.x + dx / l * s, y: p.y + dy / l * s, z: p.z + dz / l * s };
    // 1. Pins and residency for this frame (look-ahead: half a second).
    const eye = { x: p.x, y: p.y + 1.4, z: p.z };
    pins.update(eye, actorBox(p, o.shape), o.speed * 0.5);
    const stats = residency.update(eye);
    maxBytes = Math.max(maxBytes, stats.cpuBytes);
    const shown = shownLods(residency.units());
    // 2. The gate against what this frame draws.
    const entered = readyFrame >= 0;
    const allowed = entered && !o.gate ? true : gate.allows(shown, actorBox(next, o.shape));
    if (!entered) { if (allowed) readyFrame = frame; else continue; }
    if (entered && (stats.cut || stats.demoted)) cuts++;
    // 3. Move or hold, then judge the drawn frame.
    const zone = (q: Vec3): number => { const z = o.cm.cave.field.zoneAt(q.x, q.y + 1.4, q.z); return z >= 0 ? z : pins.current.zone; };
    if (allowed) {
      p = next;
      const problems = coverageProblems(o.cm, shown, actorBox(p, o.shape), COVERAGE_REACH, zone(p));
      if (problems.length) { unsafeMetres += s; unsafeFrames++; firstUnsafe ||= `frame ${frame} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}): ${problems[0]}`; }
    } else {
      held++;
      if (coverageProblems(o.cm, shown, actorBox(p, o.shape), COVERAGE_REACH, zone(p)).length) still++;
    }
  }
  return { readyFrame, frames: frame, finished: wp >= o.path.length, heldAfterEntry: held, unsafeMetres, unsafeFrames,
    exposedStillFrames: still, cutFrames: cuts, maxAccountedBytes: maxBytes, firstUnsafe };
}

/** Deterministic, uneven synthetic chunk costs: 60-900 KiB fine, a quarter coarse. */
export function syntheticCost(id: string): { fine: number; coarse: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const fine = Math.round((60 + ((h >>> 0) % 841)) * 1024);
  return { fine, coarse: Math.round(fine / 4) };
}
