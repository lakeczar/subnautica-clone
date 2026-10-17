import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import type { Scene, ShaderMaterial } from '@babylonjs/core';
import { POD_DECK, POD_RAMP, RIB_SEGMENTS } from '../sim/world.js';
import { ArtBatch } from './geometry.js';
import { PALETTE as P } from './palette.js';

export function createLandmarks(scene: Scene, cel: ShaderMaterial): void {
  const rib = new ArtBatch('landmark.reef-ribs', scene, cel);
  RIB_SEGMENTS.forEach(({ a, b, radius }, i) => {
    rib.tube([[a.x, a.y, a.z], [b.x, b.y, b.z]], radius, i % 6 < 2 ? '#47737d' : i % 3 ? P.basalt : P.stoneLight, 8);
    if (i % 4 === 1) rib.tube([[a.x, a.y + radius * 0.7, a.z - radius * 0.45], [b.x, b.y + radius * 0.7, b.z - radius * 0.45]], 0.075, '#96b79c', 4);
  });
  rib.finish();

  const pod = new ArtBatch('refuge.pod', scene, cel);
  // Shell begins behind the engineered access face; its former long nose buried it.
  pod.ellipsoid([0, 1.1, 21.8], [3.6, 3.05, 2.4], P.porcelain, 20);
  pod.ellipsoid([0, -0.8, 21.8], [3.6, 1.2, 2.4], P.petrol, 16);
  pod.box([0, 0.35, 19.1], [6.8, 0.36, 0.36], P.petrol);
  pod.box([0, 1.05, 19.34], [2.6, 3.6, 0.28], P.petrol);
  pod.box([0, 1.22, 19.15], [2.1, 2.6, 0.13], P.crown);
  pod.box([0, 2.2, 19.05], [1.55, 0.48, 0.045], P.glass);
  pod.box([0.07, 2.29, 19.012], [1.26, 0.035, 0.02], P.reflection);
  pod.box([0, 2.94, 19.1], [2.6, 0.13, 0.1], P.ochre);
  pod.box([0, 0.03, 19], [2.7, 0.25, 0.4], P.ochre);
  pod.tube([[-0.54, 0.85, 19.01], [-0.54, 1.36, 19.01], [-0.27, 1.36, 19.01]], 0.05, P.petrol, 5);
  pod.box([1.47, 1.47, 19.03], [0.25, 0.57, 0.12], P.metal);
  pod.box([1.47, 1.57, 18.94], [0.13, 0.16, 0.04], P.warm);
  for (const side of [-1, 1]) {
    pod.ellipsoid([side * 2.3, 2.25, 20.4], [0.8, 0.65, 1.3], P.glass, 10);
    pod.tube([[side * 1.7, 2.7, 19.9], [side * 2.15, 2.9, 20.2], [side * 2.75, 2.64, 20.6]], 0.055, P.reflection, 5);
    pod.box([side * 3.4, 0.4, 21.1], [0.25, 0.55, 4.1], P.ochre);
    pod.ellipsoid([side * 3.3, -0.8, 20.5], [0.65, 0.8, 2.1], P.petrol, 10);
    for (let i = 0; i < 4; i++) pod.box([side * 3.49, 0.5, 20 + i * 0.52], [0.055, 0.2, 0.18], P.ink);
    pod.tube([[side * 3.05, 0.18, 13], [side * 3.05, 1.02, 13], [side * 3.05, 1.02, 19.4]], 0.07, P.metal, 6);
    for (let z = 15; z < 19; z += 1.7) pod.tube([[side * 3.05, 0.18, z], [side * 3.05, 1.02, z]], 0.055, P.petrol, 5);
  }
  // Deck and sloped return access use the simulation's exact dimensions.
  const deck = POD_DECK;
  pod.box([0, (deck.min.y + deck.max.y) / 2, (deck.min.z + deck.max.z) / 2], [deck.max.x - deck.min.x, deck.max.y - deck.min.y, deck.max.z - deck.min.z], P.petrol);
  for (let z = 10.3; z < 19; z += 0.47) pod.box([0, 0.19, z], [5.5, 0.025, 0.27], '#759390');
  pod.box([0, 0.215, 10.15], [2.65, 0.03, 0.2], P.ochre);
  const r = POD_RAMP;
  pod.face([[r.minX, r.lowY, r.minZ], [r.minX, r.highY, r.landingZ], [r.maxX, r.highY, r.landingZ], [r.maxX, r.lowY, r.minZ]], P.metal);
  pod.face([[r.minX, r.highY, r.landingZ], [r.minX, r.highY, r.maxZ], [r.maxX, r.highY, r.maxZ], [r.maxX, r.highY, r.landingZ]], P.metal);
  for (const x of [r.minX, r.maxX]) pod.tube([[x, r.lowY, r.minZ], [x, r.highY, r.landingZ], [x, r.highY, r.maxZ]], 0.06, P.ochre, 5);
  for (let z = 6.4; z < 10; z += 0.5) {
    const y = r.lowY + Math.min(1, (z - r.minZ) / (r.landingZ - r.minZ)) * (r.highY - r.lowY);
    pod.tube([[-1.1, y + 0.02, z], [1.1, y + 0.02, z]], 0.035, P.petrol, 4);
  }
  pod.tube([[-2.1, 3.4, 22], [-2.1, 5.1, 22]], 0.055, P.petrol, 5);
  pod.box([-2.1, 5.1, 22], [0.8, 0.1, 0.12], P.warm);
  pod.box([1, 3.85, 22.5], [1.65, 0.18, 1.2], P.ochre, [0, 0, -0.08]);
  for (let i = 0; i < 4; i++) pod.box([0.5 + i * 0.29, 3.96, 22.5], [0.12, 0.1, 0.85], P.petrol);
  pod.finish();

  // A clearly non-interactive exterior label, rendered from bundled system glyphs.
  const label = new DynamicTexture('pod.label', { width: 512, height: 128 }, scene, false);
  label.drawText('HOME  /  01', null, 86, 'bold 54px sans-serif', '#e9dfb6', '#234d58', true);
  const mat = new StandardMaterial('pod.label-material', scene);
  mat.diffuseTexture = label; mat.emissiveColor = Color3.White(); mat.disableLighting = true; mat.backFaceCulling = false;
  const plate = CreatePlane('pod.label', { width: 1.7, height: 0.42 }, scene);
  plate.position.set(0, 3.2, 18.95); plate.rotation.y = Math.PI; plate.material = mat; plate.isPickable = false;
}
