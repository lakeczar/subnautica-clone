import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { RawTexture3D } from "@babylonjs/core/Materials/Textures/rawTexture3D.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture.js";
import { CEL_FRAGMENT, CEL_UNIFORMS, CEL_VERTEX, LIGHT_DIRECTION } from "../materials.js";
import { CAVE_SAMPLERS, CAVE_UNIFORMS, DEFAULT_LAMP, curveUniform, injectCaveLight, lampUniform, type LampSettings } from "./caveLight.js";
import type { CaveLightField } from "./lightField.js";

/** Babylon side of cave light: a cel material with the cave splice, the
 * light field and the exact rock occupancy as 3D textures, and per-frame lamp
 * and field uniforms. A prototype for the lab; `docs/build/streams/W1-PRE.md`
 * lists the changes `materials.ts` needs to make this the production pass. */

const RGBA = 5; // Constants.TEXTUREFORMAT_RGBA
const RED = 6; // Constants.TEXTUREFORMAT_R
/** INTEGRATION: this splices the production fragment here. Once
 * `materials.ts` owns the splice, take its fragment as is: splicing an
 * already spliced fragment throws (its fog anchor is gone). */
export const CAVE_CEL_FRAGMENT = injectCaveLight(CEL_FRAGMENT);

/** The production cel stages plus cave light, as the kit material is made. */
export function createCaveCelMaterial(scene: Scene, name = "cave.cel"): ShaderMaterial {
  const material = new ShaderMaterial(name, scene, { vertexSource: CEL_VERTEX, fragmentSource: CAVE_CEL_FRAGMENT }, {
    attributes: ["position", "normal", "color"], uniforms: [...CEL_UNIFORMS, ...CAVE_UNIFORMS], samplers: [...CAVE_SAMPLERS],
  }, true);
  material.backFaceCulling = false;
  material.setVector3("lightDirection", LIGHT_DIRECTION);
  material.setFloat("time", 0);
  material.setFloat("underwater", 0);
  return material;
}

export interface LampState {
  readonly on: boolean;
  readonly position: Vector3;
  /** Unit beam direction. */
  readonly direction: Vector3;
}

/** Owns the active cave's textures and feeds every cave material. One cave
 * is active at a time (the nearest); others draw as open water. */
export class CaveLighting {
  private field: CaveLightField | null = null;
  private light: RawTexture3D;
  private rock: RawTexture3D;
  private readonly emptyLight: RawTexture3D;
  private readonly emptyRock: RawTexture3D;
  constructor(private readonly scene: Scene, private readonly materials: readonly ShaderMaterial[],
    private readonly lamp: LampSettings = DEFAULT_LAMP) {
    this.emptyLight = this.make(new Uint8Array([0, 255, 0, 0]), 1, 1, 1, RGBA, Texture.BILINEAR_SAMPLINGMODE);
    this.emptyRock = this.make(new Uint8Array([0]), 1, 1, 1, RED, Texture.NEAREST_SAMPLINGMODE);
    this.light = this.emptyLight; this.rock = this.emptyRock;
    this.apply({ on: false, position: Vector3.Zero(), direction: new Vector3(0, 0, 1) });
  }
  private make(data: Uint8Array, nx: number, ny: number, nz: number, format: number, sampling: number): RawTexture3D {
    const t = new RawTexture3D(data, nx, ny, nz, format, this.scene, false, false, sampling);
    t.wrapU = t.wrapV = t.wrapR = Texture.CLAMP_ADDRESSMODE;
    return t;
  }
  /** Activate a cave's field, or none. */
  setField(field: CaveLightField | null): void {
    if (field === this.field) return;
    if (this.light !== this.emptyLight) this.light.dispose();
    if (this.rock !== this.emptyRock) this.rock.dispose();
    this.field = field;
    this.light = field ? this.make(field.data, field.nx, field.ny, field.nz, RGBA, Texture.BILINEAR_SAMPLINGMODE) : this.emptyLight;
    this.rock = field ? this.make(field.rock.data, field.rock.nx, field.rock.ny, field.rock.nz, RED, Texture.NEAREST_SAMPLINGMODE)
      : this.emptyRock;
  }
  /** Per frame: field, curve and lamp uniforms on every material. */
  apply(lamp: LampState): void {
    const f = this.field, r = f?.rock, curve = curveUniform(), params = lampUniform(lamp.on, this.lamp);
    for (const m of this.materials) {
      m.setTexture("caveField", this.light);
      m.setTexture("caveRock", this.rock);
      m.setFloat("caveActive", f ? 1 : 0);
      m.setVector3("caveFieldMin", f ? new Vector3(f.min.x, f.min.y, f.min.z) : Vector3.Zero());
      m.setVector3("caveFieldSize", f ? new Vector3(f.size.x, f.size.y, f.size.z) : Vector3.One());
      m.setVector3("caveRockMin", r ? new Vector3(r.min.x, r.min.y, r.min.z) : Vector3.Zero());
      m.setFloat("caveRockVoxel", r ? r.voxel : 1);
      m.setVector3("caveRockDims", r ? new Vector3(r.nx, r.ny, r.nz) : Vector3.One());
      m.setVector4("caveCurve", new Vector4(...curve));
      m.setVector3("lampPosition", lamp.position);
      m.setVector3("lampDirection", lamp.direction);
      m.setVector4("lampParams", new Vector4(...params));
      m.setColor3("lampColor", new Color3(...this.lamp.color));
    }
  }
  dispose(): void {
    if (this.light !== this.emptyLight) this.light.dispose();
    if (this.rock !== this.emptyRock) this.rock.dispose();
    this.emptyLight.dispose(); this.emptyRock.dispose();
  }
}
