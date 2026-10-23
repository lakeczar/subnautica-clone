/** ID lookups into state rosters without a scan per lookup (SIM-1, SIM-02).
 * The index lives beside the state, never in it, keyed by the roster array:
 * the live state now steps in place, so its arrays persist from tick to tick.
 * Every hit is checked against the row itself, so a roster changed in any way
 * (rows added, removed, reordered or replaced) can never return a wrong row:
 * a stale or missing entry rebuilds the index. IDs in a roster are unique. */
const indexes = new WeakMap<readonly { id: string }[], Map<string, number>>();

export function rowById<T extends { id: string }>(rows: readonly T[], id: string): T | undefined {
  let index = indexes.get(rows);
  const i = index?.get(id);
  if (i !== undefined && rows[i]?.id === id) return rows[i];
  // A miss on a current index is an absent ID; anything else rebuilds first.
  if (index && i === undefined && index.size === rows.length && rows.every((r, n) => index!.get(r.id) === n)) return undefined;
  index = new Map();
  for (let n = 0; n < rows.length; n++) if (!index.has(rows[n]!.id)) index.set(rows[n]!.id, n);
  indexes.set(rows, index);
  const j = index.get(id);
  return j === undefined ? undefined : rows[j];
}
