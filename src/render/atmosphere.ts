import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import type { Scene } from "@babylonjs/core";
import { opticalShader, opticalUniforms } from "./materials.js";

// The same directional light and optical path serve the sky and the underside
// of the water. Deep rays reach the surface through water, even from a dry room.
const skyColor = `
vec3 skyRadiance(vec3 d){
  float altitude=smoothstep(-.08,.8,d.y);
  vec3 sky=mix(vec3(.78,.85,.72),vec3(.22,.57,.64),altitude);
  float sun=dot(d,normalize(vec3(-.42,.45,-.68)));
  sky+=vec3(.22,.12,.01)*pow(max(0.0,sun),16.0);
  sky=mix(sky,vec3(1.0,.94,.71),smoothstep(.9992,.9996,sun));
  float cloud=sin(d.x*20.0+d.z*8.0+sin(d.z*15.0))*sin(d.z*26.0-d.x*8.0);
  float veil=smoothstep(.55,.85,cloud)*smoothstep(.01,.17,d.y)*(1.0-smoothstep(.22,.5,d.y));
  return mix(sky,vec3(.85,.89,.79),veil*.32);
}
`;

export function createAtmosphere(scene: Scene): { water: ShaderMaterial; sky: ShaderMaterial } {
  const sky = CreateSphere("atmosphere.sky", { diameter: 800, segments: 16 }, scene);
  sky.infiniteDistance = true; sky.isPickable = false; sky.renderingGroupId = 0;
  const skyMaterial = new ShaderMaterial("atmosphere.sky", scene, {
    vertexSource: `precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 vDirection;
      void main(){vDirection=position;gl_Position=worldViewProjection*vec4(position,1.0);}`,
    fragmentSource: `precision highp float; varying vec3 vDirection;
      ${opticalShader}
      ${skyColor}
      void main(){
        vec3 d=normalize(vDirection);
        float wet=waterPath(cameraPosition,cameraPosition+d*2000.0);
        vec3 sky=mix(skyRadiance(d),waterFogColor,1.0-exp(-wet*fogDensity));
        gl_FragColor=vec4(sky,1.0);
      }`,
  }, { attributes: ["position"], uniforms: ["worldViewProjection", ...opticalUniforms] });
  skyMaterial.backFaceCulling = false; skyMaterial.disableDepthWrite = true;
  sky.material = skyMaterial;

  // Beyond the camera's 450 m far plane in every horizontal direction. Follow
  // X/Z only; Y=0 remains the real waterline. No finite patch edge enters view.
  const waterMesh = CreateGround("ocean.waterline", { width: 2048, height: 2048 }, scene);
  scene.onBeforeRenderObservable.add(() => {
    if (!scene.activeCamera) return;
    waterMesh.position.x = scene.activeCamera.position.x;
    waterMesh.position.z = scene.activeCamera.position.z;
  });
  const water = new ShaderMaterial("ocean.water", scene, {
    vertexSource: `precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; uniform mat4 world; varying vec3 vWorld;
      void main(){vWorld=(world*vec4(position,1.0)).xyz;gl_Position=worldViewProjection*vec4(position,1.0);}`,
    fragmentSource: `precision highp float; varying vec3 vWorld; uniform float time;
      ${opticalShader}
      ${skyColor}
      void main(){
        vec3 local=carrierLocal(vWorld);
        if(carrierPresent>.5&&all(greaterThan(local,carrierAirMin))&&all(lessThan(local,carrierAirMax)))discard;
        vec3 ray=normalize(vWorld-cameraPosition);
        float fresnel=pow(1.0-abs(ray.y),3.0);
        float wave=sin(vWorld.x*1.12+vWorld.z*.27+time*.5+sin(vWorld.z*.51-time*.17)*.5);
        float line=smoothstep(.965,.995,wave);
        float distance=length(cameraPosition-vWorld),far=1.0-exp(-distance*.012);
        vec3 color=mix(vec3(.19,.60,.61),vec3(.67,.80,.67),fresnel*.65+far*.25);
        if(cameraPosition.y<0.0)color=mix(skyRadiance(ray),vec3(.17,.49,.55),.42);
        color+=vec3(.14,.16,.12)*line*(1.0-far);
        gl_FragColor=vec4(opticalFog(color,vWorld),.36+fresnel*.48+far*.15);
      }`,
  }, { attributes: ["position"], uniforms: ["world", "worldViewProjection", "time", ...opticalUniforms], needAlphaBlending: true });
  water.backFaceCulling = false; water.disableDepthWrite = true; water.setFloat("time", 0);
  waterMesh.material = water; waterMesh.isPickable = false; waterMesh.renderingGroupId = 1;
  waterMesh.alphaIndex = 0;
  return { water, sky: skyMaterial };
}
