import { Constants } from "@babylonjs/core/Engines/constants.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Vec3 } from "../sim/types.js";
import { creatureParts } from "./creatures/kit.js";
import { BEACON, beaconGlow, beaconSize, CROWN_RAY_COUNT, CROWN_RAY_SPAN, crownRayPoses, MAST_LAMP, mastLampGlow } from "./hubView.js";
import { PALETTE as P } from "./palette.js";

/** The hub's landmark presentation (W2): the summit beacon and the crown
 * rays. The beacon is a flare and a faint shaft of light toward the surface
 * on their own additive material, so a strong source still reads through
 * murk that hides lit rock (see `hubView.ts`); terrain in front of it still
 * hides it. The rays are ordinary cel creatures, posed from time alone. */
export interface HubArt {
  readonly root: TransformNode;
  readonly meshes: readonly Mesh[];
  update(seconds: number, camera: Vec3): void;
  dispose(): void;
}

/** The camera's far plane is 450 m; past this the flare is drawn on the
 * line of sight at this distance, at the same angular size. */
const IMPOSTOR = 420;
/** The beacon house's radius plus a margin, metres. */
const LAMP_CLEAR = 4;
const smoothstep = (a: number, b: number, v: number): number => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Rays are culled past this (they are fogged out well before). */
const RAY_CULL = 330;

const FLARE_VERTEX = `precision highp float; attribute vec3 position; attribute vec2 uv;
uniform mat4 worldViewProjection; varying vec2 vUv;
void main(){vUv=uv;gl_Position=worldViewProjection*vec4(position,1.);}`;
const FLARE_FRAGMENT = `precision highp float; varying vec2 vUv; uniform float glow; uniform vec3 tint;
void main(){vec2 d=vUv*2.-1.;float r2=dot(d,d);
  float core=exp(-r2*22.),halo=exp(-r2*4.)*.42,rays=exp(-abs(d.x*d.y)*90.)*exp(-r2*2.2)*.25;
  vec3 c=mix(vec3(1.,.7,.36),vec3(1.,.97,.86),core)*tint;
  gl_FragColor=vec4(c,clamp((core+halo+rays)*glow,0.,1.));}`;
const SHAFT_VERTEX = `precision highp float; attribute vec3 position; attribute vec3 normal;
uniform mat4 world; uniform mat4 worldViewProjection; varying vec3 vWorld; varying vec3 vNormal; varying float vUp;
void main(){vWorld=(world*vec4(position,1.)).xyz;vNormal=normalize((world*vec4(normal,0.)).xyz);vUp=position.y+.5;
  gl_Position=worldViewProjection*vec4(position,1.);}`;
const SHAFT_FRAGMENT = `precision highp float; varying vec3 vWorld; varying vec3 vNormal; varying float vUp;
uniform vec3 eye; uniform float glow; uniform vec3 tint;
void main(){vec3 v=normalize(eye-vWorld);float edge=abs(dot(normalize(vNormal),v));
  float a=pow(edge,2.5)*(1.-.75*vUp)*glow*.3;
  gl_FragColor=vec4(vec3(1.,.8,.5)*tint,clamp(a,0.,1.));}`;

function additive(scene: Scene, name: string, vertex: string, fragment: string, attributes: string[], uniforms: string[]): ShaderMaterial {
  const m = new ShaderMaterial(name, scene, { vertexSource: vertex, fragmentSource: fragment },
    { attributes, uniforms, needAlphaBlending: true });
  m.alphaMode = Constants.ALPHA_ADD;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.depthFunction = Constants.LEQUAL;
  m.setFloat("glow", 0);
  m.setColor3("tint", new Color3(1, 1, 1));
  return m;
}
/** The hub's additive flare (a billboard plane's material): a strong source that
 * reads through murk; `glow` 0..1 sets it, `tint` recolours it (SIG-1's sonar). */
export const flareMaterial = (scene: Scene, name: string): ShaderMaterial =>
  additive(scene, name, FLARE_VERTEX, FLARE_FRAGMENT, ["position", "uv"], ["worldViewProjection", "glow", "tint"]);
/** The hub shaft's additive rim glow: edges facing across the view light up. */
export const rimGlowMaterial = (scene: Scene, name: string): ShaderMaterial =>
  additive(scene, name, SHAFT_VERTEX, SHAFT_FRAGMENT, ["position", "normal"], ["world", "worldViewProjection", "eye", "glow", "tint"]);

export function createHubArt(scene: Scene, cel: Material): HubArt {
  const root = new TransformNode("hub", scene);
  // --- Beacon flare and shaft ---------------------------------------------------
  const flare = CreatePlane("hub.beacon.flare", { size: 1 }, scene);
  flare.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const beaconFlare = flareMaterial(scene, "hub.beacon.flare");
  flare.material = beaconFlare; flare.isPickable = false; flare.parent = root;
  const shaftMaterial = rimGlowMaterial(scene, "hub.beacon.shaft");
  const shaftTop = -1.5, shaftHeight = shaftTop - BEACON.y;
  const shaft = CreateCylinder("hub.beacon.shaft", { height: 1, diameterBottom: 2.2, diameterTop: 10, tessellation: 16, cap: Mesh.NO_CAP }, scene);
  shaft.scaling.set(1, shaftHeight, 1);
  shaft.position.set(BEACON.x, BEACON.y + shaftHeight / 2, BEACON.z);
  shaft.material = shaftMaterial; shaft.isPickable = false; shaft.parent = root;
  // --- The surface mast's lamp (HUB-2): the hub seen above water from the
  // starting island. Hub art is created once and never streamed, and past the
  // far plane the flare is an impostor on the line of sight, so it shows at
  // the island lookout's 765 m.
  const lampMaterial = flareMaterial(scene, "hub.mast.flare");
  const lamp = CreatePlane("hub.mast.flare", { size: 1 }, scene);
  lamp.billboardMode = Mesh.BILLBOARDMODE_ALL;
  lamp.material = lampMaterial; lamp.isPickable = false; lamp.parent = root;
  // --- Crown rays ------------------------------------------------------------------
  const rays = Array.from({ length: CROWN_RAY_COUNT }, (_, i) => createCrownRay(scene, cel, `creature.crown_rays.${i}`, root));
  const meshes = [flare, shaft, lamp, ...rays.flatMap(r => r.meshes)];
  for (const m of meshes) m.renderingGroupId = 1;
  const eye = new Vector3();
  let disposed = false;
  return {
    root, meshes,
    update(seconds, camera) {
      if (disposed) return;
      const dx = BEACON.x - camera.x, dy = BEACON.y - camera.y, dz = BEACON.z - camera.z, d = Math.hypot(dx, dy, dz);
      const glow = beaconGlow(d, seconds);
      flare.setEnabled(glow > 0.004);
      if (glow > 0.004) {
        // Drawn in front of the lamp room by more than the house's radius, so
        // the house wall never hides the core; past the far plane, an impostor.
        const along = Math.max(0.5, Math.min(d, IMPOSTOR) - LAMP_CLEAR), k = along / d;
        flare.position.set(camera.x + dx * k, camera.y + dy * k, camera.z + dz * k);
        const size = beaconSize(d) * k;
        flare.scaling.set(size, size, size);
        beaconFlare.setFloat("glow", glow);
      }
      {
        const lx = MAST_LAMP.x - camera.x, ly = MAST_LAMP.y - camera.y, lz = MAST_LAMP.z - camera.z, ld = Math.hypot(lx, ly, lz);
        const g = mastLampGlow(ld, seconds, camera.y < 0);
        lamp.setEnabled(g > 0.004);
        if (g > 0.004) {
          const along = Math.max(0.5, Math.min(ld, IMPOSTOR) - 1.5), k = along / ld;
          lamp.position.set(camera.x + lx * k, camera.y + ly * k, camera.z + lz * k);
          const size = beaconSize(ld) * 0.8 * k;
          lamp.scaling.set(size, size, size);
          lampMaterial.setFloat("glow", g);
        }
      }
      // The shaft is for distance: faint beside the house, full from about
      // 90 m, and gone before the far plane (it has no impostor).
      const shaftGlow = beaconGlow(d, seconds) * smoothstep(25, 90, d) * (1 - smoothstep(330, 420, d)) * 1.6;
      shaft.setEnabled(shaftGlow > 0.004);
      shaftMaterial.setFloat("glow", shaftGlow);
      shaftMaterial.setVector3("eye", eye.set(camera.x, camera.y, camera.z));
      const poses = crownRayPoses(seconds);
      rays.forEach((ray, i) => {
        const p = poses[i]!, near = Math.hypot(p.position.x - camera.x, p.position.y - camera.y, p.position.z - camera.z) < RAY_CULL;
        ray.root.setEnabled(near);
        if (near) ray.pose(p.position, p.yaw, p.roll, p.beat, p.scale);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const r of rays) r.dispose();
      beaconFlare.dispose(); shaftMaterial.dispose(); lampMaterial.dispose();
      root.dispose(false, false);
    },
  };
}

interface CrownRay {
  readonly root: TransformNode;
  readonly meshes: readonly Mesh[];
  pose(at: Vec3, yaw: number, roll: number, beat: number, scale: number): void;
  dispose(): void;
}

/** A crown ray: a broad, slow manta-like ray, pale-bellied, with a row of
 * faint spots under each wing that catch a lamp. Benign; it never reacts. */
function createCrownRay(scene: Scene, cel: Material, name: string, parent: TransformNode): CrownRay {
  const parts = creatureParts(scene, cel, name, parent);
  const half = CROWN_RAY_SPAN / 2, chord = 3.4;
  const body = parts.part("body", b => {
    b.ellipsoid([0, 0, 0], [1.5, 0.5, 2.6], "#27525e", 10);
    b.ellipsoid([0, -0.18, -0.1], [1.3, 0.3, 2.2], P.shell, 9);
    for (const side of [-1, 1]) {
      // Cephalic lobes, the manta's silhouette at the front.
      b.tube([[side * 0.7, 0, -2.3], [side * 0.85, -0.15, -3.1]], 0.16, "#27525e", 5);
      b.ellipsoid([side * 0.95, 0.15, -1.9], [0.12, 0.1, 0.12], P.ink, 6);
    }
    b.tube([[0, 0.05, 2.4], [0, 0.1, 4.6], [0, 0.2, 7.2]], 0.08, P.petrol, 5);
  });
  const wings: { hinge: TransformNode; tip: TransformNode; side: number }[] = [];
  const meshes: Mesh[] = [body];
  for (const side of [-1, 1]) {
    const hinge = parts.node(`wing.${side}`);
    hinge.position.set(side * 1.3, 0, 0);
    const inner = parts.part(`wing.${side}.inner`, b => {
      const w = half * 0.55;
      b.face([[0, 0, -chord / 2], [side * w, 0.05, -chord * 0.15], [side * w, 0.02, chord * 0.55], [0, 0, chord / 2]], "#2c5d69");
      b.face([[0, -0.03, -chord / 2], [side * w, -0.03, -chord * 0.15], [side * w, -0.03, chord * 0.55], [0, -0.03, chord / 2]], P.shell);
      for (const t of [0.3, 0.55, 0.8]) b.glow(b.ellipsoid([side * w * t, -0.06, 0.2], [0.18, 0.03, 0.18], P.mint, 6));
    }, hinge);
    const tip = parts.node(`wing.${side}.tip`, hinge);
    tip.position.set(side * half * 0.55, 0, 0);
    const outer = parts.part(`wing.${side}.outer`, b => {
      const w = half * 0.45;
      b.face([[0, 0.05, -chord * 0.15], [side * w, 0.15, chord * 0.55], [0, 0.02, chord * 0.55]], "#336b76");
      b.face([[0, -0.02, -chord * 0.15], [side * w, 0.12, chord * 0.55], [0, -0.01, chord * 0.55]], P.shell);
      b.tube([[0, 0.05, -chord * 0.15], [side * w, 0.15, chord * 0.55]], 0.05, P.mint, 4);
    }, tip);
    wings.push({ hinge, tip, side });
    meshes.push(inner, outer);
  }
  return {
    root: parts.root, meshes,
    pose(at, yaw, roll, beat, scale) {
      parts.root.position.set(at.x, at.y, at.z);
      parts.root.rotation.set(0, -yaw, roll);
      parts.root.scaling.set(scale, scale, scale);
      const flap = Math.sin(beat * Math.PI * 2);
      body.rotation.set(0.04 * flap, 0, 0);
      for (const w of wings) {
        w.hinge.rotation.set(0, 0, w.side * 0.32 * flap);
        w.tip.rotation.set(0, 0, w.side * 0.28 * Math.sin(beat * Math.PI * 2 - 0.9));
      }
    },
    dispose: () => parts.dispose(),
  };
}
