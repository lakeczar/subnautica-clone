import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { caveDef, CAVE_SOURCES, type CaveSource } from "../../content/regions/caves.js";
import { worldFloor } from "../../content/regions/worldFloor.js";
import { CaveLighting } from "./caveMaterial.js";
import { caveLightField, type CaveLightField } from "./lightField.js";

/** Within this many metres of a footprint, a cave's light field is active. */
export const CAVE_ACTIVE_RANGE = 60;
/** Caves whose textures are made ahead: the cache keeps four, one is active. */
const UPLOAD_AHEAD = 3;

/** Where light fields come from: the baked store in the browser (null while
 * a field is fetched), or generation (Node, tools, a dev build without a
 * bake). `settled` says a null will not change by waiting. */
export interface CaveFieldSource {
  field(id: string): CaveLightField | null;
  settled(id: string): boolean;
}
/** Generated fields, built on first ask (about 0.1–1 s each). */
export const liveCaveFields: CaveFieldSource = {
  field: id => caveLightField(caveDef(id, worldFloor), worldFloor),
  settled: () => true,
};

/** The renderer's cave light (C4, streamed since CW-1): one `CaveLighting`
 * feeding the scene's cel material. The active cave is the one whose
 * footprint holds the camera, else the nearest within `CAVE_ACTIVE_RANGE`,
 * so in a linked network the light switches at the seam. Fields and their
 * textures arrive ahead of use: the streamer names the caves to fetch and
 * to upload (`stream`), one texture set per frame. A field still in flight
 * when its cave becomes active draws as open water until it lands; with
 * the bake that never happens in ordinary play (fetch from 300 m). Without a
 * store, `prepare` builds nearby fields in idle time. The lamp is the camera's. */
export interface CaveView {
  /** Idle-time construction (live fields only); true while there was work to do. */
  prepare(): boolean;
  /** Streamer wishes for this frame: fields to fetch, textures to upload. */
  stream(light: readonly string[], upload: readonly string[]): void;
  update(camera: Vector3, forward: Vector3, lamp: boolean): void;
  /** The active cave's ID, or null. */
  readonly active: string | null;
  /** Active frames whose field was not ready yet (drawn as open water). */
  readonly stats: { readonly missing: number; readonly uploads: number; readonly textureBytes: number };
  dispose(): void;
}

export function createCaveView(scene: Scene, materials: readonly ShaderMaterial[], source: CaveFieldSource = liveCaveFields): CaveView {
  const lighting = new CaveLighting(scene, materials);
  const live = source === liveCaveFields;
  const built = new Map<string, CaveLightField>();
  let active: string | null = null, missing = 0, near: readonly string[] = [];
  const field = (id: string): CaveLightField | null => {
    let f = built.get(id) ?? null;
    if (!f) { f = source.field(id); if (f && live) built.set(id, f); }
    return f;
  };
  const reach = (s: CaveSource, p: Vector3): number => {
    const r = s.footprint;
    return Math.hypot(Math.max(0, r.minX - p.x, p.x - r.maxX), Math.max(0, r.minZ - p.z, p.z - r.maxZ));
  };
  return {
    get active() { return active; },
    get stats() { return { missing, uploads: lighting.stats.uploads, textureBytes: lighting.stats.bytes }; },
    prepare() {
      // Live fields only: the nearest the streamer named that is not built.
      if (!live) return false;
      const next = near.find(id => !built.has(id));
      if (!next) return false;
      field(next);
      return true;
    },
    stream(light, upload) {
      near = light;
      if (live) return;
      for (const id of light) source.field(id);
      // One new texture set per frame, nearest first, and never more caves
      // than the texture cache keeps (more would evict and re-upload forever).
      for (const id of upload.slice(0, UPLOAD_AHEAD)) {
        const f = source.field(id);
        if (f && !lighting.has(f)) { lighting.upload(f); break; }
      }
    },
    update(camera, forward, lamp) {
      let best: CaveSource | null = null, bestReach = CAVE_ACTIVE_RANGE;
      for (const s of CAVE_SOURCES) {
        const r = reach(s, camera);
        if (r <= bestReach) { best = s; bestReach = r; }
        if (r === 0) break;
      }
      active = best?.id ?? null;
      const f = best ? field(best.id) : null;
      if (best && !f) missing++;
      lighting.setField(f);
      lighting.apply({ on: lamp, position: camera, direction: forward.lengthSquared() > 0 ? forward.normalizeToNew() : new Vector3(0, 0, -1) });
    },
    dispose() { lighting.dispose(); },
  };
}
