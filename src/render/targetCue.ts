import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { InteractionHost } from "../sim/targeting.js";
import type { Vec3 } from "../sim/types.js";
import { opticalShader, opticalUniforms } from "./materials.js";

/** One retained, depth-tested and normally fogged set of quiet host brackets. */
export function createTargetCue(scene: Scene) {
  const mesh = new Mesh("interaction.cue", scene);
  const data = new VertexData();
  const positions: number[] = [], indices: number[] = [], colors: number[] = [];
  const quad = (x: number, y: number, w: number, h: number, core: number): void => {
    const n = positions.length / 3;
    positions.push(x, y, 0, x + w, y, 0, x + w, y + h, 0, x, y + h, 0);
    indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
    for (let i = 0; i < 4; i++) colors.push(core, core, core, 1);
  };
  for (const core of [0, 1]) for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const pad = core ? 0 : 0.035;
    // Ink and core share a single retained buffer. Move the core slightly
    // toward the eye to avoid coplanar fragments without clearing scene depth.
    const start = positions.length;
    quad((x < 0 ? -1 : 0.54) - pad, (y < 0 ? -1 : 0.95) - pad, 0.46 + 2 * pad, 0.05 + 2 * pad, core);
    quad((x < 0 ? -1 : 0.95) - pad, (y < 0 ? -1 : 0.54) - pad, 0.05 + 2 * pad, 0.46 + 2 * pad, core);
    if (core) for (let i = start + 2; i < positions.length; i += 3) positions[i] = -0.001;
  }
  data.positions = positions;
  data.indices = indices;
  data.colors = colors;
  data.applyToMesh(mesh);
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;
  const material = new ShaderMaterial("interaction.cue", scene, {
    vertexSource: `precision highp float; attribute vec3 position; attribute vec4 color;
      uniform mat4 world; uniform mat4 worldViewProjection; varying vec3 vWorld; varying float vCore;
      void main(){vCore=color.r;vWorld=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}`,
    fragmentSource: `precision highp float; varying vec3 vWorld; varying float vCore; uniform float emphasis;
      ${opticalShader}
      void main(){vec3 ink=vec3(.035,.09,.10);vec3 light=vec3(.98,.97,.88);
        gl_FragColor=vec4(opticalFog(mix(ink,light,vCore*emphasis),vWorld),1.);}`,
  }, { attributes: ["position", "color"], uniforms: ["world", "worldViewProjection", "emphasis", ...opticalUniforms] });
  material.setFloat("emphasis", 1);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.depthFunction = Constants.LEQUAL;
  mesh.material = material;
  mesh.setEnabled(false);
  let disposed = false;
  return {
    material,
    update(host: InteractionHost | null, eye?: Vec3, executable = true): void {
      if (disposed) return;
      material.setFloat("emphasis", executable ? 1 : 0.42);
      const valid = host && [host.center.x, host.center.y, host.center.z, host.radius].every(Number.isFinite) && host.radius > 0;
      mesh.setEnabled(!!valid);
      if (!host || !valid) return;
      mesh.position.set(host.center.x, host.center.y, host.center.z);
      let scale = Math.min(0.42, host.radius * 0.3);
      if (eye) {
        const x = eye.x - host.center.x, y = eye.y - host.center.y, z = eye.z - host.center.z;
        const distance = Math.hypot(x, y, z);
        if (Number.isFinite(distance) && distance > 1e-6) {
          // Keep the cue on the near side of its host rather than buried in
          // the host mesh. It still uses the ordinary scene depth buffer.
          const offset = Math.min(host.radius * 0.9, distance * 0.5);
          mesh.position.addInPlaceFromFloats(x * offset / distance, y * offset / distance, z * offset / distance);
          scale = Math.min(scale, (distance - offset) * 0.07);
        }
      }
      mesh.scaling.setAll(Math.max(0.02, scale));
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      mesh.dispose();
      material.dispose();
    },
  };
}
