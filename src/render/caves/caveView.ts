import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { caves, type CaveDef } from "../../content/regions/caves.js";
import { worldFloor } from "../../content/regions/worldFloor.js";
import { CaveLighting } from "./caveMaterial.js";
import { caveLightField, type CaveLightField } from "./lightField.js";

/** Within this many metres of a footprint, a cave's light field is active. */
export const CAVE_ACTIVE_RANGE = 60;

/** The renderer's cave light (C4): one `CaveLighting` feeding the scene's cel
 * material. The nearest cave within `CAVE_ACTIVE_RANGE` of the camera is the
 * active one; its field is built in idle time (`prepare`) or, failing that,
 * on first approach (about 0.1 s, once). The lamp is the camera's. */
export interface CaveView {
  /** Idle-time construction; true while there was work to do. */
  prepare(): boolean;
  update(camera: Vector3, forward: Vector3, lamp: boolean): void;
  /** The active cave's ID, or null. */
  readonly active: string | null;
  dispose(): void;
}

export function createCaveView(scene: Scene, materials: readonly ShaderMaterial[]): CaveView {
  const lighting = new CaveLighting(scene, materials);
  const fields = new Map<string, CaveLightField>();
  let defs: readonly CaveDef[] | null = null, active: string | null = null;
  const all = (): readonly CaveDef[] => defs ??= caves(worldFloor);
  const field = (def: CaveDef): CaveLightField => {
    let f = fields.get(def.id);
    if (!f) fields.set(def.id, f = caveLightField(def, worldFloor));
    return f;
  };
  const reach = (def: CaveDef, p: Vector3): number => {
    const r = def.replacementFootprints[0]!;
    return Math.hypot(Math.max(0, r.minX - p.x, p.x - r.maxX), Math.max(0, r.minZ - p.z, p.z - r.maxZ));
  };
  return {
    get active() { return active; },
    prepare() {
      const next = all().find(d => !fields.has(d.id));
      if (!next) return false;
      field(next);
      return true;
    },
    update(camera, forward, lamp) {
      let best: CaveDef | null = null, bestReach = CAVE_ACTIVE_RANGE;
      for (const def of all()) {
        const r = reach(def, camera);
        if (r <= bestReach) { best = def; bestReach = r; }
      }
      active = best?.id ?? null;
      lighting.setField(best ? field(best) : null);
      lighting.apply({ on: lamp, position: camera, direction: forward.lengthSquared() > 0 ? forward.normalizeToNew() : new Vector3(0, 0, -1) });
    },
    dispose() { lighting.dispose(); },
  };
}
