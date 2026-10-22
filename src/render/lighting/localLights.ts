/** Local lights (ATM-1, Babylon-free). The world's emissive art (vertex alpha
 * -1: lamps, lit windows, vents, bulbs, colonies, creature glows) is turned
 * into cheap point lights for the cel pass, so in the dark it lights what is
 * around it. Faintly luminous art (alpha -0.3: Divide crystals) gives a
 * weaker light. Each frame the renderer sends the few that matter most. */

export type Vec3Like = { readonly x: number; readonly y: number; readonly z: number };

/** Vertex alpha at or below this is unlit ("glow"). */
export const UNLIT_ALPHA = -0.5;
/** Vertex alpha in (UNLIT_ALPHA, FAINT_ALPHA] is faintly luminous. */
export const FAINT_ALPHA = -0.1;
/** Cluster cell, metres: emissive vertices in one cell make one light. */
export const CLUSTER_CELL = 4;

export interface LightCluster {
  /** Centre in the mesh's local space. */
  readonly x: number; readonly y: number; readonly z: number;
  /** Linear colour, 0..1. */
  readonly r: number; readonly g: number; readonly b: number;
  /** Largest extent of the cluster's emissive vertices, metres. */
  readonly extent: number;
  /** True when built from faintly luminous vertices. */
  readonly faint: boolean;
}

/** Group a mesh's emissive vertices into lights, in its local space.
 * `positions` xyz and `colors` rgba per vertex, as the cel meshes carry them. */
export function clusterEmissive(positions: ArrayLike<number>, colors: ArrayLike<number>, cell = CLUSTER_CELL): LightCluster[] {
  const job = emissiveScan(positions, colors, cell);
  while (!job.step(Infinity)) { /* whole mesh at once */ }
  return job.clusters();
}

/** `clusterEmissive` resumable (CW-1): a streamed chunk can carry hundreds of
 * thousands of vertices, so the scene lights scan it a slice at a time;
 * `step(vertices)` reads at most that many and reports whether it is done.
 * The clusters are the same as in one pass. */
export function emissiveScan(positions: ArrayLike<number>, colors: ArrayLike<number>, cell = CLUSTER_CELL) {
  const cells = new Map<string, { n: number; x: number; y: number; z: number; r: number; g: number; b: number;
    lo: [number, number, number]; hi: [number, number, number]; faint: boolean }>();
  const count = Math.min(positions.length / 3, colors.length / 4);
  let next = 0;
  const clusters = (): LightCluster[] => [...cells.values()].map(c => ({
    x: c.x / c.n, y: c.y / c.n, z: c.z / c.n, r: c.r / c.n, g: c.g / c.n, b: c.b / c.n,
    extent: Math.max(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]), faint: c.faint,
  }));
  const step = (vertices: number): boolean => {
  const end = Math.min(count, next + vertices);
  for (let i = next; i < end; i++) {
    const a = colors[i * 4 + 3]!;
    if (!(a <= FAINT_ALPHA)) continue;
    const faint = a > UNLIT_ALPHA;
    const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
    const key = `${faint ? "f" : "u"}${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    let c = cells.get(key);
    if (!c) cells.set(key, c = { n: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, lo: [x, y, z], hi: [x, y, z], faint });
    c.n++; c.x += x; c.y += y; c.z += z;
    c.r += colors[i * 4]!; c.g += colors[i * 4 + 1]!; c.b += colors[i * 4 + 2]!;
    c.lo = [Math.min(c.lo[0], x), Math.min(c.lo[1], y), Math.min(c.lo[2], z)];
    c.hi = [Math.max(c.hi[0], x), Math.max(c.hi[1], y), Math.max(c.hi[2], z)];
  }
  next = end;
  return next >= count;
  };
  return { step, clusters };
}

/** A light in world space as the shader takes it. */
export interface PointLight {
  readonly x: number; readonly y: number; readonly z: number;
  /** Reach, metres: no light past it. */
  readonly radius: number;
  readonly r: number; readonly g: number; readonly b: number;
  /** Multiplies the colour. */
  readonly strength: number;
  /** Always sent, before every other light (instrument and marker lights). */
  readonly reserved?: boolean;
  /** No halo in the water (a light inside the pilot's own compartment). */
  readonly noHalo?: boolean;
}

/** Reach and strength from a cluster's size: a creature's eye is a faint
 * spark, a lantern lights a few metres, a lit window wall lights a street. */
export function lightFromCluster(c: LightCluster, attached = false): Omit<PointLight, "x" | "y" | "z"> {
  const radius = Math.min(18, Math.max(2, 2 + c.extent * 7)) * (c.faint ? 0.45 : 1);
  const strength = Math.min(1, 0.22 + c.extent * 0.7) * (c.faint ? 0.35 : 1) * (attached ? 0.45 : 1);
  // Glow colours are pale; lights carry their hue a little more strongly.
  const peak = Math.max(c.r, c.g, c.b, 1e-3), k = 0.35;
  return { radius, strength, r: (c.r / peak) * (1 - k) + (c.r / peak) ** 2 * k,
    g: (c.g / peak) * (1 - k) + (c.g / peak) ** 2 * k, b: (c.b / peak) * (1 - k) + (c.b / peak) ** 2 * k };
}

/** How much a light can matter to the view from `eye`: big and close first. */
export function lightScore(l: PointLight, eye: Vec3Like): number {
  const d = Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z);
  return (l.strength * l.radius) / Math.max(1, d - l.radius * 0.5);
}

/** Lights further than this from the eye are never sent. */
export const LIGHT_RANGE = 200;
/** Slots in the shader. */
export const MAX_LIGHTS = 12;

/** The lights to send this frame: every reserved light (up to the slot
 * count), then the best-scoring others within `LIGHT_RANGE`. Lights near the
 * range edge fade out, so leaving range never pops. */
export function selectLights(lights: Iterable<PointLight>, eye: Vec3Like, slots = MAX_LIGHTS): PointLight[] {
  const reserved: PointLight[] = [], scored: { l: PointLight; s: number }[] = [];
  for (const l of lights) {
    if (l.reserved) { if (reserved.length < slots) reserved.push(l); continue; }
    const d = Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z);
    if (d - l.radius > LIGHT_RANGE) continue;
    scored.push({ l, s: lightScore(l, eye) });
  }
  scored.sort((a, b) => b.s - a.s);
  const out = [...reserved];
  for (const { l } of scored) {
    if (out.length >= slots) break;
    const d = Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z);
    const fade = 1 - Math.max(0, Math.min(1, (d - l.radius - LIGHT_RANGE * 0.75) / (LIGHT_RANGE * 0.25)));
    out.push(fade < 1 ? { ...l, strength: l.strength * fade } : l);
  }
  return out;
}

/** Shader uniform data for `selectLights`' result: pos+radius and
 * colour+strength, `MAX_LIGHTS` vec4 each. */
export function lightUniforms(lights: readonly PointLight[]): { position: number[]; color: number[]; count: number } {
  const position = new Array<number>(MAX_LIGHTS * 4).fill(0), color = new Array<number>(MAX_LIGHTS * 4).fill(0);
  const n = Math.min(MAX_LIGHTS, lights.length);
  for (let i = 0; i < n; i++) {
    const l = lights[i]!;
    position.splice(i * 4, 4, l.x, l.y, l.z, l.radius);
    // A negative strength marks a light without a halo.
    color.splice(i * 4, 4, l.r, l.g, l.b, l.noHalo ? -l.strength : l.strength);
  }
  return { position, color, count: n };
}

export const LOCAL_LIGHT_UNIFORMS = ["localLightPos", "localLightColor", "localLightCount", "haloGain"] as const;

/** Cel banding like the lamp's: three Lambert bands and three range rings.
 * Back faces keep a little (thin fans and fronds). `localHalo` is the glow
 * of the water round each light along the view ray (closest approach),
 * fogged more gently than surfaces so a light reads from far off. */
export const LOCAL_LIGHT_SHADER = `
uniform vec4 localLightPos[${MAX_LIGHTS}]; uniform vec4 localLightColor[${MAX_LIGHTS}];
uniform float localLightCount; uniform float haloGain;
vec3 localLight(vec3 p,vec3 n){
  vec3 sum=vec3(0.0);
  for(int i=0;i<${MAX_LIGHTS};i++){
    if(float(i)>=localLightCount)break;
    vec4 L=localLightPos[i]; vec3 v=L.xyz-p; float d=length(v);
    if(d>=L.w)continue;
    float f=1.0-d/L.w; f*=f;
    float lam=dot(n,v/max(d,1e-3));
    float band=lam>.45?1.0:(lam>.05?.68:.3);
    float ring=f>.42?1.0:(f>.14?.62:.3*smoothstep(0.0,.05,f));
    sum+=localLightColor[i].rgb*abs(localLightColor[i].a)*band*ring;
  }
  // Several lights together never burn a surface white.
  return min(sum,vec3(1.1));
}
vec3 localHalo(vec3 p){
  if(haloGain<=0.0)return vec3(0.0);
  vec3 ray=p-cameraPosition; float len=length(ray); ray/=max(len,1e-3);
  vec3 sum=vec3(0.0);
  for(int i=0;i<${MAX_LIGHTS};i++){
    if(float(i)>=localLightCount)break;
    vec4 L=localLightPos[i]; vec3 c=L.xyz-cameraPosition;
    float t=clamp(dot(c,ray),0.0,len); vec3 q=c-ray*t; float r2=dot(q,q), dc=length(c);
    // A light at the eye (the cockpit's own) would fog the whole view: none.
    float h=L.w*.35; float g=exp(-r2/(h*h))*exp(-fogDensity*.35*dc)*smoothstep(h*.6,h*1.6,dc);
    sum+=localLightColor[i].rgb*max(0.0,localLightColor[i].a)*g;
  }
  return sum*haloGain*.34;
}
`;
