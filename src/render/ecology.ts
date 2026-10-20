import type { GeometryCache } from "./geometryCache.js";
import type { Scene, ShaderMaterial, Mesh } from '@babylonjs/core';
import { BASIN_SOURCE_IDS } from '../content/routes.js';
import type { GameState } from '../sim/types.js';
import type { RenderRegion, RenderQuality } from './regions.js';
import { SOURCES } from '../content/registry.js';
import { BASIN_YARD } from '../content/vistas.js';
import { terrainHeight } from '../sim/world.js';
import { ArtBatch, seeded } from './geometry.js';
import type { Point } from './geometry.js';
import { PALETTE as P } from './palette.js';

export interface AnimatedLife { update(seconds: number, state?: GameState | null): void; setQuality(quality: RenderQuality): void; dispose(): void }

export function createEcology(scene: Scene, cel: ShaderMaterial, region?: RenderRegion, cache?: GeometryCache): AnimatedLife {
  const batch = (name: string): ArtBatch => new ArtBatch(name, scene, cel, cache && { owner: cache, key: `ecology:${region ?? "complete"}:${name}` });
  const initial = new Set(scene.meshes);
  let disposed = false, quality: RenderQuality = "rich";
  const plants = batch('reef.ribbon-colonies'), random = seeded(361);
  const patches: readonly Point[] = [[-28, 0, -5], [-10, 0, -13], [-25, 0, -21], [22, 0, -8], [28, 0, 10], [-21, 0, 22]];
  if (!region || region === "refuge_reef") patches.forEach(([cx, , cz], patch) => {
    for (let colony = 0; colony < 5; colony++) {
      const x = cx + (random() - 0.5) * 6.5, z = cz + (random() - 0.5) * 5.2, y = terrainHeight(x, z);
      const height = 1.5 + random() * 1.7, color = patch % 3 === 0 ? P.coral : patch % 3 === 1 ? P.jade : P.violet;
      plants.ellipsoid([x, y + 0.1, z], [0.65, 0.2, 0.54], '#467e7d', 6);
      for (let leaf = 0; leaf < 5; leaf++) {
        const angle = leaf / 5 * Math.PI * 2 + random() * 0.4, leanX = Math.cos(angle), leanZ = Math.sin(angle), length = height * (0.7 + random() * 0.35);
        const path: Point[] = [], left: Point[] = [], right: Point[] = [];
        for (let s = 0; s <= 7; s++) {
          const t = s / 7, px = x + leanX * (t * t * 1.5), py = y + t * length, pz = z + leanZ * t * t * 1.5;
          const width = Math.sin(t * Math.PI) * 0.35 + 0.015;
          path.push([px, py, pz]); left.push([px - leanZ * width, py - 0.02, pz + leanX * width]); right.push([px + leanZ * width, py - 0.02, pz - leanX * width]);
        }
        for (let s = 0; s < 7; s++) {
          const a = path[s]!, b = path[s + 1]!;
          plants.face([left[s]!, a, b, left[s + 1]!], s > 5 ? P.lime : color);
          plants.face([a, right[s]!, right[s + 1]!, b], s > 5 ? P.lime : patch % 2 ? '#78b9a3' : '#d99589');
        }
        plants.tube(path, 0.022, patch % 2 ? '#bad3a4' : '#f1c199', 4);
      }
      // Low ribbed cups create a second silhouette beside the taller ribbons.
      for (let i = 0; i < 3; i++) {
        const px = x + 0.8 + i * 0.3, pz = z + 0.5, py = terrainHeight(px, pz);
        plants.tube([[px, py, pz], [px + 0.12, py + 0.45 + i * 0.16, pz]], 0.13, P.amber, 7);
      }
    }
  });
  if (!region || region === "refuge_reef") plants.finish();

  // Shore plants are authored to the walkable height field; they are decorative,
  // without resource glints or interaction prompts until the first expedition.
  const shore = batch('island.wind-leaves');
  for (let i = 0; (!region || region === "island_chain") && i < 28; i++) {
    const x = -4 + random() * 28, z = -38 - random() * 20, y = terrainHeight(x, z);
    if (y < 1 || y > 12) continue;
    const h = 1.1 + random() * 1.8;
    shore.tube([[x, y, z], [x + 0.15, y + h * 0.6, z], [x + 0.5, y + h, z + 0.1]], 0.055, '#517a6b', 5);
    for (let j = 0; j < 4; j++) {
      const yy = y + h * (0.3 + j * 0.15), direction = j % 2 ? 1 : -1;
      shore.face([[x + 0.1, yy, z], [x + 0.7 * direction, yy + 0.22, z - 0.3], [x + 1.4 * direction, yy + 0.65, z + 0.1], [x + 0.6 * direction, yy + 0.42, z + 0.3]], j % 2 ? '#a8bd7a' : '#829f71');
    }
  }
  if (!region || region === "island_chain") shore.finish();

  // The current runs along +Z into the source's lee hollow. Fans, suspended
  // particles and loose shed all point to the actual collectable catch ID.
  const flows: { mesh: Mesh; from: Point; to: Point; phase: number }[] = [];
  const grazers: { mesh: Mesh; x: number; y: number; z: number; phase: number }[] = [];
  for (const [id, source] of Object.entries(SOURCES)) {
    if (region && source.region !== region) continue;
    const { x, y, z } = source.position;
    if (source.asset === 'ribbons') {
      const fans = batch(`ecology.filters.${id}`);
      const upstreamZ = z - 4.5;
      for (const offset of [-1.6, 1.4]) {
        const fx = x + offset, fy = terrainHeight(fx, upstreamZ);
        fans.ellipsoid([fx, fy + 0.15, upstreamZ], [0.8, 0.3, 0.6], P.basalt, 7);
        const stem: Point = [fx, fy + 0.2, upstreamZ];
        for (let rib = 0; rib < 7; rib++) {
          const angle = -1.1 + rib * 0.36;
          const tip: Point = [fx + Math.sin(angle) * 1.55, fy + 0.7 + Math.cos(angle) * 2.3, upstreamZ + 0.7];
          const mid: Point = [(stem[0] + tip[0]) / 2, (stem[1] + tip[1]) / 2 + 0.15, upstreamZ + 0.15];
          fans.tube([stem, mid, tip], 0.045, P.amber, 5);
          if (rib < 6) {
            const next: Point = [fx + Math.sin(angle + 0.36) * 1.55, fy + 0.7 + Math.cos(angle + 0.36) * 2.3, upstreamZ + 0.7];
            const middle: Point = [(stem[0] + tip[0] + next[0]) / 3, (stem[1] + tip[1] + next[1]) / 3, upstreamZ + 0.23];
            fans.face([stem, tip, middle], rib % 2 ? P.coral : '#ca8e9f');
            fans.face([middle, tip, next], P.coralRim);
            fans.face([stem, middle, next], '#b282a6');
            // Cross-veins and the bright outer lip make an open membrane,
            // rather than a stack of flat alternating triangles.
            for (const t of [0.45, 0.72]) {
              const at = (p: Point): Point => [stem[0] + (p[0] - stem[0]) * t, stem[1] + (p[1] - stem[1]) * t, stem[2] + (p[2] - stem[2]) * t - 0.035];
              fans.tube([at(tip), at(next)], 0.018, P.shell, 4);
            }
            fans.tube([tip, next], 0.027, P.coralRim, 5);
          }
        }
        fans.tube([[fx, fy + 0.18, upstreamZ], [fx + offset * 0.12, fy + 0.1, upstreamZ + 1.1], [fx + offset * 0.2, terrainHeight(fx, upstreamZ + 1.7) + 0.06, upstreamZ + 1.7]], 0.07, P.petrol, 6);
      }
      fans.finish();
      for (let n = 0; n < 8; n++) {
        const drift = batch(`ecology.shed.${id}.${n}`);
        drift.face([[-0.2, 0, 0], [0.2, 0.03, 0], [0.13, 0.18, 0.12], [-0.17, 0.08, 0.13]], n % 2 ? P.coral : P.lime);
        const mesh = drift.finish(); mesh.unfreezeWorldMatrix();
        flows.push({ mesh, from: [x, terrainHeight(x, upstreamZ) + 2.0, upstreamZ + 0.8], to: [x, y + 0.2, z], phase: n / 8 });
      }
    }
    if (source.asset === 'glass') {
      for (let n = 0; n < 2; n++) {
        const grazer = batch(`ecology.grazer.${id}.${n}`);
        grazer.ellipsoid([0, 0.25, 0], [0.42, 0.28, 0.65], '#cedcb7', 8);
        grazer.ellipsoid([0, 0.13, -0.05], [0.36, 0.1, 0.63], P.jade, 8);
        for (const side of [-1, 1]) {
          grazer.tube([[side * 0.2, 0.17, -0.45], [side * 0.27, 0.08, -0.7]], 0.045, P.jade, 5);
          grazer.ellipsoid([side * 0.18, 0.3, -0.49], [0.06, 0.06, 0.06], P.ink, 5);
          for (let leg = 0; leg < 3; leg++)
            grazer.tube([[side * 0.22, 0.14, -0.3 + leg * 0.26], [side * 0.45, 0.05, -0.4 + leg * 0.26], [side * 0.51, 0.04, -0.25 + leg * 0.26]], 0.028, P.ochre, 5);
          grazer.tube([[side * 0.28, 0.37, -0.35], [side * 0.38, 0.34, 0.1], [side * 0.22, 0.36, 0.49]], 0.022, P.shell, 5);
        }
        for (let rib = 0; rib < 4; rib++)
          grazer.box([0, 0.5, -0.25 + rib * 0.18], [0.32, 0.04, 0.045], P.petrol);
        const mesh = grazer.finish(); mesh.unfreezeWorldMatrix();
        grazers.push({ mesh, x, y: y - 0.6, z, phase: n * Math.PI + random() });
      }
    }
    if ((source.asset === 'crust' || source.asset === 'resin') && source.region !== 'silt_basin') {
      const host = batch(`ecology.holdfast.${id}`);
      // Off-axis living host leaves the registered collectable and approach clear.
      const hx = x + 2.6, hz = z - 1.8, floor = terrainHeight(hx, hz);
      for (const side of [-1, 1])
        host.tube([[hx + side * 1.1, terrainHeight(hx + side * 1.1, hz) + 0.03, hz], [hx + side * 0.5, floor + 0.45, hz], [hx, floor + 2.4, hz]], 0.12, P.petrol, 6);
      host.tube([[hx, floor + 0.15, hz], [hx + 0.15, floor + 2.4, hz], [hx + 0.6, floor + 5.1, hz + 0.5]], 0.13, P.petrol, 7);
      host.ellipsoid([hx + 0.6, floor + 5.1, hz + 0.5], [1.35, 0.9, 1], source.asset === 'resin' ? P.amber : P.jade, 10);
      for (let vein = 0; vein < 4; vein++) {
        const dx = -1.2 + vein * 0.7;
        host.leaf([[hx + .6, floor + 5.5, hz + .5], [hx + dx * .5, floor + 6.4, hz - .2], [hx + dx * 1.5, floor + 6.2, hz - 1.7], [hx + dx * 1.8, floor + 5.8, hz - 2.7]], [.025, .42, .6, .02], [1, 0, 0], vein % 2 ? P.jade : '#268c80', '#8fd5a6');
      }
      for (const side of [-1, 1]) {
        host.tube([[hx + .6, floor + 4.8, hz + .5], [hx + .6 + side * .8, floor + 4.3, hz + .5]], .035, P.petrol, 5);
        host.ellipsoid([hx + .6 + side * .8, floor + 3.55, hz + .5], [.24, .13, .24], P.orange, 8);
        host.ellipsoid([hx + .6 + side * .8, floor + 4.4, hz + .5], [.23, .15, .23], P.plum, 8);
        host.glow(host.ellipsoid([hx + .6 + side * .8, floor + 4.0, hz + .5], [.18, .4, .18], P.amber, 8));
      }
      if (source.asset === 'resin') {
        // A cured scar above the loose amber nodules teaches shed provenance.
        host.ellipsoid([hx + 0.3, floor + 4.55, hz + 0.1], [0.43, 0.13, 0.4], P.orange, 8);
      } else {
        for (let fin = 0; fin < 3; fin++) {
          const fx = x - 0.7 + fin * 0.65;
          host.face([[fx, y - 0.8, z - 0.9], [fx, y + 0.2, z - 0.6], [fx, y + 0.05, z + 0.9], [fx, y - 0.8, z + 1.1]], P.petrol);
          host.tube([[fx, y + 0.2, z - 0.6], [fx, y + 0.05, z + 0.9]], 0.032, P.ochre, 5);
        }
      }
      host.finish(.35);
    }
  }

  const schools: { mesh: Mesh; canopy: boolean }[] = [];
  for (let group = 0; group < 2; group++) {
    const owner = group ? "suspended_garden" : "refuge_reef";
    if (region && region !== owner) continue;
    const school = batch(`reef.decorative-school.${group}`);
    for (let fish = 0; fish < 7; fish++) {
      const x = (random() - 0.5) * 6, y = (random() - 0.5) * 2, z = (random() - 0.5) * 3;
      school.ellipsoid([x, y, z], [0.46, 0.16, 0.13], group ? P.amber : P.lime, 6);
      school.face([[x - 0.34, y, z], [x - 0.72, y + 0.28, z], [x - 0.6, y, z + 0.05], [x - 0.72, y - 0.25, z]], group ? P.coral : P.jade);
      school.face([[x, y + 0.05, z], [x - 0.15, y + 0.43, z - 0.03], [x + 0.22, y + 0.13, z]], P.petrol);
      school.ellipsoid([x + 0.3, y + 0.04, z - 0.11], [0.045, 0.05, 0.025], P.ink, 4);
    }
    const mesh = school.finish(); mesh.unfreezeWorldMatrix(); schools.push({ mesh, canopy: group === 1 });
  }
  const scavengers: { mesh: Mesh; x: number; z: number; phase: number }[] = [];
  let silt: Mesh | null = null;
  if (!region || region === "silt_basin") {
    for (const [i, id] of BASIN_SOURCE_IDS.slice(0, 2).entries()) {
      const p = SOURCES[id].position, b = batch(`basin.scavenger.${id}`);
      b.ellipsoid([0, .18, 0], [.38, .18, .6], P.steelLight, 6);
      for (const side of [-1, 1]) for (let leg = 0; leg < 3; leg++)
        b.tube([[side * .2, .14, -.35 + leg * .3], [side * .55, .04, -.4 + leg * .3]], .025, P.ochre, 4);
      const mesh = b.finish(); mesh.unfreezeWorldMatrix();
      scavengers.push({ mesh, x: p.x - 2.4, z: p.z - 1.5, phase: i * Math.PI });
    }
    basinWorksYard(batch("basin.works-yard"));
    const b = batch("basin.local-silt");
    for (let i = 0; i < 48; i++) {
      const x = (random() - .5) * 9, y = random() * 2, z = (random() - .5) * 7;
      b.face([[x, y, z], [x + .045, y + .02, z], [x + .01, y + .075, z + .015]], i % 2 ? P.steelLight : P.metal);
    }
    silt = b.finish(); silt.unfreezeWorldMatrix(); silt.setEnabled(false);
  }
  const meshes = scene.meshes.filter(m => !initial.has(m));
  return { update(seconds, state) {
    if (disposed) return;
    const craft = state?.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId);
    const machinery = craft ? Math.hypot(craft.velocity.x, craft.velocity.y, craft.velocity.z) : 0;

    flows.forEach(({ mesh, from, to, phase }) => {
      const t = (seconds / 7 + phase) % 1;
      mesh.position.set(from[0] + (to[0] - from[0]) * t + Math.sin(t * 8 + phase) * 0.35, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t);
      mesh.rotation.set(t * 2, t * 3, Math.sin(t * 9) * 0.2);
    });
    grazers.forEach(({ mesh, x, y, z, phase }) => {
      const a = seconds * 0.13 + phase;
      mesh.position.set(x + Math.sin(a) * 1.1, y + Math.sin(seconds * 2.4 + phase) * 0.025, z + Math.cos(a) * 0.55);
      mesh.rotation.y = Math.atan2(-Math.cos(a), Math.sin(a) * 0.5);
      mesh.rotation.x = Math.sin(seconds * 2.4 + phase) * 0.09;
    });
    schools.forEach(({ mesh: school, canopy }, i) => {
      const angle = seconds * (canopy ? .08 : .065) + i * 2;
      const scatter = canopy && machinery > 3 ? 3 : 0;
      if (!canopy)
        school.position.set(-15 + Math.cos(angle) * 10, -4.3 + Math.sin(angle * 2) * .6, -6 + Math.sin(angle) * 8);
      else
        school.position.set(112 + Math.cos(angle) * (8 + scatter), -106 + Math.sin(angle * 2) * 1.2 + scatter, -116 + Math.sin(angle) * (8 + scatter));
      school.rotation.y = -angle - Math.PI / 2;
    });
    scavengers.forEach(({ mesh, x, z, phase }) => {
      const nearby = state && Math.hypot(state.player.pose.position.x - x, state.player.pose.position.z - z) < 12;
      const retreat = nearby && machinery > 1 ? 1.3 : 0;
      const px = x + Math.sin(seconds * .16 + phase) * .6 - retreat;
      const pz = z + Math.cos(seconds * .16 + phase) * .45;
      mesh.position.set(px, terrainHeight(px, pz) + .02, pz);
      mesh.rotation.y = seconds * .16 + phase;
    });
    if (silt) {
      const p = craft?.pose.position;
      const floor = p ? terrainHeight(p.x, p.z) : 0;
      const active = !!p && p.y - floor < 6 && machinery > .5 && quality === "rich";
      silt.setEnabled(active);
      if (p && active) {
        silt.position.set(p.x, floor + .2 + Math.sin(seconds * .5) * .1, p.z);
        silt.rotation.y = seconds * .08;
      }
    }
  },
  setQuality(next) { quality = next; if (next === "light") silt?.setEnabled(false); },
  dispose() { if (disposed) return; disposed = true; for (const mesh of meshes) mesh.dispose(); },
  };
}

/** The boundary station's yard (layout in content/vistas.ts BASIN_YARD,
 * where tests keep it off the Basin lanes). The station stands on its pad
 * above the silt with the fracture beyond its wall, so the dressing is what
 * reads from the approach and over the wall: lamps on the pad's back corners
 * and along the fracture lip, an open survey mast above the wall, a thin
 * conduit down to the dish spine and pale tube colonies at the pillar's
 * foot. All of it thin and visual-only. */
function basinWorksYard(b: ArtBatch): void {
  const lamp = (x: number, y: number, z: number, h: number, light: string): void => {
    b.tube([[x, y, z], [x, y + h, z]], 0.11, P.petrol, 5);
    b.box([x, y + h + 0.12, z], [0.8, 0.2, 0.8], P.metal);
    b.glow(b.box([x, y + h - 0.35, z], [0.6, 0.5, 0.6], light));
  };
  BASIN_YARD.lamps.forEach((l, i) => lamp(l.x, l.y ?? terrainHeight(l.x, l.z) - 0.2, l.z, l.y === undefined ? 2.6 + (i % 3) * 0.5 : 3.4,
    l.y === undefined && i % 3 === 1 ? "#9fe6e0" : P.warm));
  // The survey mast: four legs, alternating braces, a lantern above the wall.
  const { x: mx, z: mz, h, half } = BASIN_YARD.mast, base = terrainHeight(mx, mz) - 1, top = 0.5;
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  for (const [u, v] of legs) b.tube([[mx + u * half, terrainHeight(mx + u * half, mz + v * half) - 1, mz + v * half], [mx + u * top, base + h, mz + v * top]], 0.16, P.steelLight, 5);
  for (let y = 4; y < h - 3; y += 5) {
    const r0 = half + (top - half) * (y / h), r1 = half + (top - half) * ((y + 4) / h);
    for (let i = 0; i < 4; i++) {
      const [u0, v0] = legs[i]!, [u1, v1] = legs[(i + 1) % 4]!;
      b.tube([[mx + u0 * r0, base + y, mz + v0 * r0], [mx + u1 * r1, base + y + 4, mz + v1 * r1]], 0.07, i % 2 ? P.steelLight : P.ochre, 4);
    }
  }
  b.box([mx, base + h + 0.4, mz], [1.4, 0.8, 1.4], P.petrol);
  b.glow(b.box([mx, base + h + 1.3, mz], [0.9, 1.1, 0.9], P.warm));
  // A thin conduit from the station's west edge down the pillar to the spine.
  b.tube(BASIN_YARD.conduit.map(p => [...p] as Point), 0.22, P.metal, 6);
  for (const [x, y, z] of BASIN_YARD.conduit.slice(1, -1)) b.tube([[x, y - 0.3, z], [x, y + 0.3, z]], 0.32, P.ochre, 6);
  // Pale tube colonies at the foot of the station's pillar.
  for (const [cx, cz, n] of BASIN_YARD.tubes)
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + cx, r = 0.5 + (i % 3) * 0.55, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = terrainHeight(x, z) - 0.1, t = 0.8 + (i % 4) * 0.35;
      b.tube([[x, y, z], [x, y + t, z]], 0.09, i % 2 ? P.porcelain : P.shell, 5);
      b.tube([[x, y + t, z], [x, y + t + 0.1, z]], 0.12, P.ochre, 5);
    }
  b.finish(0.22);
}
