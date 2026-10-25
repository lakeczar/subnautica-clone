// Small helpers several test files share (STEW-1, F24/F25); not a test file itself.
// One definition each, so a fix lands everywhere. Fixtures stay with their tests.
import type { ChunkDescriptor } from "../src/world/types.js";

/** Run a sliced builder (a generator that yields between work slices) to its result. */
export const drain = <T>(g: Generator<void, T>): T => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };

/** A chunk's horizontal rectangle, as the terrain codecs and footprints take it. */
export const rectOf = (c: ChunkDescriptor) => ({ minX: c.bounds.min.x, maxX: c.bounds.max.x, minZ: c.bounds.min.z, maxZ: c.bounds.max.z });

/** Wait until `done()` holds, polling every few milliseconds, instead of sleeping a
 * fixed time and hoping. Fails with `label` if it hasn't held within `timeoutMs`. */
export async function waitUntil(done: () => boolean, label: string, timeoutMs = 10_000): Promise<void> {
  const t0 = Date.now();
  while (!done()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 2));
  }
}
