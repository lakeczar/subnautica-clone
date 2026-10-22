import test from "node:test";
import assert from "node:assert/strict";
import { caveDef, type CaveDef } from "../src/content/regions/caves.js";
import { caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { caveLightField, DISTANCE_RANGE, REFERENCE_FALLOFF, type CaveLightField } from "../src/render/caves/lightField.js";

// W2-05 (Sol R1): a numerical regression for the light-field fix. The stored
// daylight path length of every water texel must equal an independent
// shortest-path solve: a plain float64 Dijkstra, uncapped, over the same
// texel classification read from the generated voxels. A solver that
// compares float64 keys with float32 stored distances (the W1 bug) skips
// expansions and leaves 1,249 of the Fanvault's water texels too long; it
// fails this.

const NEIGHBOURS = (() => {
  const out: [number, number, number, number][] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if (dx || dy || dz) out.push([dx, dy, dz, Math.hypot(dx, dy, dz)]);
  return out;
})();

/** Reference distances per 2-voxel texel (Infinity for rock), from the volume. */
function reference(def: CaveDef): { distance: Float64Array; water: Uint8Array } {
  const v = caveVolume(def), g = v.grid, f = 2, nx = g.nx / f, ny = g.ny / f, nz = g.nz / f, n = nx * ny * nz, texel = g.voxel * f;
  const water = new Uint8Array(n), seed = new Uint8Array(n), room = new Int16Array(n).fill(-1);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let rock = 0, inside = 0, outside = 0;
    const votes = new Map<number, number>();
    for (let c = 0; c < 8; c++) {
      const at = (f * i + (c & 1)) + g.nx * ((f * j + ((c >> 1) & 1)) + g.ny * (f * k + (c >> 2)));
      if (v.solid[at]) { rock++; continue; }
      const r = v.room[at]!;
      if (r) { inside++; votes.set(r - 1, (votes.get(r - 1) ?? 0) + 1); } else outside++;
    }
    const t = i + nx * (j + ny * k);
    let best = 0;
    for (const [r, count] of votes) if (count > best) { best = count; room[t] = r; }
    if (rock < 8) water[t] = 1;
    if (rock < 8 && outside >= inside) seed[t] = 1;
  }
  const scale = def.rooms.map(r => REFERENCE_FALLOFF / r.falloff);
  const distance = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  // A simple binary heap of [distance, texel], no stale-key tricks.
  const heap: [number, number][] = [];
  const push = (d: number, t: number): void => {
    heap.push([d, t]);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p]![0] <= d) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && heap[c + 1]![0] < heap[c]![0]) c++;
        if (heap[c]![0] >= heap[i]![0]) break;
        [heap[c], heap[i]] = [heap[i]!, heap[c]!]; i = c;
      }
    }
    return top;
  };
  for (let t = 0; t < n; t++) if (seed[t]) { distance[t] = 0; push(0, t); }
  while (heap.length) {
    const [d, t] = pop();
    if (done[t]) continue;
    done[t] = 1;
    const i = t % nx, j = Math.floor(t / nx) % ny, k = Math.floor(t / (nx * ny));
    for (const [dx, dy, dz, len] of NEIGHBOURS) {
      const a = i + dx, b = j + dy, c = k + dz;
      if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
      const u = a + nx * (b + ny * c);
      if (!water[u] || done[u]) continue;
      const next = d + len * texel * (room[u]! >= 0 ? scale[room[u]!]! : 1);
      if (next < distance[u]!) { distance[u] = next; push(next, u); }
    }
  }
  return { distance, water };
}
const byte = (d: number): number => Math.max(0, Math.min(255, Math.round(Math.min(d, DISTANCE_RANGE) / DISTANCE_RANGE * 255)));
function mismatches(field: CaveLightField, ref: ReturnType<typeof reference>): { count: number; water: number; first: string } {
  let count = 0, water = 0, first = "";
  for (let t = 0; t < ref.water.length; t++) {
    if (!ref.water[t]) continue;
    water++;
    const want = byte(ref.distance[t]!), got = field.data[t * 4]!;
    if (want !== got) { count++; first ||= `texel ${t}: stored ${got}, reference ${want}`; }
  }
  return { count, water, first };
}

test("light field: every water texel's daylight path length equals an independent uncapped float64 shortest path", () => {
  for (const id of ["fanvault", "hub_crown_shaft"]) {
    const def = caveDef(id, worldFloor), field = caveLightField(def, worldFloor), ref = reference(def);
    const m = mismatches(field, ref);
    assert.ok(m.water > 5000, `${id}: ${m.water} water texels`);
    assert.equal(m.count, 0, `${id}: ${m.count} texels differ, ${m.first}`);
  }
});

test("negative control: the comparison sees a single texel stored a step too long", () => {
  const def = caveDef("fanvault", worldFloor), field = caveLightField(def, worldFloor), ref = reference(def);
  const t = ref.distance.findIndex((d, i) => ref.water[i] === 1 && d > 4 && d < DISTANCE_RANGE - 4);
  const data = field.data.slice();
  data[t * 4] = byte(ref.distance[t]! + 1);
  assert.equal(mismatches({ ...field, data }, ref).count - mismatches(field, ref).count, 1);
});
