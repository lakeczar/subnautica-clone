import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core';

const vertex = `
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec4 color;
uniform mat4 world; uniform mat4 worldViewProjection;
varying vec3 vWorld; varying vec3 vNormal; varying vec4 vColor;
void main(){
  vWorld=(world*vec4(position,1.0)).xyz;
  vNormal=normalize(mat3(world)*normal); vColor=color;
  gl_Position=worldViewProjection*vec4(position,1.0);
}`;

const fragment = `
precision highp float;
varying vec3 vWorld; varying vec3 vNormal; varying vec4 vColor;
uniform vec3 cameraPosition; uniform vec3 fogColor; uniform vec3 lightDirection;
uniform float fogDensity; uniform float time; uniform float underwater;
void main(){
  vec3 n=normalize(vNormal); float d=dot(n,normalize(lightDirection));
  float band=d>.66?1.09:(d>.12?.91:(d>-.32?.72:.53));
  vec3 temperature=mix(vec3(.66,.85,1.02),vec3(1.07,1.035,.9),smoothstep(-.12,.75,d));
  vec3 shade=vColor.rgb*band*temperature;
  float rim=pow(1.0-max(0.0,dot(n,normalize(cameraPosition-vWorld))),3.0);
  shade+=vec3(.026,.067,.071)*rim;
  float wx=vWorld.x*.82+sin(vWorld.z*.49+time*.2)*.9+time*.15;
  float wz=vWorld.z*.93+sin(vWorld.x*.44-time*.15)*.7;
  float net=1.0-smoothstep(.012,.09,abs(sin(wx)*sin(wz)));
  float caustic=net*smoothstep(.45,.95,n.y)*(1.0-smoothstep(-.8,-.1,vWorld.y));
  shade+=vec3(.06,.10,.055)*caustic*underwater;
  float distance=length(cameraPosition-vWorld);
  float density=mix(fogDensity*.27,fogDensity,underwater);
  float haze=1.0-exp(-distance*density);
  shade=mix(shade,fogColor,clamp(haze,0.0,.97));
  gl_FragColor=vec4(shade,1.0);
}`;

export function createCelMaterial(scene: Scene): ShaderMaterial {
  const material = new ShaderMaterial('siltwake.cel', scene, { vertexSource: vertex, fragmentSource: fragment }, {
    attributes: ['position', 'normal', 'color'],
    uniforms: ['world', 'worldViewProjection', 'cameraPosition', 'fogColor', 'lightDirection', 'fogDensity', 'time', 'underwater'],
  });
  material.backFaceCulling = false;
  material.setVector3('lightDirection', new Vector3(-0.42, 0.85, -0.3));
  material.setColor3('fogColor', Color3.FromHexString('#70bdb5'));
  material.setFloat('fogDensity', 0.027);
  material.setFloat('time', 0);
  material.setFloat('underwater', 0);
  material.setVector3('cameraPosition', Vector3.Zero());
  return material;
}
