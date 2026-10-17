import type { Scene, ShaderMaterial, Mesh } from '@babylonjs/core';
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

  const schools: Mesh[] = [];
  for (let group = 0; group < 2; group++) {
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
    schools.forEach((school, i) => {
      const angle = seconds * (0.065 + i * 0.015) + i * 2;
      school.position.set(-15 + Math.cos(angle) * 10 + i * 20, -4.3 + Math.sin(angle * 2) * 0.6, -6 + Math.sin(angle) * 8);
      school.rotation.y = -angle - Math.PI / 2;
    });
  } };
}
