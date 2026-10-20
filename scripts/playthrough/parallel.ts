/** Scenario groups in separate processes. A group is a New Game root and the
 * scenarios that branch from its saves. The launcher is injected (run.ts spawns
 * node; tests simulate crashes), and every requested scenario must come back
 * exactly once from a child that exited normally. Anything else is a blocked run,
 * never a silent omission. */
import { emptyRun } from "./timeline.js";
import type { RunRecord } from "./timeline.js";

export interface ChildOutcome {
  /** Exit code, or null when killed by a signal or never started. */
  code: number | null;
  signal: string | null;
  /** Spawn error or timeout, if any. */
  error: string | null;
  /** The child's --json output, if it wrote one. */
  json: string | null;
}
export type Launch = (scenarios: readonly string[]) => Promise<ChildOutcome>;

export function groupsOf(selected: readonly string[], parentOf: (id: string) => string | undefined): string[][] {
  const root = (id: string): string => { let r = id; for (let p = parentOf(r); p; p = parentOf(r)) r = p; return r; };
  return [...new Set(selected.map(root))].map((r) => selected.filter((id) => root(id) === r));
}

/** Validate one child's outcome; a failed group yields one blocked run per scenario. */
export function collect(group: readonly string[], outcome: ChildOutcome, strategyOf: (id: string) => string): RunRecord[] {
  const failed = (why: string): RunRecord[] => group.map((id) => {
    const run = emptyRun(id, strategyOf(id));
    run.outcome = "blocked";
    run.checks.push({ name: "child process", ok: false, detail: why });
    return run;
  });
  const how = `exit ${outcome.code ?? "none"}${outcome.signal ? `, signal ${outcome.signal}` : ""}${outcome.error ? `, ${outcome.error}` : ""}`;
  // 0: clean; 1: the child itself reported blocked runs or failed checks (kept as reported).
  if (outcome.error || outcome.signal || (outcome.code !== 0 && outcome.code !== 1)) return failed(`${how}; results discarded`);
  if (!outcome.json) return failed(`${how}; no result written`);
  let runs: RunRecord[];
  try { runs = (JSON.parse(outcome.json) as { runs: RunRecord[] }).runs; } catch { return failed(`${how}; unreadable result`); }
  if (!Array.isArray(runs)) return failed(`${how}; result has no runs`);
  const out: RunRecord[] = [];
  for (const id of group) {
    const found = runs.filter((r) => r.scenario === id);
    if (found.length !== 1) out.push(...failed(`${how}; ${found.length} results for ${id}`).filter((r) => r.scenario === id));
    else out.push(found[0]!);
  }
  const extra = runs.filter((r) => !group.includes(r.scenario));
  if (extra.length) return failed(`${how}; unexpected results for ${extra.map((r) => r.scenario).join(", ")}`);
  return out;
}

export async function runGroups(selected: readonly string[], limit: number, launch: Launch,
  parentOf: (id: string) => string | undefined, strategyOf: (id: string) => string): Promise<RunRecord[]> {
  const groups = groupsOf(selected, parentOf);
  const results: RunRecord[][] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < groups.length) {
      const i = next++, group = groups[i]!;
      let outcome: ChildOutcome;
      try { outcome = await launch(group); } catch (e) { outcome = { code: null, signal: null, error: String(e), json: null }; }
      results[i] = collect(group, outcome, strategyOf);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, groups.length) }, worker));
  const all = results.flat();
  return selected.map((id) => all.find((r) => r.scenario === id)!);
}
