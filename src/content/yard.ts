/** C3: S9 hull construction at S2's stack-yard berth. No imports, so the
 * registry can read it without a cycle. */
/** Construction poses at the yard (keel reference, metres). Each clears the floor,
 * the pier and the others (`tests/campaign-sites.test.ts`); the carrier takes the
 * dredged berth between S2's two cradles, the compact and medium slips stand
 * east of the east cradle and the surface tender floats beside the pier. */
export const YARD_BUILD = {
  hearthline: { pose: { x: 470, y: -14, z: -12 }, yaw: Math.PI },
  mantle: { pose: { x: 503, y: -10, z: -16 }, yaw: Math.PI },
  hush: { pose: { x: 503, y: -6, z: 4 }, yaw: Math.PI },
  spindle: { pose: { x: 458, y: -0.4, z: 28 }, yaw: Math.PI },
} as const;
