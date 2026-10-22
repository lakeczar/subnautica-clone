import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { THREATS, THREAT_AGENT_IDS } from "../../content/ecology/species.js";
import type { ThreatAgentId } from "../../content/ecology/species.js";
import { layerY, speciesOf } from "../../sim/ecology/agents.js";
import { cueHome } from "../../sim/ecology/cues.js";
import { MAX_DETERRENTS } from "../../sim/ecology/ecology.js";
import type { EcologyView } from "../../sim/ecology/ecology.js";
import type { Vec3 } from "../../sim/types.js";
import { createHollowChoir } from "./choir.js";
import { createBrineSails, createDeterrents, createEmberMites } from "./cues.js";
import { createHazardCues } from "./hazards.js";
import { createLayerSkate } from "./skate.js";
import { createGlareStalker } from "./stalker.js";
import { createFauna } from "./fauna.js";
import type { GameState } from "../../sim/types.js";
import type { CreatureView } from "./types.js";

export interface CreatureLayer {
  readonly root: TransformNode;
  /** Every mesh the layer owns, for budgets and tests. */
  readonly meshes: readonly Mesh[];
  /** Pose all creatures and cues from the derived view. Never writes state.
   * With `state`, CR-1's grounds, falls and laying skates are posed too. */
  update(view: EcologyView, seconds: number, camera?: Vec3, state?: GameState): void;
  dispose(): void;
}
/** Beyond this distance from the camera a creature is disabled, not destroyed. */
export const CREATURE_CULL_DISTANCE = 180;

/** One owned layer for every later-region species, cue animal, deterrent and
 * field cue. Built once per scene; S1's residency can disable it by region. */
export function createCreatureLayer(scene: Scene, cel: Material, parent?: TransformNode): CreatureLayer {
  const root = new TransformNode("creatures", scene);
  if (parent) root.parent = parent;
  const threats = new Map<ThreatAgentId, CreatureView>();
  for (const id of THREAT_AGENT_IDS) {
    const name = `creature.${speciesOf(id)}.${id}`, species = speciesOf(id);
    threats.set(id, species === "glare_stalker" ? createGlareStalker(scene, cel, name, root)
      : species === "layer_skate" ? createLayerSkate(scene, cel, name, layerY("divide_dense_layer"), root)
      : createHollowChoir(scene, cel, name, THREATS.hollow_choir.reach, root));
  }
  const mites = createEmberMites(scene, cel, "creature.ember_mites.rift_mites_lip", cueHome("rift_mites_lip"), 14, root);
  const sails = createBrineSails(scene, cel, "creature.brine_sails.divide_sails_lane", 3, root);
  const deterrents = createDeterrents(scene, cel, "creature.deterrents", MAX_DETERRENTS, root);
  const fields = createHazardCues(scene, cel, "creature.fields", root);
  const fauna = createFauna(scene, cel, root);
  const meshes = [...[...threats.values()].flatMap(v => v.meshes), ...mites.meshes, ...sails.meshes, ...deterrents.meshes, ...fields.meshes, ...fauna.meshes];
  const near = (p: Vec3, camera: Vec3 | undefined): boolean =>
    !camera || Math.hypot(p.x - camera.x, p.y - camera.y, p.z - camera.z) <= CREATURE_CULL_DISTANCE;
  let disposed = false;
  return {
    root, meshes,
    update(view, seconds, camera, state) {
      if (disposed) return;
      for (const pose of view.threats) {
        const v = threats.get(pose.id);
        if (!v) continue;
        const visible = near(pose.position, camera);
        v.root.setEnabled(visible);
        if (visible) v.update(pose, seconds);
      }
      const lip = cueHome("rift_mites_lip");
      mites.root.setEnabled(near(lip, camera));
      mites.update(view.mites.scatter, seconds);
      sails.update(view.sails.filter(p => near(p, camera)), seconds);
      deterrents.update(view.deterrents, seconds);
      fields.update(view.fields, seconds);
      if (state) fauna.update(state, seconds, camera, near);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const v of threats.values()) v.dispose();
      mites.dispose(); sails.dispose(); deterrents.dispose(); fields.dispose(); fauna.dispose();
      root.dispose(false, false);
    },
  };
}
