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
      revolve(b, [0, 0, 0], [[plume.shape.radius * 0.5, 0], [plume.shape.radius * 0.58, 0.35], [plume.shape.radius * 0.52, 0.7]], "#ffb36b", P.orange, 14);
    }, undefined, 0);
    rings.push({ mesh, glow: new Display(mesh, () => true), offset: i / 7 });
  }
  // The chimney itself is S2's region art (`rift.split_chimney.columns`); the
  // field's centre is its lip, so the rings rise from there.
  const layer = HAZARD_FIELDS.divide_dense_layer, lc = sitePosition(layer.shape.center), ly = lc.y + layer.shape.y;
  // Sparse elongated glints rather than a solid sheet: the interface reads as
  // a bright shimmering surface while the animal below it stays visible.
  const mirror = parts.part("divide.mirror", b => {
    const w = layer.shape.max.x - layer.shape.min.x, d = layer.shape.max.z - layer.shape.min.z;
    for (let i = 0; i < 420; i++) {
      const x = lc.x + (random() - 0.5) * w * 0.5, z = lc.z + (random() - 0.5) * d * 0.5;
      const len = 2.5 + random() * 5, wid = 0.25 + random() * 0.55, a = 0.35 + (random() - 0.5) * 0.5;
      const ux = Math.cos(a) * len, uz = Math.sin(a) * len, vx = -Math.sin(a) * wid, vz = Math.cos(a) * wid, y = ly + (random() - 0.5) * 0.12;
      b.face([[x - ux, y, z - uz], [x + vx, y, z + vz], [x + ux, y, z + uz], [x - vx, y, z - vz]], i % 3 ? P.reflection : "#d8f0ec");
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
    root: parts.root, meshes: [...rings.map(r => r.mesh), mirror, silt],
    update(fields: readonly { id: HazardFieldId; level: number }[], seconds: number) {
      // Baseline 0.3 reads as faint shimmer; the vent is bright, fast and tall.
      const heat = levelOf(fields, "rift_split_plume"), active = Math.max(0, (heat - (plume.baseline ?? 0)) / (1 - (plume.baseline ?? 0)));
      const height = plume.shape.top * (0.25 + 0.75 * active);
      for (const r of rings) {
        const t = (r.offset + seconds * (0.05 + active * 0.25)) % 1;
        r.mesh.position.set(c.x, c.y + t * height, c.z);
        // Between vents only two faint rings shimmer at the lip; a vent lights the column.
        r.mesh.setEnabled(active > 0.05 || t < 0.3);
        r.mesh.scaling.set(0.8 + t * (0.6 + active), 1 + active * 2, 0.8 + t * (0.6 + active));
        r.mesh.rotation.y = seconds * 0.2 + r.offset * 3;
        r.glow.set(active > 0.05 ? (0.5 + active) * (1 - t * 0.6) : 0.7, true);
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
