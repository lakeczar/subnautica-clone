import { buildCave, caveShell } from "../src/content/regions/caveGeometry.js";
import type { CaveSource } from "../src/content/regions/caves.js";
import { caveFloor } from "../src/content/regions/caves/authored.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { MeshRecipe } from "../src/render/kit/types.js";

/** Differences between a group cave's shells built in each order (fine then
 * coarse, coarse then fine, coarse alone), each on a fresh definition and
 * floor. The floor is unnamed, so nothing comes from the build cache. */
export function shellOrders(source: CaveSource): string[] {
  const fresh = () => buildCave(source, caveFloor(source, worldFloor));
  const a = fresh(), fineA = caveShell(a, "fine"), coarseA = caveShell(a, "coarse");
  const b = fresh(), coarseB = caveShell(b, "coarse"), fineB = caveShell(b, "fine");
  const coarseC = caveShell(fresh(), "coarse");
  return [
    ...differences(`${source.id} fine (coarse first)`, fineA, fineB),
    ...differences(`${source.id} coarse (fine first)`, coarseB, coarseA),
    ...differences(`${source.id} coarse (alone)`, coarseB, coarseC),
  ];
}

function differences(what: string, want: MeshRecipe, got: MeshRecipe): string[] {
  const out: string[] = [];
  for (const k of ["positions", "indices", "normals", "colors"] as const) {
    const p = want[k], q = got[k];
    if (p.length !== q.length) { out.push(`${what}: ${k} length ${p.length} -> ${q.length}`); continue; }
    let n = 0, worst = 0;
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) { n++; worst = Math.max(worst, Math.abs(p[i]! - q[i]!)); }
    if (n) out.push(`${what}: ${n} ${k} differ, by up to ${worst}`);
  }
  return out;
}
