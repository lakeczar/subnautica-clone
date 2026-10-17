import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import type { Scene, ShaderMaterial } from "@babylonjs/core";
import { POD_DECK, POD_RAMP, RIB_SEGMENTS } from "../sim/world.js";
import { ArtBatch } from "./geometry.js";
import { PALETTE as P } from "./palette.js";

export function createLandmarks(scene: Scene, cel: ShaderMaterial): void {
  const rib = new ArtBatch("landmark.reef-ribs", scene, cel);
  RIB_SEGMENTS.forEach(({ a, b, radius }, i) => {
    rib.tube(
      [
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
      ],
      radius,
      i % 6 < 2 ? "#47737d" : i % 3 ? P.basalt : P.stoneLight,
      8,
    );
    if (i % 4 === 1)
      rib.tube(
        [
          [a.x, a.y + radius * 0.7, a.z - radius * 0.45],
          [b.x, b.y + radius * 0.7, b.z - radius * 0.45],
        ],
        0.075,
        "#96b79c",
        4,
      );
  });
  rib.finish();

  const pod = new ArtBatch("refuge.pod", scene, cel);
  const d = POD_DECK;
  pod.box([0, -0.01, 17.1], [6.2, 0.38, 14.2], P.petrol);
  for (let z = 10.8; z < 24; z += 1.2)
    pod.box([0, 0.19, z], [5.5, 0.025, 0.07], "#426a70");
  for (const side of [-1, 1]) {
    pod.box([side * 3.25, 1.7, 21.6], [0.65, 3.5, 5.4], P.porcelain);
    pod.box([side * 2.91, 2.1, 22], [0.06, 1.05, 2.7], P.glass);
    pod.box([side * 2.86, 2.6, 22], [0.04, 0.06, 2.2], P.reflection);
    pod.box([side * 3.2, -0.8, 21], [1.5, 1.7, 5], P.petrol);
    pod.box([side * 3.37, 0.5, 21.5], [0.6, 0.35, 5.2], P.ochre);
    pod.tube(
      [
        [side * 3.05, 0.18, 13],
        [side * 3.05, 1.02, 13],
        [side * 3.05, 1.02, 19.4],
      ],
      0.07,
      P.metal,
      6,
    );
    pod.box([side * 2.4, 3.38, 21.5], [0.4, 0.12, 4], P.warm);
  }
  pod.box([0, 1.9, 24.1], [6.9, 3.8, 0.3], P.porcelain);
  pod.box([0, 2.1, 23.91], [3.8, 1.3, 0.09], P.glass);
  pod.box([0, 3.85, 21.8], [7.2, 0.3, 5.1], P.petrol);
  pod.box([0, 3.65, 22], [5.4, 0.05, 3.7], "#c8c8a5");
  for (const x of [-2, 2])
    pod.box([x, 1.95, 19.45], [1, 3.3, 0.4], P.porcelain);
  pod.box([0, 3.2, 19.45], [3.2, 0.55, 0.4], P.petrol);
  pod.box([0, 3.12, 19.18], [2.9, 0.1, 0.08], P.warm);
  // Working bench and identifiable locker face actual simulation interaction positions.
  pod.box([2.25, 0.78, 21.0], [1.15, 1.1, 2.5], P.petrol);
  pod.box([2.1, 1.36, 20.9], [1.45, 0.18, 2.7], P.metal);
  pod.box([2.05, 1.53, 20.45], [0.9, 0.16, 0.7], P.ochre);
  pod.box([2.15, 2.2, 21.4], [0.45, 0.85, 0.8], P.petrol);
  pod.box([1.89, 2.2, 21.4], [0.05, 0.55, 0.6], P.lime);
  pod.box([-2.2, 0.9, 22.4], [1.2, 1.4, 1.2], P.petrol);
  pod.box([-1.55, 1.0, 22.4], [0.08, 1.1, 0.8], P.ochre);
  pod.tube(
    [
      [-1.48, 0.8, 22.25],
      [-1.48, 1.2, 22.25],
    ],
    0.04,
    P.porcelain,
    5,
  );
  pod.box([-2.2, 1.72, 21.1], [1.0, 0.75, 0.3], P.petrol);
  pod.ellipsoid([-1.68, 1.78, 21.1], [0.05, 0.23, 0.23], P.warm, 10);
  pod.tube(
    [
      [-2.7, 2.7, 23.6],
      [-2.7, 1.6, 23.6],
      [-2.7, 1.6, 21.2],
    ],
    0.065,
    P.ochre,
    6,
  );
  const r = POD_RAMP;
  pod.face(
    [
      [r.minX, r.lowY, r.minZ],
      [r.minX, r.highY, r.landingZ],
      [r.maxX, r.highY, r.landingZ],
      [r.maxX, r.lowY, r.minZ],
    ],
    P.metal,
  );
  pod.face(
    [
      [r.minX, r.highY, r.landingZ],
      [r.minX, r.highY, r.maxZ],
      [r.maxX, r.highY, r.maxZ],
      [r.maxX, r.highY, r.landingZ],
    ],
    P.metal,
  );
  for (const x of [r.minX, r.maxX])
    pod.tube(
      [
        [x, r.lowY, r.minZ],
        [x, r.highY, r.landingZ],
        [x, r.highY, r.maxZ],
      ],
      0.06,
      P.ochre,
      5,
    );
  for (let z = 6.4; z < 10; z += 0.5) {
    const y =
      r.lowY +
      Math.min(1, (z - r.minZ) / (r.landingZ - r.minZ)) * (r.highY - r.lowY);
    pod.tube(
      [
        [-1.1, y + 0.02, z],
        [1.1, y + 0.02, z],
      ],
      0.035,
      P.petrol,
      4,
    );
  }
  pod.tube(
    [
      [-2.1, 3.9, 22],
      [-2.1, 5.1, 22],
    ],
    0.055,
    P.petrol,
    5,
  );
  pod.box([-2.1, 5.1, 22], [0.8, 0.1, 0.12], P.warm);
  pod.box([0, 0.21, d.min.z + 0.1], [2.65, 0.03, 0.2], P.ochre);
  pod.finish();
  label(scene, "HOME / 01", [0, 3.45, 19.15], 1.6);
  label(scene, "LOCKER", [-1.52, 1.65, 22.4], 0.85, Math.PI / 2);
  label(scene, "SERVICE / AIR", [1.65, 2.9, 21.2], 1.1);
}

export function label(
  scene: Scene,
  text: string,
  p: readonly [number, number, number],
  width = 2,
  yaw = 0,
): void {
  const texture = new DynamicTexture(
    "label." + text,
    { width: 512, height: 128 },
    scene,
    false,
  );
  texture.drawText(
    text,
    null,
    82,
    "bold 45px sans-serif",
    "#f3e6bb",
    "#234d58",
    true,
  );
  const material = new StandardMaterial("label." + text, scene);
  material.diffuseTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  const plane = CreatePlane(
    "label." + text,
    { width, height: width / 4 },
    scene,
  );
  plane.position.set(...p);
  plane.rotation.y = yaw;
  plane.material = material;
  plane.isPickable = false;
  plane.renderingGroupId = 1;
}
