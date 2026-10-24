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
/** Bytes of field data written to the GPU per frame by a sliced upload. A slab
 * (whole z planes) is written only if it fits what is left of the budget; the
 * one allowance: a single plane larger than the whole budget is written alone,
 * as a frame's first write (else such a field could never progress). */
export const UPLOAD_BYTES_PER_FRAME = 128 * 1024;
/** Partial fills kept at once (CW-1 R3-2): the active cave's and the next wish's
 * progress survive each other; the oldest unwanted partial is dropped beyond. */
export const PARTIAL_FILLS = 2;
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

/** The GPU side of cave light textures, behind a port (CW-1 R2): the Babylon
 * implementation below, or a test double that counts bytes. A texture is
 * allocated empty, filled by z planes, then marked complete. */
export interface CaveTexturePort<T> {
  /** An empty RGBA (`channels` 4, linear sampling) or R (1, nearest) 3D texture. */
  create(nx: number, ny: number, nz: number, channels: 1 | 4): T;
  /** Write z planes `[z, z + dz)`; `data` holds the whole texture. */
  write(texture: T, data: Uint8Array, nx: number, ny: number, z: number, dz: number, channels: 1 | 4): void;
  /** The whole data is resident: what a context restore re-uploads. */
  complete(texture: T, data: Uint8Array): void;
  dispose(texture: T): void;
  /** Called after a lost context is restored (a partial fill restarts). */
  onRestored(listener: () => void): void;
}

/** Babylon's port: RawTexture3D allocated empty, texSubImage3D slabs through the
 * engine's own binding, the whole data kept for Babylon's context restore. */
export function babylonCaveTextures(scene: Scene): CaveTexturePort<RawTexture3D> {
  const engine = scene.getEngine() as unknown as EngineGL & { onContextRestoredObservable?: { add(f: () => void): unknown } };
  return {
    create(nx, ny, nz, channels) {
      const t = new RawTexture3D(null, nx, ny, nz, channels === 4 ? RGBA : RED, scene, false, false,
        channels === 4 ? Texture.BILINEAR_SAMPLINGMODE : Texture.NEAREST_SAMPLINGMODE);
      t.wrapU = t.wrapV = t.wrapR = Texture.CLAMP_ADDRESSMODE;
      return t;
    },
    write(t, data, nx, ny, z, dz, channels) {
      const gl = engine._gl, internal = t.getInternalTexture();
      engine._bindTextureDirectly(gl.TEXTURE_3D, internal, true);
      engine._unpackFlipY(false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, z, nx, ny, dz, channels === 4 ? gl.RGBA : gl.RED, gl.UNSIGNED_BYTE, data, z * nx * ny * channels);
      engine._bindTextureDirectly(gl.TEXTURE_3D, null);
    },
    complete(t, data) { (t.getInternalTexture() as unknown as { _bufferView: Uint8Array | null })._bufferView = data; },
    dispose(t) { t.dispose(); },
    onRestored(listener) { engine.onContextRestoredObservable?.add(listener); },
  };
}

interface TexturePair<T> { light: T; rock: T }
interface FillJob<T> { readonly field: CaveLightField; readonly textures: TexturePair<T>;
  readonly parts: { texture: T; data: Uint8Array; nx: number; ny: number; nz: number; channels: 1 | 4; z: number }[] }

/** Owns the cave textures and feeds every cave material. One cave is active
 * at a time; others draw as open water. CW-1: textures are kept per field
 * (up to `keep`, least recently bound dropped), filled a slab at a time under
 * one byte budget per frame (`beginFrame`), and a field is bound only once
 * complete (R2: activation never uploads synchronously). It is the one upload
 * scheduler (R3-2): `fill` spends the frame's budget on the active field
 * first, then the prefetch wishes in order, and every partial fill keeps its
 * progress (at most PARTIAL_FILLS), so prefetch and activation never cancel
 * each other's work. */
export class CaveLighting<T = RawTexture3D> {
  private field: CaveLightField | null = null;
  private light: T;
  private rock: T;
  private readonly empty: TexturePair<T>;
  private readonly cached = new Map<CaveLightField, TexturePair<T> & { bytes: number }>();
  /** Fills in progress, by field, oldest first. */
  private readonly filling = new Map<CaveLightField, FillJob<T>>();
  private budget = 0;
  /** Fields completed (uploads), textures and bytes held; the longest
   * allocation and slab write, ms (bounded-work evidence); fills restarted by
   * a context restore. */
  readonly stats = { uploads: 0, textures: 0, bytes: 0, maxAllocMs: 0, maxWriteMs: 0, restarts: 0 };
  private readonly scratch = { min: new Vector3(), size: new Vector3(), rockMin: new Vector3(), dims: new Vector3(), curve: new Vector4(), params: new Vector4(), color: new Color3() };
  constructor(scene: Scene, private readonly materials: readonly ShaderMaterial[],
    private readonly lamp: LampSettings = DEFAULT_LAMP, private readonly keep = 4,
    private readonly port: CaveTexturePort<T> = babylonCaveTextures(scene) as unknown as CaveTexturePort<T>) {
    const light = port.create(1, 1, 1, 4), rock = port.create(1, 1, 1, 1);
    port.write(light, new Uint8Array([0, 255, 0, 0]), 1, 1, 0, 1, 4); port.write(rock, new Uint8Array([0]), 1, 1, 0, 1, 1);
    port.complete(light, new Uint8Array([0, 255, 0, 0])); port.complete(rock, new Uint8Array([0]));
    this.empty = { light, rock };
    this.light = light; this.rock = rock;
    // A context restore re-creates the textures from their complete data; a fill in progress starts over.
    port.onRestored(() => { for (const job of this.filling.values()) { for (const p of job.parts) p.z = 0; this.stats.restarts++; } });
    this.apply({ on: false, position: Vector3.Zero(), direction: new Vector3(0, 0, 1) });
  }
  /** Whether a field's textures exist and are complete. */
  has(field: CaveLightField): boolean { return this.cached.has(field); }
  /** Start a frame's upload budget, bytes (one budget for prefetch and activation). */
  beginFrame(budget = UPLOAD_BYTES_PER_FRAME): void {
    this.lastFrame = this.frame; this.frame = { ms: 0, bytes: 0 };
    this.budget = budget;
  }
  private frame = { ms: 0, bytes: 0 };
  /** The previous frame's upload work: allocation and slab writes, ms and bytes (both prefetch and activation). */
  lastFrame = { ms: 0, bytes: 0 };
  /** Continue filling a field's textures within what is left of this frame's
   * budget; true once they are complete and cached (CW-1: a field's whole
   * texImage3D, up to a megabyte, took 65-84 ms in one frame on the 3090).
   * A partial fill keeps its progress until it completes or `fill` drops it. */
  prepare(field: CaveLightField): boolean {
    if (this.cached.has(field)) return true;
    let job = this.filling.get(field);
    if (!job) {
      // No allocation for a fill that can't write a plane this frame.
      const plane = field.nx * field.ny * 4;
      if (this.budget < plane && !(plane > UPLOAD_BYTES_PER_FRAME && this.frame.bytes === 0 && this.budget > 0)) return false;
      const t0 = performance.now();
      const light = this.port.create(field.nx, field.ny, field.nz, 4), rock = this.port.create(field.rock.nx, field.rock.ny, field.rock.nz, 1);
      const allocMs = performance.now() - t0;
      this.stats.maxAllocMs = Math.max(this.stats.maxAllocMs, allocMs); this.frame.ms += allocMs;
      job = { field, textures: { light, rock }, parts: [
        { texture: light, data: field.data, nx: field.nx, ny: field.ny, nz: field.nz, channels: 4, z: 0 },
        { texture: rock, data: field.rock.data, nx: field.rock.nx, ny: field.rock.ny, nz: field.rock.nz, channels: 1, z: 0 },
      ] };
      this.filling.set(field, job);
    }
    for (const p of job.parts) {
      const plane = p.nx * p.ny * p.channels;
      while (p.z < p.nz) {
        // Whole planes that fit what is left; a plane larger than the whole
        // budget only as the frame's first write.
        const fit = Math.floor(this.budget / plane);
        const dz = fit > 0 ? Math.min(p.nz - p.z, fit) : (plane > UPLOAD_BYTES_PER_FRAME && this.frame.bytes === 0 && this.budget > 0 ? 1 : 0);
        if (dz === 0) return false;
        const t0 = performance.now();
        this.port.write(p.texture, p.data, p.nx, p.ny, p.z, dz, p.channels);
        const writeMs = performance.now() - t0;
        this.stats.maxWriteMs = Math.max(this.stats.maxWriteMs, writeMs); this.frame.ms += writeMs; this.frame.bytes += dz * plane;
        p.z += dz; this.budget = Math.max(0, this.budget - dz * plane);
      }
    }
    for (const p of job.parts) this.port.complete(p.texture, p.data);
    this.filling.delete(field);
    this.adopt(field, job.textures);
    return true;
  }
  /** One frame's uploads, most important first (the active field, then the
   * prefetch wishes): each continues its own fill within what is left of the
   * frame's budget. Partial fills of fields no longer asked for are kept up to
   * PARTIAL_FILLS, oldest dropped first; a field in `order` is never dropped. */
  fill(order: readonly (CaveLightField | null)[]): void {
    for (const f of order) if (f && !this.prepare(f) && this.budget <= 0) break;
    if (this.filling.size <= PARTIAL_FILLS) return;
    for (const [f, job] of this.filling) {
      if (this.filling.size <= PARTIAL_FILLS) break;
      if (order.includes(f)) continue;
      this.port.dispose(job.textures.light); this.port.dispose(job.textures.rock); this.filling.delete(f);
    }
  }
  /** Fills in progress (measurement and tests). */
  get partial(): number { return this.filling.size; }
  private adopt(field: CaveLightField, textures: TexturePair<T>): void {
    const bytes = field.data.byteLength + field.rock.data.byteLength;
    this.cached.set(field, { ...textures, bytes });
    this.stats.uploads++; this.stats.textures = this.cached.size * 2; this.stats.bytes += bytes;
    // Least recently bound first; the active field is never dropped.
    for (const [f, t] of this.cached) {
      if (this.cached.size <= this.keep) break;
      if (f === this.field || f === field) continue;
      this.port.dispose(t.light); this.port.dispose(t.rock); this.cached.delete(f);
      this.stats.textures = this.cached.size * 2; this.stats.bytes -= t.bytes;
    }
  }
  /** Activate a cave's field if its textures are complete; otherwise (or
   * null) the materials draw open water. Never uploads. */
  setField(field: CaveLightField | null): void {
    const t = field ? this.cached.get(field) : undefined;
    const bound = t ? field : null;
    if (bound === this.field) return;
    this.field = bound;
    if (!t || !bound) { this.light = this.empty.light; this.rock = this.empty.rock; return; }
    // Re-insert: most recently bound last.
    this.cached.delete(bound); this.cached.set(bound, t);
    this.light = t.light; this.rock = t.rock;
  }
  /** The field bound now, or null (open water). */
  get bound(): CaveLightField | null { return this.field; }
  /** Per frame: field, curve and lamp uniforms on every material. */
  apply(lamp: LampState): void {
    const f = this.field, r = f?.rock, curve = curveUniform(), params = lampUniform(lamp.on, this.lamp), k = this.scratch;
    f ? k.min.set(f.min.x, f.min.y, f.min.z) : k.min.setAll(0);
    f ? k.size.set(f.size.x, f.size.y, f.size.z) : k.size.setAll(1);
    r ? k.rockMin.set(r.min.x, r.min.y, r.min.z) : k.rockMin.setAll(0);
    r ? k.dims.set(r.nx, r.ny, r.nz) : k.dims.setAll(1);
    k.curve.set(curve[0], curve[1], curve[2], curve[3]); k.params.set(params[0], params[1], params[2], params[3]);
    k.color.set(this.lamp.color[0], this.lamp.color[1], this.lamp.color[2]);
    for (const m of this.materials) {
      m.setTexture("caveField", this.light as unknown as RawTexture3D);
      m.setTexture("caveRock", this.rock as unknown as RawTexture3D);
      m.setFloat("caveActive", f ? 1 : 0);
      m.setVector3("caveFieldMin", k.min);
      m.setVector3("caveFieldSize", k.size);
      m.setVector3("caveRockMin", k.rockMin);
      m.setFloat("caveRockVoxel", r ? r.voxel : 1);
      m.setVector3("caveRockDims", k.dims);
      m.setVector4("caveCurve", k.curve);
      m.setVector3("lampPosition", lamp.position);
      m.setVector3("lampDirection", lamp.direction);
      m.setVector4("lampParams", k.params);
      m.setColor3("lampColor", k.color);
    }
  }
  dispose(): void {
    for (const t of this.cached.values()) { this.port.dispose(t.light); this.port.dispose(t.rock); }
    this.cached.clear();
    for (const job of this.filling.values()) { this.port.dispose(job.textures.light); this.port.dispose(job.textures.rock); }
    this.filling.clear();
    this.port.dispose(this.empty.light); this.port.dispose(this.empty.rock);
  }
}
