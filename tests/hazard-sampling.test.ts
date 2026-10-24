import test from "node:test";
import assert from "node:assert/strict";
import { HAZARD_FIELDS } from "../src/content/ecology/hazards.js";
import type { HazardFieldDefinition, HazardFieldId, HazardKind } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { fieldLevel, sampleHazards, shapeWeight } from "../src/sim/ecology/hazards.js";
import { hazardsAt } from "../src/sim/fittings.js";
import type { Vec3 } from "../src/sim/types.js";

// SIM-PERF-1 sampled hazards without a record, vector or second pass per call.
// The answers must be exactly the earlier algorithm's, kept here as the reference.
const IDS = Object.keys(HAZARD_FIELDS) as HazardFieldId[];
const field = (id: HazardFieldId): HazardFieldDefinition => HAZARD_FIELDS[id];
function referenceSample(p: Vec3, tick: number) {
  const out: Record<HazardKind, number> = { heat: 0, brine: 0, current: 0, sediment: 0, darkness: 0 };
  let flow = { x: 0, y: 0, z: 0 }; const fields: HazardFieldId[] = [];
  for (const id of IDS) {
    const f = field(id), w = shapeWeight(f.shape, f.edge, p);
    if (w <= 0) continue;
    const level = w * fieldLevel(id, tick) * f.intensity;
    if (level <= 1e-9) continue;
    fields.push(id);
    out[f.kind] = f.kind === "current" ? out[f.kind] + level : Math.max(out[f.kind], level);
    if (f.flow) {
      const k = f.kind === "sediment" ? level * 0.45 : level;
      flow = { x: flow.x + f.flow.x * k, y: flow.y + f.flow.y * k, z: flow.z + f.flow.z * k };
    }
  }
  return { heat: out.heat, brine: out.brine, sediment: out.sediment, darkness: out.darkness, flow, fields };
}
function referenceHazardsAt(p: Vec3, tick: number) {
  const heat: { level: number; kind: string }[] = [];
  for (const id of IDS) {
    const f = field(id);
    if (f.kind !== "heat") continue;
    const level = shapeWeight(f.shape, f.edge, p) * fieldLevel(id, tick) * f.intensity;
    if (level <= 1e-9) continue;
    heat.push({ level, kind: !("cycle" in f) ? "ambient" : fieldLevel(id, tick) > ((f as { baseline?: number }).baseline ?? 0) + 1e-9 ? "burst" : "core" });
  }
  return { heat, brine: referenceSample(p, tick).brine };
}

test("hazard samples and fit hazards are exactly the reference algorithm's in and around every field, over its cycle", () => {
  let points = 0, contributing = 0;
  for (const id of IDS) {
    const f = field(id), c = sitePosition(f.shape.center);
    for (const dx of [-60, -25, -8, 0, 5, 18, 40]) for (const dy of [-30, -6, 0, 4, 20]) for (const dz of [-45, -12, 0, 9, 33]) {
      const p = { x: c.x + dx, y: c.y + dy, z: c.z + dz };
      for (const tick of [0, 1_234, 9_000, 41_777, 180_000, 600_013]) {
        points++;
        const { ambient, visibility, ...sample } = sampleHazards(p, tick), reference = referenceSample(p, tick);
        assert.deepEqual(sample, reference, `${id} at ${JSON.stringify(p)}, tick ${tick}`);
        assert.ok(Number.isFinite(ambient) && Number.isFinite(visibility));
        assert.deepEqual(hazardsAt(p, tick), referenceHazardsAt(p, tick), `${id} fit hazards at ${JSON.stringify(p)}, tick ${tick}`);
        if (reference.fields.length) contributing++;
      }
    }
  }
  assert.ok(contributing > points / 10, `${contributing} of ${points} samples meet a field`);
});
