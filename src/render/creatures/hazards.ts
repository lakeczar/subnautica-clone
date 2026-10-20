import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { HAZARD_FIELDS } from "../../content/ecology/hazards.js";
import { sitePosition } from "../../content/ecology/sites.js";
import type { HazardFieldId } from "../../content/ecology/hazards.js";
import { seeded } from "../geometry.js";
import { PALETTE as P } from "../palette.js";
import { creatureParts, Display, revolve } from "./kit.js";

/** Field cues that the simulation's hazards need to be legible: the plume
 * column's rising shimmer rings, the mirror layer's surface and the Basin
 * lane's sediment wall. Region art (S2) may replace these; each only reads
 * `fieldLevel` from the ecology view and never decides harm. */
export function createHazardCues(scene: Scene, cel: Material, name: string, parent?: TransformNode) {
  const parts = creatureParts(scene, cel, name, parent), random = seeded(4242);
  const plume = HAZARD_FIELDS.rift_split_plume, c = sitePosition(plume.shape.center);
  const rings: { mesh: Mesh; glow: Display; offset: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const mesh = parts.part(`plume.ring.${i}`, b => {
      revolve(b, [0, 0, 0], [[plume.shape.radius * 0.45, 0], [plume.shape.radius * 0.6, 1.4], [plume.shape.radius * 0.5, 2.8]], "#ffb36b", P.orange, 14);
    }, undefined, 0);
    rings.push({ mesh, glow: new Display(mesh, () => true), offset: i / 7 });
  }
  const chimney = parts.part("plume.chimney", b => {
    revolve(b, [c.x, c.y - 2, c.z], [[7, 0], [5.5, 6], [4.2, 12], [3.4, 15]], "#4d3a3a", "#6b4a3d", 12);
    revolve(b, [c.x, c.y + 12.6, c.z], [[3.5, 0], [4.4, 0.6]], "#e8d8b8", "#d9c49a", 12);
  });
  const layer = HAZARD_FIELDS.divide_dense_layer, lc = sitePosition(layer.shape.center), ly = lc.y + layer.shape.y;
  const mirror = parts.part("divide.mirror", b => {
    const size = 8, nx = 12, nz = 10;
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = lc.x - (nx * size) / 2 + i * size, z = lc.z - (nz * size) / 2 + k * size, wobble = (random() - 0.5) * 0.15;
      b.face([[x, ly + wobble, z], [x + size, ly, z], [x + size, ly + wobble, z + size], [x, ly, z + size]], (i + k) % 2 ? P.reflection : "#b8dfe0");
    }
  }, undefined, 0);
  const mirrorDisplay = new Display(mirror, () => true);
  mirrorDisplay.set(0.85, true);
  const lane = HAZARD_FIELDS.basin_sediment_lane, sc = sitePosition(lane.shape.center);
  const silt = parts.part("basin.surge", b => {
    for (let i = 0; i < 140; i++) {
      const x = sc.x + lane.shape.min.x + random() * (lane.shape.max.x - lane.shape.min.x);
      const y = sc.y + lane.shape.min.y + random() * (lane.shape.max.y - lane.shape.min.y);
      const z = sc.z + lane.shape.min.z + random() * (lane.shape.max.z - lane.shape.min.z);
      b.face([[x, y, z], [x + 0.5, y + 0.12, z], [x + 0.18, y + 0.5, z + 0.2]], i % 2 ? P.steelLight : "#c2cdc3");
    }
  }, undefined, 0);
  const levelOf = (fields: readonly { id: HazardFieldId; level: number }[], id: HazardFieldId): number => fields.find(f => f.id === id)?.level ?? 0;
  return {
    root: parts.root, meshes: [...rings.map(r => r.mesh), chimney, mirror, silt],
    update(fields: readonly { id: HazardFieldId; level: number }[], seconds: number) {
      // Baseline 0.3 reads as faint shimmer; the vent is bright, fast and tall.
      const heat = levelOf(fields, "rift_split_plume"), active = Math.max(0, (heat - (plume.baseline ?? 0)) / (1 - (plume.baseline ?? 0)));
      const height = plume.shape.top * (0.25 + 0.75 * active);
      for (const r of rings) {
        const t = (r.offset + seconds * (0.05 + active * 0.25)) % 1;
        r.mesh.position.set(c.x, c.y + 12 + t * height, c.z);
        r.mesh.scaling.setAll(0.8 + t * (0.6 + active));
        r.mesh.rotation.y = seconds * 0.2 + r.offset * 3;
        r.glow.set((0.35 + active * 1.1) * (1 - t * 0.7), active > 0.05);
      }
      const surge = levelOf(fields, "basin_sediment_lane");
      silt.setEnabled(surge > 0.12);
      // Scale about the lane floor so the wall rises out of the sediment.
      const floor = sc.y + lane.shape.min.y, rise = 0.2 + 0.8 * surge;
      silt.scaling.set(1, rise, 1);
      silt.position.set(0, floor * (1 - rise), Math.sin(seconds * 0.4) * 0.4);
    },
    dispose: () => parts.dispose(),
  };
}
