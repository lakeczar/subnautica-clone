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
import { CORRIDOR_COLORS, corridorDrawing, corridorLines } from "../corridorView.js";

export function createLaunchCorridor(scene: Scene) {
  let mesh: LinesMesh | null = null, shape = "", disposed = false;
  return {
    update(s: GameState | null, world: WorldQueries): void {
      if (disposed) return;
      const d = s ? corridorDrawing(s, world) : null, h = s ? carrierHull(s) : undefined;
      if (!d || !h) { mesh?.setEnabled(false); return; }
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
      mesh.color = Color3.FromHexString(d.mode === "guide" ? CORRIDOR_COLORS.guide : d.clear ? CORRIDOR_COLORS.clear : CORRIDOR_COLORS.blocked);
      mesh.alpha = d.mode === "guide" ? 0.6 : 0.85;
      mesh.setEnabled(true);
    },
    get visible(): boolean { return !!mesh?.isEnabled(); },
    dispose(): void {
      disposed = true;
      mesh?.dispose();
      mesh = null;
    },
  };
}
