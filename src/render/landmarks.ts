import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import type { Scene, ShaderMaterial } from "@babylonjs/core";
import { FACILITY_SOLIDS, POD_DECK, POD_RAMP, RIB_SEGMENTS } from "../sim/world.js";
import { ArtBatch } from "./geometry.js";
import { PALETTE as P } from "./palette.js";
import { createObservationPane, wallWithOpening } from "./materials.js";

export function createLandmarks(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial): void {
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
  rib.finish(.32);

  const pod = new ArtBatch("refuge.pod", scene, cel);
  for (const body of FACILITY_SOLIDS.filter((s) => s.id.startsWith("pod.")))
    pod.bounds(body, P.petrol);
  const d = POD_DECK;
  pod.box([0, -0.01, 17.1], [6.2, 0.38, 14.2], P.petrol);
  for (let z = 10.8; z < 24; z += 1.2)
    pod.box([0, 0.19, z], [5.5, 0.025, 0.07], "#426a70");
  for (const side of [-1, 1]) {
    wallWithOpening(pod, [side * 3.25, 1.7, 21.6], [0.65, 3.5, 5.4], {
      center: [side * 3.25, 2.1, 22], width: 2.7, height: 1.05, normal: "x",
    }, P.porcelain);
    createObservationPane(scene, glass, `pod.pane.side.${side}`, [
      [side * 3.25, 1.575, 20.65], [side * 3.25, 1.575, 23.35],
      [side * 3.25, 2.625, 23.35], [side * 3.25, 2.625, 20.65],
    ]);
    for (const y of [1.575, 2.625])
      pod.box([side * 2.91, y, 22], [.045, .065, 2.78], P.metal);
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
    pod.box([side * 2.4, 3.48, 21.5], [0.48, 0.16, 4.1], P.petrol);
    pod.glow(pod.box([side * 2.4, 3.38, 21.5], [0.24, 0.045, 3.8], P.warm));
  }
  wallWithOpening(pod, [0, 1.9, 24.1], [6.9, 3.8, .3], {
    center: [0, 2.1, 24.1], width: 3.8, height: 1.3, normal: "z",
  }, P.porcelain);
  createObservationPane(scene, glass, "pod.pane.rear", [
    [-1.9, 1.45, 24.1], [1.9, 1.45, 24.1], [1.9, 2.75, 24.1], [-1.9, 2.75, 24.1],
  ]);
  for (const y of [1.45, 2.75]) pod.box([0, y, 23.91], [3.9, .075, .07], P.metal);
  for (const x of [-1.9, 1.9]) pod.box([x, 2.1, 23.91], [.075, 1.3, .07], P.metal);
  pod.box([0, 3.85, 21.8], [7.2, 0.3, 5.1], P.petrol);
  pod.box([0, 3.65, 22], [5.4, 0.05, 3.7], "#c8c8a5");
  for (const x of [-2, 2])
    pod.box([x, 1.95, 19.45], [1, 3.3, 0.4], P.porcelain);
  pod.box([0, 3.2, 19.45], [3.2, 0.55, 0.4], P.petrol);
  pod.glow(pod.box([0, 3.12, 19.18], [2.9, 0.1, 0.08], P.warm));
  // Pressure-frame cheeks and retained hatch guides stop outside the open
  // doorway. The entrance remains a continuous view and walking line to shore.
  for (const side of [-1, 1]) {
    pod.panel([side * 2.22, 1.85, 19.2], [0.47, 2.9], 0.1, P.shade, 0, 0.14);
    pod.box([side * 1.51, 1.8, 19.23], [0.035, 2.7, 0.07], P.metal);
    for (const y of [0.6, 2.8]) {
      pod.box([side * 2.02, y, 19.14], [0.3, 0.17, 0.09], P.petrol);
      pod.box([side * 2.02, y, 19.085], [0.16, 0.07, 0.02], P.ochre);
    }
    // Panel rhythm wraps the existing side wall; no new wall occupies the deck.
    for (const z of [20.0, 21.7, 23.35]) {
      pod.box([side * 3.58, 1.8, z], [0.025, 3.2, 0.035], P.seam);
      pod.box([side * 2.895, 2.1, z], [0.025, 1.1, 0.045], P.metal);
    }
    pod.box([side * 3.62, 3.35, 21.6], [0.1, 0.1, 4.7], P.ochre);
    pod.box([side * 2.82, 0.4, 22.7], [0.07, 0.12, 1.4], P.warm);
    for (const z of [20, 23.1]) {
      pod.panel([side * 3.59, 1.1, z], [0.7, 0.45], 0.025, P.petrol, -side * Math.PI / 2);
      for (let i = 0; i < 4; i++)
        pod.box([side * 3.62, 1.0 + i * 0.07, z], [0.025, 0.025, 0.48], P.metal);
    }
  }
  // Deck inlays lead to the ramp without resembling a row of pickups.
  for (let z = 10.7; z < 19; z += 1.2) {
    pod.box([0, 0.207, z], [0.12, 0.012, 0.62], P.ochre);
    for (const x of [-2.55, 2.55])
      pod.box([x, 0.207, z], [0.28, 0.012, 0.05], P.steelLight);
  }
  // Working bench and identifiable locker face actual simulation interaction positions.
  pod.box([2.1, 1.36, 20.9], [1.45, 0.18, 2.7], P.metal);
  pod.box([2.05, 1.53, 20.45], [0.9, 0.16, 0.7], P.ochre);
  pod.box([2.15, 2.2, 21.4], [0.45, 0.85, 0.8], P.petrol);
  pod.box([1.89, 2.2, 21.4], [0.05, 0.55, 0.6], P.lime);
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
  // Scored regulator: a protected side-wall instrument within reach of C01.
  // Its mechanical face, not a floating clue identifier, supplies the affordance.
  pod.panel([-2.82, 1.65, 21.05], [1.65, 1.85], 0.06, P.shade, -Math.PI / 2, 0.18);
  pod.panel([-2.745, 1.68, 21.05], [1.31, 1.48], 0.025, P.petrol, -Math.PI / 2);
  pod.ellipsoid([-2.7, 1.85, 20.9], [0.035, 0.28, 0.28], P.shell, 12);
  pod.ring([-2.65, 1.85, 20.9], [0, 0, 1], [0, 1, 0], 0.31, 0.265, P.ochre);
  pod.tube([[-2.62, 1.85, 20.9], [-2.62, 2.02, 20.76]], 0.018, P.ink, 4);
  for (let i = 0; i < 5; i++) {
    const a = i / 4 * Math.PI;
    pod.tube([[-2.615, 1.85 + Math.sin(a) * 0.22, 20.9 + Math.cos(a) * 0.22], [-2.615, 1.85 + Math.sin(a) * 0.19, 20.9 + Math.cos(a) * 0.19]], 0.012, P.ink, 4);
  }
  pod.box([-2.69, 1.31, 21.36], [0.07, 0.22, 0.25], P.ochre);
  pod.tube([[-2.58, 1.32, 21.45], [-2.58, 1.32, 21.27]], 0.028, P.ink, 5);
  // Localized peeled shield and scored metal, leaving the refuge comfortable.
  pod.face([[-3.58, 3.56, 20.1], [-2.66, 3.85, 20.05], [-2.87, 4.14, 20.65], [-3.6, 3.58, 20.8]], P.ochre);
  pod.tube([[-2.88, 2.87, 20.15], [-2.88, 2.65, 20.39], [-2.88, 2.57, 20.25], [-2.88, 2.2, 20.45]], 0.022, P.ink, 4);
  pod.tube([[-2.78, 2.9, 20.15], [-2.62, 2.73, 20.35], [-2.73, 2.4, 20.55]], 0.023, P.orange, 5);
  // Worktop grip, tool slots, storage seam and a useful fabrication control face.
  pod.panel([1.66, 0.85, 20.75], [1.85, 0.75], 0.025, P.shade, Math.PI / 2);
  for (const z of [20.25, 21.05, 21.8])
    pod.box([1.64, 1.05, z], [0.045, 0.05, 0.3], P.ochre);
  pod.panel([1.87, 2.2, 21.4], [0.62, 0.65], 0.018, P.ink, Math.PI / 2);
  for (let i = 0; i < 3; i++)
    pod.box([1.84, 2.07 + i * 0.13, 21.4], [0.02, 0.035, 0.3 - i * 0.06], P.mint);
  // Personal objects stay on the existing worktop/locker, never in a walking
  // line. A clipped task lamp, mug and folded cloth imply use without pickups.
  pod.tube([[2.62, 1.5, 20.0], [2.62, 2.4, 20.0], [2.2, 2.5, 20.12]], .035, P.petrol, 6);
  pod.panel([2.17, 2.43, 20.08], [.35, .13], .08, P.ochre);
  pod.glow(pod.box([2.17, 2.37, 20.17], [.27, .035, .12], P.warm));
  pod.ellipsoid([2.05, 1.58, 21.92], [.12, .16, .12], P.orange, 10);
  pod.ellipsoid([2.05, 1.73, 21.92], [.09, .013, .09], P.ink, 10);
  pod.ring([1.9, 1.61, 21.92], [1, 0, 0], [0, 1, 0], .085, .05, P.orange, 10);
  for (let i = 0; i < 3; i++)
    pod.box([-2.17, 1.63 + i * .035, 22.5], [.65, .035, .4], i % 2 ? P.coral : P.shell);
  for (const x of [-1.53, 1.53]) {
    pod.box([x, 1.6, 19.25], [.06, 2.8, .06], P.petrol);
    pod.glow(pod.box([x, 1.6, 19.21], [.035, 2.35, .025], P.warm));
  }
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
  pod.finish(.45);
  label(scene, "H / 01", [0, 3.45, 19.15], .62);
  label(scene, "LOCKER", [-1.52, 1.65, 22.4], 0.54, Math.PI / 2);
  label(scene, "SERVICE", [1.65, 2.9, 21.2], .52);
  label(scene, "REGULATOR", [-2.68, 2.55, 21.05], .54, -Math.PI / 2);
}

export function label(
  scene: Scene,
  text: string,
  p: readonly [number, number, number],
  width = 2,
  yaw = 0,
): Mesh {
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
    `bold ${Math.min(45, Math.floor(800 / Math.max(1, text.length)))}px sans-serif`,
    "#f3e6bb",
    "#234d58",
    true,
  );
  const material = new StandardMaterial("label." + text, scene);
  material.diffuseTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = true;
  const plane = CreatePlane(
    "label." + text,
    { width, height: width / 4, sideOrientation: Mesh.DOUBLESIDE,
      frontUVs: new Vector4(1, 0, 0, 1), backUVs: new Vector4(0, 0, 1, 1) },
    scene,
  );
  plane.position.set(...p);
  plane.rotation.y = yaw;
  plane.material = material;
  plane.isPickable = false;
  plane.renderingGroupId = 1;
  // Each side has explicit UVs. With the production right-handed scene, the
  // -Z face needs U reversed; a two-sided material alone mirrors the return view.
  // Static signs live with the scene. Dynamic carrier signs also dispose their
  // texture/material when their shell is rebuilt for another lock state.
  plane.onDisposeObservable.add(() => material.dispose(true, true));
  return plane;
}
