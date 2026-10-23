import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { ArtBatch } from "../geometry.js";
import type { Point } from "../geometry.js";

/** Shared construction for creature leaves. Every mesh and node is owned by
 * one creature root; disposing the root releases all of them and never the
 * scene's shared cel material. */
export interface CreatureParts {
  readonly scene: Scene;
  readonly cel: Material;
  readonly root: TransformNode;
  /** Sibling of root in the parent's frame, for cues placed in world space
   * (a dimple on the mirror layer, a pulse shell). Disposed with the creature. */
  readonly world: TransformNode;
  /** Batch whose finished mesh is parented to `parent` (default root) and left
   * movable. A world-space cue (parented to `world`) starts hidden; its view
   * shows it when it poses it. */
  part(name: string, build: (b: ArtBatch) => void, parent?: TransformNode, contour?: number): Mesh;
  node(name: string, parent?: TransformNode): TransformNode;
  /** Shows or hides everything the creature owns: its root and its world-space cues. */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}
export function creatureParts(scene: Scene, cel: Material, name: string, parent?: TransformNode): CreatureParts {
  const root = new TransformNode(name, scene), world = new TransformNode(`${name}.world`, scene);
  if (parent) { root.parent = parent; world.parent = parent; }
  return {
    scene, cel, root, world,
    part(partName, build, owner = root, contour = 0.5) {
      const b = new ArtBatch(`${name}.${partName}`, scene, cel);
      build(b);
      const mesh = b.finish(contour);
      mesh.unfreezeWorldMatrix();
      mesh.parent = owner;
      if (owner === world) mesh.setEnabled(false);
      return mesh;
    },
    node(nodeName, owner = root) {
      const n = new TransformNode(`${name}.${nodeName}`, scene);
      n.parent = owner;
      return n;
    },
    setEnabled(enabled) { root.setEnabled(enabled); world.setEnabled(enabled); },
    dispose() { root.dispose(false, false); world.dispose(false, false); },
  };
}

/** A creature's warning display: selected vertex colors scaled by a gain and
 * switched between emissive and ordinary shading, as the sound hunter does.
 * Only this mesh's own color buffer changes; geometry and material never do. */
export class Display {
  private readonly base: Float32Array;
  private readonly colors: Float32Array;
  private readonly offsets: number[] = [];
  private gain = Number.NaN;
  private lit = true;
  constructor(readonly mesh: Mesh, select: (offset: number, colors: Float32Array) => boolean = (i, c) => c[i + 3]! < 0) {
    this.base = new Float32Array(mesh.getVerticesData("color")!);
    this.colors = this.base.slice();
    for (let i = 0; i < this.base.length; i += 4) if (select(i, this.base)) this.offsets.push(i);
    mesh.setVerticesData("color", this.colors, true, 4);
  }
  get size(): number { return this.offsets.length; }
  /** gain 0..~1.6; lit=false renders the same parts with ordinary cel shading. */
  set(gain: number, lit = true): void {
    const g = Math.round(gain * 40) / 40;
    if (g === this.gain && lit === this.lit) return;
    this.gain = g; this.lit = lit;
    for (const i of this.offsets) {
      this.colors[i] = this.base[i]! * g;
      this.colors[i + 1] = this.base[i + 1]! * g;
      this.colors[i + 2] = this.base[i + 2]! * g;
      this.colors[i + 3] = lit ? -1 : 1;
    }
    this.mesh.updateVerticesData("color", this.colors, false, false);
  }
}

/** Frustum bands between successive circles: bells, cups and plume rings. */
export function revolve(b: ArtBatch, center: Point, profile: readonly (readonly [radius: number, height: number])[], color: string, inner: string, sides = 10): void {
  const at = (r: number, h: number, i: number): Point => {
    const a = (i / sides) * Math.PI * 2;
    return [center[0] + Math.cos(a) * r, center[1] + h, center[2] + Math.sin(a) * r];
  };
  for (let k = 0; k < profile.length - 1; k++) {
    const [r0, h0] = profile[k]!, [r1, h1] = profile[k + 1]!;
    for (let i = 0; i < sides; i++) {
      b.face([at(r0, h0, i), at(r0, h0, i + 1), at(r1, h1, i + 1), at(r1, h1, i)], k % 2 ? inner : color);
    }
  }
}
export const smooth = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)));
