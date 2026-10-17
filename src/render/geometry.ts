import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder.js";
import type { Scene, Material } from "@babylonjs/core";
import type { Vec3 } from "../sim/types.js";

export type Point = readonly [number, number, number];
export const v3 = (p: Vec3): Vector3 => new Vector3(p.x, p.y, p.z);
export const seeded = (initial: number): (() => number) => {
  let seed = initial;
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

/** Editable procedural art is batched by semantic owner, with vertex palette slots.
 * The scene owns final meshes/materials; temporary primitives are disposed by merge. */
export class ArtBatch {
  private readonly parts: Mesh[] = [];
  constructor(
    private readonly name: string,
    private readonly scene: Scene,
    private readonly material: Material,
  ) {}

  bounds(s: { min: Vec3; max: Vec3 }, hex: string): void {
    this.box(
      [(s.min.x + s.max.x) / 2, (s.min.y + s.max.y) / 2, (s.min.z + s.max.z) / 2],
      [s.max.x - s.min.x, s.max.y - s.min.y, s.max.z - s.min.z], hex,
    );
  }

  paint(mesh: Mesh, hex: string): Mesh {
    // UV-free palette shader: all batched parts must have identical attributes.
    mesh.removeVerticesData("uv");
    const c = Color3.FromHexString(hex),
      colors: number[] = [];
    for (let i = 0; i < mesh.getTotalVertices(); i++)
      colors.push(c.r, c.g, c.b, 1);
    mesh.setVerticesData("color", colors);
    mesh.material = this.material;
    mesh.isPickable = false;
    this.parts.push(mesh);
    return mesh;
  }

  box(p: Point, size: Point, color: string, rotation: Point = [0, 0, 0]): Mesh {
    const mesh = CreateBox(
      this.name,
      { width: size[0], height: size[1], depth: size[2] },
      this.scene,
    );
    mesh.position.set(...p);
    mesh.rotation.set(...rotation);
    return this.paint(mesh, color);
  }

  ellipsoid(p: Point, radius: Point, color: string, segments = 12): Mesh {
    const mesh = CreateSphere(this.name, { diameter: 2, segments }, this.scene);
    mesh.position.set(...p);
    mesh.scaling.set(...radius);
    return this.paint(mesh, color);
  }

  tube(path: readonly Point[], radius: number, color: string, sides = 7): Mesh {
    const mesh = CreateTube(
      this.name,
      {
        path: path.map((p) => new Vector3(...p)),
        radius,
        tessellation: sides,
        cap: Mesh.CAP_ALL,
      },
      this.scene,
    );
    return this.paint(mesh, color);
  }

  face(points: readonly Point[], color: string): Mesh {
    const mesh = new Mesh(this.name, this.scene),
      data = new VertexData();
    const positions = points.flatMap((p) => [...p]),
      indices: number[] = [],
      normals: number[] = [];
    for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
    VertexData.ComputeNormals(positions, indices, normals);
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.applyToMesh(mesh);
    return this.paint(mesh, color);
  }

  /** A pressure bezel with an actual opening, rather than a painted-on disc.
   * u/v are unit axes in the fitting's plane. Original 20711d1 ring construction. */
  ring(p: Point, u: Point, v: Point, outer: number, inner: number, color: string, sides = 12): void {
    const point = (r: number, i: number): Point => {
      const a = i / sides * Math.PI * 2;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      return [p[0] + u[0] * x + v[0] * y, p[1] + u[1] * x + v[1] * y, p[2] + u[2] * x + v[2] * y];
    };
    for (let i = 0; i < sides; i++)
      this.face([point(outer, i), point(outer, i + 1), point(inner, i + 1), point(inner, i)], color);
  }

  /** Shallow chamfered equipment plate; the corners describe manufactured scale.
   * The datum is its front face, facing -Z before yaw, with depth behind it. */
  panel(p: Point, size: readonly [number, number], depth: number, color: string, yaw = 0, chamfer = 0.1): void {
    const w = size[0] / 2, h = size[1] / 2;
    const c = Math.min(chamfer, w * 0.4, h * 0.4);
    const outline = [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]];
    const at = (q: number[], z: number): Point => [p[0] + q[0]! * Math.cos(yaw) + z * Math.sin(yaw), p[1] + q[1]!, p[2] - q[0]! * Math.sin(yaw) + z * Math.cos(yaw)];
    const front = outline.map((q) => at(q, 0)), back = outline.map((q) => at(q, depth));
    this.face(front, color);
    this.face([...back].reverse(), color);
    for (let i = 0; i < front.length; i++) {
      const j = (i + 1) % front.length;
      this.face([front[i]!, back[i]!, back[j]!, front[j]!], color);
    }
  }

  /** Original faceted cross-section loft, adapted from the 20711d1 cel sculpture technique. */
  loft(
    sections: readonly { z: number; w: number; low: number; high: number }[],
    color: string,
  ): void {
    const rings = sections.map(
      (s) =>
        [
          [-s.w * 0.68, s.high, s.z],
          [s.w * 0.68, s.high, s.z],
          [s.w, s.high * 0.3 + s.low * 0.7, s.z],
          [s.w * 0.7, s.low, s.z],
          [-s.w * 0.7, s.low, s.z],
          [-s.w, s.high * 0.3 + s.low * 0.7, s.z],
        ] as Point[],
    );
    this.face([...rings[0]!].reverse(), color);
    this.face(rings.at(-1)!, color);
    for (let i = 0; i < rings.length - 1; i++)
      for (let j = 0; j < 6; j++)
        this.face(
          [
            rings[i]![j]!,
            rings[i]![(j + 1) % 6]!,
            rings[i + 1]![(j + 1) % 6]!,
            rings[i + 1]![j]!,
          ],
          color,
        );
  }
  finish(): Mesh {
    for (const part of this.parts) part.bakeCurrentTransformIntoVertices();
    const mesh = Mesh.MergeMeshes(
      this.parts,
      true,
      true,
      undefined,
      false,
      false,
    );
    if (!mesh) throw new Error(`Empty art batch ${this.name}`);
    mesh.name = this.name;
    mesh.material = this.material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
  }
}
