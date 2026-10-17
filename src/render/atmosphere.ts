import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import type { Scene } from '@babylonjs/core';

export function createAtmosphere(scene: Scene): { water: ShaderMaterial; sky: ShaderMaterial } {
  const sky = CreateSphere('atmosphere.sky', { diameter: 800, segments: 16 }, scene);
  sky.infiniteDistance = true; sky.isPickable = false; sky.renderingGroupId = 0;
  const skyMaterial = new ShaderMaterial('atmosphere.sky', scene, {
    vertexSource: `precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 vDirection;
      void main(){ vDirection=position; gl_Position=worldViewProjection*vec4(position,1.0); }`,
    fragmentSource: `precision highp float; varying vec3 vDirection; uniform float underwater;
      void main(){vec3 d=normalize(vDirection); float altitude=smoothstep(-.08,.8,d.y);
      vec3 sky=mix(vec3(.78,.85,.72),vec3(.22,.57,.64),altitude);
      float sun=dot(d,normalize(vec3(-.42,.45,-.68))); sky+=vec3(.22,.12,.01)*pow(max(0.0,sun),16.0);
      float disc=smoothstep(.9992,.9996,sun); sky=mix(sky,vec3(1.0,.94,.71),disc);
      float cloud=sin(d.x*20.0+d.z*8.0+sin(d.z*15.0))*sin(d.z*26.0-d.x*8.0);
      float veil=smoothstep(.55,.85,cloud)*smoothstep(.01,.17,d.y)*(1.0-smoothstep(.22,.5,d.y));
      sky=mix(sky,vec3(.85,.89,.79),veil*.32);
      sky=mix(sky,vec3(.133,.431,.494),underwater*(1.0-smoothstep(0.0,.35,d.y)));
      gl_FragColor=vec4(sky,1.0); }`,
  }, { attributes: ['position'], uniforms: ['worldViewProjection', 'underwater'] });
  skyMaterial.setFloat('underwater', 0);
  skyMaterial.backFaceCulling = false; skyMaterial.disableDepthWrite = true;
  sky.material = skyMaterial;

  const waterMesh = CreateGround('ocean.waterline', { width: 680, height: 680 }, scene);
  const water = new ShaderMaterial('ocean.water', scene, {
    vertexSource: `precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; uniform mat4 world; varying vec3 vWorld;
      void main(){vWorld=(world*vec4(position,1.0)).xyz; gl_Position=worldViewProjection*vec4(position,1.0);}`,
    fragmentSource: `precision highp float; varying vec3 vWorld; uniform float time; uniform vec3 cameraPosition;
      void main(){ vec3 view=normalize(cameraPosition-vWorld); float fresnel=pow(1.0-abs(view.y),3.0);
      float wave=sin(vWorld.x*1.12+vWorld.z*.27+time*.5+sin(vWorld.z*.51-time*.17)*.5);
      float line=smoothstep(.965,.995,wave); float far=1.0-exp(-length(cameraPosition-vWorld)*.012);
      vec3 color=mix(vec3(.19,.60,.61),vec3(.67,.80,.67),fresnel*.65+far*.25);
      color=mix(color,vec3(.17,.49,.55)+vec3(.06,.07,.04)*(1.0-fresnel),step(cameraPosition.y,0.0)*.7);
      color+=vec3(.14,.16,.12)*line*(1.0-far);
      gl_FragColor=vec4(color,.36+fresnel*.48+far*.15); }`,
  }, { attributes: ['position'], uniforms: ['world', 'worldViewProjection', 'time', 'cameraPosition'], needAlphaBlending: true });
  water.backFaceCulling = false; water.setFloat('time', 0);
  waterMesh.material = water; waterMesh.isPickable = false; waterMesh.renderingGroupId = 1;
  return { water, sky: skyMaterial };
}
