import type { Scene, ShaderMaterial, Mesh } from '@babylonjs/core';
import { SOURCES } from '../content/registry.js';
import { terrainHeight } from '../sim/world.js';
import { ArtBatch, seeded } from './geometry.js';
import type { Point } from './geometry.js';
import { PALETTE as P } from './palette.js';

export interface AnimatedLife { update(seconds: number): void }

export function createEcology(scene: Scene, cel: ShaderMaterial): AnimatedLife {
  const plants = new ArtBatch('reef.ribbon-colonies', scene, cel), random = seeded(361);
  const patches: readonly Point[] = [[-28, 0, -5], [-10, 0, -13], [-25, 0, -21], [22, 0, -8], [28, 0, 10], [-21, 0, 22]];
  patches.forEach(([cx, , cz], patch) => {
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
  plants.finish();

  // Shore plants are authored to the walkable height field; they are decorative,
  // without resource glints or interaction prompts until the first expedition.
  const shore = new ArtBatch('island.wind-leaves', scene, cel);
  for (let i = 0; i < 28; i++) {
    const x = -4 + random() * 28, z = -38 - random() * 20, y = terrainHeight(x, z);
    if (y < 1 || y > 12) continue;
    const h = 1.1 + random() * 1.8;
    shore.tube([[x, y, z], [x + 0.15, y + h * 0.6, z], [x + 0.5, y + h, z + 0.1]], 0.055, '#517a6b', 5);
    for (let j = 0; j < 4; j++) {
      const yy = y + h * (0.3 + j * 0.15), direction = j % 2 ? 1 : -1;
      shore.face([[x + 0.1, yy, z], [x + 0.7 * direction, yy + 0.22, z - 0.3], [x + 1.4 * direction, yy + 0.65, z + 0.1], [x + 0.6 * direction, yy + 0.42, z + 0.3]], j % 2 ? '#a8bd7a' : '#829f71');
    }
  }
  shore.finish();

  // The current runs along +Z into the source's lee hollow. Fans, suspended
  // particles and loose shed all point to the actual collectable catch ID.
  const flows: { mesh: Mesh; from: Point; to: Point; phase: number }[] = [];
  const grazers: { mesh: Mesh; x: number; y: number; z: number; phase: number }[] = [];
  for (const [id, source] of Object.entries(SOURCES)) {
    const { x, y, z } = source.position;
    if (source.asset === 'ribbons') {
      const fans = new ArtBatch(`ecology.filters.${id}`, scene, cel);
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
        const drift = new ArtBatch(`ecology.shed.${id}.${n}`, scene, cel);
        drift.face([[-0.2, 0, 0], [0.2, 0.03, 0], [0.13, 0.18, 0.12], [-0.17, 0.08, 0.13]], n % 2 ? P.coral : P.lime);
        const mesh = drift.finish(); mesh.unfreezeWorldMatrix();
        flows.push({ mesh, from: [x, terrainHeight(x, upstreamZ) + 2.0, upstreamZ + 0.8], to: [x, y + 0.2, z], phase: n / 8 });
      }
    }
    if (source.asset === 'glass') {
      for (let n = 0; n < 2; n++) {
        const grazer = new ArtBatch(`ecology.grazer.${id}.${n}`, scene, cel);
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
    if (source.asset === 'crust' || source.asset === 'resin') {
      const host = new ArtBatch(`ecology.holdfast.${id}`, scene, cel);
      // Off-axis living host leaves the registered collectable and approach clear.
      const hx = x + 2.6, hz = z - 1.8, floor = terrainHeight(hx, hz);
      for (const side of [-1, 1])
        host.tube([[hx + side * 1.1, terrainHeight(hx + side * 1.1, hz) + 0.03, hz], [hx + side * 0.5, floor + 0.45, hz], [hx, floor + 2.4, hz]], 0.12, P.petrol, 6);
      host.tube([[hx, floor + 0.15, hz], [hx + 0.15, floor + 2.4, hz], [hx + 0.6, floor + 5.1, hz + 0.5]], 0.13, P.petrol, 7);
      host.ellipsoid([hx + 0.6, floor + 5.1, hz + 0.5], [1.35, 0.9, 1], source.asset === 'resin' ? P.amber : P.jade, 10);
      for (let vein = 0; vein < 4; vein++) {
        const dx = -1.2 + vein * 0.7;
        host.face([[hx + 0.6, floor + 5.5, hz + 0.5], [hx + dx, floor + 6.5, hz - 0.2], [hx + dx * 1.8, floor + 6.0, hz - 2.7], [hx + dx * 1.3, floor + 5.6, hz - 2.1]], vein % 2 ? P.jade : '#479c91');
        host.tube([[hx + 0.6, floor + 5.55, hz + 0.5], [hx + dx, floor + 6.4, hz - 0.2], [hx + dx * 1.8, floor + 6.0, hz - 2.7]], 0.025, P.mint, 5);
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
      host.finish();
    }
  }

  const schools: Mesh[] = [];
  for (let group = 0; group < 4; group++) {
    const school = new ArtBatch(`reef.decorative-school.${group}`, scene, cel);
    for (let fish = 0; fish < 7; fish++) {
      const x = (random() - 0.5) * 6, y = (random() - 0.5) * 2, z = (random() - 0.5) * 3;
      school.ellipsoid([x, y, z], [0.46, 0.16, 0.13], group ? P.amber : P.lime, 6);
      school.face([[x - 0.34, y, z], [x - 0.72, y + 0.28, z], [x - 0.6, y, z + 0.05], [x - 0.72, y - 0.25, z]], group ? P.coral : P.jade);
      school.face([[x, y + 0.05, z], [x - 0.15, y + 0.43, z - 0.03], [x + 0.22, y + 0.13, z]], P.petrol);
      school.ellipsoid([x + 0.3, y + 0.04, z - 0.11], [0.045, 0.05, 0.025], P.ink, 4);
    }
    const mesh = school.finish(); mesh.unfreezeWorldMatrix(); schools.push(mesh);
  }
  return { update(seconds) {
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
    schools.forEach((school, i) => {
      const angle = seconds * (0.065 + i * 0.015) + i * 2;
      if (i < 2)
        school.position.set(-15 + Math.cos(angle) * 10 + i * 20, -4.3 + Math.sin(angle * 2) * 0.6, -6 + Math.sin(angle) * 8);
      else
        school.position.set(112 + Math.cos(angle) * 8 + (i - 2) * 12, -106 + (i - 2) * 26 + Math.sin(angle * 2) * 1.2, -116 + Math.sin(angle) * 8);
      school.rotation.y = -angle - Math.PI / 2;
    });
  } };
}
