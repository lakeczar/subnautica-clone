/** Structural comparison of plain simulation data (what saves hold): the path of
 * the first difference, or null when equal. Key order is ignored; NaN equals NaN. */
export function firstDifference(a: unknown, b: unknown, path = "state"): string | null {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null)
    return `${path}: ${describe(a)} ≠ ${describe(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array ≠ object`;
  if (a instanceof Map || b instanceof Map || a instanceof Set || b instanceof Set) {
    if (!(a instanceof Map && b instanceof Map) && !(a instanceof Set && b instanceof Set)) return `${path}: collection kinds differ`;
    return firstDifference([...a], [...b], path);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} ≠ ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  for (const k of Object.keys(x)) {
    if (!Object.hasOwn(y, k)) return `${path}.${k}: present ≠ absent`;
    const d = firstDifference(x[k], y[k], `${path}.${k}`);
    if (d) return d;
  }
  for (const k of Object.keys(y)) if (!Object.hasOwn(x, k)) return `${path}.${k}: absent ≠ present`;
  return null;
}
const describe = (v: unknown): string => {
  if (typeof v === "string") return JSON.stringify(v.length > 60 ? `${v.slice(0, 57)}...` : v);
  if (typeof v === "object" && v !== null) return Array.isArray(v) ? "array" : "object";
  return String(v);
};
