import type { GeometryCache } from "./geometryCache.js";
import type { Scene, ShaderMaterial, Mesh } from "@babylonjs/core";
import {
  SOURCES,
  INTERACTION_HOSTS,
  EVIDENCE,
  CANOPY_COVER,
  RECOVERY_STAGE,
} from "../content/registry.js";
import { HUNTER_GEOMETRY as HG,
  SCOUT_GEOMETRY as SG } from "../content/encounterGeometry.js";
import { hunterPose } from "../sim/hunter.js";
import type { GameState, VehicleState } from "../sim/types.js";
import { CARRIER_SUPPORT, launchPoint, occupiedSockets } from "../sim/carrier.js";
import { ArtBatch } from "./geometry.js";
import type { Point } from "./geometry.js";
import { PALETTE as P } from "./palette.js";
import { label, type LabelMaterials } from "./landmarks.js";
import { FACILITY_SOLIDS, SOLIDS, terrainHeight } from "../sim/world.js";
import { createObservationPane, wallWithOpening } from "./materials.js";
import { BASIN_GEOMETRY, BASIN_SOURCE_IDS, RECOVERY_SURFACE_OPERATOR } from "../content/routes.js";
import { pinnedVehicleIds, type RegionArt, type RenderRegion } from "./regions.js";
import { b1Source, b1SourceArt, createB1Sites, creelArt, updateCreelArt } from "./fleetArt.js";
import { fleetHullArt, hearthlineShellArt, updateFleetHullArt } from "./fleet/index.js";
import { STORY_HOSTS, storyHostVisible, type StoryHostId } from "../sim/storyLink.js";

/** Individual bent maintenance plates keep contact with the local surface.
 * Their pale service tags, folded edges and bolt holes distinguish salvage
 * from geology before the player aims. No new obstacle or support platform. */
function surfaceScraps(b: ArtBatch, id: string, x: number, z: number): void {
  const offset = INTERACTION_HOSTS[id]?.offset;
  const layout = [[offset?.x ?? 0, offset?.z ?? 0, -.2], [-.65, .43, .35], [.58, -.36, -.5], [.63, .43, .18], [.02, .12, .7]] as const;
  for (const [i, [dx, dz, yaw]] of layout.entries()) {
    const at = (u: number, v: number, lift: number): Point => {
      const px = x + dx + u * Math.cos(yaw) + v * Math.sin(yaw), pz = z + dz - u * Math.sin(yaw) + v * Math.cos(yaw);
      return [px, terrainHeight(px, pz) + lift, pz];
    };
    const outline = [[-.23, -.36], [.23, -.36], [.29, -.27], [.29, .27], [.22, .36], [-.22, .36], [-.29, .27], [-.29, -.27]] as const;
    const top = (u: number): number => .13 + u * .19;
    const upper = outline.map(([u, v]) => at(u, v, top(u))), lower = outline.map(([u, v]) => at(u, v, .012));
    for (let j = 0; j < outline.length; j++) {
      const next = (j + 1) % outline.length;
      b.face([at(0, 0, top(0)), upper[j]!, upper[next]!], i % 3 === 1 ? P.ochre : P.steelLight);
      b.face([lower[next]!, upper[next]!, upper[j]!, lower[j]!], P.metal);
    }
    // A pressed rib and a surviving pale inventory tag sit on each plate.
    b.tube([at(-.2, -.23, top(-.2) + .018), at(.2, -.23, top(.2) + .018)], .018, P.petrol, 4);
    b.face([at(.13, -.08, top(.13) + .006), at(.13, .06, top(.13) + .006), at(-.17, .06, top(-.17) + .006), at(-.17, -.08, top(-.17) + .006)], P.porcelain);
    b.face([at(-.065, -.055, top(-.065) + .013), at(-.065, .035, top(-.065) + .013), at(-.11, .035, top(-.11) + .013), at(-.11, -.055, top(-.11) + .013)], P.petrol);
    for (let side = 0; side < 8; side++) {
      const a = side / 8 * Math.PI * 2, n = (side + 1) / 8 * Math.PI * 2;
      const point = (r: number, angle: number): Point => {
        const u = .17 + Math.cos(angle) * r, v = .2 + Math.sin(angle) * r;
        return at(u, v, top(u) + .01);
      };
      b.face([point(.065, a), point(.065, n), point(.032, n), point(.032, a)], P.petrol);
    }
  }
}

function surfaceGlass(b: ArtBatch, x: number, z: number): void {
  for (const [i, [dx, dz, height]] of [[-.72, -.37, .4], [.05, -.35, .52], [.68, -.15, .34], [-.45, .38, .38], [.4, .42, .44]].entries()) {
    const cx = x + dx!, cz = z + dz!, h = height!;
    const tip: Point = [cx + .035, terrainHeight(cx + .035, cz) + h, cz];
    for (let side = 0; side < 6; side++) {
      const a = side / 6 * Math.PI * 2, n = (side + 1) / 6 * Math.PI * 2;
      const base = (angle: number): Point => {
        const px = cx + Math.cos(angle) * .28, pz = cz + Math.sin(angle) * .24;
        return [px, terrainHeight(px, pz) + .005, pz];
      };
      b.face([base(a), base(n), tip], side % 3 === 0 ? P.glass : side % 2 ? P.reflection : P.mint);
    }
    const px = cx - .08, pz = cz - .1;
    b.tube([[px, terrainHeight(px, pz) + .06, pz], [cx + .025, tip[1] - .035, cz - .015]], .018, i % 2 ? P.shell : P.mint, 4);
  }
}

/** The structural descriptors remain the physical authority. Passage skins are
 * at most 3 mm proud of them; the capsule passage and the complete rail path stay
 * empty. Only the rendered fore/aft walls are cut around sealed observation
 * panes; the simulation's complete structural walls remain unchanged. */
function dartArt(
  scene: Scene,
  cel: ShaderMaterial,
  glass: ShaderMaterial,
  id: string,
  hull: "dart" | "creel",
  labels?: LabelMaterials,
  cache?: GeometryCache,
): Mesh {
  if (hull === "creel") return creelArt(scene, cel, glass, id, labels, cache);
  // Only the Dart's deterministic local batches opt in. Bump this generation
  // when its geometry, palette or contour recipe changes. Identity, pose,
  // glazing and gauge values belong to newly created live handles, never keys.
  const dartBatch = (name: string, part: string): ArtBatch => new ArtBatch(name, scene, cel,
    cache ? { owner: cache, key: `expedition:dart-local:v2:${part}` } : undefined);
  const b = dartBatch(id, "body-contour-0.55");
  const panes: { name: string; points: readonly Point[] }[] = [];
  b.loft(SG.bow, P.orange);
  b.loft(SG.body, P.metal);
  b.loft(SG.inset, P.petrol);
  b.box(SG.prow.center, SG.prow.size, P.ochre);
  // Offset faceted canopy and broad framed stern drive, rather than paired engine tubes.
  const canopy = SG.canopy;
  panes.push({ name: `${id}.pane.forward`, points: canopy });
  panes.push({ name: `${id}.pane.starboard`, points: SG.starboard });
  panes.push({ name: `${id}.pane.port`, points: SG.port });
  for (const x of [-1.15, 1.15]) {
    // The guide shoes meet the shared keel datum; no artwork hangs below
    // BERTH_ENVELOPES.dart during the sealed floor-hatch transfer.
    b.box([x, 0.225, 1.3], [0.18, 0.45, 2.8], P.metal);
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
        [x * SG.finTip, 0.6, 1.8],
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
  b.tube([canopy[0], canopy[1], canopy[2], canopy[3], canopy[0]], 0.024, P.petrol, 6);
  b.tube([canopy[3], canopy[2]], .037, P.porcelain, 6);
  b.tube([[-0.65, 1.95, 0.1], [-0.85, 0.95, 1.03], [1.15, 0.95, 1.03], [1, 1.95, 0.1]], 0.028, P.steelLight, 6);
  panes.push({ name: `${id}.pane.aft`, points: SG.aft });
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
  // Recessed service lines and warm chine flashes follow the existing loft.
  for (const side of [-1, 1]) {
    b.tube([[side * .73, .855, -2.1], [side * 1.24, .905, .1], [side * .77, .755, 2.45]], .018, P.seam, 4);
    b.face([[side * 1.80, .30, .12], [side * 1.5, .60, .12], [side * 1.03, .59, 2.36], [side * 1.14, .37, 2.36]], P.orange);
    b.glow(b.box([side * 2.28, .63, 1.65], [.10, .045, .18], side < 0 ? P.amber : P.mint));
  }
  const mesh = b.finish(.55);
  mesh.unfreezeWorldMatrix();
  for (const pane of panes) createObservationPane(scene, glass, pane.name, pane.points, mesh);
  {
    // View-only fittings stay inside the existing canopy/keel envelope. The
    // actual hull and glazing remain visible in control; no swimming disguise.
    const cockpit = dartBatch(`${id}.cockpit`, "cockpit-contour-0");
    cockpit.box([.12, 1.04, .78], [.62, .18, .34], P.shade);
    cockpit.box([.12, 1.32, .92], [.53, .58, .12], P.petrol);
    cockpit.panel([.06, .85, -.96], [1.02, .15], .25, P.petrol, 0, .065);
    cockpit.face([[-.45, .94, -1.0], [.57, .94, -1.0], [.57, .87, -.66], [-.45, .87, -.66]], P.metal);
    for (const x of [-.26, .23]) {
      cockpit.box([x, .957, -.91], [.34, .025, .19], P.ink);
      for (const dx of [-.1, 0, .1])
        cockpit.box([x + dx, .935, -.72], [.045, .025, .045], P.ochre);
    }
    // Lightning and shield silhouettes name the two real state bars. There is
    // no invented depth/radar readout; the accurate HUD remains the fallback.
    cockpit.face([[-.42,.98,-.93],[-.38,.98,-.93],[-.41,.98,-.86],[-.37,.98,-.86],[-.44,.98,-.79],[-.42,.98,-.86],[-.46,.98,-.86]], P.amber);
    cockpit.face([[.06,.98,-.93],[.10,.98,-.93],[.10,.98,-.84],[.08,.98,-.81],[.06,.98,-.84]], P.mint);
    for (const x of [-.48, .62]) {
      cockpit.tube([[x, .77, -.25], [x, .91, -.32], [x + .04, .94, -.40]], .023, P.metal, 6);
      cockpit.tube([[x - .07, .94, -.39], [x + .06, .94, -.39]], .035, P.ink, 7);
      cockpit.box([x + .06, .95, -.40], [.025, .018, .035], P.ochre);
    }
    const fittings = cockpit.finish();
    fittings.unfreezeWorldMatrix(); fittings.parent = mesh; fittings.renderingGroupId = 1;
    for (const [kind, left] of [["charge", -.34], ["health", .15]] as const) {
      const gauge = dartBatch(`${id}.instrument.${kind}`, `gauge-${kind}-contour-0`);
      gauge.glow(gauge.box([.115, 0, 0], [.23, .012, .09], kind === "charge" ? P.amber : P.mint));
      const bar = gauge.finish();
      bar.unfreezeWorldMatrix(); bar.parent = fittings; bar.position.set(left, .977, -.91);
      bar.renderingGroupId = 1;
    }
  }
  return mesh;
}

/** Hull-local view datum only; never a player/collider/save pose. */
export const DART_SEAT = { x: .12, y: 1.36, z: .45 } as const;

function surfaceRescueArt(b: ArtBatch): void {
  const p = RECOVERY_SURFACE_OPERATOR;
  // The surface control repeats the real submerged fitting, at the second
  // registered work face. It is flooded equipment, never a new air pocket.
  b.box([p.x, p.y - .42, p.z], [.9, .6, 1.3], P.ochre);
  b.box([p.x, p.y - .08, p.z], [.65, .06, .9], P.petrol);
  b.ring([p.x, p.y - .035, p.z], [1, 0, 0], [0, 0, 1], .25, .18, P.shell, 12);
  for (const x of [43, 49]) {
    b.ellipsoid([x, -.1, p.z], [.5, .33, .65], P.ochre, 8);
    b.tube([[x, -12.8, p.z], [x, .1, p.z], [x, 1.9, p.z]], .045, P.steelLight, 5);
    b.box([x, 1.8, p.z], [.65, .22, .04], P.ochre);
  }
  b.tube([[p.x, -12.3, p.z], [p.x, -.9, p.z]], .025, P.ochre, 5);
}

function createBasinArt(scene: Scene, cel: ShaderMaterial, cache?: GeometryCache, labels?: LabelMaterials): void {
  const makeSign = (text: string, p: Point, width = 2, yaw = 0): Mesh => label(scene, text, p, width, yaw, labels);
  const b = new ArtBatch("basin.facilities", scene, cel, cache && { owner: cache, key: "expedition:basin:facilities" });
  for (const solid of BASIN_GEOMETRY.solids) {
    const color = solid.id.endsWith("floor") ? P.petrol : solid.id.endsWith("back") ? P.metal
      : solid.id.includes("beds") ? P.shade : solid.id.endsWith("bundles") ? P.shell : P.petrol;
    b.bounds(solid, color);
  }
  // Furnish only the shared floors, rear walls and low work solids. Both broad
  // entrances and the entire overhead extraction path remain open water.
  for (const [site, width, depth] of [[BASIN_GEOMETRY.dormitory, 18, 12], [BASIN_GEOMETRY.station, 16, 12]] as const) {
    const { x, y, z } = site.datum;
    for (const side of [-1, 1]) {
      b.box([x + side * (width / 2 - .2), y + .018, z], [.12, .025, depth - .4], P.ochre);
      b.box([x + side * (width / 2 - .25), y + 4.5, z - depth / 2 + .32], [.18, .22, .025], P.shell);
    }
    for (let dx = -width / 2 + 1; dx < width / 2; dx += 2)
      b.box([x + dx, y + .015, z + 3.8], [1.2, .02, .06], P.steelLight);
    // Open entrance paint follows the actual floor datum, without a lintel.
    b.box([x, y + .018, z + depth / 2 - .18], [width - 1, .025, .12], P.ochre);
    for (const yy of [1.5, 3.5])
      b.box([x, y + yy, z - depth / 2 + .315], [width - .7, .035, .025], P.steelLight);
  }
  const d = BASIN_GEOMETRY.dormitory.datum;
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = d.x + side * (3.8 + i * 1.55);
    b.box([x, -165.37, -221.75], [1.25, .045, 2.0], i % 2 ? P.metal : P.petrol);
    b.box([x, -165.34, -222.4], [1.1, .025, .25], P.shell);
  }
  // Strapped bundles face inward toward the existing C05 work pose, rather
  // than suggesting a pickup on the inaccessible back of the wall.
  for (const x of [177, 178, 179]) {
    b.box([x, -164.975, -222.35], [.8, .035, .62], P.shade);
    b.box([x, -164.947, -222.35], [.075, .02, .62], P.ochre);
    b.box([x, -165.5, -221.985], [.65, .36, .02], P.shell);
    b.box([x, -165.5, -221.97], [.075, .36, .012], P.petrol);
  }
  // Boundary station: a different low, ribbed instrument face, still confined
  // to the committed console. Its display does not invent a power/air rule.
  b.box([216, -171.4, -243.58], [2.3, .55, .025], P.shade);
  for (let i = 0; i < 7; i++) {
    const x = 215.1 + i * .3;
    b.box([x, -171.3, -243.56], [.06, .3, .012], i < 3 ? P.ochre : P.steelLight);
  }
  b.box([216, -170.985, -244.1], [2.6, .025, .8], P.metal);
  // The fallen survey dish reads from the crest while remaining inside the
  // exact four-metre physical spine footprint. No dish spans a flight lane.
  const spine = BASIN_GEOMETRY.solids.find(s => s.id === "basin.dish.spine")!;
  const x = (spine.min.x + spine.max.x) / 2, top = spine.max.y;
  b.ring([x, top - 2.5, spine.max.z + .012], [1, 0, 0], [0, 1, 0], 1.95, 1.68, P.shell, 18);
  for (let i = 0; i < 9; i++) {
    const a = i / 8 * Math.PI;
    b.tube([[x, top - 3.6, spine.max.z + .018], [x + Math.cos(a) * 1.66, top - 2.5 + Math.sin(a) * 1.66, spine.max.z + .018]], .055, P.ochre, 5);
  }
  for (let y = spine.min.y + 2; y < top - 5; y += 3.8) {
    b.box([x, y, spine.max.z + .015], [3.9, .2, .025], P.metal);
    b.box([spine.max.x + .012, y + 1, -219], [.02, .4, 3.6], P.ochre);
  }
  b.finish(.34);
  makeSign("DORMITORY", [178, -162, -223.68], 2.4);
  makeSign("BOUNDARY", [216, -168.1, -245.68], 2.2);
  makeSign("SURVEY", [197, -158, -216.97], 1.6);
}

export function createExpeditionRegion(
  scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, region?: RenderRegion, cache?: GeometryCache, labels?: LabelMaterials,
): RegionArt {
  const makeSign = (text: string, p: Point, width = 2, yaw = 0): Mesh => label(scene, text, p, width, yaw, labels);
  const batch = (name: string): ArtBatch => new ArtBatch(name, scene, cel, cache && { owner: cache, key: `expedition:${region ?? "complete"}:${name}` });
  const initial = new Set(scene.meshes);
  const sourceMeshes = new Map<string, Mesh>(), unitMeshes = new Map<string, Mesh[]>();
  for (const [id, s] of Object.entries(SOURCES)) {
    if (region && s.region !== region) continue;
    if (b1Source(id)) {
      const [first, ...units] = b1SourceArt(scene, cel, id, cache);
      sourceMeshes.set(id, first!); unitMeshes.set(id, units);
      continue;
    }
    const b = batch("source." + id),
      { x, y: sourceY, z } = s.position,
      y = sourceY + (INTERACTION_HOSTS[id]?.renderOffsetY ?? 0);
    if (BASIN_SOURCE_IDS.some(sourceId => sourceId === id)) {
      if (s.asset === "scraps") surfaceScraps(b, id, x, z);
      else for (let i = 0; i < (id === "basin_survey_fins_west" ? 4 : 3); i++) {
        const west = id === "basin_survey_fins_west", dx = (i - (west ? 1.5 : 1)) * .58;
        const px = x + dx, pz = z + (west ? dx * .3 : 0);
        const at = (u: number, v: number, lift: number): Point => [px + u, terrainHeight(px + u, pz + v) + lift, pz + v];
        // Crust lies on the real persistent fin's sloped top. A flat nodule
        // would float above the downslope edge of this steep ledge.
        for (let j = 0; j < 10; j++) {
          const a = -.5 + j * .1, c = a + .1;
          b.face([at(-.16, a, .61), at(-.16, c, .61), at(0, c, .76), at(0, a, .76)], P.amber);
          b.face([at(0, a, .76), at(0, c, .76), at(.16, c, .61), at(.16, a, .61)], j % 3 ? P.ochre : P.orange);
        }
      }
      sourceMeshes.set(id, b.finish(.14));
      continue;
    }
    if (id === "island_workshop_scraps" || id === "island_headland_scraps" || id === "island_glass_ledge_west") {
      if (id === "island_glass_ledge_west") surfaceGlass(b, x, z);
      else surfaceScraps(b, id, x, z);
      sourceMeshes.set(id, b.finish(.14));
      continue;
    }
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
  const include = (id: RenderRegion): boolean => !region || region === id;
  if (include("refuge_reef")) {
  const site = batch("facilities.reef");
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
  site.finish();
  }
  if (include("island_chain")) {
  const site = batch("facilities.island");
  for (const body of FACILITY_SOLIDS.filter(s => s.id.startsWith("workshop.")))
    site.bounds(body, body.id === "workshop.locker" || body.id.startsWith("workshop.cradle.") ? P.ochre : P.petrol);
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
  // Paired amber approach lights and south-pointing chevrons replace a large
  // floating instruction card. The HUD still supplies the critical launch line.
  for (let i = 0; i < 5; i++) for (const x of [17.9, 22.1]) {
    site.ellipsoid([x, -.2, -20 + i], [.17, .11, .2], P.petrol, 6);
    site.glow(site.ellipsoid([x, -.12, -20 + i], [.10, .045, .14], P.amber, 6));
  }
  site.tube([[10.8, 2.4, -39.2], [10.8, 3.35, -39.2], [10.15, 3.5, -38.8]], .045, P.petrol, 6);
  site.glow(site.box([10.15, 3.45, -38.8], [.5, .045, .25], P.warm));
  site.finish();
  makeSign("S / 02", [7, 4.78, -34.02], .8);
  makeSign("D / 01", [22.15, .15, -21], .62);
  makeSign("BERTH / INCOMPLETE", [24, 4.5, -30], 1.5);
  const ledger = EVIDENCE.C03.position;
  makeSign("LOADING LEDGER", [ledger.x, ledger.y + .32, ledger.z - .1], .48);
  }
  if (include("suspended_garden")) {
  const site = batch("facilities.canopy");
  for (const body of FACILITY_SOLIDS.filter(s => s.id.startsWith("canopy."))) site.bounds(body, P.metal);
  // The laboratory is an open pressure hood: only the existing floor, roof,
  // back and port wall are solid. Read their actual faces, and leave both front
  // and starboard approaches fully open, including the capsule-height line.
  for (const solid of SOLIDS.filter(s => s.id.startsWith("canopy.lab."))) {
    if (solid.id.endsWith("side")) {
      wallWithOpening(site, [111.15, -116, -126], [.3, 4, 8], {
        center: [111.15, -115.8, -126.7], width: 2.5, height: 1.3, normal: "x",
      }, P.porcelain);
    } else site.bounds(solid, solid.id.endsWith("floor") ? P.petrol : P.porcelain);
  }
  createObservationPane(scene, glass, "canopy.lab.pane.port", [
    [111.15, -116.45, -127.95], [111.15, -116.45, -125.45],
    [111.15, -115.15, -125.45], [111.15, -115.15, -127.95],
  ]);
  for (const y of [-116.48, -115.12])
    site.box([111.31, y, -126.7], [.018, .055, 2.6], P.petrol);
  for (const z of [-128, -125.4])
    site.box([111.31, -115.8, z], [.018, 1.4, .055], P.petrol);
  // Faceted cladding is flush to the physical rear/port walls and roof. There
  // is deliberately no decorative fourth wall or false sealed doorway.
  for (const x of [112, 113.6, 115.2, 116.8, 118.4, 120]) {
    site.panel([x, -116.0, -129.685], [1.52, 3.2], .012, P.shade, Math.PI, .16);
    site.panel([x, -116.0, -130.002], [1.52, 3.2], .012, P.porcelain, 0, .16);
    site.box([x, -114.5, -129.67], [1.18, .055, .025], P.orange);
    site.box([x, -113.72, -126], [1.5, .025, 7.3], P.shade);
  }
  for (const z of [-128.7, -124.4, -122.25])
    site.box([116, -114.015, z], [9.35, .025, .055], P.petrol);
  site.box([116, -113.85, -122.005], [9.5, .23, .018], P.petrol);
  site.glow(site.box([116, -113.85, -121.99], [7.8, .075, .012], P.warm));
  for (const x of [111.6, 120.4]) {
    site.box([x, -113.71, -126], [.5, .018, 7.2], P.petrol);
    site.glow(site.box([x, -113.695, -126], [.22, .012, 6.4], P.amber));
  }
  site.box([118.5, -113.68, -125], [2.5, .025, 2.5], P.petrol);
  site.ring([118.5, -113.66, -125], [1, 0, 0], [0, 0, 1], 1.0, .78, P.amber, 16);
  site.glow(site.box([118.5, -113.65, -125], [.15, .012, .85], P.warm));
  // Separate luminous strips and real bounded warm fill replace the former
  // low-hanging slab. They sit against the existing ceiling and never lower it.
  for (const x of [112.6, 119.2]) {
    site.box([x, -114.025, -126.5], [.38, .045, 4.6], P.petrol);
    site.glow(site.box([x, -114.052, -126.5], [.22, .012, 4.2], P.warm));
  }
  // Painted exact air limits and inset guide lights explain the open threshold.
  site.box([116, -117.985, -122.4], [8.8, .03, .14], P.ochre);
  site.box([120.6, -117.985, -126], [.14, .03, 7.2], P.ochre);
  for (const x of [112, 114, 116, 118, 120])
    site.glow(site.box([x, -117.962, -122.4], [.3, .015, .11], P.warm));
  for (const z of [-128.5, -126.5, -124.5]) {
    site.box([116, -117.976, z], [8.8, .015, .045], P.metal);
    site.box([111.31, -117.1, z], [.018, .5, .055], P.petrol);
  }
  // Inhabited bench: a task light, specimen clamps and a folded personal cloth.
  // Everything is on the existing solid bench or flush to the rear wall.
  site.box([116, -116.94, -128], [3.0, .12, 1.0], P.ochre);
  site.box([116, -116.85, -127.8], [.85, .035, .6], P.porcelain);
  for (let row = 0; row < 5; row++)
    site.box([116, -116.825, -128.0 + row * .1], [.62, .01, .02], P.petrol);
  site.box([116, -117.4, -127.49], [2.7, .7, .018], P.shade);
  for (const x of [115.1, 116, 116.9])
    site.box([x, -117.2, -127.47], [.34, .035, .018], P.ochre);
  site.tube([[115.4, -116, -129.62], [115.4, -115.3, -129.62], [115.7, -115.2, -129.1]], .035, P.petrol, 6);
  site.box([115.7, -115.23, -129.1], [.65, .12, .28], P.orange);
  site.glow(site.box([115.7, -115.3, -129.1], [.52, .018, .2], P.warm));
  for (const x of [114.95, 115.25]) {
    site.ellipsoid([x, -116.7, -127.75], [.09, .15, .09], P.shell, 8);
    site.ellipsoid([x, -116.55, -127.75], [.1, .04, .1], P.petrol, 8);
  }
  site.box([117.1, -116.85, -128.05], [.55, .06, .45], P.coral);
  site.panel([119.1, -115.8, -129.665], [1.3, 1.35], .012, P.petrol, Math.PI);
  for (let i = 0; i < 4; i++)
    site.box([118.7 + i * .26, -115.6, -129.64], [.08, .4, .015], i % 2 ? P.metal : P.ochre);
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
  // The tall rib is the real cover, not the living crowns. Broad pale strata
  // and a broken dark vertical seam reveal its top and sheltered west flank
  // at approach distance without moving the seventy-three-metre crest.
  site.face([[cover.min.x, cover.max.y + .008, cover.min.z], [cover.min.x, cover.max.y + .008, cover.max.z],
    [cover.max.x, cover.max.y + .008, cover.max.z], [cover.max.x, cover.max.y + .008, cover.min.z]], P.steelLight);
  for (const [a, b] of [[103.2, 104.45], [107.8, 108.8]])
    site.face([[a!, cover.min.y, cover.max.z + .012], [b!, cover.min.y, cover.max.z + .012],
      [b!, cover.max.y, cover.max.z + .012], [a!, cover.max.y, cover.max.z + .012]], P.stoneLight);
  site.face([[cover.min.x - .012, cover.min.y, -121.6], [cover.min.x - .012, cover.max.y, -121.6],
    [cover.min.x - .012, cover.max.y, -120.3], [cover.min.x - .012, cover.min.y, -120.3]], P.steelLight);
  // Mineral bedding across the existing cover rib makes its scale legible.
  // Surface relief stays flush to the physical box; the clear flank stays open.
  for (let y = cover.min.y + 2; y < cover.max.y; y += 5.5) {
    site.face([[cover.min.x, y, cover.max.z + 0.01], [cover.max.x, y + 0.9, cover.max.z + 0.01], [cover.max.x, y + 1.2, cover.max.z + 0.01], [cover.min.x, y + 0.25, cover.max.z + 0.01]], P.stoneLight);
    site.face([[cover.max.x + 0.01, y + 1.2, cover.min.z], [cover.max.x + 0.01, y + 0.9, cover.max.z], [cover.max.x + 0.01, y + 1.2, cover.max.z], [cover.max.x + 0.01, y + 1.6, cover.min.z]], P.deep);
  }
  // The fork's holdfast wraps onto the actual north/west stone faces. This
  // flush, narrowing seam leads down the west edge; it adds no upper shelter
  // or relief in the open passage beside the rib.
  site.face([[cover.min.x + .2, cover.max.y + .014, cover.max.z - .8],
    [cover.min.x + .65, cover.max.y + .014, cover.max.z - .55],
    [cover.min.x + .45, cover.max.y + .014, cover.max.z],
    [cover.min.x, cover.max.y + .014, cover.max.z]], P.shell);
  site.face([[cover.min.x, cover.max.y, cover.max.z + .014],
    [cover.min.x + .45, cover.max.y, cover.max.z + .014],
    [cover.min.x + .32, cover.max.y - 1.1, cover.max.z + .014],
    [cover.min.x, cover.max.y - 2.2, cover.max.z + .014]], P.shell);
  const holdfast = [[cover.max.z, cover.max.y], [cover.max.z - 1.1, cover.max.y - 2.2],
    [cover.min.z + 2.2, cover.max.y - 6], [cover.min.z + .9, cover.max.y - 9.5],
    [cover.min.z + .8, cover.max.y - 13]] as const;
  for (let i = 0; i < holdfast.length - 1; i++) {
    const [za, ya] = holdfast[i]!, [zb, yb] = holdfast[i + 1]!;
    const width = .42 - i * .07;
    site.face([[cover.min.x - .014, ya, za], [cover.min.x - .014, yb, zb],
      [cover.min.x - .014, yb, zb - width], [cover.min.x - .014, ya, za - width]], P.shell);
  }
  site.finish();
  makeSign("AIR / 04", [111.65, -116.9, -122.01], .55);
  const sheet = EVIDENCE.C04.position;
  makeSign("FIELD OBSERVATIONS", [sheet.x, sheet.y + .35, sheet.z - .1], .48);
  makeSign("L / 04", [116, -114.65, -129.58], .65, Math.PI);
  // The ten original rooted colonies keep their authored habitat coordinates.
  // Radial, ridged crowns and pendant paired organs replace flat paddles and
  // solitary spheres. Open gaps still reveal the clear flank and lower channel.
  const canopy = batch("canopy.habitat");
  for (let i = 0; i < 10; i++) {
    const x = 78 + (i % 4) * 21, z = -88 - Math.floor(i / 4) * 23;
    const y = terrainHeight(x, z), top = -65 - (i % 3) * 12;
    canopy.tube([[x, y, z], [x + 2, y + 14, z - 1], [x + 4, top, z + 1]], .23, P.petrol, 7);
    // Lobed buoyancy body, dark basal collar and warm folded crown.
    canopy.ellipsoid([x + 4, top, z + 1], [2.7, 1.6, 2.1], i % 2 ? P.orange : P.jade, 10);
    canopy.ellipsoid([x + 4, top - 1.2, z + 1], [1.7, .6, 1.4], P.petrol, 10);
    for (let j = 0; j < 6; j++) {
      const angle = j / 6 * Math.PI * 2 + i * .6, dx = Math.cos(angle), dz = Math.sin(angle);
      const radius = i % 3 === 0 ? 1 : i % 3 === 1 ? .85 : .72;
      const at = (r: number, h: number): Point => [x + 4 + dx * r * radius, top + h, z + 1 + dz * r * radius];
      canopy.leaf([at(.8, .5), at(3.2, 2.6), at(6.2, 2.5), at(9.0, .8), at(10.2, -.6)], [.12, 1.35, 1.7, 1.05, .025], [-dz, 0, dx], j % 2 ? P.jade : "#258b80", j % 2 ? P.shell : P.lime);
      canopy.tube([at(.7, -.6), at(2, -1), at(2.3, -2.6)], .06, P.petrol, 6);
      const organ = at(2.3, -3.3);
      canopy.ellipsoid([organ[0], organ[1] - 1.25, organ[2]], [.45, .3, .45], P.orange, 10);
      canopy.glow(canopy.ellipsoid([organ[0], organ[1] - .1, organ[2]], [.62, 1.12, .62], P.amber, 10));
      canopy.ellipsoid([organ[0], organ[1] + 1.05, organ[2]], [.7, .34, .7], P.plum, 8);
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5])
        canopy.tube([[organ[0] + Math.cos(a) * .18, organ[1] - 1.5, organ[2] + Math.sin(a) * .18], [organ[0] + Math.cos(a) * .62, organ[1], organ[2] + Math.sin(a) * .62], [organ[0] + Math.cos(a) * .3, organ[1] + 1.2, organ[2] + Math.sin(a) * .3]], .035, P.plum, 5);
    }
  }
  // One raised, open fork differs from the radial crowns. Its two cupped
  // fronds and unequal tips remain legible in still/grayscale views; sparse
  // living tethers attach it to the unchanged crest, twenty-four metres below.
  const forkX = (cover.min.x + cover.max.x) / 2;
  const forkZ = (cover.min.z + cover.max.z) / 2;
  const forkAt = (x: number, y: number, z: number): Point => [forkX + x, cover.max.y + y, forkZ + z];
  canopy.leaf([forkAt(-.15, 22.8, .2), forkAt(-.9, 23.45, -.5),
    forkAt(-1.7, 24.4, -.9), forkAt(-2, 24.8, -.95)],
    [.12, .55, .62, .025], [.52, 0, -.85], P.jade, P.shell);
  canopy.leaf([forkAt(.15, 22.8, .15), forkAt(.9, 24, .65),
    forkAt(1.4, 25.1, 1), forkAt(1.7, 25.3, 1.15)],
    [.12, .6, .55, .025], [.52, 0, -.85], P.jade, P.shell);
  // Inflated lobes keep the fork readable when a membrane is edge-on.
  canopy.ellipsoid(forkAt(-1.35, 24, -.78), [.67, .72, .58], P.shell, 8);
  canopy.ellipsoid(forkAt(1.12, 24.45, .82), [.65, .95, .62], P.shell, 8);
  canopy.tube([forkAt(-2, 24.8, -.95), forkAt(-1.7, 24.4, -.9),
    forkAt(-.9, 23.45, -.5), forkAt(0, 22.8, .2), forkAt(.9, 24, .65),
    forkAt(1.4, 25.1, 1), forkAt(1.7, 25.3, 1.15)], .085, P.petrol, 6);
  canopy.tube([forkAt(-.2, 22.8, .2), forkAt(-1.25, 18, .35), forkAt(-1.5, 12, .6),
    [cover.min.x + .45, cover.max.y + 5, cover.max.z - .85],
    [cover.min.x + .3, cover.max.y + .015, cover.max.z - .7]], .1, P.shell, 6);
  canopy.tube([forkAt(.35, 22.8, .25), forkAt(-.3, 18, 1.1), forkAt(-.75, 12, 1.6),
    [cover.min.x + .85, cover.max.y + 5, cover.max.z - .35],
    [cover.min.x + .6, cover.max.y + .015, cover.max.z - .15]], .085, P.jade, 6);
  canopy.finish(.22);
  }
  if (include("refuge_reef")) {
  const site = batch("facilities.rescue");
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
  surfaceRescueArt(site);
  site.finish();
  makeSign("RESCUE", [46, -10, -53.9], 1.0);
  makeSign("RESCUE", [46, 1.5, -53.9], 1.15);
  }
  if (include("silt_basin")) createBasinArt(scene, cel, cache, labels);
  const sites = createB1Sites(scene, cel, glass, region, labels, cache);
  const meshes = scene.meshes.filter(m => !initial.has(m));
  let disposed = false;
  return {
    update(state) {
      if (disposed) return;
      for (const [id, mesh] of sourceMeshes)
        mesh.setEnabled(!state || !!state.world.resources.find(r => r.id === id && r.stock > 0));
      // Finite frame stacks show one member per remaining unit.
      for (const [id, units] of unitMeshes) {
        const left = state ? state.world.resources.find(r => r.id === id)?.stock ?? 0 : units.length + 1;
        units.forEach((unit, i) => unit.setEnabled(i + 1 < left));
      }
      sites.update(state);
    },
    dispose() { if (disposed) return; disposed = true; for (const mesh of meshes) mesh.dispose(); },
  };
}

/** Compatible full-scene factory for direct callers. Production composition
 * uses the regional and actor handles independently. */
export function createExpeditionArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial): RegionArt {
  const staticArt = createExpeditionRegion(scene, cel, glass);
  const actors = createExpeditionActors(scene, cel, glass);
  return {
    update(state) { staticArt.update(state); actors.update(state); },
    dispose() { actors.dispose(); staticArt.dispose(); },
  };
}

export function createExpeditionActors(
  scene: Scene,
  cel: ShaderMaterial,
  glass: ShaderMaterial,
  resident: (position: Readonly<GameState["player"]["pose"]["position"]>) => boolean = () => true,
  labels?: LabelMaterials,
  cache?: GeometryCache,
): RegionArt {
  const makeSign = (text: string, p: Point, width = 2, yaw = 0): Mesh => label(scene, text, p, width, yaw, labels);
  const initial = new Set(scene.meshes);
  let disposed = false;
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
  const hunter = new ArtBatch("ecology.sound-hunter", scene, cel);
  hunter.loft(HG.body, P.violet);
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
        [x * .95, .9, -1.7],
        [x * 1.65, 1.35, -2.2],
        [x * 1.8, 1.4, -1.5],
      ],
      0.1,
      P.amber,
      6,
    );
    hunter.ellipsoid([x * .76, .82, -3.25], [.16, .12, .13], P.ink, 10);
    hunter.glow(hunter.ellipsoid([x * .76, .83, -3.36], [.09, .045, .035], P.amber, 8));
    // Long cheek ridge, gill slots and a split sensory rostrum preserve an
    // animal silhouette at the warning distance; no weapon/trophy silhouette.
    hunter.tube([[x * .30, .59, -3.95], [x * .8, .65, -3.15], [x * .95, .54, -.8], [x * .48, .62, 1.5]], .055, P.coralRim, 6);
    hunter.face([[x * .3, .69, -3.95], [x * .64, .885, -3.3], [x * .68, 1.12, -1.9], [x * .30, .91, -2.7]], P.plum);
    for (let gill = 0; gill < 4; gill++)
      hunter.tube([[x * (1.08 - gill * 0.05), 0.95, -1.4 + gill * 0.35], [x * (1.08 - gill * 0.05), 0.58, -1.25 + gill * 0.35]], 0.035, P.plum, 5);
    hunter.tube([[x * .95, .9, -1.7], [x * 1.65, 1.35, -2.2], [x * 1.8, 1.4, -1.5]], .035, P.coralRim, 5);
  }
  hunter.tube([[-.6, .48, -3.55], [0, .46, -4.01], [.6, .48, -3.55]], .035, P.ink, 5);
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
  const hunterMesh = hunter.finish(.65);
  hunterMesh.unfreezeWorldMatrix();
  // Retain only this animal's selected vertex colors. The shared cel material
  // interprets alpha -1 as emission, still in its ordinary opaque/fogged pass.
  const hunterDisplay: {
    mesh: Mesh; base: Float32Array; colors: Float32Array; offsets: number[];
  }[] = [];
  const retainHunterDisplay = (mesh: Mesh, select: (offset: number, colors: Float32Array) => boolean): void => {
    const base = new Float32Array(mesh.getVerticesData("color")!);
    const colors = base.slice(), offsets: number[] = [];
    for (let i = 0; i < base.length; i += 4)
      if (select(i, base)) offsets.push(i);
    const display = { mesh, base, colors, offsets };
    mesh.setVerticesData("color", colors, true, 4);
    hunterDisplay.push(display);
    // Meshes remain scene-owned; disposing one releases its retained data,
    // without disposing the cel material shared by the rest of the scene.
    mesh.onDisposeObservable.addOnce(() => hunterDisplay.splice(hunterDisplay.indexOf(display), 1));
  };
  retainHunterDisplay(hunterMesh, (i, colors) => colors[i + 3]! < 0);
  let hunterDisplayGain = 1;
  const hunterFins: { mesh: Mesh; side: number }[] = [];
  for (const side of [-1, 1]) {
    const fin = new ArtBatch(`ecology.hunter-warning-fin.${side}`, scene, cel);
    const membraneVertices = fin.face([[0, 0, -1.2], [side * 1.2, .15, -1.35], [side * 2.7, -.3, .8], [side * 1.2, 0, 1.1], [0, 0.1, 1.4]], P.coral).getTotalVertices();
    const veinStart = membraneVertices + fin.face([[0, 0.04, -0.7], [side * 1.2, 0.03, -0.1], [side * 1.2, 0.04, 1.1], [0, 0.14, 1.4]], P.violet).getTotalVertices();
    for (const z of [-0.4, 0.2, 0.8])
      fin.tube([[0, 0.12, z], [side * 1.1, 0.04, z + 0.2], [side * 2.3, -0.35, 1.5]], 0.025, P.coralRim, 5);
    const mesh = fin.finish();
    mesh.unfreezeWorldMatrix();
    mesh.parent = hunterMesh;
    mesh.position.set(side * 0.65, 0.65, 0);
    retainHunterDisplay(mesh, i => i < membraneVertices * 4 || i >= veinStart * 4);
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
  const mooringSign = makeSign("SUPPORTED SURVEY MOORING", [CARRIER_SUPPORT.x + 9, 3, CARRIER_SUPPORT.z + 14], 5);
  // Story fixtures composed at existing sites, on the same datums as their hosts.
  const story = new Map<StoryHostId, Mesh>();
  const checklist = new ArtBatch("story.pod_checklist", scene, cel), cp = STORY_HOSTS.pod_checklist.position;
  // A laminated sheet on the locker door's outer face (x −1.51), facing the cabin.
  checklist.box([cp.x - .052, cp.y, cp.z], [.012, .36, .26], P.porcelain);
  checklist.box([cp.x - .044, cp.y + .17, cp.z], [.016, .04, .1], P.ochre);
  for (let i = 0; i < 4; i++) checklist.box([cp.x - .045, cp.y + .09 - i * .07, cp.z - .02], [.004, .012, .18], P.ink);
  story.set("pod_checklist", checklist.finish());
  const tray = new ArtBatch("story.mara_specimen_tray", scene, cel), tp = STORY_HOSTS.mara_specimen_tray.position;
  tray.box([tp.x, tp.y - .03, tp.z], [.5, .05, .34], P.ochre);
  for (const [dx, dz, c] of [[-.15, -.07, P.coral], [0, .06, P.jade], [.14, -.05, P.lime]] as const)
    tray.ellipsoid([tp.x + dx, tp.y + .02, tp.z + dz], [.05, .035, .05], c, 8);
  story.set("mara_specimen_tray", tray.finish());
  const buffer = new ArtBatch("story.C14", scene, cel), bp = STORY_HOSTS.C14.position;
  buffer.box([bp.x - .04, bp.y, bp.z], [.16, .3, .3], P.petrol);
  buffer.glow(buffer.box([bp.x + .045, bp.y + .08, bp.z], [.012, .04, .2], P.mint));
  story.set("C14", buffer.finish());
  const vehicles = new Map<string, Mesh>(),
    caches = new Map<string, Mesh>();
  let carrierShell: Mesh | null = null, shellKey = "";
  const fixedMeshes = scene.meshes.filter(m => !initial.has(m));
  return {
    update(s) {
      if (disposed) return;
      const pins = pinnedVehicleIds(s);
      const visibleVehicle = (v: VehicleState): boolean => pins.has(v.id) || resident(v.pose.position);
      for (const [id, mesh] of story) mesh.setEnabled(!!s && s.opening.phase === 4 && storyHostVisible(s, id) && resident(STORY_HOSTS[id].position));
      mooringMesh.setEnabled(s?.scenario === "carrier-fixture");
      mooringSign.setEnabled(s?.scenario === "carrier-fixture");
      restraintMesh.setEnabled(!!s && s.opening.phase === 0);
      fogMesh.setEnabled(!!s && s.opening.phase < 3);
      latchMesh.setEnabled(!!s && s.opening.phase < 2);
      const time = s ? s.tick / 60 : 0;
      const t = s?.world.threat;
      hunterMesh.setEnabled(s?.scenario === "expedition" && !!t && (resident(t.position) || t.mode !== "idle"));
      const displaying = s?.scenario === "expedition" &&
        (t?.mode === "warn" || t?.mode === "investigate" || t?.mode === "pursue");
      // 0.75 Hz, +8–28% local color gain. Simulation time keeps pause and
      // replacement deterministic; no wall-clock phase or per-frame buffers.
      const displayGain = displaying ? 1.18 + Math.sin(time * Math.PI * 2 * .75) * .1 : 1;
      if (displayGain !== hunterDisplayGain) {
        for (const { mesh, base, colors, offsets } of hunterDisplay) {
          for (const i of offsets) {
            colors[i] = base[i]! * displayGain;
            colors[i + 1] = base[i + 1]! * displayGain;
            colors[i + 2] = base[i + 2]! * displayGain;
            colors[i + 3] = displaying ? -1 : base[i + 3]!;
          }
          mesh.updateVerticesData("color", colors, false, false);
        }
        hunterDisplayGain = displayGain;
      }
      if (t) {
        hunterMesh.position.set(t.position.x, t.position.y, t.position.z);
        const pose = hunterPose(s!);
        hunterMesh.rotation.set(0, -pose.yaw, pose.roll);
        for (const { mesh, side } of hunterFins)
          mesh.rotation.z = side * pose.finAngle;
      }
      // A remote parked hull is hidden, not rebuilt on every return: the fleet
      // is small and bounded, and its live handles are re-read from state.
      for (const [id, mesh] of vehicles)
        if (!s?.fleet.vehicles.some(v => v.id === id)) {
          mesh.dispose();
          vehicles.delete(id);
        }
      for (const v of s?.fleet.vehicles ?? []) {
        if (!visibleVehicle(v)) { vehicles.get(v.id)?.setEnabled(false); continue; }
        let m = vehicles.get(v.id);
        if (m && m.metadata.hull !== v.hull) { m.dispose(); vehicles.delete(v.id); m = undefined; }
        if (!m) {
          m = v.hull === "dart" || v.hull === "creel" ? dartArt(scene, cel, glass, v.id, v.hull, labels, cache)
            : fleetHullArt(scene, cel, glass, v.id, v.hull, labels, cache);
          m.metadata = { hull: v.hull };
          m.renderingGroupId = 1;
          vehicles.set(v.id, m);
        }
        m.position.set(v.pose.position.x, v.pose.position.y, v.pose.position.z);
        // Semantic +yaw turns local -Z toward +X. Babylon's mesh Y rotation
        // uses the opposite sign, including in a right-handed scene.
        m.rotation.set(v.hull === "dart" && !v.berth ? v.pose.pitch : 0, -v.pose.yaw, 0);
        // Every hull keeps its visible art and view-only cockpit while piloted.
        m.setEnabled(true);
        if (v.hull === "creel") updateCreelArt(m, s, v);
        else if (v.hull !== "dart") updateFleetHullArt(m, s, v,
          v.hull === "hearthline" && s?.fleet.docking?.vehicleId === v.id ? occupiedSockets(s.fleet.docking) : undefined);
        for (const child of m.getChildMeshes())
          if (child.name === `${v.id}.cockpit`) child.setEnabled(s?.player.controlledVehicleId === v.id);
          else if (child.name === `${v.id}.instrument.charge`) child.scaling.x = Math.max(0, Math.min(1, v.charge / 100));
          else if (child.name === `${v.id}.instrument.health`) child.scaling.x = Math.max(0, Math.min(1, v.health / 100));
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
      const nextShellKey = h && dock && visibleVehicle(h) ? `${h.id}.${dock.configuration}.${openSlot ?? "sealed"}` : "";
      if (shellKey !== nextShellKey) {
        carrierShell?.dispose();
        carrierShell = null;
        shellKey = nextShellKey;
        if (h && dock && visibleVehicle(h)) {
          carrierShell = hearthlineShellArt(scene, cel, glass, h.id, dock.configuration, openSlot, labels);
        }
      }
      if (h) {
        if (carrierShell) {
          carrierShell.position.set(h.pose.position.x, h.pose.position.y, h.pose.position.z);
          carrierShell.rotation.y = -h.pose.yaw;
        }
        const exit = launchPoint(h, h);
        blockMesh.position.set(exit.x, exit.y + 1, exit.z);
        blockMesh.rotation.y = -h.pose.yaw;
      }
      for (const [id, mesh] of caches)
        if (!s?.recovery.caches.some(c => c.id === id && resident(c.position))) {
          mesh.dispose();
          caches.delete(id);
        }
      for (const c of s?.recovery.caches ?? []) {
        if (!resident(c.position)) continue;
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
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of vehicles.values()) mesh.dispose();
      for (const mesh of caches.values()) mesh.dispose();
      vehicles.clear(); caches.clear();
      carrierShell?.dispose(); carrierShell = null;
      for (const mesh of fixedMeshes) mesh.dispose();
    },
  };
}
