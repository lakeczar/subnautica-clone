import test from "node:test";
import assert from "node:assert/strict";
import { caveDef } from "../src/content/regions/caves.js";
import { caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { caveLightField, DISTANCE_RANGE, REFERENCE_FALLOFF } from "../src/render/caves/lightField.js";

/** CA-1 R1 (CA-1-02): the daylight path length (the field's R) is a shortest
 * path through water, so no water texel may read further from daylight than
 * a 26-neighbour plus the step between them. The kit's Dijkstra kept its
 * distances in a Float32Array beside float64 heap keys: where a store rounded
 * down, the popped entry looked stale against its own value and the texel
 * never expanded, leaving whole passages too long or unreachable (W1-pre
 * Fanvault: 1,276 violations, up to 4.36 m). This check fails on that array
 * and passes on Float64. Rooms and rock are recomputed here from the volume,
 * independently of the field's code. */
function violations(id: string): { checked: number; bad: number; worst: number } {
  const def = caveDef(id, worldFloor), field = caveLightField(def, worldFloor), volume = caveVolume(def), g = volume.grid;
  const { nx, ny, nz, texel, data } = field, f = 2;
  const scale = def.rooms.map(r => REFERENCE_FALLOFF / r.falloff);
  const n = nx * ny * nz, water = new Uint8Array(n), room = new Int16Array(n).fill(-1);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const t = i + nx * (j + ny * k), votes = new Map<number, number>();
    let rock = 0;
    for (let c = 0; c < 8; c++) {
      const at = f * i + (c & 1) + g.nx * (f * j + ((c >> 1) & 1) + g.ny * (f * k + (c >> 2)));
      if (volume.solid[at]) { rock++; continue; }
      const r = volume.room[at]!;
      if (r) votes.set(r - 1, (votes.get(r - 1) ?? 0) + 1);
    }
    water[t] = rock < 8 ? 1 : 0;
    let best = 0;
    for (const [r, count] of votes) if (count > best) { best = count; room[t] = r; }
  }
  // One stored byte is DISTANCE_RANGE / 255 m; each side rounds by half of it.
  const unit = DISTANCE_RANGE / 255, tolerance = unit + 1e-6;
  let checked = 0, bad = 0, worst = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = i + nx * (j + ny * k), ru = data[u * 4]!;
    if (!water[u] || ru === 255) continue;
    const du = ru * unit, step = texel * (room[u]! >= 0 ? scale[room[u]!]! : 1);
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const a = i + dx, b = j + dy, c = k + dz;
      if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
      const t = a + nx * (b + ny * c), rt = data[t * 4]!;
      if (!water[t] || rt === 255) continue;
      checked++;
      const excess = du - (rt * unit + Math.hypot(dx, dy, dz) * step);
      if (excess > tolerance) { bad++; worst = Math.max(worst, excess); }
    }
  }
  return { checked, bad, worst };
}

test("light field: every water texel's daylight path is no longer than a neighbour's plus the step (Fanvault, Archlet)", () => {
  for (const id of ["fanvault", "reef_archlet"]) {
    const r = violations(id);
    assert.ok(r.checked > 100_000, `${id}: ${r.checked} neighbour pairs`);
    assert.equal(r.bad, 0, `${id}: ${r.bad} of ${r.checked} pairs break the shortest-path rule, worst by ${r.worst.toFixed(2)} m`);
  }
});
