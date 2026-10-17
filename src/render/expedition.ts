import type { Scene, ShaderMaterial, Mesh } from "@babylonjs/core";
import {
  SOURCES,
  EVIDENCE,
  CANOPY_COVER,
  RECOVERY_STAGE,
} from "../content/registry.js";
import type { GameState, VehicleState } from "../sim/types.js";
import { CARRIER_LAYOUT, CARRIER_SUPPORT, carrierRooms, carrierStructure, launchPoint } from "../sim/carrier.js";
import { ArtBatch } from "./geometry.js";
import type { Point } from "./geometry.js";
import { PALETTE as P } from "./palette.js";
import { label } from "./landmarks.js";
import { FACILITY_SOLIDS, terrainHeight } from "../sim/world.js";

/** The structural descriptors remain the physical authority. Passage skins are
 * at most 3 mm proud of them; the capsule passage and the complete rail path stay
 * empty. Observation glazing is opaque cel glass until core supplies a shared
 * transparent, fog-aware material; it never implies a door into a sealed room. */
function carrierShellArt(scene: Scene, cel: ShaderMaterial, configuration: "compact" | "medium", openSlot?: 0 | 1): Mesh {
  const b = new ArtBatch("carrier.physical-compartments", scene, cel);
  const signs: Mesh[] = [];
  for (const solid of carrierStructure(configuration, openSlot))
    b.bounds(solid, solid.id.includes("gate") ? P.ochre : solid.id.includes("roof") ? P.shade : P.petrol);
  for (const [slot, room] of carrierRooms(configuration).entries()) {
    const { min: a, max: c } = room, w = c.x - a.x, length = c.z - a.z, cx = (a.x + c.x) / 2;
    const accent = slot === 0 ? P.ochre : P.steelLight;
    // Broad fore/aft bulkheads use human-scale service panels, a gasketed
    // observation pane and bold berth identity, rather than blank white walls.
    for (const [z, yaw] of [[a.z - CARRIER_LAYOUT.wall - 0.002, 0], [c.z + CARRIER_LAYOUT.wall + 0.002, Math.PI]] as const) {
      const toward = yaw === 0 ? -1 : 1;
      b.panel([cx, a.y + 0.65, z], [w - 0.14, 1.05], 0.016, P.metal, yaw);
      b.panel([cx, a.y + 3.15, z], [w - 0.14, 2.1], 0.016, P.shade, yaw, 0.16);
      b.panel([cx, a.y + 1.85, z + toward * 0.001], [w - 0.8, 1.45], 0.018, P.steelLight, yaw, 0.18);
      b.panel([cx, a.y + 1.85, z + toward * 0.002], [w - 1.04, 1.21], 0.016, P.glass, yaw, 0.16);
      b.box([cx - w * 0.22, a.y + 2.22, z + toward * 0.003], [w * 0.31, 0.045, 0.004], P.reflection);
      b.box([cx + w * 0.13, a.y + 1.85, z + toward * 0.003], [0.045, 1.14, 0.004], P.metal);
      for (const x of [a.x + 0.16, c.x - 0.16]) {
        b.box([x, a.y + 2.15, z + toward * 0.001], [0.1, 4.05, 0.008], P.porcelain);
        for (const y of [a.y + 0.28, c.y - 0.28])
          b.box([x, y, z + toward * 0.003], [0.14, 0.065, 0.006], accent);
      }
      b.box([cx, a.y + 0.18, z + toward * 0.002], [w - 0.4, 0.07, 0.007], accent);
      b.box([cx, a.y + 2.7, z + toward * 0.002], [w - 0.8, 0.06, 0.007], openSlot === slot ? P.ochre : P.mint);
      const name = configuration === "medium" ? "SERVICE BERTH" : slot === 0 ? "PORT / 01" : "STARBOARD / 02";
      signs.push(label(scene, name, [cx, a.y + 3.4, z + toward * 0.008], w - 1.05, yaw));
      signs.push(label(scene, openSlot === slot ? "TRANSFER / KEEP CLEAR" : "DRY / ISOLATED", [cx, a.y + 0.65, z + toward * 0.008], Math.min(2.7, w - 0.9), yaw));
    }
    for (const [x, yaw] of [[a.x - CARRIER_LAYOUT.wall - 0.002, Math.PI / 2], [c.x + CARRIER_LAYOUT.wall + 0.002, -Math.PI / 2]] as const) {
      // Side skins are flush. In particular, nothing projects into the 0.84 m
      // central free width in the two-compact configuration.
      const count = Math.ceil(length / 1.9), step = length / count;
      for (let i = 0; i < count; i++) {
        const z = a.z + step * (i + 0.5);
        b.panel([x, a.y + 0.78, z], [step - 0.045, 1.4], 0.012, i % 2 ? P.metal : P.petrol, yaw, 0.06);
        b.panel([x, a.y + 2.9, z], [step - 0.045, 2.7], 0.012, i % 2 ? P.porcelain : P.shade, yaw, 0.08);
        b.panel([x + (yaw > 0 ? -0.001 : 0.001), a.y + 1.62, z], [step - 0.24, 0.13], 0.012, accent, yaw, 0.035);
      }
    }
  }
  // Existing deck and the sealed hatches remain authoritative. Painted tracks
  // and chevrons explain the passage, not a new platform or service interaction.
  const rooms = carrierRooms(configuration);
  const passageMin = rooms[0]!.max.x + CARRIER_LAYOUT.wall;
  const passageMax = configuration === "compact" ? rooms[1]!.min.x - CARRIER_LAYOUT.wall : CARRIER_LAYOUT.interior.maxX;
  const passageX = (passageMin + passageMax) / 2;
  for (let z = CARRIER_LAYOUT.deck.min.z + 1; z < CARRIER_LAYOUT.deck.max.z - 1; z += 0.85) {
    for (const x of [passageX - 0.27, passageX + 0.27])
      b.box([x, CARRIER_LAYOUT.deck.max.y + 0.002, z], [0.045, 0.004, 0.5], P.mint);
  }
  const mesh = b.finish();
  mesh.unfreezeWorldMatrix();
  mesh.renderingGroupId = 1;
  for (const sign of signs) sign.parent = mesh;
  return mesh;
}

function dartArt(
  scene: Scene,
  cel: ShaderMaterial,
  id: string,
  hull: VehicleState["hull"],
): Mesh {
  const b = new ArtBatch(id, scene, cel);
  if (hull === "hearthline") {
    const width = CARRIER_LAYOUT.deck.max.x - CARRIER_LAYOUT.deck.min.x;
    b.box([0, 9, 0], [width + 0.6, 0.35, 26], P.porcelain);
    for (const x of [CARRIER_LAYOUT.deck.min.x, CARRIER_LAYOUT.deck.max.x]) {
      b.box([x, 6.3, 0], [0.6, 4.5, 25], P.porcelain);
      b.box([x > 0 ? x - 0.37 : x + 0.37, 6.5, 0], [0.05, 2.4, 16], P.glass);
      b.box([Math.sign(x) * 7.2, 1.5, 0], [4, 3, 28], P.petrol);
      b.box([Math.sign(x) * 7.2, 2.9, 0], [3, 0.8, 26], P.ochre);
    }
    b.box([0, 6.4, -12], [width, 5, 0.3], P.petrol);
    b.box([0, 6.6, -11.8], [8, 2.7, 0.06], P.glass);
    // The helm is a waist-high console, readable from the actual standing eye.
    b.box([0, 4.55, -8], [3, 1.1, 1.2], P.petrol);
    b.face([[-1.45, 5.14, -8.6], [1.45, 5.14, -8.6], [1.45, 4.95, -7.4], [-1.45, 4.95, -7.4]], P.metal);
    for (const x of [-0.78, 0, 0.78]) {
      b.panel([x, 5.15, -8.3], [0.65, 0.38], 0.055, P.glass, Math.PI);
      b.box([x, 5.15, -8.235], [0.42, 0.035, 0.012], P.mint);
      b.box([x, 5.02, -7.68], [0.38, 0.06, 0.22], P.ochre);
    }
    // Window mullions, pressure rib rhythm and wall-bound fittings sit outside
    // the shared walking bounds, with no new interior service function.
    for (const x of [-4, 0, 4])
      b.box([x, 6.7, -11.75], [0.16, 2.95, 0.09], P.metal);
    for (const x of [-3.3, 2.2])
      b.face([[x, 7.55, -11.7], [x + 0.9, 7.55, -11.7], [x + 2, 6.25, -11.7], [x + 1.7, 6.25, -11.7]], P.reflection);
    for (const side of [-1, 1]) {
      const x = side * (CARRIER_LAYOUT.deck.max.x - 0.31);
      for (let z = -10; z <= 10; z += 3.8) {
        b.box([x, 6.3, z], [0.08, 4.5, 0.14], P.metal);
        b.box([x - side * 0.06, 8.15, z], [0.05, 0.1, 2.5], P.warm);
      }
      b.box([x, 4.7, -8.5], [0.08, 0.85, 4.8], P.metal);
    }
    // Aft vestibule: a chamfered pressure frame and a flush, closed outer hatch.
    b.panel([CARRIER_LAYOUT.vestibule.x, 5.5, 11.78], [2.6, 3.1], 0.08, P.metal, 0, 0.3);
    b.panel([CARRIER_LAYOUT.vestibule.x, 5.5, 11.7], [2.2, 2.75], 0.05, P.shade, 0, 0.24);
    b.box([4, 5.3, 11.63], [0.08, 2.0, 0.04], P.petrol);
    b.box([4.8, 5.5, 11.59], [0.12, 0.48, 0.05], P.ochre);
    b.box([0, 6.5, 12], [width, 5, 0.3], P.petrol);
    // Inlays replace the old solid vestibule step and corridor-side crates.
    // They guide the player to the unchanged aft interaction position.
    b.box([3.8, 4.005, 9], [2, 0.01, 3.4], P.ochre);
    for (const z of [6.5, 7.5, 8.5])
      b.box([2.2, 4.011, z], [2.4, 0.008, 0.07], P.steelLight);
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
    // Pressure gasket, low boarding grip and one service coupling adapt the
    // original scout study. All extents remain inside the guided Dart envelope.
    b.tube([canopy[0], canopy[1], canopy[2], canopy[3], canopy[0]], 0.035, P.metal, 6);
    b.tube([[-0.65, 1.95, 0.1], [-0.85, 0.95, 1.03], [1.15, 0.95, 1.03], [1, 1.95, 0.1]], 0.035, P.steelLight, 6);
    b.face([[-0.6, 1.96, 0.1], [0.95, 1.96, 0.1], [0.9, 1.1, 1.02], [-0.78, 1.1, 1.02]], P.glass);
    b.panel([-1.2, 0.82, 0.1], [0.44, 0.2], 0.04, P.ochre, Math.PI / 2, 0.04);
    b.tube([[-1.29, 0.82, -0.04], [-1.29, 0.91, -0.04], [-1.29, 0.91, 0.22], [-1.29, 0.82, 0.22]], 0.025, P.steelLight, 5);
    for (const x of [-1.35, 1.35]) {
      b.panel([x, 0.7, -0.8], [0.25, 0.35], 0.04, P.shade, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0.05);
      b.ring([x, 0.75, 1.5], [1, 0, 0], [0, 0, 1], 0.2, 0.12, P.steelLight, 10);
      b.ellipsoid([x, 0.72, 1.5], [0.105, 0.035, 0.105], P.ochre, 8);
      for (let i = 0; i < 3; i++)
        b.box([x, 0.78, 1.05 + i * 0.1], [0.34, 0.035, 0.045], P.metal);
    }
    b.ring([0, 0.8, 2.66], [1, 0, 0], [0, 1, 0], 0.32, 0.25, P.steelLight);
  }
  const mesh = b.finish();
  mesh.unfreezeWorldMatrix();
  if (hull === "hearthline") {
    for (const sign of [
      label(scene, "BRIDGE", [0, 7.9, -11.66], 2.4, Math.PI),
      label(scene, "AFT / VESTIBULE", [3.8, 7.45, 11.68], 2.7),
      label(scene, "HEARTHLINE / LAUNCH CONTROL", [-3.7, 6.0, -11.67], 2.7, Math.PI),
    ]) sign.parent = mesh;
  }
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
    0.065,
    P.ochre,
    6,
  );
  restraint.box([0, 0.76, 21.2], [0.32, 0.27, 0.12], P.petrol);
  restraint.panel([0, 0.76, 21.11], [0.23, 0.17], 0.025, P.metal, 0, 0.035);
  restraint.box([0, 0.76, 21.085], [0.14, 0.035, 0.018], P.ochre);
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
        b.ring([x + dx + 0.15, y - 0.175, z + dz - 0.2], [1, 0, 0], [0, 0, 1], 0.08, 0.045, P.ink, 8);
      } else if (s.asset === "glass") {
        const tip: Point = [x + dx + 0.06, y + 0.16, z + dz + 0.04];
        for (let side = 0; side < 6; side++) {
          const a = side / 6 * Math.PI * 2, n = (side + 1) / 6 * Math.PI * 2;
          b.face([[x + dx + Math.cos(a) * 0.28, y - 0.57, z + dz + Math.sin(a) * 0.3], [x + dx + Math.cos(n) * 0.28, y - 0.57, z + dz + Math.sin(n) * 0.3], tip], side % 2 ? P.reflection : "#a7d3be");
        }
        b.tube(
          [
            [x + dx, y - 0.3, z + dz],
            [x + dx + 0.1, y + 0.2, z + dz],
          ],
          0.025,
          P.reflection,
          4,
        );
        b.face([[x + dx - 0.12, y - 0.4, z + dz - 0.22], [x + dx + 0.06, y + 0.06, z + dz - 0.06], [x + dx + 0.12, y - 0.25, z + dz - 0.24]], P.mint);
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
        b.tube([[x + dx, y - 0.58, z + dz], [x + dx + 0.35, y - 0.36, z + dz + 0.1], [x + dx + 0.6, y + 0.08, z + dz + 0.2]], 0.018, P.coralRim, 4);
      } else if (s.asset === "crust") {
        b.box([x + dx, y - 0.4, z + dz], [0.3, 0.7, 0.7], P.petrol, [
          0,
          0,
          i * 0.12,
        ]);
        b.ellipsoid([x + dx, y, z + dz], [0.28, 0.14, 0.32], P.amber, 6);
        for (let line = 0; line < 3; line++)
          b.box([x + dx - 0.13 + line * 0.13, y + 0.08, z + dz], [0.045, 0.04, 0.32], P.orange);
      } else if (s.asset === "resin") {
        b.ellipsoid(
          [x + dx, y - 0.25, z + dz],
          [0.4, 0.35, 0.3],
          i % 2 ? P.amber : P.orange,
          7,
        );
        b.ring([x + dx, y - 0.03, z + dz], [1, 0, 0], [0, 0, 1], 0.29, 0.2, P.coralRim, 9);
      } else {
        // Shallow edible cups have a visible open rim, unlike glass nodules or
        // resin. They remain ordinary hand food, with no invented glow or tool.
        const cx = x + dx, cz = z + dz, base = y - 0.55;
        b.ellipsoid([cx, base + 0.1, cz], [0.24, 0.13, 0.24], P.jade, 8);
        b.ellipsoid([cx, y + 0.08, cz], [0.3, 0.035, 0.3], P.petrol, 8);
        for (let side = 0; side < 8; side++) {
          const a = side / 8 * Math.PI * 2, n = (side + 1) / 8 * Math.PI * 2;
          b.face([[cx + Math.cos(a) * 0.15, base, cz + Math.sin(a) * 0.15], [cx + Math.cos(n) * 0.15, base, cz + Math.sin(n) * 0.15], [cx + Math.cos(n) * 0.35, y + 0.17, cz + Math.sin(n) * 0.35], [cx + Math.cos(a) * 0.35, y + 0.17, cz + Math.sin(a) * 0.35]], side % 2 ? P.jade : P.lime);
        }
        b.ring([cx, y + 0.18, cz], [1, 0, 0], [0, 0, 1], 0.355, 0.28, P.shell, 8);
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
  // A continuous, centimetre-thin grip surface follows the same ramp samples
  // as locomotion. The old isolated treads could read as floating steps.
  for (const side of [-1, 1]) {
    const x = 10 + side * 1.75;
    for (let z = -30.9; z < -22; z += 0.4) {
      const nz = Math.min(-22, z + 0.4);
      site.face([[x - 0.045, terrainHeight(x - 0.045, z) + 0.012, z], [x + 0.045, terrainHeight(x + 0.045, z) + 0.012, z], [x + 0.045, terrainHeight(x + 0.045, nz) + 0.012, nz], [x - 0.045, terrainHeight(x - 0.045, nz) + 0.012, nz]], P.ochre);
    }
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
  // Weathered but serviceable shore machinery: framed bench, tool trough,
  // drawer seams, folded canopy ribs and maintenance stock in the actual locker.
  for (const x of [7.4, 12.6]) {
    site.box([x, 1.75, -38.44], [0.08, 0.95, 0.07], P.metal);
    site.box([x, 2.24, -38.39], [0.16, 0.08, 0.08], P.ochre);
  }
  site.box([8.1, 2.35, -39.05], [1.1, 0.1, 0.5], P.petrol);
  for (const x of [7.8, 8.1, 8.4])
    site.tube([[x, 2.42, -39.2], [x, 2.43, -38.9]], 0.035, P.steelLight, 5);
  site.panel([14.53, 2.25, -36.6], [1.05, 1.45], 0.03, P.petrol, Math.PI / 2);
  for (let i = 0; i < 4; i++)
    site.box([14.49, 1.8 + i * 0.28, -36.6], [0.025, 0.035, 0.65], P.steelLight);
  for (const z of [-39.8, -37.2, -34.25]) {
    site.tube([[3.05, 5.48, z], [10, 5.98 + (z + 40) * -0.05, z], [15.95, 5.2 + (z + 40) * -0.05, z]], 0.055, P.metal, 5);
  }
  site.box([7, 4.95, -34.04], [1.4, 0.07, 0.08], P.warm);
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
  // Mark the exact air-volume front (z=-122.4), and give the dry alcove a
  // comprehensible hood, floor datum and sealed instrument wall. The threshold
  // is a painted cue only; the simulation remains the air authority.
  site.box([116, -117.985, -122.4], [8.8, 0.03, 0.2], P.ochre);
  for (const x of [111.5, 120.5]) {
    site.box([x, -116, -122.4], [0.2, 3.9, 0.2], P.metal);
    site.box([x, -115.7, -122.27], [0.08, 2.5, 0.025], P.mint);
  }
  site.box([116, -114.1, -122.4], [9.2, 0.2, 0.24], P.metal);
  for (let x = 112; x <= 120; x += 1.6) {
    site.panel([x, -115.95, -129.67], [1.5, 3.35], 0.025, P.metal, Math.PI, 0.14);
    site.panel([x, -115.8, -129.63], [1.18, 1.6], 0.02, P.petrol, Math.PI);
    site.box([x, -115.15, -129.6], [0.75, 0.035, 0.025], P.steelLight);
  }
  for (const z of [-128.5, -126.5, -124.5]) {
    site.box([116, -117.976, z], [8.8, 0.015, 0.055], P.metal);
    site.box([111.32, -116, z], [0.025, 3.65, 0.07], P.metal);
  }
  site.box([114.48, -117.4, -128], [0.04, 0.65, 1], P.ochre);
  site.box([116, -117.4, -127.47], [2.7, 0.7, 0.025], P.shade);
  for (const x of [115.1, 116, 116.9])
    site.box([x, -117.2, -127.45], [0.34, 0.035, 0.025], P.ochre);
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
  // Mineral bedding across the existing cover rib makes its scale legible.
  // Surface relief stays flush to the physical box; the clear flank stays open.
  for (let y = cover.min.y + 2; y < cover.max.y; y += 5.5) {
    site.face([[cover.min.x, y, cover.max.z + 0.01], [cover.max.x, y + 0.9, cover.max.z + 0.01], [cover.max.x, y + 1.2, cover.max.z + 0.01], [cover.min.x, y + 0.25, cover.max.z + 0.01]], P.stoneLight);
    site.face([[cover.max.x + 0.01, y + 1.2, cover.min.z], [cover.max.x + 0.01, y + 0.9, cover.max.z], [cover.max.x + 0.01, y + 1.2, cover.max.z], [cover.max.x + 0.01, y + 1.6, cover.min.z]], P.deep);
  }
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
  // These are physical record/device labels. Persistent clue IDs remain solely
  // in the registry and notebook; the world does not advertise internal IDs.
  const ledger = EVIDENCE.C03.position, sheet = EVIDENCE.C04.position;
  label(scene, "LOADING LEDGER", [ledger.x, ledger.y + 0.32, ledger.z - 0.1], 1.1);
  label(scene, "FIELD OBSERVATIONS", [sheet.x, sheet.y + 0.35, sheet.z - 0.1], 1.15);
  label(scene, "SAMPLING / UPPER CANOPY", [116, -114.65, -129.58], 3.6, Math.PI);
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
    // Long cheek ridge, gill slots and a split sensory rostrum preserve an
    // animal silhouette at the warning distance; no weapon/trophy silhouette.
    hunter.tube([[x * 0.23, 0.62, -3.55], [x * 0.74, 0.7, -2.2], [x * 0.85, 0.54, -0.8], [x * 0.48, 0.62, 1.5]], 0.055, P.mint, 6);
    hunter.ellipsoid([x * 0.39, 0.8, -2.8], [0.12, 0.14, 0.18], P.ink, 8);
    hunter.ellipsoid([x * 0.43, 0.84, -2.88], [0.055, 0.05, 0.08], P.amber, 6);
    for (let gill = 0; gill < 4; gill++)
      hunter.tube([[x * (1.08 - gill * 0.05), 0.95, -1.4 + gill * 0.35], [x * (1.08 - gill * 0.05), 0.58, -1.25 + gill * 0.35]], 0.035, P.plum, 5);
    hunter.tube([[x * 0.9, 1.4, -1.2], [x * 1.3, 2.2, -0.8], [x * 1.1, 2.5, 0.3]], 0.035, P.coralRim, 5);
  }
  for (let spine = 0; spine < 3; spine++) {
    const z = -0.5 + spine * 1.05;
    hunter.face([[0, 1.1, z - 0.35], [0, 2.5 - spine * 0.3, z + 0.3], [0.04, 1.1, z + 0.75]], spine % 2 ? P.coral : P.plum);
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
  const hunterFins: { mesh: Mesh; side: number }[] = [];
  for (const side of [-1, 1]) {
    const fin = new ArtBatch(`ecology.hunter-warning-fin.${side}`, scene, cel);
    fin.face([[0, 0, -0.7], [side * 1.2, -0.15, -0.1], [side * 2.7, -0.5, 1.8], [side * 1.2, 0, 1.1], [0, 0.1, 1.4]], P.coral);
    fin.face([[0, 0.04, -0.7], [side * 1.2, 0.03, -0.1], [side * 1.2, 0.04, 1.1], [0, 0.14, 1.4]], P.violet);
    for (const z of [-0.4, 0.2, 0.8])
      fin.tube([[0, 0.12, z], [side * 1.1, 0.04, z + 0.2], [side * 2.3, -0.35, 1.5]], 0.025, P.coralRim, 5);
    const mesh = fin.finish();
    mesh.unfreezeWorldMatrix();
    mesh.parent = hunterMesh;
    mesh.position.set(side * 0.65, 0.65, 0);
    hunterFins.push({ mesh, side });
  }
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
  let carrierShell: Mesh | null = null, shellKey = "";
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
        // State-driven display communicates the implemented warning/approach
        // without claiming additional ecology or changing threat timing.
        const warning = t.mode === "warn" || t.mode === "investigate" || t.mode === "pursue";
        for (const { mesh, side } of hunterFins)
          mesh.rotation.z = side * ((warning ? 0.3 : -0.16) + Math.sin(time * (warning ? 4 : 1.8)) * (warning ? 0.13 : 0.055));
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
      const dock = s?.fleet.docking;
      const openSlot = dock?.transaction?.phase === "lock" ? dock.transaction.slot : undefined;
      const nextShellKey = h && dock ? `${h.id}.${dock.configuration}.${openSlot ?? "sealed"}` : "";
      if (shellKey !== nextShellKey) {
        carrierShell?.dispose();
        carrierShell = null;
        shellKey = nextShellKey;
        if (h && dock) {
          carrierShell = carrierShellArt(scene, cel, dock.configuration, openSlot);
        }
      }
      if (h) {
        if (carrierShell) {
          carrierShell.position.set(h.pose.position.x, h.pose.position.y, h.pose.position.z);
          carrierShell.rotation.y = h.pose.yaw;
        }
        const exit = launchPoint(h, h);
        blockMesh.position.set(exit.x, exit.y + 1, exit.z);
        blockMesh.rotation.y = h.pose.yaw;
      }
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
