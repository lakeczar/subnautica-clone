// Lamp-visibility controls against the real Fanvault geometry, shared by the
// fast test (CPU walk) and tools/cave-gpu-check.mjs (the shader on a GPU).
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Vec3 } from "../src/sim/types.js";

/** R1 light-confirm.json: fine-shell points (normal-biased) and route head
 * poses whose rays crossed 1.4-2.2 m of rock yet were lit by the old march. */
export const R1_LEAKS: readonly (readonly [readonly [number, number, number], readonly [number, number, number]])[] = [
  [[-295.419389, -18.186214, -69.905867], [-289.5, -13.4, -64]], [[-282.929526, -18.872886, -68.713782], [-293.5, -24.1, -77]],
  [[-297.888156, -19.52009, -67.918273], [-284.5, -18.2, -51.5]], [[-307.100065, -21.898933, -64.608411], [-292.5, -23.7, -71]],
  [[-286.374244, -15.760875, -64.484639], [-304.5, -22.8, -64.5]], [[-306.497357, -24.158086, -63.955335], [-288, -22.6, -59.5]],
  [[-302.168628, -24.057734, -61.780767], [-289.5, -19.4, -64]], [[-303.658793, -23.020472, -61.153854], [-289.5, -23.7, -64.5]],
  [[-292.992065, -25.689894, -60.515738], [-283.2, -16.8, -48]], [[-289.393816, -24.490018, -58.002985], [-304.5, -22.8, -64.5]],
  [[-283.366233, -16.330544, -53.087093], [-300, -23, -65.2]], [[-284.115779, -15.49681, -52.256478], [-296, -23.2, -65.4]],
];
const seabed = (x: number, z: number): Vec3 => ({ x, y: worldFloor(x, z) + 0.3, z });
/** Clear controls: lamp pose and targets it must reach. */
export const CLEAR: readonly (readonly [Vec3, readonly Vec3[]])[] = [
  [{ x: -283.2, y: -16.6, z: -50 }, [-1.5, 0, 1.5].map(dx => seabed(-283 + dx, -42))],
  [{ x: -296.5, y: -24, z: -84 }, [-1.5, 0, 1.5].map(dx => ({ ...seabed(-297 + dx, -96), y: -25.5 }))],
  [{ x: -289.5, y: -20, z: -64 }, [{ x: -289.5, y: -9.5, z: -64 }, { x: -288.5, y: -10, z: -63 }]],
];

