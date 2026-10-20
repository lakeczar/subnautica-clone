import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { RawTexture3D } from "@babylonjs/core/Materials/Textures/rawTexture3D.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture.js";
import { CEL_FRAGMENT, CEL_UNIFORMS, CEL_VERTEX, LIGHT_DIRECTION } from "../../materials.js";
import type { RockGrid } from "../lightField.js";
import { windowCentre, windowJob, type OccupancySource } from "../../../world/caves/large/lampWindow.js";
import type { Vec3 } from "../../../world/types.js";
import { CAVE_CURVE, DEFAULT_LAMP, LARGE_CAVE_ATTRIBUTE, LARGE_CAVE_SAMPLERS, LARGE_CAVE_UNIFORMS, injectLargeCaveLight, lampUniform, type LampSettings } from "./caveShader.js";

/** Babylon side of cave-biome light: one cel material for every cave chunk
 * (light is per vertex), and the lamp window, a double-buffered R8 3D
 * texture of exact occupancy rebuilt in slices whenever the lamp's snapped
 * centre moves. INTEGRATION: `materials.ts` would own the splice (see LC.md). */

const RED = 6; // Constants.TEXTUREFORMAT_R
const STAGES = injectLargeCaveLight(CEL_VERTEX, CEL_FRAGMENT);

export function createLargeCaveMaterial(scene: Scene, name = "lc.cave.cel"): ShaderMaterial {
  const material = new ShaderMaterial(name, scene, { vertexSource: STAGES.vertex, fragmentSource: STAGES.fragment }, {
    attributes: ["position", "normal", "color", LARGE_CAVE_ATTRIBUTE], uniforms: [...CEL_UNIFORMS, ...LARGE_CAVE_UNIFORMS], samplers: [...LARGE_CAVE_SAMPLERS],
  }, true);
  material.backFaceCulling = false;
  material.setVector3("lightDirection", LIGHT_DIRECTION);
  material.setFloat("time", 0);
  material.setFloat("underwater", 1);
  material.setVector3("cameraPosition", Vector3.Zero());
  material.setColor3("fogColor", Color3.FromHexString("#a5ccd1"));
  material.setColor3("waterFogColor", Color3.FromHexString("#237e89"));
  material.setFloat("fogDensity", 0.0105);
  material.setVector3("carrierPosition", Vector3.Zero());
  material.setFloat("carrierYaw", 0);
  material.setFloat("carrierPresent", 0);
  material.setVector3("carrierAirMin", Vector3.Zero());
  material.setVector3("carrierAirMax", Vector3.Zero());
  material.setVector4("caveCurve", new Vector4(...CAVE_CURVE));
  material.setVector4("caveTint", new Vector4(1, 1, 1, 0));
  return material;
}

export interface LampState { readonly on: boolean; readonly position: Vec3; readonly direction: Vec3 }

export class LampWindow {
  private shown: { grid: RockGrid; texture: RawTexture3D } | null = null;
  private job: { centre: Vec3; gen: Generator<void, RockGrid> } | null = null;
  private readonly empty: RawTexture3D;
  /** Windows built so far, and the longest single build step (ms). */
  readonly stats = { built: 0, maxStepMs: 0, bytes: 0 };
  constructor(private readonly scene: Scene, private readonly materials: readonly ShaderMaterial[], private readonly source: OccupancySource,
    private readonly lamp: LampSettings = DEFAULT_LAMP) {
    this.empty = this.make({ min: { x: 0, y: 0, z: 0 }, voxel: 1, nx: 1, ny: 1, nz: 1, data: new Uint8Array([0]) });
  }
  private make(g: RockGrid): RawTexture3D {
    const t = new RawTexture3D(g.data, g.nx, g.ny, g.nz, RED, this.scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    t.wrapU = t.wrapV = t.wrapR = Texture.CLAMP_ADDRESSMODE;
    return t;
  }
  get grid(): RockGrid | null { return this.shown?.grid ?? null; }
  /** Advance the window towards the viewer within `budgetMs`. */
  update(viewer: Vec3, budgetMs = 1.5, now: () => number = () => performance.now()): void {
    const c = windowCentre(viewer), cur = this.job?.centre ?? this.centreOf();
    if (!cur || cur.x !== c.x || cur.y !== c.y || cur.z !== c.z) this.job = { centre: c, gen: windowJob(this.source, c) };
    if (!this.job) return;
    const start = now();
    while (now() - start < budgetMs) {
      const s0 = now(), r = this.job.gen.next();
      this.stats.maxStepMs = Math.max(this.stats.maxStepMs, now() - s0);
      if (!r.done) continue;
      const texture = this.make(r.value);
      this.shown?.texture.dispose();
      this.shown = { grid: r.value, texture };
      this.stats.built++; this.stats.bytes = r.value.data.byteLength;
      this.job = null;
      break;
    }
  }
  private centreOf(): Vec3 | null {
    const g = this.shown?.grid;
    if (!g) return null;
    const h = g.voxel, half = g.nx / 2;
    return windowCentre({ x: g.min.x + (half + 0.5) * h, y: g.min.y + (half + 0.5) * h, z: g.min.z + (half + 0.5) * h });
  }
  /** Per frame: lamp, window and zone tint on every cave material. */
  apply(lamp: LampState, tint: readonly [number, number, number], inside: number): void {
    const g = this.shown?.grid, params = lampUniform(lamp.on, this.lamp);
    for (const m of this.materials) {
      m.setTexture("caveRock", this.shown?.texture ?? this.empty);
      m.setFloat("caveRockOn", g ? 1 : 0);
      m.setVector3("caveRockMin", g ? new Vector3(g.min.x, g.min.y, g.min.z) : Vector3.Zero());
      m.setFloat("caveRockVoxel", g ? g.voxel : 1);
      m.setVector3("caveRockDims", g ? new Vector3(g.nx, g.ny, g.nz) : Vector3.One());
      m.setVector3("lampPosition", new Vector3(lamp.position.x, lamp.position.y, lamp.position.z));
      m.setVector3("lampDirection", new Vector3(lamp.direction.x, lamp.direction.y, lamp.direction.z));
      m.setVector4("lampParams", new Vector4(...params));
      m.setColor3("lampColor", new Color3(...this.lamp.color));
      m.setVector4("caveTint", new Vector4(tint[0], tint[1], tint[2], inside));
    }
  }
  dispose(): void { this.shown?.texture.dispose(); this.empty.dispose(); }
}
