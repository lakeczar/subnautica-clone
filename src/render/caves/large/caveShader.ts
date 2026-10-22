import { LAMP_SKIN, LAMP_WALK_STEPS } from "../lightField.js";
import { DEFAULT_LAMP, type LampSettings } from "../caveLight.js";

/** Cave-biome light for the cel pass (Babylon-free GLSL), extending W1.
 *
 * W1 lights one small cave from a 3D light field. A 250 m biome bakes its
 * light per vertex instead (`caveLight`: daylight through water from the
 * openings, and life's glow through water), so every chunk carries its own
 * light and nothing is sampled across rock:
 * - lit colour falls with that daylight in soft cel steps to a floor, and
 *   glow adds the life's colour onto the rock it reaches;
 * - the fog medium darkens with the fragment's own daylight and takes the
 *   viewer's zone tint, so the cave reads dark while an exit seen from inside
 *   keeps its bright water;
 * - the lamp is W1's: a banded cone stopped by any rock voxel its ray
 *   crosses past the surface skin (the same unfiltered DDA as
 *   `lampVisible`), over a 64 m window of exact occupancy round the lamp;
 * - unlit colour (alpha -1: life, colonies) stays unlit.
 * `injectLargeCaveLight` splices this into the production cel stages and
 * throws when an anchor moved. Fragments with no cave light (exterior art in
 * the same material) read full daylight and change nothing. */

export const LARGE_CAVE_UNIFORMS = [
  "caveCurve", "caveTint", "caveRockMin", "caveRockVoxel", "caveRockDims", "caveRockOn",
  "lampPosition", "lampDirection", "lampParams", "lampColor",
] as const;
export const LARGE_CAVE_SAMPLERS = ["caveRock"] as const;
export const LARGE_CAVE_ATTRIBUTE = "caveLight";

/** `caveCurve`: lit floor, fog floor, posterise mix, glow gain. */
export const CAVE_CURVE: readonly [number, number, number, number] = [0.05, 0.08, 0.6, 1.25];
export { DEFAULT_LAMP, type LampSettings };
export function lampUniform(on: boolean, lamp: LampSettings = DEFAULT_LAMP): [number, number, number, number] {
  const rad = Math.PI / 180;
  return [on ? 1 : 0, lamp.range, Math.cos(lamp.outer * rad), Math.cos(lamp.inner * rad)];
}

const FRAGMENT_HEAD = `
varying vec4 vCaveLight;
uniform vec4 caveCurve; uniform vec4 caveTint;
uniform highp sampler3D caveRock; uniform vec3 caveRockMin; uniform float caveRockVoxel; uniform vec3 caveRockDims; uniform float caveRockOn;
uniform vec3 lampPosition; uniform vec3 lampDirection; uniform vec4 lampParams; uniform vec3 lampColor;
float caveLit(float day){
  float lit=caveCurve.x+(1.0-caveCurve.x)*day;
  float q=max(caveCurve.x,floor(lit*5.0+.35)/5.0);
  return mix(lit,q,caveCurve.z);
}
// 1 when no rock voxel lies on p->lamp past the surface skin (W1's walk).
float lampVisible(vec3 p,vec3 lamp){
  if(caveRockOn<.5)return 1.0;
  vec3 a=(p-caveRockMin)/caveRockVoxel,d=(lamp-caveRockMin)/caveRockVoxel-a;
  float len=length(d)*caveRockVoxel;
  if(len<1e-6)return 1.0;
  float tSkip=${LAMP_SKIN.toFixed(2)}/len,tEnter=0.0;
  vec3 cell=floor(a),stp=sign(d);
  vec3 tDelta=vec3(d.x!=0.0?abs(1.0/d.x):1e30,d.y!=0.0?abs(1.0/d.y):1e30,d.z!=0.0?abs(1.0/d.z):1e30);
  vec3 tMax=vec3(d.x!=0.0?(cell.x+(d.x>0.0?1.0:0.0)-a.x)/d.x:1e30,d.y!=0.0?(cell.y+(d.y>0.0?1.0:0.0)-a.y)/d.y:1e30,
    d.z!=0.0?(cell.z+(d.z>0.0?1.0:0.0)-a.z)/d.z:1e30);
  for(int i=0;i<${LAMP_WALK_STEPS};i++){
    if(tEnter>1.0)return 1.0;
    float tExit=min(tMax.x,min(tMax.y,tMax.z));
    if(tExit>tSkip&&all(greaterThanEqual(cell,vec3(0.0)))&&all(lessThan(cell,caveRockDims))&&
      texelFetch(caveRock,ivec3(cell),0).r>.5)return 0.0;
    if(tMax.x<=tMax.y&&tMax.x<=tMax.z){cell.x+=stp.x;tEnter=tMax.x;tMax.x+=tDelta.x;}
    else if(tMax.y<=tMax.z){cell.y+=stp.y;tEnter=tMax.y;tMax.y+=tDelta.y;}
    else{cell.z+=stp.z;tEnter=tMax.z;tMax.z+=tDelta.z;}
  }
  return 0.0;
}
vec3 caveLamp(vec3 p,vec3 n,vec3 albedo){
  if(lampParams.x<.5)return vec3(0.0);
  vec3 l=lampPosition-p; float dist=length(l);
  if(dist>lampParams.y||dist<.001)return vec3(0.0);
  l/=dist;
  float cone=smoothstep(lampParams.z,lampParams.w,dot(-l,lampDirection));
  if(cone<=0.0)return vec3(0.0);
  float lam=dot(n,l);
  float band=lam>.55?1.0:(lam>.2?.72:(lam>0.0?.42:0.0));
  if(band==0.0)return vec3(0.0);
  float fall=1.0-dist/lampParams.y;
  float ring=fall>.55?1.0:(fall>.25?.66:.36*smoothstep(0.0,.08,fall));
  float edge=mix(.5,1.0,smoothstep(.45,.6,cone))*smoothstep(0.0,.3,cone);
  return albedo*lampColor*band*ring*edge*lampVisible(p+n*.3,lampPosition);
}
`;

/** Each anchor in the production cel stages and what goes there. */
const FRAGMENT_ANCHORS: readonly { readonly at: string; readonly mode: "before" | "replace"; readonly code: string }[] = [
  { at: "void main(){", mode: "before", code: FRAGMENT_HEAD },
  { at: "shade=mix(shade,vColor.rgb*1.12,step(vColor.a,-.5));", mode: "before",
    code: "float cDay=vCaveLight.x,cLit=caveLit(cDay);\n  shade=shade*cLit+vColor.rgb*vCaveLight.yzw*caveCurve.w+caveLamp(vWorld,n,vColor.rgb)*(1.0-.78*cLit);\n  " },
  { at: "gl_FragColor=vec4(opticalFog(shade,vWorld),1.0);", mode: "replace",
    code: `vec3 fogged=opticalFog(shade,vWorld),medium=opticalFog(vec3(0.0),vWorld);
  float m=caveCurve.y+(1.0-caveCurve.y)*cDay;
  vec3 v=vWorld-cameraPosition; float vd=length(v);
  float beam=lampParams.x*smoothstep(lampParams.z,1.0,dot(v/max(vd,.001),lampDirection))*(1.0-exp(-vd*.06))*caveTint.w*.2;
  gl_FragColor=vec4(fogged-medium+medium*m*mix(vec3(1.0),caveTint.rgb,(1.0-cDay))+lampColor*beam,1.0);` },
];
const VERTEX_ANCHORS: typeof FRAGMENT_ANCHORS = [
  { at: "varying vec3 vWorld; varying vec3 vNormal; varying vec4 vColor;", mode: "before", code: "attribute vec4 caveLight; varying vec4 vCaveLight;\n" },
  { at: "vColor=color;", mode: "before", code: "vCaveLight=caveLight;\n  " },
];

function splice(source: string, anchors: typeof FRAGMENT_ANCHORS, what: string): string {
  let out = source;
  for (const a of anchors) {
    const first = out.indexOf(a.at);
    if (first < 0 || out.indexOf(a.at, first + 1) >= 0)
      throw new Error(`large cave light: ${what} anchor ${first < 0 ? "missing" : "repeated"}: ${a.at}`);
    out = a.mode === "before" ? out.slice(0, first) + a.code + out.slice(first) : out.slice(0, first) + a.code + out.slice(first + a.at.length);
  }
  return out;
}
/** The production cel stages with cave-biome light spliced in. */
export function injectLargeCaveLight(vertex: string, fragment: string): { vertex: string; fragment: string } {
  return { vertex: splice(vertex, VERTEX_ANCHORS, "vertex"), fragment: splice(fragment, FRAGMENT_ANCHORS, "fragment") };
}
export const LARGE_CAVE_ANCHORS = [...VERTEX_ANCHORS, ...FRAGMENT_ANCHORS].map(a => a.at);
