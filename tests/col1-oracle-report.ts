// COL-1 oracle report (a script, not a test): speed, memory and the full
// probe tables per scene, for the handoff. Performance numbers count only
// from `--class exclusive`:
//   $H --class exclusive -- node --expose-gc --import ./scripts/test-build-cache.mjs \
//     .test-build/tests/col1-oracle-report.js docs/build/streams/col1/oracle.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { STRUCTURES } from "../src/content/regions/structures.js";
import type { Capsule, Vec3, WorldQueries } from "../src/sim/types.js";
import { createWorldQueries, surfaceHeight, type Solid } from "../src/sim/world.js";
import {
  biomeScene, caveScenes, DIVER, dishScene, MEDIUM, probe, random, vistaScene, type OracleScene, type ProbeResult,
} from "./col1-oracle-support.js";

const out = process.argv[2] ?? "/work/tmp/col1/oracle.json";
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("run with --expose-gc");
const used = (): number => { gc(); gc(); const m = process.memoryUsage(); return m.heapUsed + m.external; };
const CREEL: Capsule = { radius: 3.9, height: 3.6 };

/** Retained bytes of what `build` returns, measured on the heap. */
function retained<T>(build: () => T): { value: T; bytes: number } {
  const before = used(), value = build(), after = used();
  return { value, bytes: after - before };
}

/** Median microseconds per call for two runs over the same inputs: seven
 * timed passes each, interleaved (a, b, a, b, ...) after a warm-up of both,
 * so neither pays the other's JIT or cache state. */
function microsPair(calls: number, a: () => void, b: () => void): { old: number; neo: number } {
  a(); b(); a(); b();
  const ta: number[] = [], tb: number[] = [];
  for (let i = 0; i < 7; i++) {
    let t = performance.now(); a(); ta.push((performance.now() - t) * 1000 / calls);
    t = performance.now(); b(); tb.push((performance.now() - t) * 1000 / calls);
  }
  const med = (v: number[]): number => v.sort((x, y) => x - y)[3]!;
  return { old: med(ta), neo: med(tb) };
}

interface Speed { readonly [query: string]: { readonly old: number; readonly neo: number } }
/** The same inputs through both worlds: poses clear in both, near the art. */
function speed(scene: OracleScene, shapes: readonly { id: string; shape: Capsule; step: number }[]): Speed {
  const rnd = random(77), result: Record<string, { old: number; neo: number }> = {};
  for (const { id, shape, step } of shapes) {
    const poses: Vec3[] = [];
    for (let guard = 0; poses.length < 400 && guard < 40000; guard++) {
      const s = scene.seeds[Math.floor(rnd() * scene.seeds.length)]!, r = shape.radius + 0.2 + 3.5 * rnd(), u = rnd() * Math.PI * 2;
      const p = { x: s.x + r * Math.cos(u), y: s.y - shape.height / 2 + (rnd() - 0.5) * 2, z: s.z + r * Math.sin(u) };
      if (scene.old.clearance(p, shape) && scene.neo.clearance(p, shape)) poses.push(p);
    }
    const frames = poses.map(() => { const u = rnd() * Math.PI * 2; return { x: Math.cos(u) * step, y: (rnd() - 0.5) * step * 0.4, z: Math.sin(u) * step }; });
    const long = poses.map((_, i) => ({ x: frames[i]!.x * 20, y: frames[i]!.y * 20, z: frames[i]!.z * 20 }));
    const time = (name: string, f: (w: WorldQueries, i: number) => unknown): void => {
      result[`${id}.${name}`] = microsPair(poses.length,
        () => { for (let i = 0; i < poses.length; i++) f(scene.old, i); },
        () => { for (let i = 0; i < poses.length; i++) f(scene.neo, i); });
    };
    time("clearance", (w, i) => w.clearance(poses[i]!, shape));
    time("move.frame", (w, i) => w.moveCapsule(poses[i]!, frames[i]!, shape));
    time("move.long", (w, i) => w.moveCapsule(poses[i]!, long[i]!, shape));
    time("support", (w, i) => w.supportHeight(poses[i]!.x, poses[i]!.z, poses[i]!.y));
    time("sight", (w, i) => w.lineOfSight({ ...poses[i]!, y: poses[i]!.y + 0.5 }, { x: poses[i]!.x + long[i]!.x, y: poses[i]!.y + 0.5, z: poses[i]!.z + long[i]!.z }));
    result[`${id}.poses`] = { old: poses.length, neo: poses.length };
  }
  return result;
}

/** Highest of `surface` at the box's footprint corners, edge midpoints and centre. */
const under = (p: Vec3, s: Capsule, surface: (x: number, z: number) => number): number => {
  let top = -Infinity;
  for (const i of [-1, 0, 1]) for (const k of [-1, 0, 1]) top = Math.max(top, surface(p.x + i * s.radius, p.z + k * s.radius));
  return top;
};
const stat = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b), at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
  return { samples: s.length, mean: s.reduce((a, x) => a + x, 0) / Math.max(1, s.length), p50: at(0.5), p95: at(0.95), max: at(1) };
};

/** A diver dropped onto each bowl panel from 3 m above it: how far its feet
 * rest above the highest porcelain under its footprint (ART-03's float),
 * old and new. A drop that slides off the bowl's slope still counts where it rests. */
function bowlFloat(scene: OracleScene) {
  const rows = [];
  for (const d of STRUCTURES.filter(s => s.kind === "dish")) {
    const o: number[] = [], n: number[] = [];
    for (const f of d.dish!.bowl) {
      const [a, b, c] = f.pts as [Vec3, Vec3, Vec3], m = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 };
      const start = { x: m.x, y: m.y + 3, z: m.z };
      if (!scene.old.clearance(start, DIVER) || !scene.neo.clearance(start, DIVER)) continue;
      // Where each world's drop comes to rest on something; drops that fall
      // through a gap (no contact) are not resting on the bowl.
      const rest = (w: WorldQueries): number | null => {
        const m2 = w.moveCapsule(start, { x: 0, y: -4, z: 0 }, DIVER), e = m2.position;
        if (!m2.hitSolid) return null;
        const art = under(e, DIVER, (x, z) => scene.art.support(x, z, e.y + 0.05));
        return Number.isFinite(art) ? e.y - art : null;
      };
      const ra = rest(scene.old), rb = rest(scene.neo);
      if (ra !== null && rb !== null) { o.push(ra); n.push(rb); }
    }
    rows.push({ dish: d.id, old: stat(o), neo: stat(n) });
  }
  return rows;
}

/** A diver straddling a cave footprint's edge, dropped 3 m onto the seam
 * from 2 m above it: how far its feet rest above the highest real surface
 * under it (the floor outside the footprint, the shell inside; CAV-20's
 * float), old columns against the new collar. */
function collarFloat(old: WorldQueries, neo: WorldQueries, scene: OracleScene) {
  const rnd = random(5), o: number[] = [], n: number[] = [];
  const feet = scene.regions.map(r => ({ minX: r.min.x + 4, maxX: r.max.x - 4, minZ: r.min.z + 4, maxZ: r.max.z - 4 }));
  const insideAny = (x: number, z: number): boolean => feet.some(f => x >= f.minX && x < f.maxX && z >= f.minZ && z < f.maxZ);
  for (let i = 0; o.length < 600 && i < 40000; i++) {
    const f = feet[Math.floor(rnd() * feet.length)]!, side = Math.floor(rnd() * 4), t = rnd(), out = 0.3 * rnd();
    const x = side === 0 ? f.minX - out : side === 1 ? f.maxX + out : f.minX + (f.maxX - f.minX) * t;
    const z = side === 2 ? f.minZ - out : side === 3 ? f.maxZ + out : f.minZ + (f.maxZ - f.minZ) * t;
    const surface = (px: number, pz: number, top: number): number => insideAny(px, pz) ? scene.art.support(px, pz, top) : surfaceHeight(px, pz);
    const start = { x, y: under({ x, y: 0, z }, DIVER, (px, pz) => surface(px, pz, 1e3)) + 2, z };
    if (!old.clearance(start, DIVER) || !neo.clearance(start, DIVER)) continue;
    const rest = (w: WorldQueries): number | null => {
      const m2 = w.moveCapsule(start, { x: 0, y: -3, z: 0 }, DIVER), e = m2.position;
      if (!m2.hitSolid) return null;
      const top = under(e, DIVER, (px, pz) => surface(px, pz, e.y + 0.05));
      return Number.isFinite(top) ? e.y - top : null;
    };
    const a = rest(old), b = rest(neo);
    if (a !== null && b !== null) { o.push(a); n.push(b); }
  }
  return { old: stat(o), neo: stat(n) };
}

const FULL = { poses: 12000, moves: 6000, columns: 8000, sights: 4000, seed: 1 };
const report: Record<string, unknown> = { generated: new Date().toISOString(), node: process.version };
const record = (scene: OracleScene, r: ProbeResult, extra: Record<string, unknown>): void => {
  report[scene.id] = {
    label: scene.label, before: scene.before,
    after: { triangles: scene.after.triangles, boxes: scene.after.boxCount, samples: scene.after.samples, bytes: scene.after.bytes, sharedBytes: scene.after.sharedBytes },
    probe: { clearance: r.clearance, moves: r.moves, support: r.support, sight: r.sight, protected: r.protected }, ...extra,
  };
  console.log(scene.id, JSON.stringify(report[scene.id]));
};
const oldMemory = (solids: readonly Solid[], cellSize?: number): number => retained(() => {
  const copy: Solid[] = JSON.parse(JSON.stringify(solids));
  return createWorldQueries(copy, surfaceHeight, cellSize ? { cellSize } : {});
}).bytes;

for (const make of [dishScene, vistaScene]) {
  const scene = make(), build = retained(() => make().after);
  const extra: Record<string, unknown> = {
    memory: { oldMeasured: oldMemory(scene.oldSolids), neoMeasured: build.bytes, neoFormat: build.value.bytes },
    speed: speed(scene, [{ id: "diver", shape: DIVER, step: 0.09 }, { id: "medium", shape: MEDIUM, step: 0.2 }]),
  };
  if (scene.id === "dishes") extra.bowlFloat = bowlFloat(scene);
  record(scene, probe(scene, FULL), extra);
}
{
  const scenes = caveScenes();
  for (const [k, scene] of Object.entries(scenes.variants)) {
    const extra: Record<string, unknown> = {
      memory: { oldMeasured: oldMemory(scene.oldSolids, 8), neoFormat: scene.after.bytes, neoShared: scene.after.sharedBytes },
      speed: speed(scene, [{ id: "diver", shape: DIVER, step: 0.09 }]),
    };
    if (k !== "columns") extra.collarFloat = collarFloat(scenes.variants.columns.neo, scene.neo, scene);
    record(scene, probe(scene, { ...FULL, poses: 8000, moves: 4000 }), extra);
  }
}
{
  const scene = biomeScene();
  record(scene, probe(scene, { ...FULL, poses: 8000, moves: 4000 }), {
    memory: { lcFormat: scene.lcBytes, neoFormat: scene.after.bytes, neoShared: scene.after.sharedBytes, chunks: scene.chunks },
    speed: speed(scene, [{ id: "diver", shape: DIVER, step: 0.09 }, { id: "creel", shape: CREEL, step: 0.11 }]),
  });
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`wrote ${out}`);
