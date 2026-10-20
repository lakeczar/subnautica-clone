/** Human-readable timeline: one block per scenario with its phases, the survival
 * minima of every leg type, saves and checks. */
import type { LegRecord, Minima, RunRecord } from "./timeline.js";

const pct = (n: number | null): string => n === null ? "  —" : `${Math.round(n)}`.padStart(3);
const mins = (ticks: number): string => `${(ticks / 3600).toFixed(1)} min`;
const counts = (c: Readonly<Record<string, number>>): string =>
  Object.entries(c).map(([k, n]) => `${k.replace(/_/g, " ")} ${n}`).join(", ") || "—";
const minima = (m: Minima): string => `O2 ${pct(m.oxygen)} food ${pct(m.food)} hp ${pct(m.health)} power ${pct(m.power)} hull ${pct(m.hull)}`;

export function formatRun(run: RunRecord): string {
  const out: string[] = [];
  out.push(`== ${run.scenario} (${run.strategy}) · ${run.outcome} · ${mins(run.ticks)} of play · ${(run.wallMs / 1000).toFixed(1)} s wall`);
  for (const p of run.phases) {
    out.push(`  ${p.status.padEnd(10)} ${p.id.padEnd(14)} ${p.status === "pass" ? `${mins(p.ticks).padStart(9)}  ${minima(p.minima)}` : ""}`);
    if (p.status === "pass") {
      if (Object.keys(p.gathered).length) out.push(`               gathered: ${counts(p.gathered)}`);
      if (Object.keys(p.spent).length) out.push(`               spent:    ${counts(p.spent)}`);
      if (p.crafted.length) out.push(`               crafted:  ${p.crafted.join(", ")}`);
      if (p.discoveries.length) out.push(`               found:    ${p.discoveries.join(", ")}`);
    }
    if (p.deferred?.length) out.push(`               deferred (host not placed): ${p.deferred.join(", ")}`);
    for (const line of p.detail ?? []) out.push(`               ${p.status === "pending-c3" ? "needs" : "why"}: ${line}`);
  }
  out.push(`  discoveries in order: ${run.discoveries.map((x) => x.id).join(" → ") || "—"}`);
  out.push(`  saves: ${run.saves.map((s) => `${s.label}${s.equal ? "" : " (MISMATCH)"}`).join(", ") || "—"}`);
  const thin = run.legs.filter((l: LegRecord) => l.minima.oxygen < 25 || (l.minima.power !== null && l.minima.power < 25));
  out.push(`  legs: ${run.legs.length}; below 25% oxygen or power: ${thin.length ? thin.map((l) => `${l.phase}/${l.leg}`).join("; ") : "none"}`);
  out.push(`  refusals met on the way: ${run.refusals.length}; incapacities: ${run.failures}`);
  for (const n of run.notes) out.push(`  note: ${n}`);
  for (const c of run.checks) out.push(`  check ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.detail ? ` · ${c.detail}` : ""}`);
  return out.join("\n");
}
