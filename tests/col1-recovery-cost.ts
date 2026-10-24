// COL-1 recovery cost (a script, not a test), median of three calls, mesh
// construction excluded: R2's N4 (a closed lat/long sphere at several
// densities) and R3's R3-2 (n nested closed boxes as parts of one shape,
// and as separate members). Numbers count only from `--class exclusive`:
//   $H --class exclusive -- node .test-build/tests/col1-recovery-cost.js
import { performance } from "node:perf_hooks";
import { createStaticCollider, depenetrate } from "../src/world/collision/collider.js";
import { buildShape } from "../src/world/collision/shape.js";
import { gridBoxMesh, sphereMesh } from "./col1-support.js";
import type { StaticMember } from "../src/world/collision/collider.js";

const DIVER = { x: 0.34, y: 0.475, z: 0.34 };
for (const [bands, segments] of [[10, 18], [40, 80], [80, 160], [100, 200]] as const) {
  const m = sphereMesh(2, bands, segments), col = createStaticCollider("sphere", [buildShape("sphere", m.positions, m.indices, { interior: "solid", facing: 1 })]);
  for (const c of [{ x: 0, y: 0, z: 0 }, { x: 0.1, y: 0.2, z: 0.3 }]) {
    const trace = { tried: 0, sweeps: 0 }, ms: number[] = [];
    let r = null;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      r = depenetrate({ sweep: col.escapeSweep, blocked: (p, e) => col.overlaps(p, e), containing: col.containing, candidates: col.escapeCandidates, exitBound: col.exitBound, trace }, c, DIVER, 3);
      ms.push(performance.now() - t);
    }
    console.log(JSON.stringify({ triangles: m.indices.length / 3, centre: c, medianMs: ms.sort((a, b) => a - b)[1], maxMs: ms[2], perCall: { tried: trace.tried / 3, sweeps: trace.sweeps / 3 }, distance: r?.distance ?? null, clear: r ? !col.overlaps(r, DIVER) : null }));
  }
}

for (const n of [100, 500, 1000, 2000]) for (const oneShape of [true, false]) {
  const meshes = Array.from({ length: n }, (_, k) => { const r = 1 + k / n; return gridBoxMesh({ x: -r, y: -r, z: -r }, { x: r, y: r, z: r }, 1); });
  let members: StaticMember[];
  if (oneShape) {
    const pos: number[] = [], idx: number[] = [], parts: number[] = [];
    meshes.forEach((m, k) => { const base = pos.length / 3; pos.push(...m.positions); for (const i of m.indices) idx.push(i + base); for (let t = 0; t < 12; t++) parts.push(k); });
    members = [buildShape("nested", new Float32Array(pos), idx, { interior: "solid", facing: 1, parts })];
  } else members = meshes.map((m, k) => buildShape(`box.${k}`, m.positions, m.indices, { interior: "solid", facing: 1 }));
  const col = createStaticCollider("nested", members), c = { x: 0.1, y: 0.2, z: 0.3 }, trace = { tried: 0, sweeps: 0 }, ms: number[] = [];
  let r = null;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    r = depenetrate({ sweep: col.escapeSweep, blocked: (p, e) => col.overlaps(p, e), containing: col.containing, candidates: col.escapeCandidates, exitBound: col.exitBound, trace }, c, DIVER, 3);
    ms.push(performance.now() - t);
  }
  console.log(JSON.stringify({ parts: n, layout: oneShape ? "one shape" : "members", triangles: 12 * n, medianMs: ms.sort((a, b) => a - b)[1], maxMs: ms[2], perCall: { tried: trace.tried / 3, sweeps: trace.sweeps / 3 }, distance: r?.distance ?? null, clear: r ? !col.overlaps(r, DIVER) : null }));
}
