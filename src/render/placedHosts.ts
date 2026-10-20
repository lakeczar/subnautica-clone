/** C3: art for every host standing at an S2 site: the lifted sources (S9's late
 * deposits and C3's isles, Canopy and Basin lifts), S9's technical records, S5's
 * placed records and consoles, and the upper hall's work faces. Hosts build when
 * the camera comes within BUILD_DISTANCE and are released beyond DROP_DISTANCE,
 * so a 2 km world holds only the few nearby. Each source keeps a persistent host
 * (a place to return to) with its stock as a separate mesh that empties. */
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { CAMPAIGN_TECH_RECORDS } from "../content/campaign/plans.js";
import { SOURCES, type SourceId } from "../content/registry.js";
import { PLACED_HOSTS, WORKS_FACES, type PlacedHostId, type WorksFaceId } from "../content/story/placements.js";
import { PLACED_SOURCE_IDS } from "../content/worldSources.js";
import { storyHostVisible } from "../sim/storyLink.js";
import type { GameState, Vec3 } from "../sim/types.js";
import { ArtBatch, seeded, type Point } from "./geometry.js";
import { PALETTE as P } from "./palette.js";

export const BUILD_DISTANCE = 160;
export const DROP_DISTANCE = 240;

type HostKind = "source" | "tech" | "story" | "works";
interface Host { id: string; kind: HostKind; position: Vec3 }
interface Built { meshes: Mesh[]; stock: Mesh | null }

const HOSTS: readonly Host[] = [
  ...[...PLACED_SOURCE_IDS].map((id) => ({ id, kind: "source" as const, position: SOURCES[id as SourceId].position })),
  ...Object.entries(CAMPAIGN_TECH_RECORDS).map(([id, r]) => ({ id, kind: "tech" as const, position: r.position })),
  ...(Object.keys(PLACED_HOSTS) as PlacedHostId[]).map((id) => ({ id, kind: "story" as const, position: PLACED_HOSTS[id] })),
  ...(Object.keys(WORKS_FACES) as WorksFaceId[]).map((id) => ({ id, kind: "works" as const, position: WORKS_FACES[id].position })),
];

/** The source's material, read from its look: pale ceramic plates, dark core
 * inclusions, crystalline lattice, clear glass, amber resin, crusted fins,
 * tagged alloy and shore pods. */
function stockArt(b: ArtBatch, asset: string, [x, y, z]: Point, seed: number): void {
  const random = seeded(seed);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + random() * 0.4, r = 0.45 + random() * 0.55, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (asset === "ceramic") b.box([px, y + 0.08 + i * 0.03, pz], [0.7, 0.07, 0.5], i % 2 ? P.porcelain : "#e4d9c2", [0, a, 0.08]);
    else if (asset === "core") b.ellipsoid([px, y + 0.14, pz], [0.2, 0.16, 0.2], i % 2 ? P.ink : P.orange, 6);
    else if (asset === "lattice") b.tube([[px, y, pz], [px + 0.1, y + 0.55 + random() * 0.3, pz - 0.08]], 0.07, i % 2 ? P.reflection : "#9fd0e0", 4);
    else if (asset === "glass") b.ellipsoid([px, y + 0.12, pz], [0.18, 0.2, 0.16], i % 2 ? P.reflection : P.mint, 6);
    else if (asset === "resin") b.ellipsoid([px, y + 0.1, pz], [0.2, 0.14, 0.18], i % 2 ? P.amber : P.orange, 6);
    else if (asset === "crust") b.box([px, y + 0.3, pz], [0.12, 0.6, 0.5], i % 2 ? P.amber : P.ochre, [0, a, 0]);
    else if (asset === "food") b.ellipsoid([px, y + 0.18, pz], [0.16, 0.24, 0.16], i % 2 ? "#a8bd7a" : "#829f71", 6);
    else b.box([px, y + 0.1, pz], [0.6, 0.1, 0.35], i % 2 ? P.ochre : P.metal, [0, a, 0.1]);
  }
}
function hostArt(b: ArtBatch, h: Host): void {
  const { x, y, z } = h.position;
  if (h.kind === "source") {
    // A low ledge or frame that remains when the stock is gone.
    b.ellipsoid([x, y - 0.7, z], [1.5, 0.35, 1.3], P.basalt, 9);
    b.tube([[x - 1.2, y - 0.45, z - 0.9], [x + 1.1, y - 0.42, z + 0.8]], 0.05, P.stoneLight, 4);
  } else if (h.kind === "tech" || (h.kind === "story" && !/^C\d\d$/.test(h.id))) {
    // A post with a weatherproof case or plate: a readable record.
    b.tube([[x, y - 0.6, z], [x, y + 0.2, z]], 0.06, P.metal, 5);
    b.box([x, y + 0.35, z], [0.55, 0.4, 0.12], P.ochre);
    b.box([x, y + 0.36, z - 0.07], [0.42, 0.28, 0.02], P.porcelain);
  } else if (h.kind === "story") {
    // A console with a lit screen: telemetry, a recorder or a voice log.
    b.box([x, y - 0.2, z], [0.8, 0.8, 0.5], P.petrol);
    b.glow(b.box([x, y + 0.12, z - 0.26], [0.6, 0.32, 0.02], "#bfe7da"));
  } else {
    // A restoration bay: a frame around a dark, unpowered panel.
    for (const dx of [-1.4, 1.4]) b.box([x + dx, y + 0.6, z], [0.18, 1.8, 0.18], P.steelLight);
    b.box([x, y + 1.55, z], [3, 0.16, 0.2], P.steelLight);
    b.box([x, y + 0.6, z + 0.1], [2.5, 1.6, 0.06], P.ink);
  }
}

export interface PlacedHostLayer {
  update(state: GameState | null, camera: Vec3): void;
  /** Hosts currently built, for diagnostics and tests. */
  readonly built: readonly string[];
  dispose(): void;
}
export function createPlacedHosts(scene: Scene, cel: ShaderMaterial): PlacedHostLayer {
  const built = new Map<string, Built>();
  const build = (h: Host): Built => {
    const base = new ArtBatch(`placed.${h.id}`, scene, cel);
    hostArt(base, h);
    const meshes = [base.finish(0.12)];
    let stock: Mesh | null = null;
    if (h.kind === "source") {
      const s = SOURCES[h.id as SourceId], b = new ArtBatch(`placed.${h.id}.stock`, scene, cel);
      stockArt(b, s.asset, [s.position.x, s.position.y - 0.3, s.position.z], h.id.length * 97 + Math.round(s.position.x));
      stock = b.finish(0.14);
      meshes.push(stock);
    }
    for (const m of meshes) m.renderingGroupId = 1;
    return { meshes, stock };
  };
  let disposed = false;
  return {
    get built() { return [...built.keys()]; },
    update(state, camera) {
      if (disposed) return;
      for (const h of HOSTS) {
        const d = Math.hypot(h.position.x - camera.x, h.position.y - camera.y, h.position.z - camera.z);
        const shown = !!state && state.opening.phase >= 4 &&
          (h.kind !== "story" || storyHostVisible(state, h.id as PlacedHostId));
        let art = built.get(h.id);
        if (!art && shown && d <= BUILD_DISTANCE) built.set(h.id, art = build(h));
        else if (art && (d > DROP_DISTANCE || !shown)) {
          for (const m of art.meshes) m.dispose();
          built.delete(h.id);
          continue;
        }
        if (art?.stock && state) art.stock.setEnabled((state.world.resources.find((r) => r.id === h.id)?.stock ?? 0) > 0);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const art of built.values()) for (const m of art.meshes) m.dispose();
      built.clear();
    },
  };
}
