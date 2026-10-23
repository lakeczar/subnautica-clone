import assert from "node:assert/strict";
import test from "node:test";
import { biomeScene, caveScenes, dishScene, probe, vistaScene, type ProbeResult } from "./col1-oracle-support.js";

/** COL-1 oracle, exhaustive: today's box queries against the static
 * collider on the dishes, A1's set pieces, CA-1's colonnade caves and LC's
 * Canopy chunks. Heavy only for its probe counts (no Babylon). Speed and
 * memory are measured by `col1-oracle-report.ts` under `--class exclusive`. */

const FULL = { poses: 12000, moves: 6000, columns: 8000, sights: 4000, seed: 1 };
const summary = (r: ProbeResult): string => JSON.stringify({ scene: r.scene, clearance: r.clearance, moves: r.moves, support: r.support, sight: r.sight,
  protected: { ...r.protected, newlyBlocked: r.protected.newlyBlocked.length, newlyCleared: r.protected.newlyCleared.length } });

for (const make of [dishScene, vistaScene]) {
  test(`structures (${make.name}): the art blocks only where the art is, and no route, tether or pose is newly blocked`, () => {
    const scene = make(), r = probe(scene, FULL);
    console.log(summary(r));
    assert.deepEqual(r.protected.newlyBlocked, [], `${scene.id}: newly blocked`);
    assert.equal(r.clearance.spurious, 0, `${scene.id}: blocked without art:\n${JSON.stringify(r.examples.slice(0, 5))}`);
    assert.equal(r.sight.newOnlyBlockedOutsideArt, 0, `${scene.id}: sight blocked without art`);
    // A move stopped where the old one went free stops at art on its path.
    assert.equal(r.moves.spurious, 0, `${scene.id}: ${JSON.stringify(r.examples.filter(e => e.kind.startsWith("new stops")).slice(0, 4))}`);
    assert.ok(r.clearance.newClearOldBlocked > 0, `${scene.id}: the art frees nothing the boxes held: no stand-off measured`);
  });
}

test("caves (CA-1 colonnade): the heightfield collar never blocks what the columns allowed; the shell's differences are reported", () => {
  const { variants } = caveScenes();
  const results = Object.fromEntries(Object.entries(variants).map(([k, s]) => [k, probe(s, { ...FULL, poses: 8000, moves: 4000 })])) as Record<string, ProbeResult>;
  for (const r of Object.values(results)) console.log(summary(r));
  const columns = results.columns!, heightfield = results.heightfield!, shell = results.shell!;
  // Against today's production composite, the heightfield blocks nothing the composer control does not.
  const extra = heightfield.protected.newlyBlocked.filter(id => !columns.protected.newlyBlocked.includes(id));
  assert.deepEqual(extra, [], "heightfield blocks routes or poses the columns (same composer) leave clear");
  // The heightfield is never above the columns where it replaces them: it frees, never blocks.
  assert.ok(heightfield.clearance.oldClearNewBlocked <= columns.clearance.oldClearNewBlocked,
    `heightfield ${heightfield.clearance.oldClearNewBlocked} vs columns ${columns.clearance.oldClearNewBlocked} newly blocked poses`);
  console.log(JSON.stringify({ shellNewlyBlocked: shell.protected.newlyBlocked, columnsNewlyBlocked: columns.protected.newlyBlocked }));
});

test("cave biome (LC Canopy): the compact format answers exactly as LC's chunk colliders", () => {
  const scene = biomeScene(), r = probe(scene, { ...FULL, poses: 8000, moves: 4000 });
  console.log(summary(r), JSON.stringify({ lcBytes: scene.lcBytes, compactBytes: scene.after.bytes, shared: scene.after.sharedBytes, chunks: scene.chunks }));
  assert.equal(r.clearance.agree, r.clearance.tried, JSON.stringify(r.examples.slice(0, 3)));
  assert.equal(r.moves.agree, r.moves.tried, JSON.stringify(r.examples.slice(0, 3)));
  assert.equal(r.support.agree, r.support.tried);
  assert.equal(r.sight.agree, r.sight.tried);
  assert.deepEqual([r.protected.newlyBlocked, r.protected.newlyCleared], [[], []]);
  assert.ok(scene.after.bytes < scene.lcBytes * 0.5, `compact ${scene.after.bytes} B vs LC ${scene.lcBytes} B`);
});
