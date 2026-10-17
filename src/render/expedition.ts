import type { Scene, ShaderMaterial, Mesh } from "@babylonjs/core";
import {
  SOURCES,
  EVIDENCE,
  CANOPY_COVER,
  RECOVERY_STAGE,
} from "../content/registry.js";
import type { GameState, VehicleState } from "../sim/types.js";
import { CARRIER_SUPPORT } from "../sim/carrier.js";
import { ArtBatch } from "./geometry.js";
import type { Point } from "./geometry.js";
import { PALETTE as P } from "./palette.js";
import { label } from "./landmarks.js";
import { FACILITY_SOLIDS, terrainHeight } from "../sim/world.js";
function dartArt(
  scene: Scene,
  cel: ShaderMaterial,
  id: string,
  hull: VehicleState["hull"],
): Mesh {
  const b = new ArtBatch(id, scene, cel);
  if (hull === "hearthline") {
    b.box([0, 3.8, 0], [11, 0.5, 24], P.petrol);
    b.box([0, 9, 0], [12, 0.35, 26], P.porcelain);
    for (const x of [-5.6, 5.6]) {
      b.box([x, 6.3, 0], [0.6, 4.5, 25], P.porcelain);
      b.box([x > 0 ? 5.23 : -5.23, 6.5, 0], [0.05, 2.4, 16], P.glass);
      b.box([x * 1.3, 1.5, 0], [4, 3, 28], P.petrol);
      b.box([x * 1.3, 2.9, 0], [3, 0.8, 26], P.ochre);
    }
    b.box([0, 6.4, -12], [11, 5, 0.3], P.petrol);
    b.box([0, 6.6, -11.8], [8, 2.7, 0.06], P.glass);
    b.box([0, 5, -8], [3, 1.5, 1.2], P.petrol);
    b.box([0, 5.85, -8.2], [2.7, 0.1, 0.8], P.lime);
    b.box([0, 6.5, 12], [11, 5, 0.3], P.petrol);
    b.box([3.8, 4.3, 9], [2, 0.3, 4], P.ochre);
    for (const z of [-5, 3, 8])
      b.box([-4.2, 4.8, z], [1.4, 1.3, 2.5], z === 3 ? P.ochre : P.metal);
  } else if (hull === "spindle") {
    b.loft(
      [
        { z: -3.7, w: 0.1, low: 0, high: 0.4 },
        { z: -1, w: 0.85, low: 0, high: 1 },
        { z: 2.8, w: 0.7, low: 0.1, high: 1 },
      ],
      P.porcelain,
    );
    for (const x of [-2, 2]) {
      b.ellipsoid([x, 0.4, 0], [0.32, 0.45, 2.6], P.ochre, 8);
      b.box([x / 2, 0.55, 0], [2, 0.15, 0.2], P.metal);
    }
    b.box([0, 1.4, 0], [1.2, 0.12, 1.5], P.glass);
  } else if (hull === "creel") {
    b.box([0, 0.8, 0], [4, 1.5, 6.5], P.petrol);
    b.box([0, 2, -1], [3.5, 1.5, 2.5], P.porcelain);
    b.box([0, 2, -2.3], [2.8, 0.9, 0.06], P.glass);
    for (const x of [-2.5, 2.5]) b.box([x, 0.8, -2], [0.6, 0.4, 3], P.ochre);
  } else {
    b.loft(
      [
        { z: -3.6, w: 0.15, low: 0.15, high: 0.6 },
        { z: -2.1, w: 1.1, low: 0, high: 0.85 },
        { z: 0.1, w: 1.85, low: 0, high: 0.9 },
        { z: 2.5, w: 1.15, low: 0.2, high: 0.75 },
      ],
      P.porcelain,
    );
    b.loft(
      [
        { z: -2, w: 0.7, low: 0.15, high: 0.6 },
        { z: 0, w: 1.7, low: 0.1, high: 0.7 },
        { z: 2.5, w: 1.15, low: 0.2, high: 0.7 },
      ],
      P.petrol,
    );
    b.box([0, 0.61, -2.2], [1.3, 0.2, 0.95], P.ochre);
    // Offset faceted canopy and broad framed stern drive, rather than paired engine tubes.
    const canopy = [
      [-0.64, 0.8, -1.5],
      [0.74, 0.8, -1.5],
      [1, 1.95, 0.1],
      [-0.65, 1.95, 0.1],
    ] as const;
    b.face(canopy, P.glass);
    b.face([canopy[1], [1.2, 0.8, 1.0], [1, 1.95, 0.1]], "#317c8c");
    b.face([canopy[0], [-0.9, 0.8, 1.0], [-0.65, 1.95, 0.1]], "#1c536a");
    b.face(
      [
        [-0.58, 1.85, 0.02],
        [0.3, 1.85, 0.02],
        [0.13, 1.1, -1.13],
        [-0.49, 1.1, -1.13],
      ],
      P.reflection,
    );
    for (const x of [-1.15, 1.15]) {
      b.box([x, 0.15, 1.3], [0.18, 0.45, 2.8], P.metal);
      b.box([x, 0.72, 2.5], [0.16, 1.2, 0.18], P.ochre);
      b.tube(
        [
          [x, 0.9, 0.9],
          [x, 1.12, 0.9],
          [x, 1.12, 1.8],
        ],
        0.04,
        P.metal,
        5,
      );
    }
    b.box([0, 1.3, 2.5], [2.5, 0.16, 0.18], P.ochre);
    b.box([0, 0.3, 2.5], [2.5, 0.18, 0.2], P.ochre);
    b.ellipsoid([0, 0.8, 2.55], [0.3, 0.3, 0.1], P.ink, 8);
    for (const x of [-1, 1]) {
      b.face(
        [
          [x * 1.1, 0.7, 0.7],
          [x * 2.5, 0.6, 1.8],
          [x * 1.1, 0.65, 2.4],
        ],
        P.ochre,
      );
      for (let i = 0; i < 4; i++)
        b.box([x * 1.48, 0.9, 0.5 + i * 0.22], [0.35, 0.05, 0.07], P.ink);
    }
    b.ellipsoid([0, 0.45, -3.1], [0.26, 0.14, 0.12], P.warm, 8);
    b.tube(
      [
        [-0.75, 0.3, -2.9],
        [0, 0.3, -3.55],
        [0.75, 0.3, -2.9],
      ],
      0.04,
      P.metal,
      6,
    );
  }
  const mesh = b.finish();
  mesh.unfreezeWorldMatrix();
  return mesh;
}
export function createExpeditionArt(
  scene: Scene,
  cel: ShaderMaterial,
): { update(state: GameState | null): void } {
  const restraint = new ArtBatch("opening.restraint", scene, cel);
  restraint.tube(
    [
      [-0.65, 1.4, 21.1],
      [0, 0.7, 21.25],
      [0.65, 1.4, 21.1],
    ],
    0.12,
    P.ochre,
    6,
  );
  restraint.box([0, 0.76, 21.2], [0.32, 0.27, 0.12], P.petrol);
  const restraintMesh = restraint.finish();
  const fogged = new ArtBatch("opening.fogged-window", scene, cel);
  fogged.box([0, 1.6, 19.4], [3.2, 3.0, 0.12], "#0c2c3d");
  for (let i = 0; i < 8; i++)
    fogged.box(
      [-1.2 + i * 0.34, 1.2 + Math.sin(i) * 0.3, 19.48],
      [0.025, 1.5, 0.025],
      "#2b6370",
    );
  const fogMesh = fogged.finish();
  const latch = new ArtBatch("opening.service-latch", scene, cel);
  latch.box([-1.4, 1.3, 20.7], [0.75, 0.6, 0.22], P.ochre);
  latch.tube(
    [
      [-1.65, 1.2, 20.9],
      [-1.65, 1.5, 20.9],
      [-1.2, 1.5, 20.9],
    ],
    0.05,
    P.ink,
    5,
  );
  const latchMesh = latch.finish();
  const sourceMeshes = new Map<string, Mesh>();
  for (const [id, s] of Object.entries(SOURCES)) {
    const b = new ArtBatch("source." + id, scene, cel),
      { x, y, z } = s.position;
    for (let i = 0; i < 5; i++) {
      const dx = ((i % 3) - 1) * 0.65,
        dz = (Math.floor(i / 3) - 0.5) * 0.7;
      if (s.asset === "scraps") {
        b.box(
          [x + dx, y - 0.25, z + dz],
          [0.55, 0.12, 0.8],
          i % 2 ? P.ochre : P.metal,
          [0, i * 0.4, 0.1],
        );
        b.box([x + dx, y - 0.16, z + dz], [0.35, 0.025, 0.04], P.porcelain);
      } else if (s.asset === "glass") {
        b.ellipsoid(
          [x + dx, y - 0.3, z + dz],
          [0.28, 0.6, 0.3],
          i % 2 ? "#9ce4d1" : "#caedc5",
          5,
        );
        b.tube(
          [
            [x + dx, y - 0.3, z + dz],
            [x + dx + 0.1, y + 0.2, z + dz],
          ],
          0.025,
          P.reflection,
          4,
        );
      } else if (s.asset === "ribbons") {
        b.face(
          [
            [x + dx, y - 0.6, z + dz],
            [x + dx + 0.8, y - 0.5, z + dz],
            [x + dx + 0.6, y + 0.1, z + dz + 0.2],
            [x + dx - 0.1, y - 0.3, z + dz + 0.3],
          ],
          i % 2 ? P.coral : P.jade,
        );
      } else if (s.asset === "crust") {
        b.box([x + dx, y - 0.4, z + dz], [0.3, 0.7, 0.7], P.petrol, [
          0,
          0,
          i * 0.12,
        ]);
        b.ellipsoid([x + dx, y, z + dz], [0.28, 0.14, 0.32], P.amber, 6);
      } else if (s.asset === "resin") {
        b.ellipsoid(
          [x + dx, y - 0.25, z + dz],
          [0.4, 0.35, 0.3],
          i % 2 ? P.amber : P.orange,
          7,
        );
      } else {
        b.tube(
          [
            [x + dx, y - 0.4, z + dz],
            [x + dx, y + 0.2, z + dz],
          ],
          0.18,
          P.jade,
          7,
        );
        b.ellipsoid([x + dx, y + 0.25, z + dz], [0.32, 0.2, 0.32], P.lime, 8);
      }
    }
    sourceMeshes.set(id, b.finish());
  }
  const site = new ArtBatch("facilities.context", scene, cel);
  for (const body of FACILITY_SOLIDS.filter((s) => !s.id.startsWith("pod.")))
    site.bounds(body, body.id === "workshop.locker" || body.id.startsWith("workshop.cradle.") ? P.ochre : body.id === "canopy.bench" ? P.metal : P.petrol);
  // Reef intake pipes, a sediment-choked filter and actual current-facing colonies.
  for (const x of [-20, -18, -16]) {
    site.tube(
      [
        [x, -8, -12],
        [x, -8, -8],
        [x, -7.7, -6],
      ],
      0.3,
      P.petrol,
      8,
    );
    for (let i = 0; i < 4; i++)
      site.box([x, -7.5, -8 + i * 0.4], [0.58, 0.1, 0.07], P.metal);
  }
  site.box([-17, -7.7, -8], [1.2, 0.6, 1.8], P.ochre);
  // Workshop platform, weathered folded roof, and human-scale mechanical station.
  // Narrow grip treads follow the same continuous terrain ramp as the controller.
  for (let z = -30.5; z <= -23; z += 0.85) {
    const y = terrainHeight(10, z);
    site.box([10, y + 0.025, z], [3.4, 0.04, 0.12], P.petrol);
    for (const x of [8.1, 11.9])
      site.ellipsoid([x, terrainHeight(x, z) + 0.08, z], [0.1, 0.07, 0.1], P.ochre, 5);
  }
  site.box([9.5, 1.05, -35.5], [13, 0.3, 9], P.petrol);
  for (let z = -39; z < -31; z += 0.6)
    site.box([9.5, 1.22, z], [12.4, 0.03, 0.1], P.metal);
  for (const x of [3.3, 15.7])
    for (const z of [-39.7, -32]) {
      site.box([x, 1.5, z], [0.4, 0.4, 0.4], P.ochre);
    }
  site.face(
    [
      [3, 5.5, -40],
      [10, 6, -40],
      [10, 5.7, -34],
      [3, 5.2, -34],
    ],
    P.porcelain,
  );
  site.face(
    [
      [10, 6, -40],
      [16, 5.2, -40],
      [16, 4.9, -34],
      [10, 5.7, -34],
    ],
    "#adc5b9",
  );
  site.box([10, 2.3, -39], [5.8, 0.14, 1.2], P.metal);
  // A reachable, readable ledger and instrument panel above a waist-high bench.
  site.box([10, 2.4, -38.8], [1.1, 0.06, 0.7], P.ochre);
  site.box([10, 2.44, -38.8], [0.85, 0.02, 0.55], P.porcelain);
  for (let row = 0; row < 4; row++)
    site.box([10, 2.455, -39 + row * 0.13], [0.63 - row * 0.06, 0.01, 0.025], P.petrol);
  site.box([11.8, 2.85, -39.3], [1.2, 0.8, 0.15], P.ochre);
  site.box([11.8, 2.85, -39.2], [0.95, 0.58, 0.06], P.petrol);
  for (const x of [11.5, 11.8, 12.1])
    site.box([x, 2.85, -39.15], [0.09, 0.35, 0.03], P.lime);
  for (const x of [7.8, 9, 10.2, 11.4, 12.2]) {
    site.box([x, 1.73, -38.48], [0.8, 0.75, 0.04], "#396b74");
    site.box([x, 1.9, -38.43], [0.35, 0.045, 0.04], P.ochre);
  }
  for (let z = -38; z < -35; z += 0.6)
    site.tube(
      [
        [4, 1.2, z],
        [4, 2.2, z],
      ],
      0.06,
      P.metal,
      5,
    );
  // Visible incomplete carrier cradle. No active construction interaction.
  for (const x of [24, 42]) {
    site.tube(
      [
        [x, -3, -30],
        [x, 5, -30],
        [x, 7, -49],
        [x, -7, -49],
      ],
      0.35,
      P.petrol,
      8,
    );
    for (let z = -32; z > -48; z -= 4)
      site.box([x, 1, z], [0.7, 0.6, 2], P.ochre);
  }
  for (let z = -32; z > -49; z -= 5)
    site.tube(
      [
        [24, -1, z],
        [28, 0, z],
        [38, 0, z],
        [42, -1, z],
      ],
      0.25,
      P.metal,
      7,
    );
  // Dart cradle and sea-facing approach lights.
  for (let i = 0; i < 5; i++)
    site.ellipsoid([20, -0.1, -19 + i], [0.12, 0.08, 0.12], P.lime, 6);
  // Upper laboratory: dry physical alcove with an open pressure hood and distinct return arch.
  site.box([116, -118.2, -126], [10, 0.4, 8], P.petrol);
  site.box([116, -113.85, -126], [10, 0.3, 8], P.porcelain);
  site.box([116, -116, -129.9], [10, 4, 0.2], P.petrol);
  site.box([111.15, -116, -126], [0.3, 4, 8], P.porcelain);
  for (const x of [111.5, 120.5])
    site.box([x, -116, -122.1], [0.25, 4, 0.25], P.ochre);
  site.box([116, -116.94, -128], [3.2, 0.12, 1.2], P.ochre);
  site.box([116, -116.85, -127.8], [0.85, 0.035, 0.6], P.porcelain);
  for (let row = 0; row < 5; row++)
    site.box([116, -116.825, -128.0 + row * 0.1], [0.62, 0.01, 0.02], P.petrol);
  site.box([117.9, -114.4, -125], [3, 0.12, 4], P.warm);
  const cover = CANOPY_COVER;
  site.box(
    [
      (cover.min.x + cover.max.x) / 2,
      (cover.min.y + cover.max.y) / 2,
      (cover.min.z + cover.max.z) / 2,
    ],
    [
      cover.max.x - cover.min.x,
      cover.max.y - cover.min.y,
      cover.max.z - cover.min.z,
    ],
    P.basalt,
  );
  const rs = RECOVERY_STAGE;
  site.box([rs.x, rs.y - 0.9, rs.z], [8, 0.4, 7], P.petrol);
  site.box([rs.x, rs.y - 0.3, rs.z], [0.9, 0.9, 1.4], P.ochre);
  site.tube(
    [
      [rs.x - 3, rs.y - 1, rs.z],
      [rs.x - 3, rs.y + 2, rs.z],
    ],
    0.07,
    P.metal,
    6,
  );
  site.finish();
  label(scene, "SPLITSPINE / WORKSHOP", [10, 4.7, -32.1], 4);
  label(scene, "DART / CLEAR CRADLE", [20, 1, -21], 3);
  label(scene, "LARGE BERTH / INCOMPLETE", [33, 5, -30], 5);
  label(scene, "UPPER LAB / AIR", [116, -114.7, -122.05], 3.7);
  label(scene, "LOCAL RESCUE", [46, -10, -53.9], 2.6);
  for (const [id, e] of Object.entries(EVIDENCE))
    label(
      scene,
      id,
      [e.position.x, e.position.y + 0.4, e.position.z - 0.1],
      0.45,
    );
  // Canopy holdfasts, buoyant bladders and long ribbed fronds establish a distinct habitat.
  const canopy = new ArtBatch("canopy.habitat", scene, cel);
  for (let i = 0; i < 10; i++) {
    const x = 78 + (i % 4) * 21,
      z = -88 - Math.floor(i / 4) * 23,
      y = terrainHeight(x, z),
      top = -65 - (i % 3) * 12;
    canopy.tube(
      [
        [x, y, z],
        [x + 2, y + 14, z - 1],
        [x + 4, top, z + 1],
      ],
      0.23,
      P.petrol,
      7,
    );
    canopy.ellipsoid(
      [x + 4, top, z + 1],
      [2.7, 1.9, 2.1],
      i % 2 ? P.amber : P.jade,
      8,
    );
    for (let j = 0; j < 4; j++) {
      const path: Point[] = [
        [x + 4, top, z + 1],
        [x + 6 + j, top + 2, z + 2 + j * 2],
        [x + 10 + j * 2, top + 2.5, z + 3 + j * 4],
      ];
      canopy.tube(path, 0.05, P.lime, 5);
      canopy.face(
        [
          [x + 4, top, z + 1],
          [x + 6 + j, top + 3, z + j * 2],
          [x + 12 + j * 2, top + 3, z + 5 + j * 4],
          [x + 10 + j * 2, top + 1, z + 3 + j * 4],
        ],
        j % 2 ? "#4ca68e" : "#7bcda8",
      );
    }
  }
  canopy.finish();
  const hunter = new ArtBatch("ecology.sound-hunter", scene, cel);
  hunter.loft(
    [
      { z: -4, w: 0.2, low: 0.4, high: 0.7 },
      { z: -1.8, w: 1.2, low: 0, high: 1.5 },
      { z: 1, w: 0.7, low: 0.2, high: 1.2 },
      { z: 4, w: 0.1, low: 0.4, high: 0.7 },
    ],
    P.violet,
  );
  for (const x of [-1, 1]) {
    hunter.face(
      [
        [0, 0.8, -1],
        [x * 3, 0.4, 1],
        [x * 1, 1, 2],
      ],
      P.coral,
    );
    hunter.tube(
      [
        [x * 0.9, 1.4, -1.2],
        [x * 1.3, 2.2, -0.8],
        [x * 1.1, 2.5, 0.3],
      ],
      0.1,
      P.amber,
      6,
    );
    hunter.ellipsoid([x * 0.65, 1.1, -1.9], [0.12, 0.13, 0.2], P.warm, 6);
  }
  hunter.face(
    [
      [0, 0.6, 3],
      [0, 2.7, 4.5],
      [0, 0.8, 4],
      [0, -1, 4.2],
    ],
    P.petrol,
  );
  const hunterMesh = hunter.finish();
  hunterMesh.unfreezeWorldMatrix();
  const buoy = new ArtBatch("equipment.salvage-buoy", scene, cel);
  buoy.ellipsoid([0, 0.45, 0], [0.9, 0.5, 0.9], P.ochre, 10);
  buoy.box([0, -0.2, 0], [1.5, 0.6, 1.5], P.petrol);
  buoy.tube(
    [
      [0, 0.4, 0],
      [0, 1.5, 0],
    ],
    0.04,
    P.metal,
    5,
  );
  const buoyMesh = buoy.finish();
  buoyMesh.unfreezeWorldMatrix();
  const bobbin = new ArtBatch("equipment.bobbin", scene, cel);
  bobbin.box([0, 0, 0], [0.7, 0.35, 0.9], P.ochre);
  bobbin.ellipsoid([0, 0, -0.5], [0.2, 0.15, 0.15], P.glass, 6);
  const bobbinMesh = bobbin.finish();
  bobbinMesh.unfreezeWorldMatrix();
  const obstruction = new ArtBatch("fixture.obstruction", scene, cel);
  obstruction.box([0, 0, 0], [8, 6, 0.7], P.orange);
  for (let x = -3; x < 4; x += 1)
    obstruction.box([x, 0, -0.4], [0.4, 5, 0.1], P.ink, [0, 0, -0.3]);
  const blockMesh = obstruction.finish();
  blockMesh.unfreezeWorldMatrix();
  const mooring = new ArtBatch("fixture.support-mooring", scene, cel);
  for (const x of [-9, 9]) for (const z of [-14, 14]) {
    mooring.ellipsoid([CARRIER_SUPPORT.x + x, 0.3, CARRIER_SUPPORT.z + z], [0.9, 0.6, 0.9], P.ochre, 9);
    mooring.tube([[CARRIER_SUPPORT.x + x, 0.3, CARRIER_SUPPORT.z + z], [CARRIER_SUPPORT.x + x, 2, CARRIER_SUPPORT.z + z]], 0.07, P.petrol, 6);
  }
  const mooringMesh = mooring.finish();
  const mooringSign = label(scene, "SUPPORTED SURVEY MOORING", [CARRIER_SUPPORT.x + 9, 3, CARRIER_SUPPORT.z + 14], 5);
  const vehicles = new Map<string, Mesh>(),
    caches = new Map<string, Mesh>();
  return {
    update(s) {
      mooringMesh.setEnabled(s?.scenario === "carrier-fixture");
      mooringSign.setEnabled(s?.scenario === "carrier-fixture");
      restraintMesh.setEnabled(!!s && s.opening.phase === 0);
      fogMesh.setEnabled(!!s && s.opening.phase < 3);
      latchMesh.setEnabled(!!s && s.opening.phase < 2);
      for (const [id, mesh] of sourceMeshes)
        mesh.setEnabled(
          !s || !!s.world.resources.find((r) => r.id === id && r.stock > 0),
        );
      const time = s ? s.tick / 60 : 0;
      const t = s?.world.threat;
      hunterMesh.setEnabled(s?.scenario === "expedition");
      if (t) {
        hunterMesh.position.set(t.position.x, t.position.y, t.position.z);
        const p = s!.player.pose.position;
        hunterMesh.rotation.y = Math.atan2(
          p.x - t.position.x,
          -(p.z - t.position.z),
        );
        hunterMesh.rotation.z = Math.sin(time * 1.5) * 0.045;
      }
      for (const [id, mesh] of vehicles)
        if (!s?.fleet.vehicles.some((v) => v.id === id)) {
          mesh.dispose();
          vehicles.delete(id);
        }
      for (const v of s?.fleet.vehicles ?? []) {
        let m = vehicles.get(v.id);
        if (!m) {
          m = dartArt(scene, cel, v.id, v.hull);
          m.renderingGroupId = 1;
          vehicles.set(v.id, m);
        }
        m.position.set(v.pose.position.x, v.pose.position.y, v.pose.position.z);
        m.rotation.y = v.pose.yaw;
        m.setEnabled(
          s?.player.controlledVehicleId !== v.id || v.hull === "hearthline",
        );
      }
      buoyMesh.setEnabled(!!s?.inventory.buoy.deployed);
      if (s)
        buoyMesh.position.set(
          s.inventory.buoy.position.x,
          s.inventory.buoy.position.y,
          s.inventory.buoy.position.z,
        );
      bobbinMesh.setEnabled(!!s?.recovery.operation);
      if (s?.recovery.operation) {
        const p = s.recovery.operation.position;
        bobbinMesh.position.set(p.x, p.y, p.z);
      }
      blockMesh.setEnabled(!!s?.fleet.docking?.launchBlocked);
      const h = s?.fleet.vehicles.find(
        (v) => v.id === s.fleet.docking?.vehicleId,
      );
      if (h)
        blockMesh.position.set(
          h.pose.position.x,
          h.pose.position.y - 2,
          h.pose.position.z - 17,
        );
      for (const c of s?.recovery.caches ?? []) {
        let m = caches.get(c.id);
        if (!m) {
          const b = new ArtBatch(c.id, scene, cel);
          b.box([0, 0.3, 0], [0.7, 0.6, 0.7], P.ochre);
          b.tube(
            [
              [0, 0.6, 0],
              [0, 1.5, 0],
            ],
            0.04,
            P.lime,
            5,
          );
          m = b.finish();
          m.unfreezeWorldMatrix();
          m.renderingGroupId = 1;
          caches.set(c.id, m);
        }
        m.position.set(c.position.x, c.position.y, c.position.z);
        m.setEnabled(
          s!.inventory.items.some((i) => i.containerId === c.containerId),
        );
      }
    },
  };
}
