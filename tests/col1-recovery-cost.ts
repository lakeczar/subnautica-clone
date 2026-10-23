// COL-1 R2 (N4) recovery cost (a script, not a test): recovery from inside
// a closed lat/long sphere at several densities, median of three calls,
// mesh construction excluded. Numbers count only from `--class exclusive`:
//   $H --class exclusive -- node .test-build/tests/col1-recovery-cost.js
import { performance } from "node:perf_hooks";
import { createStaticCollider, depenetrate } from "../src/world/collision/collider.js";
import { buildShape } from "../src/world/collision/shape.js";
import { sphereMesh } from "./col1-support.js";

const DIVER = { x: 0.34, y: 0.475, z: 0.34 };
for (const [bands, segments] of [[10, 18], [40, 80], [80, 160], [100, 200]] as const) {
  const m = sphereMesh(2, bands, segments), col = createStaticCollider("sphere", [buildShape("sphere", m.positions, m.indices, { interior: "solid", facing: 1 })]);
  for (const c of [{ x: 0, y: 0, z: 0 }, { x: 0.1, y: 0.2, z: 0.3 }]) {
    const trace = { tried: 0, sweeps: 0 }, ms: number[] = [];
    let r = null;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      r = depenetrate({ sweep: col.escapeSweep, blocked: (p, e) => col.overlaps(p, e), containing: col.containing, candidates: col.escapeCandidates, partDistance: col.partDistance, trace }, c, DIVER, 3);
      ms.push(performance.now() - t);
    }
    console.log(JSON.stringify({ triangles: m.indices.length / 3, centre: c, medianMs: ms.sort((a, b) => a - b)[1], maxMs: ms[2], perCall: { tried: trace.tried / 3, sweeps: trace.sweeps / 3 }, distance: r?.distance ?? null, clear: r ? !col.overlaps(r, DIVER) : null }));
  }
}
