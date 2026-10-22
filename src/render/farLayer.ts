import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { STRUCTURES, type StructureDef } from "../content/regions/structures.js";
import { chunkId, columnAt } from "../world/frame.js";
import type { Residency } from "../world/residency.js";
import { ArtBatch } from "./geometry.js";

/** The far layer (CW-1, owner rule "seeing far stays intact"): the tallest
 * landmarks as cheap silhouettes, each with a lamp on top, always resident.
 * A landmark's silhouette shows only while no LOD of its chunk is drawn
 * (beyond the coarse band, or a chunk cut under byte pressure), so distant
 * landmarks and their lights never pop out while detail streams in, and
 * nothing is drawn twice up close. The lamps are emissive, so the scene
 * lights (ATM-1) carry them as point lights too. A few hundred triangles. */

/** Structures at least this tall are far landmarks. */
export const FAR_LANDMARK_HEIGHT = 20;
const SILHOUETTE: Partial<Record<StructureDef["region"], string>> = {
  thermal_rift: "#2c2526", brine_divide: "#4b4760", deep_district: "#3c403c", island_chain: "#3a4642", silt_basin: "#4a504d",
};
const LAMP: Partial<Record<StructureDef["region"], string>> = {
  thermal_rift: "#ff8a3d", brine_divide: "#c7a8ff", deep_district: "#ffd47c", island_chain: "#ffe2a0", silt_basin: "#ffc070",
};
const height = (s: StructureDef): number => Math.max(...s.solids.map(b => b.max.y)) - Math.min(...s.solids.map(b => b.min.y));
export const farLandmarks = (): readonly StructureDef[] => STRUCTURES.filter(s => height(s) >= FAR_LANDMARK_HEIGHT);

export function createFarLayer(scene: Scene, cel: ShaderMaterial, residency: Pick<Residency, "units">) {
  const items = farLandmarks().map(s => {
    const b = new ArtBatch(`far.${s.id}`, scene, cel);
    for (const box of s.solids) b.bounds(box, SILHOUETTE[s.region] ?? "#40464a");
    const top = Math.max(...s.solids.map(x => x.max.y));
    b.glow(b.box([s.x, top + 0.8, s.z], [1.6, 1.6, 1.6], LAMP[s.region] ?? "#ffd47c"));
    const mesh: Mesh = b.finish();
    mesh.renderingGroupId = 1;
    mesh.setEnabled(false);
    const c = columnAt(s.x, s.z);
    return { id: s.id, mesh, chunk: c ? chunkId({ ix: c.ix, iz: c.iz, layer: 0 }) : null };
  });
  let frame = 0, shown = 0;
  return {
    get shown() { return shown; },
    /** Every few frames: show each silhouette whose chunk nothing draws. */
    update(): void {
      if (frame++ % 15) return;
      const drawn = new Set(residency.units().filter(u => u.state === "shown").map(u => u.chunk));
      shown = 0;
      for (const it of items) {
        const on = !it.chunk || !drawn.has(it.chunk);
        it.mesh.setEnabled(on);
        if (on) shown++;
      }
    },
    dispose(): void { for (const it of items) it.mesh.dispose(); },
  };
}
