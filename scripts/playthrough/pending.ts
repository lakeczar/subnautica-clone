/** The versioned list of content the build under test is EXPECTED to lack: S2, S5
 * and S9 work written but not yet composed into the simulation. Only these keys may
 * report "pending C3"; any other missing capability (a removed recipe, an existing
 * route that no longer reaches, an unplaced host not listed here) blocks the run.
 *
 * Update this list at integration: remove every key the composed build now has. The
 * run fails while any listed key is already present (see `staleExpected`), so the
 * list can only shrink as content lands. */
import { stillMissing } from "./content.js";

export const EXPECTED_PENDING_BASE = "C3 (S2, S4, S5 and S9 composed): nothing is expected to be missing";

/** C3 composed every S2 route and site, S9 recipe and deposit, and S5 host and
 * work face this list named (pruned at C3; `plans:bp_deep_service` follows C07
 * and the Rift ledger, both placed). */
export const EXPECTED_PENDING: ReadonlySet<string> = new Set([]);

/** Listed keys this build already satisfies: the list is out of date. */
export const staleExpected = (): string[] => [...EXPECTED_PENDING].filter((key) => !stillMissing(key));
