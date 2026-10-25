/** LS-1 1b R3: deterministic work counters for the fixed step's bounded-work tests. Null
 * in normal play, so each counted operation costs one null check; a test turns them on,
 * runs the real callers (`stepSystems`) and reads what was actually done. */
export interface WorkCounts {
  /** Per-cache distance tests in lost-site cache discovery (`openSiteCaches`). */
  cacheDistanceChecks: number;
  /** Host power evaluations (SYS-1's `hostPower`). */
  hostPowerEvaluations: number;
}
export let workCounts: WorkCounts | null = null;
/** Starts counting from zero (tests only); `false` stops. */
export function countWork(on: boolean): WorkCounts | null {
  workCounts = on ? { cacheDistanceChecks: 0, hostPowerEvaluations: 0 } : null;
  return workCounts;
}
