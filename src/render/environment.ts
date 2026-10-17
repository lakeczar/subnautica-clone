import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Scene } from "@babylonjs/core";
import { terrainHeight, WORLD_BOUNDS } from "../sim/world.js";
import { ArtBatch, seeded } from "./geometry.js";
import { PALETTE as P } from "./palette.js";

export function createEnvironment(scene: Scene, cel: ShaderMaterial): void {
  const terrain = new Mesh("island.terrain", scene),
    data = new VertexData();
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const nx = 190,
    nz = 178,
    minX = -95,
    minZ = -202,
    sizeX = 300,
    sizeZ = 290;
  for (let z = 0; z <= nz; z++)
    for (let x = 0; x <= nx; x++) {
      const px = minX + (x / nx) * sizeX,
        pz = minZ + (z / nz) * sizeZ,
        py = terrainHeight(px, pz);
      positions.push(px, py, pz);
      const dx =
        (terrainHeight(px + 0.1, pz) - terrainHeight(px - 0.1, pz)) / 0.2;
      const dz =
        (terrainHeight(px, pz + 0.1) - terrainHeight(px, pz - 0.1)) / 0.2;
      const length = Math.hypot(dx, 1, dz);
      normals.push(-dx / length, 1 / length, -dz / length);
      const patch = Math.sin(px * 0.2 + pz * 0.12) * Math.cos(pz * 0.16);
      let hex: string =
        py > 13
          ? P.basalt
          : py > 3.3
            ? patch > 0.1
              ? "#81966e"
              : "#76947b"
            : py > -1.2
              ? P.shore
              : patch > 0.44
                ? "#789c94"
                : P.sand;
      if (Math.hypot(dx, dz) > 1.15) hex = py > 0 ? "#5c7f7e" : "#669894";
      const c = Color3.FromHexString(hex);
      colors.push(c.r, c.g, c.b, 1);
      if (x < nx && z < nz) {
        const a = z * (nx + 1) + x,
          b = a + 1,
          c = a + nx + 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(terrain);
  terrain.material = cel;
  terrain.isPickable = false;
  terrain.freezeWorldMatrix();

  const stones = new ArtBatch("reef.geology", scene, cel),
    random = seeded(574);
  // Authored sediment lenses and rubble cluster beside ribs, leaving a clear pod route.
  for (const [cx, cz, count] of [
    [-25, -7, 28],
    [-10, -17, 18],
    [28, -23, 16],
    [29, 7, 15],
    [-40, 19, 14],
  ]) {
    if (cx === undefined || cz === undefined || count === undefined) continue;
    for (let i = 0; i < count; i++) {
      const x = cx + (random() - 0.5) * 13,
        z = cz + (random() - 0.5) * 11,
        s = 0.3 + random() * 1.3;
      stones.ellipsoid(
        [x, terrainHeight(x, z) + s * 0.2, z],
        [s, s * 0.48, s * 0.73],
        i % 3 ? P.stoneLight : P.basalt,
        6,
      );
    }
  }
  // Sparse physical ripple relief, restrained in tone and confined to sand pockets.
  for (let i = 0; i < 14; i++) {
    const z = -7 + i * 0.78;
    const path: [number, number, number][] = [];
    for (let j = 0; j < 10; j++) {
      const x = 8 + j * 0.9;
      path.push([
        x,
        terrainHeight(x, z) + 0.025,
        z + Math.sin(j * 0.6 + i * 0.2) * 0.16,
      ]);
    }
    stones.tube(path, 0.035, "#c2d1ae", 4);
  }
  // Rock bands follow existing island surfaces: decorative relief is only centimetres.
  for (let i = 0; i < 7; i++) {
    const z = -42 - i * 4.6;
    const path: [number, number, number][] = [];
    for (let x = -10; x <= 29; x += 1.3)
      path.push([x, terrainHeight(x, z) + 0.04, z]);
    stones.tube(path, 0.07, i % 2 ? "#6d8980" : "#9cab89", 5);
  }
  stones.finish();

  // Edge buoys are navigation context for this deliberately bounded early build.
  const buoys = new ArtBatch("foundation.edge-buoys", scene, cel);
  for (const [x, z] of [
    [WORLD_BOUNDS.minX + 2, 12],
    [WORLD_BOUNDS.maxX - 2, 12],
    [-38, WORLD_BOUNDS.maxZ - 2],
    [38, WORLD_BOUNDS.maxZ - 2],
    [-38, WORLD_BOUNDS.minZ + 2],
    [48, WORLD_BOUNDS.minZ + 2],
  ]) {
    if (x === undefined || z === undefined) continue;
    buoys.ellipsoid([x, 0.02, z], [0.45, 0.38, 0.45], P.ochre, 8);
    buoys.tube(
      [
        [x, 0, z],
        [x, 1.7, z],
      ],
      0.045,
      P.petrol,
      5,
    );
    buoys.box([x, 1.55, z], [0.48, 0.23, 0.04], P.porcelain);
  }
  buoys.finish();
}
