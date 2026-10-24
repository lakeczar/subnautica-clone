/** The versioned list of content the build under test is EXPECTED to lack: S2, S5
 * and S9 work written but not yet composed into the simulation. Only these keys may
 * report "pending C3"; any other missing capability (a removed recipe, an existing
 * route that no longer reaches, an unplaced host not listed here) blocks the run.
 *
 * Keys name ABSENT IDs (or the one uncomposed bounds condition). A present ID that
 * cannot be used gets a `broken:`/`refused:` key, which this list never holds.
 *
 * Update this list at integration: remove every key the composed build now has. The
 * run fails while any listed key is already present (see `staleExpected`), so the
 * list can only shrink as content lands. */
import { stillMissing } from "./content.js";

export const EXPECTED_PENDING_BASE = "C3 (S2, S4, S5 and S9 composed, bounds lifted): nothing is expected to be missing";

/** Pruned at C3: every S9 recipe, hull and deposit, the bounds condition, every S5
 * story site, host and work face are composed. `plans:bp_deep_service` is raised
 * only while neither C07 nor the Rift ledger is placed, and both are. */
export const EXPECTED_PENDING: ReadonlySet<string> = new Set([]);

/** Listed keys this build already satisfies: the list is out of date. */
export const staleExpected = (): string[] => [...EXPECTED_PENDING].filter((key) => !stillMissing(key));
/** The list must only hold absent-ID keys, never a present-but-broken condition. */
export const malformedExpected = (): string[] => [...EXPECTED_PENDING].filter((key) => /^(broken|refused|owned):/.test(key));
