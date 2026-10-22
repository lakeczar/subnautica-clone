/** SYS-1 upgrade economy: is every upgrade payable from sources reachable at its
 * tier, does each depth tier need a material from the previous tier's frontier,
 * does each higher tier need more common base plus a rare new material, and is
 * nothing cave-only? Arithmetic over the registry's sources, not play.
 *
 * A material with no placed source in this checkout falls back to its region
 * list (MATERIALS.sources) at the region's shallowest depth, flagged `placed:
 * false`. Once C3 composes S9's late sources, every material is placed. */
import { HULLS, MATERIALS, RECIPES, REGIONS, SOURCES } from "../../content/registry.js";
import type { CostKind, MaterialId, RegionId } from "../../content/registry.js";
import { caveSourceAt } from "../../content/regions/caves.js";
import { reachLimit, UPGRADE_IDS, UPGRADES } from "../../content/upgrades/catalogue.js";
import type { ReachTier, UpgradeId } from "../../content/upgrades/catalogue.js";
import { HOST_UPGRADE_IDS, HOST_UPGRADES } from "../../content/upgrades/hosts.js";
import type { HostUpgradeId } from "../../content/upgrades/hosts.js";

/** Craft upgrades and SYS-2 host upgrades share one economy. */
export type EconomyId = UpgradeId | HostUpgradeId;
interface Entry {
  readonly line: string;
  readonly tier: ReachTier;
  readonly cost: Partial<Record<CostKind, number>>;
  readonly fits?: Readonly<Record<string, string>>;
  readonly refit?: { readonly rating: number };
  readonly registry?: string;
}
const ENTRY_IDS: readonly EconomyId[] = [...UPGRADE_IDS, ...HOST_UPGRADE_IDS];
const entry = (id: EconomyId): Entry => (Object.hasOwn(UPGRADES, id) ? UPGRADES[id as UpgradeId] : HOST_UPGRADES[id as HostUpgradeId]) as Entry;

export interface SourceView {
  readonly id: string;
  readonly item: CostKind;
  /** Working depth, metres. */
  readonly depth: number;
  /** Finite stock plus host reserve; null for a region-level fallback. */
  readonly units: number | null;
  readonly cave: boolean;
  readonly protection: "heat" | "brine" | null;
  readonly placed: boolean;
}
export type Protections = Readonly<Record<string, { readonly protection: "heat" | "brine" | null }>>;
const COST_KINDS = new Set<string>([...Object.keys(MATERIALS), "tagged_frame"]);
export const isCostKind = (k: string): k is CostKind => COST_KINDS.has(k);
/** A source inside a W1 cave's replacement envelope, or one authored with `cave: true`. */
export function inCave(def: { readonly position: { x: number; y: number; z: number }; readonly cave?: unknown }): boolean {
  if (def.cave === true) return true;
  const cave = caveSourceAt(def.position.x, def.position.z);
  return !!cave && def.position.y < cave.topY;
}

/** Sources from the composed registry. `protection` marks deposits that need
 * heat or brine protection to work (S9's CAMPAIGN_SOURCE_SITES); they are never
 * counted as ordinary supply. */
export function registrySources(protection: Protections = {}): SourceView[] {
  const placed: SourceView[] = [];
  for (const [id, def] of Object.entries(SOURCES) as [string, (typeof SOURCES)[keyof typeof SOURCES]][]) {
    if (!isCostKind(def.item)) continue;
    placed.push({ id, item: def.item, depth: Math.max(0, -def.position.y), units: def.stock + def.reserve,
      cave: inCave(def), protection: protection[id]?.protection ?? null, placed: true });
  }
  const fallback = (Object.keys(MATERIALS) as MaterialId[]).filter((m) => !placed.some((s) => s.item === m))
    .flatMap((m) => (MATERIALS[m].sources as readonly RegionId[]).map((r): SourceView => ({
      id: `region:${r}:${m}`, item: m, depth: Math.max(0, REGIONS[r].depth[0]), units: null, cave: false, protection: null, placed: false,
    })));
  return [...placed, ...fallback];
}

const ordinary = (s: SourceView): boolean => !s.cave && s.protection === null && s.units !== 0;
/** CB: a rare early sample is a taste, never a frontier: one unit to scan. */
const TASTE_UNITS = 1;
/** Shallowest ordinary (non-cave, unprotected, not scan-only) source of a material;
 * tastes are skipped. */
export function firstDepth(sources: readonly SourceView[], kind: CostKind): number {
  return Math.min(Infinity, ...sources.filter((s) => s.item === kind && ordinary(s) && (s.units === null || s.units > TASTE_UNITS))
    .map((s) => s.depth));
}
/** Materials a tier-1 player works short of its limit: the common base. Everything else is rare. */
export function commonBase(sources: readonly SourceView[]): CostKind[] {
  return [...COST_KINDS].filter((k): k is CostKind => isCostKind(k) && firstDepth(sources, k) < reachLimit(1));
}
/** Materials that open a tier: first found at or beyond the previous tier's limit
 * (CB's tier rule, which puts each frontier exactly at that limit: frames at
 * 150 m, core at 350 m) and short of this tier's own. */
export function frontierMaterials(sources: readonly SourceView[], tier: ReachTier): CostKind[] {
  return [...COST_KINDS].filter((k): k is CostKind => {
    if (!isCostKind(k)) return false;
    const d = firstDepth(sources, k);
    return d >= reachLimit((tier - 1) as 0 | ReachTier) && d < reachLimit(tier);
  });
}

export interface SupplyShortfall { readonly kind: CostKind; readonly need: number; readonly have: number }
export interface UpgradeRow {
  readonly id: EconomyId;
  readonly tier: ReachTier;
  readonly limit: number;
  readonly owner: "SYS-1" | "registry";
  readonly shortfalls: readonly SupplyShortfall[];
  /** Cost materials met only by a region-level fallback in this checkout. */
  readonly regionLevel: readonly CostKind[];
  readonly caveOnly: readonly CostKind[];
  /** Depth tiers need a frontier material; null where the rule does not apply. */
  readonly frontier: { readonly ok: boolean; readonly materials: readonly CostKind[] } | null;
}
export function upgradeRow(sources: readonly SourceView[], id: EconomyId): UpgradeRow {
  const d = entry(id), limit = reachLimit(d.tier), cost = Object.entries(d.cost) as [CostKind, number][];
  const shortfalls: SupplyShortfall[] = [], regionLevel: CostKind[] = [], caveOnly: CostKind[] = [];
  for (const [kind, need] of cost) {
    const all = sources.filter((s) => s.item === kind);
    if (all.length && all.every((s) => s.cave)) caveOnly.push(kind);
    const reach = all.filter((s) => ordinary(s) && s.depth <= limit);
    const units = reach.filter((s) => s.placed).reduce((n, s) => n + (s.units ?? 0), 0);
    if (units >= need) continue;
    if (reach.some((s) => !s.placed)) regionLevel.push(kind);
    else shortfalls.push({ kind, need, have: units });
  }
  // A depth refit needs a material first found at or beyond the previous tier's
  // limit and within its own new rating (CB's tier rule: frames at 150 m for the
  // 350 m refits, core at 350 m for 450 m; the carrier's 550 m refit takes
  // lattice from 450 m, beyond its 400 m).
  const refit = "refit" in d ? (d as { refit: { rating: number } }).refit : null, floor = reachLimit((d.tier - 1) as 0 | ReachTier);
  const used = cost.map(([k]) => k).filter((k) => { const at = firstDepth(sources, k); return !!refit && at >= floor && at <= refit.rating; });
  return { id, tier: d.tier, limit, owner: "registry" in d ? "registry" : "SYS-1", shortfalls, regionLevel, caveOnly,
    frontier: refit ? { ok: used.length > 0, materials: used } : null };
}

export interface LineStep {
  readonly line: string;
  readonly from: EconomyId;
  readonly to: EconomyId;
  readonly commonBefore: number;
  readonly commonAfter: number;
  /** Rare materials the higher tier adds. */
  readonly newRare: readonly CostKind[];
  readonly ok: boolean;
  readonly owner: "SYS-1" | "registry";
}
type Cost = Partial<Record<CostKind, number>>;
/** One tier step against the rule: strictly more common base than the tier below,
 * plus at least one rare material the tier below lacks. */
export function tierStep(common: ReadonlySet<CostKind>, lower: Cost, higher: Cost): { commonBefore: number; commonAfter: number; newRare: CostKind[]; ok: boolean } {
  const sum = (c: Cost): number => (Object.entries(c) as [CostKind, number][]).filter(([k]) => common.has(k)).reduce((n, [, v]) => n + v, 0);
  const newRare = (Object.keys(higher) as CostKind[]).filter((k) => !common.has(k) && !(k in lower));
  const commonBefore = sum(lower), commonAfter = sum(higher);
  return { commonBefore, commonAfter, newRare, ok: commonAfter > commonBefore && newRare.length > 0 };
}
/** Each successive tier of a line (per hull for refits), checked by `tierStep`. */
export function lineSteps(sources: readonly SourceView[]): LineStep[] {
  const common = new Set(commonBase(sources));
  // A line is ordered per hull: plating, for one, has a tier the Spindle cannot take.
  const groups = new Map<string, EconomyId[]>();
  for (const id of ENTRY_IDS)
    for (const hull of Object.keys(entry(id).fits ?? { host: "" })) {
      const key = `${entry(id).line}:${hull}`;
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
  const rating = (id: EconomyId): number => entry(id).refit?.rating ?? 0;
  const steps: LineStep[] = [], seen = new Set<string>();
  for (const ids of groups.values()) {
    const ordered = [...ids].sort((a, b) => entry(a).tier - entry(b).tier || rating(a) - rating(b));
    for (let i = 1; i < ordered.length; i++) {
      const from = ordered[i - 1]!, to = ordered[i]!;
      if (seen.has(`${from}>${to}`)) continue;
      seen.add(`${from}>${to}`);
      const owner = entry(from).registry || entry(to).registry ? "registry" : "SYS-1";
      steps.push({ line: entry(to).line, from, to, ...tierStep(common, entry(from).cost, entry(to).cost), owner });
    }
  }
  return steps;
}

export interface TierLoad {
  readonly tier: ReachTier;
  /** Every SYS-1-owned upgrade up to this tier, bought once. */
  readonly demand: Partial<Record<CostKind, number>>;
  /** Placed units reachable at this tier; null where only region-level. */
  readonly supply: Partial<Record<CostKind, number | null>>;
}
/** Stress view: the whole SYS-1 catalogue up to each tier bought once against
 * all reachable finite stock. Reported, not gated: no player buys every
 * signature for six hulls, and the campaign spends from the same stock. */
export function tierLoads(sources: readonly SourceView[]): TierLoad[] {
  return ([1, 2, 3] as const).map((tier) => {
    const demand: Partial<Record<CostKind, number>> = {}, supply: Partial<Record<CostKind, number | null>> = {};
    for (const id of ENTRY_IDS) {
      const d = entry(id);
      if (d.tier > tier || "registry" in d) continue;
      for (const [k, n] of Object.entries(d.cost) as [CostKind, number][]) demand[k] = (demand[k] ?? 0) + n;
    }
    for (const k of Object.keys(demand) as CostKind[]) {
      const reach = sources.filter((s) => s.item === k && ordinary(s) && s.depth <= reachLimit(tier));
      supply[k] = reach.some((s) => s.placed) ? reach.reduce((n, s) => n + (s.units ?? 0), 0) : reach.length ? null : 0;
    }
    return { tier, demand, supply };
  });
}

/** Craft recipes (S9's) and the deepest first-found material each needs: the
 * frontier a new craft pulls the player to. Reported for the recipes' owner. */
export function craftFrontiers(sources: readonly SourceView[]): { recipe: string; hull: string; material: CostKind | null; depth: number }[] {
  return (Object.entries(RECIPES) as [string, { output: string; cost: Partial<Record<CostKind, number>> }][])
    .filter(([, r]) => Object.hasOwn(HULLS, r.output))
    .map(([recipe, r]) => {
      const deepest = (Object.keys(r.cost) as CostKind[]).map((k) => ({ k, d: firstDepth(sources, k) }))
        .sort((a, b) => b.d - a.d)[0];
      return { recipe, hull: r.output, material: deepest?.k ?? null, depth: deepest?.d ?? 0 };
    });
}

export interface EconomyReport {
  readonly ok: boolean;
  readonly failures: readonly string[];
  /** Registry-owned costs that miss the tier rule: proposals for their owner. */
  readonly advisories: readonly string[];
  readonly rows: readonly UpgradeRow[];
  readonly lines: readonly LineStep[];
  readonly loads: readonly TierLoad[];
  readonly placedAll: boolean;
}
export function checkUpgradeEconomy(sources: readonly SourceView[] = registrySources()): EconomyReport {
  const rows = ENTRY_IDS.map((id) => upgradeRow(sources, id)), lines = lineSteps(sources);
  const failures: string[] = [], advisories: string[] = [];
  for (const id of ENTRY_IDS)
    for (const k of Object.keys(entry(id).cost)) if (!isCostKind(k)) failures.push(`${id}: ${k} is not a shared material`);
  for (const r of rows) {
    for (const s of r.shortfalls) failures.push(`${r.id}: needs ${s.need} ${s.kind} but only ${s.have} is reachable within ${r.limit} m`);
    for (const k of r.caveOnly) failures.push(`${r.id}: ${k} is found only in caves`);
    if (r.frontier && !r.frontier.ok)
      (r.owner === "SYS-1" ? failures : advisories).push(`${r.id}: no material first found at or beyond ${reachLimit((r.tier - 1) as 0 | ReachTier)} m`);
  }
  for (const l of lines.filter((l) => !l.ok))
    (l.owner === "SYS-1" ? failures : advisories).push(`${l.from} → ${l.to}: common base ${l.commonBefore} → ${l.commonAfter}, new rare [${l.newRare.join(", ")}]`);
  return { ok: failures.length === 0, failures, advisories, rows, lines, loads: tierLoads(sources), placedAll: sources.every((s) => s.placed) };
}
