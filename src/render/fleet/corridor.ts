/** UX-1: the Hearthline's lock corridor drawn in the world (render/corridorView.ts
 * decides what). A projection over the scene, in its own rendering group, so the
 * helm sees it through the bridge floor and a pilot outside sees the lock mouth
 * from anywhere nearby. */
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { carrierHull, localToWorld } from "../../sim/carrier.js";
import type { GameState, WorldQueries } from "../../sim/types.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { CORRIDOR_COLORS, corridorDrawing, corridorFaces, corridorLines } from "../corridorView.js";

export function createLaunchCorridor(scene: Scene) {
  let mesh: LinesMesh | null = null, shape = "", disposed = false;
  // A faint volume under the lines: one-pixel lines alone read poorly through the bridge floor.
  const ghost = new Mesh("carrier.corridor.ghost", scene), material = new StandardMaterial("carrier.corridor.ghost", scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  ghost.material = material;
  ghost.isPickable = false;
  ghost.renderingGroupId = 2;
  // Compile now with a placeholder quad, so the first helm frame does not stall on it.
  const seed = new VertexData();
  seed.positions = [0, -1e4, 0, 1, -1e4, 0, 1, -1e4, 1];
  seed.indices = [0, 1, 2];
  seed.applyToMesh(ghost, true);
  material.forceCompilation(ghost);
  ghost.setEnabled(false);
  return {
    update(s: GameState | null, world: WorldQueries): void {
      if (disposed) return;
      const d = s ? corridorDrawing(s, world) : null, h = s ? carrierHull(s) : undefined;
      if (!d || !h) { mesh?.setEnabled(false); ghost.setEnabled(false); return; }
      const lines = corridorLines(d).map((strip) => strip.map((p) => {
        const q = localToWorld(p, h);
        return new Vector3(q.x, q.y, q.z);
      }));
      const key = lines.map((l) => l.length).join(",");
      if (!mesh || key !== shape) {
        mesh?.dispose();
        mesh = CreateLineSystem("carrier.corridor", { lines, updatable: true }, scene);
        mesh.isPickable = false;
        mesh.renderingGroupId = 2;
        shape = key;
      } else CreateLineSystem("carrier.corridor", { lines, instance: mesh }, scene);
      const color = Color3.FromHexString(d.mode === "guide" ? CORRIDOR_COLORS.guide : d.clear ? CORRIDOR_COLORS.clear : CORRIDOR_COLORS.blocked);
      mesh.color = color;
      mesh.alpha = d.mode === "guide" ? 0.6 : 0.85;
      mesh.setEnabled(true);
      const data = new VertexData(), positions: number[] = [], indices: number[] = [];
      for (const quad of corridorFaces(d)) {
        const n = positions.length / 3;
        for (const p of quad) { const q = localToWorld(p, h); positions.push(q.x, q.y, q.z); }
        indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
      }
      data.positions = positions;
      data.indices = indices;
      data.applyToMesh(ghost, true);
      material.emissiveColor = color;
      material.alpha = d.mode === "guide" ? 0.1 : 0.16;
      ghost.setEnabled(true);
    },
    get visible(): boolean { return !!mesh?.isEnabled(); },
    dispose(): void {
      disposed = true;
      mesh?.dispose();
      ghost.dispose();
      material.dispose();
      mesh = null;
    },
  };
}
