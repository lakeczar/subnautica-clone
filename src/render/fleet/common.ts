import type { Mesh, Scene, ShaderMaterial } from "@babylonjs/core";
import { ArtBatch, type Point } from "../geometry.js";
import type { GeometryCache } from "../geometryCache.js";

/** Deterministic hull-local batches opt into the cache under `fleet:<hull>:v1`.
 * Bump the generation when a recipe changes. Live state, poses and glazing
 * never become keys (cf. B1's fleetArt.ts batchFor). */
export function batchFor(scene: Scene, cel: ShaderMaterial, cache: GeometryCache | undefined,
  name: string, hull: string, part: string): ArtBatch {
  return new ArtBatch(name, scene, cel, cache ? { owner: cache, key: `fleet:${hull}:v1:${part}` } : undefined);
}

export function child(mesh: Mesh, parent: Mesh): Mesh {
  mesh.unfreezeWorldMatrix(); mesh.parent = parent; mesh.renderingGroupId = 1; return mesh;
}

/** Faceted skin between rings. Outward normals need rings that advance along
 * an axis and run clockwise seen from that axis' positive end, as ArtBatch.loft.
 * `closed` joins the last point of each ring to its first. */
export function skin(b: ArtBatch, rings: readonly (readonly Point[])[], color: string, closed = true): void {
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i]!, c = rings[i + 1]!, n = closed ? a.length : a.length - 1;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % a.length;
      b.face([a[j]!, a[k]!, c[k]!, c[j]!], color);
    }
  }
}

/** The same skin, mirrored across x = 0, with orientation preserved. */
export const mirrored = (rings: readonly (readonly Point[])[]): Point[][] =>
  rings.map((r) => r.map((p): Point => [-p[0], p[1], p[2]]).reverse());

/** ArtBatch.loft's faceted hexagonal sections, translated by `offset`. */
export function loftAt(b: ArtBatch, sections: readonly { z: number; w: number; low: number; high: number }[], color: string, offset: Point): void {
  const [ox, oy, oz] = offset;
  const rings = sections.map((s): Point[] => [
    [-s.w * .68, s.high, s.z], [s.w * .68, s.high, s.z], [s.w, s.high * .3 + s.low * .7, s.z],
    [s.w * .7, s.low, s.z], [-s.w * .7, s.low, s.z], [-s.w, s.high * .3 + s.low * .7, s.z],
  ].map((p): Point => [p[0]! + ox, p[1]! + oy, p[2]! + oz]));
  b.face([...rings[0]!].reverse(), color);
  b.face(rings.at(-1)!, color);
  skin(b, rings, color);
}

/** Surface of revolution about a vertical axis through `c`. `profile` is
 * [radius x, y, radius z] rising upward. `skip(segment, band)` leaves a real
 * opening for glazing. Angle 0 is +X; segments advance toward +Z. */
export function lathe(b: ArtBatch, c: Point, profile: readonly Point[], sides: number, color: string,
  skip?: (segment: number, band: number) => boolean, phase = 0): Point[][] {
  const rings = profile.map(([rx, y, rz]) => Array.from({ length: sides }, (_, j): Point => {
    const a = phase + j / sides * Math.PI * 2;
    return [c[0] + Math.cos(a) * rx, c[1] + y, c[2] + Math.sin(a) * rz];
  }));
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < sides; j++) {
      if (skip?.(j, i)) continue;
      const k = (j + 1) % sides;
      b.face([rings[i]![j]!, rings[i]![k]!, rings[i + 1]![k]!, rings[i + 1]![j]!], color);
    }
  return rings;
}

/** A thin two-sided plate with edges, so both faces shade outward. The front
 * face lies on `points`, the back on `points + offset`; winding is corrected. */
export function plate(b: ArtBatch, points: readonly Point[], offset: Point, color: string, edge = color): void {
  // Newell normal of the given winding; flip so it points along the offset.
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, c = points[(i + 1) % points.length]!;
    nx += (a[1] - c[1]) * (a[2] + c[2]); ny += (a[2] - c[2]) * (a[0] + c[0]); nz += (a[0] - c[0]) * (a[1] + c[1]);
  }
  if (nx * offset[0] + ny * offset[1] + nz * offset[2] < 0) points = [...points].reverse();
  const back = points.map((p): Point => [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]]);
  b.face(points, color);
  b.face([...back].reverse(), color);
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    b.face([points[j]!, points[i]!, back[i]!, back[j]!], edge);
  }
}

/** One glazing group: both sides of every face in two meshes, rather than two
 * meshes per pane (materials.ts createObservationPane). Same alpha-side
 * convention, so the scene's glass sorter orders the group around the surface. */
export function glazing(scene: Scene, glass: ShaderMaterial, name: string, faces: readonly (readonly Point[])[], parent: Mesh): Mesh[] {
  const result: Mesh[] = [];
  for (const side of [1, -1]) {
    const b = new ArtBatch(`${name}.${side > 0 ? "above" : "below"}`, scene, glass);
    for (const f of faces) {
      const face = b.face(f, "#75adae"), colors = face.getVerticesData("color")!;
      for (let i = 3; i < colors.length; i += 4) colors[i] = side;
      face.setVerticesData("color", colors);
    }
    const pane = b.finish();
    pane.metadata = { paneSide: side };
    pane.renderingGroupId = 1;
    pane.unfreezeWorldMatrix(); pane.parent = parent;
    result.push(pane);
  }
  return result;
}

/** Closed polyline helper for gaskets and duct lips. */
export function loop(center: Point, u: Point, v: Point, r: number, sides = 14): Point[] {
  return Array.from({ length: sides + 1 }, (_, i): Point => {
    const a = i / sides * Math.PI * 2, x = Math.cos(a) * r, y = Math.sin(a) * r;
    return [center[0] + u[0] * x + v[0] * y, center[1] + u[1] * x + v[1] * y, center[2] + u[2] * x + v[2] * y];
  });
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
