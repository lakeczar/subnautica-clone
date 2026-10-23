import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { RawTexture3D } from "@babylonjs/core/Materials/Textures/rawTexture3D.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture.js";
import { CEL_FRAGMENT, CEL_SAMPLERS, CEL_UNIFORMS, CEL_VERTEX, LIGHT_DIRECTION } from "../materials.js";
import { DEFAULT_LAMP, curveUniform, lampUniform, type LampSettings } from "./caveLight.js";
import type { CaveLightField } from "./lightField.js";

/** Babylon side of cave light: the light field and the exact rock occupancy
 * as 3D textures, and per-frame lamp and field uniforms, for any material on
 * the production cel fragment (which carries the cave splice since C4). */

const RGBA = 5; // Constants.TEXTUREFORMAT_RGBA
const RED = 6; // Constants.TEXTUREFORMAT_R
/** Bytes of field data written to the GPU per frame by a sliced upload. */
export const UPLOAD_BYTES_PER_FRAME = 128 * 1024;
/** One texture being filled slab by slab (z planes) by `prepare`. */
interface SliceJob { readonly texture: RawTexture3D; readonly data: Uint8Array; readonly nx: number; readonly ny: number; readonly nz: number;
  readonly texel: number; readonly glFormat: number; z: number }
/** Babylon's engine as `prepare` drives it: its raw GL and texture binding (internal API). */
interface EngineGL {
  readonly _gl: WebGL2RenderingContext;
  _bindTextureDirectly(target: number, texture: unknown, forTextureDataUpdate?: boolean): unknown;
  _unpackFlipY(value: boolean): void;
}
/** `materials.ts` owns the one splice; splicing again would throw (its fog
 * anchor is gone), so this is the production fragment as is. */
export const CAVE_CEL_FRAGMENT = CEL_FRAGMENT;

/** The production cel stages plus cave light, as the kit material is made. */
export function createCaveCelMaterial(scene: Scene, name = "cave.cel"): ShaderMaterial {
  const material = new ShaderMaterial(name, scene, { vertexSource: CEL_VERTEX, fragmentSource: CAVE_CEL_FRAGMENT }, {
    attributes: ["position", "normal", "color"], uniforms: CEL_UNIFORMS, samplers: CEL_SAMPLERS,
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

/** Owns the cave textures and feeds every cave material. One cave is active
 * at a time; others draw as open water. CW-1: textures are kept per field
 * (up to `keep`, least recently bound dropped), so switching between nearby
 * caves only binds, and `upload` lets the streamer create a field's textures
 * ahead of use, one field per frame. */
export class CaveLighting {
  private field: CaveLightField | null = null;
  private light: RawTexture3D;
  private rock: RawTexture3D;
  private readonly emptyLight: RawTexture3D;
  private readonly emptyRock: RawTexture3D;
  private readonly cached = new Map<CaveLightField, { light: RawTexture3D; rock: RawTexture3D; bytes: number }>();
  /** Textures created (uploads) and the bytes they hold on the GPU. */
  readonly stats = { uploads: 0, textures: 0, bytes: 0 };
  constructor(private readonly scene: Scene, private readonly materials: readonly ShaderMaterial[],
    private readonly lamp: LampSettings = DEFAULT_LAMP, private readonly keep = 4) {
    this.emptyLight = this.make(new Uint8Array([0, 255, 0, 0]), 1, 1, 1, RGBA, Texture.BILINEAR_SAMPLINGMODE);
    this.emptyRock = this.make(new Uint8Array([0]), 1, 1, 1, RED, Texture.NEAREST_SAMPLINGMODE);
    this.light = this.emptyLight; this.rock = this.emptyRock;
    this.apply({ on: false, position: Vector3.Zero(), direction: new Vector3(0, 0, 1) });
  }
  private make(data: Uint8Array | null, nx: number, ny: number, nz: number, format: number, sampling: number): RawTexture3D {
    const t = new RawTexture3D(data, nx, ny, nz, format, this.scene, false, false, sampling);
    t.wrapU = t.wrapV = t.wrapR = Texture.CLAMP_ADDRESSMODE;
    return t;
  }
  /** Whether a field's textures exist and are complete. */
  has(field: CaveLightField): boolean { return this.cached.has(field); }
  /** The field whose textures are being filled, a slab at a time. */
  private preparing: { field: CaveLightField; light: RawTexture3D; rock: RawTexture3D; jobs: SliceJob[] } | null = null;
  /** Fill a field's textures across frames, at most `budget` bytes now; true
   * once they are complete and cached (CW-1: a field's whole texImage3D, up
   * to a megabyte, took 65-84 ms in one frame on the 3090). The textures are
   * allocated empty and filled by z slabs; a field is bound only when done. */
  prepare(field: CaveLightField, budget = UPLOAD_BYTES_PER_FRAME): boolean {
    if (this.cached.has(field)) return true;
    if (this.preparing?.field !== field) {
      this.preparing?.light.dispose(); this.preparing?.rock.dispose();
      const light = this.make(null, field.nx, field.ny, field.nz, RGBA, Texture.BILINEAR_SAMPLINGMODE);
      const rock = this.make(null, field.rock.nx, field.rock.ny, field.rock.nz, RED, Texture.NEAREST_SAMPLINGMODE);
      const gl = this.engine._gl;
      this.preparing = { field, light, rock, jobs: [
        { texture: light, data: field.data, nx: field.nx, ny: field.ny, nz: field.nz, texel: 4, glFormat: gl.RGBA, z: 0 },
        { texture: rock, data: field.rock.data, nx: field.rock.nx, ny: field.rock.ny, nz: field.rock.nz, texel: 1, glFormat: gl.RED, z: 0 },
      ] };
    }
    const job = this.preparing!;
    let left = budget;
    for (const j of job.jobs) {
      const plane = j.nx * j.ny * j.texel;
      while (j.z < j.nz && left > 0) {
        const dz = Math.max(1, Math.min(j.nz - j.z, Math.floor(left / plane)));
        this.writeSlab(j, j.z, dz);
        j.z += dz; left -= dz * plane;
      }
      if (j.z < j.nz) return false;
    }
    // Complete: restore-on-context-loss keeps the whole data, as a whole upload would.
    for (const j of job.jobs) (j.texture.getInternalTexture() as unknown as { _bufferView: Uint8Array | null })._bufferView = j.data;
    this.preparing = null;
    this.adopt(field, job.light, job.rock);
    return true;
  }
  private get engine(): EngineGL { return this.scene.getEngine() as unknown as EngineGL; }
  private writeSlab(j: SliceJob, z: number, dz: number): void {
    const e = this.engine, gl = e._gl, internal = j.texture.getInternalTexture();
    e._bindTextureDirectly(gl.TEXTURE_3D, internal, true);
    e._unpackFlipY(false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, z, j.nx, j.ny, dz, j.glFormat, gl.UNSIGNED_BYTE, j.data, z * j.nx * j.ny * j.texel);
    e._bindTextureDirectly(gl.TEXTURE_3D, null);
  }
  /** Create a field's textures now (the streamer calls this ahead of use). */
  upload(field: CaveLightField): void {
    if (this.cached.has(field)) return;
    if (this.preparing?.field === field) { this.prepare(field, Infinity); return; }
    const light = this.make(field.data, field.nx, field.ny, field.nz, RGBA, Texture.BILINEAR_SAMPLINGMODE);
    const rock = this.make(field.rock.data, field.rock.nx, field.rock.ny, field.rock.nz, RED, Texture.NEAREST_SAMPLINGMODE);
    this.adopt(field, light, rock);
  }
  private adopt(field: CaveLightField, light: RawTexture3D, rock: RawTexture3D): void {
    const bytes = field.data.byteLength + field.rock.data.byteLength;
    this.cached.set(field, { light, rock, bytes });
    this.stats.uploads++; this.stats.textures = this.cached.size * 2; this.stats.bytes += bytes;
    // Least recently bound first; the active field is never dropped.
    for (const [f, t] of this.cached) {
      if (this.cached.size <= this.keep) break;
      if (f === this.field || f === field) continue;
      t.light.dispose(); t.rock.dispose(); this.cached.delete(f);
      this.stats.textures = this.cached.size * 2; this.stats.bytes -= t.bytes;
    }
  }
  /** Activate a cave's field, or none. */
  setField(field: CaveLightField | null): void {
    if (field === this.field) return;
    this.field = field;
    if (!field) { this.light = this.emptyLight; this.rock = this.emptyRock; return; }
    this.upload(field);
    const t = this.cached.get(field)!;
    // Re-insert: most recently bound last.
    this.cached.delete(field); this.cached.set(field, t);
    this.light = t.light; this.rock = t.rock;
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
    for (const t of this.cached.values()) { t.light.dispose(); t.rock.dispose(); }
    this.cached.clear();
    this.preparing?.light.dispose(); this.preparing?.rock.dispose(); this.preparing = null;
    this.emptyLight.dispose(); this.emptyRock.dispose();
  }
}
