// Shared by tests/large-cave.test.ts and its heavy tier file (TT-1); not a test file itself.
import type { Vec3 } from "../src/sim/types.js";
import { caveRockAt } from "../src/world/caves/large/collision.js";
import { DIVER, VAULT_OFFSET, boxSamples, composedWith, vault, vaultFloor } from "./large-cave-support.js";

// LC: the large-cave technology on a small synthetic biome (2 x 2 x 2 chunks).
export const cave = vault();

export const world = composedWith(cave, vaultFloor, VAULT_OFFSET);

/** In cave rock or under the exterior seabed where no cave owns the point. */
export function solidAt(p: Vec3): boolean {
  if (cave.field.owned(p.x, p.y, p.z)) return caveRockAt(cave.collision, p);
  return p.y < vaultFloor(p.x, p.z) - 0.02;
}

export const buried = (p: Vec3, s: typeof DIVER): Vec3 | undefined => boxSamples(p, s).find(solidAt);

export const VAULT_OWNED = (p: Vec3): boolean => cave.field.owned(p.x, p.y, p.z);
