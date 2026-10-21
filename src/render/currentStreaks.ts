import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { volumeBounds, volumeWeight } from "../sim/currents/flow.js";
import { flowAt, worldCurrents } from "../sim/currents/world.js";
import type { CurrentVolumeDef } from "../sim/currents/types.js";
import type { Vec3 } from "../sim/types.js";
import { uploadMesh } from "./kit/loader.js";
import type { MeshRecipe } from "./kit/types.js";

/** Visible currents (C4): pale grit streaks carried by the real flow field in
 * every current volume near the camera, so a current reads before it pushes
 * (CY: never colour alone). Presentation only; each streak follows
 * `flowAt`, so it slackens and runs with the volume's cycle. One thin-instance
 * batch on the scene's cel material. */
const PER_VOLUME = 140;
const NEAR = 110;
/** Streaks are seeded within this many metres of the camera on each axis. */
const SPAWN = 35;
const MAX_STREAKS = PER_VOLUME * 3;

function streakRecipe(): MeshRecipe {
  // A slim unlit box, 1 m along +Z, scaled per instance by the local speed.
  const w = 0.025, positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const corners = [[-w, -w], [w, -w], [w, w], [-w, w]] as const;
  for (const z of [-0.5, 0.5]) for (const [x, y] of corners) {
    positions.push(x, y, z); normals.push(x / w, y / w, 0); colors.push(0.78, 0.86, 0.84, -1);
  }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    indices.push(i, j, 4 + j, i, 4 + j, 4 + i);
  }
  return { name: "current.streak", positions: new Float32Array(positions), normals: new Float32Array(normals),
    colors: new Float32Array(colors), indices: new Uint16Array(indices) };
}

interface Streak { p: Vec3; volume: number }

export interface CurrentStreaks {
  update(camera: Vec3, tick: number, visible: boolean): void;
  readonly shown: number;
  dispose(): void;
}

export function createCurrentStreaks(scene: Scene, material: ShaderMaterial): CurrentStreaks {
  const mesh: Mesh = uploadMesh(streakRecipe(), "current.streaks", scene, material);
  mesh.renderingGroupId = 1;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  const matrices = new Float32Array(MAX_STREAKS * 16);
  mesh.thinInstanceSetBuffer("matrix", matrices, 16, false);
  mesh.thinInstanceCount = 0;
  const volumes = worldCurrents().volumes, boxes = volumes.map(volumeBounds);
  const streaks = new Map<number, Streak[]>();
  let seed = 0x9e3779b9, lastTick = -1, shown = 0;
  const random = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  /** A point in the volume's flow, near the camera (long volumes such as the
   * Divide crest are hundreds of metres; only the part in view gets grit). */
  const spawn = (v: CurrentVolumeDef, i: number, camera: Vec3): Vec3 | null => {
    const box = boxes[i]!, r = SPAWN;
    const b = { min: { x: Math.max(box.min.x, camera.x - r), y: Math.max(box.min.y, camera.y - r), z: Math.max(box.min.z, camera.z - r) },
      max: { x: Math.min(box.max.x, camera.x + r), y: Math.min(box.max.y, camera.y + r), z: Math.min(box.max.z, camera.z + r) } };
    if (b.min.x > b.max.x || b.min.y > b.max.y || b.min.z > b.max.z) return null;
    for (let tries = 0; tries < 12; tries++) {
      const p = { x: b.min.x + random() * (b.max.x - b.min.x), y: b.min.y + random() * (b.max.y - b.min.y), z: b.min.z + random() * (b.max.z - b.min.z) };
      if (volumeWeight(v, p) > 0.3) return p;
    }
    return null;
  };
  return {
    get shown() { return shown; },
    update(camera, tick, visible) {
      const dt = lastTick < 0 ? 0 : Math.max(0, Math.min(0.1, (tick - lastTick) / 60));
      lastTick = tick;
      shown = 0;
      if (visible) volumes.forEach((v, i) => {
        const b = boxes[i]!;
        const far = Math.hypot(Math.max(0, b.min.x - camera.x, camera.x - b.max.x), Math.max(0, b.min.y - camera.y, camera.y - b.max.y),
          Math.max(0, b.min.z - camera.z, camera.z - b.max.z));
        if (far > NEAR) { streaks.delete(i); return; }
        let list = streaks.get(i);
        if (!list) streaks.set(i, list = []);
        while (list.length < PER_VOLUME) { const p = spawn(v, i, camera); if (!p) break; list.push({ p, volume: i }); }
        for (const s of list) {
          if (shown >= MAX_STREAKS) break;
          const f = flowAt(s.p, tick).flow, speed = Math.hypot(f.x, f.y, f.z);
          s.p = { x: s.p.x + f.x * dt, y: s.p.y + f.y * dt, z: s.p.z + f.z * dt };
          if (volumeWeight(v, s.p) < 0.05 || Math.hypot(s.p.x - camera.x, s.p.y - camera.y, s.p.z - camera.z) > SPAWN * 1.8) {
            const p = spawn(v, i, camera); if (p) s.p = p;
            continue;
          }
          if (speed < 0.15) continue;
          // Basis: +Z along the flow, scaled by speed; X and Y thin.
          const fx = f.x / speed, fy = f.y / speed, fz = f.z / speed;
          const ux0 = Math.abs(fy) > 0.95 ? 1 : 0, uy0 = Math.abs(fy) > 0.95 ? 0 : 1;
          let rx = uy0 * fz, ry = -ux0 * fz, rz = ux0 * fy - uy0 * fx;
          const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
          const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
          const len = 0.35 + 0.45 * speed, o = shown * 16;
          matrices.set([rx, ry, rz, 0, ux, uy, uz, 0, fx * len, fy * len, fz * len, 0, s.p.x, s.p.y, s.p.z, 1], o);
          shown++;
        }
      });
      mesh.thinInstanceCount = shown;
      mesh.thinInstanceBufferUpdated("matrix");
      mesh.setEnabled(shown > 0);
    },
    dispose() { mesh.dispose(false, false); },
  };
}
