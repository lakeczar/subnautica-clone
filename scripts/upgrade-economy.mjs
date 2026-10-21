// Run after `npm test` (compiled modules in .test-build). SYS-1 upgrade economy:
// every upgrade payable from ordinary sources reachable at its tier, a frontier
// material for every depth tier, more common base plus a rare new material for
// every higher tier, nothing cave-only, no per-vessel currency.
//
// Uses the composed registry's SOURCES. Where S9's campaign content is present
// (after C3), its protected deposits are excluded from ordinary supply and the
// stress view is repeated on what the campaign leaves after its required and
// optional spend and a failed rescue.
// Optional: --out <result.json>
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2), out = args[args.indexOf("--out") + 1];
if (!(args.length === 0 || (args.length === 2 && args[0] === "--out"))) throw new Error("only --out is supported");
const build = new URL("../.test-build/src/", import.meta.url);
const load = (path) => import(new URL(path, build).href);
const optional = async (path) => fs.existsSync(fileURLToPath(new URL(path, build))) ? load(path) : null;

const { checkUpgradeEconomy, craftFrontiers, registrySources } = await load("sim/upgrades/economy.js");
const { UPGRADES, REACH_TIERS } = await load("content/upgrades/catalogue.js");
const { HOST_UPGRADES } = await load("content/upgrades/hosts.js");
const ENTRIES = { ...UPGRADES, ...Object.fromEntries(Object.entries(HOST_UPGRADES).map(([k, d]) => [k, { ...d, layer: `host·${d.scope}` }])) };
const campaign = await optional("content/campaign/index.js");
const campaignEconomy = await optional("sim/campaignEconomy.js");

const sources = registrySources(campaign?.CAMPAIGN_SOURCE_SITES ?? {});
const report = checkUpgradeEconomy(sources);
const pad = (s, n) => String(s).padEnd(n);

console.log(`SYS-1 upgrade economy · ${report.rows.length} upgrades (craft and host) · sources ${report.placedAll ? "all placed" : "with region-level fallbacks (S9 late sources not composed yet)"}`);
console.log(`Reach tiers: ${REACH_TIERS.map((t) => `${t.tier}=${t.limit} m`).join(", ")}`);
for (const r of report.rows) {
  const d = ENTRIES[r.id];
  const cost = Object.entries(d.cost).map(([k, n]) => `${n} ${k}`).join(", ");
  const flags = [r.shortfalls.length ? "UNPAYABLE" : "payable", r.regionLevel.length ? `region-level: ${r.regionLevel.join(",")}` : "",
    r.frontier ? (r.frontier.ok ? `frontier ${r.frontier.materials.join(",")}` : "NO FRONTIER") : "", r.owner === "registry" ? "(registry)" : ""]
    .filter(Boolean).join(" · ");
  console.log(`  ${pad(r.id, 28)} t${r.tier} ${pad(d.layer, 14)} ${pad(cost, 78)} ${flags}`);
}
console.log("Tier lines (common base before → after, rare new):");
for (const l of report.lines)
  console.log(`  ${l.ok ? "ok " : "NO "} ${pad(`${l.from} → ${l.to}`, 34)} ${l.commonBefore} → ${l.commonAfter}  [${l.newRare.join(", ")}]${l.owner === "registry" ? "  (registry)" : ""}`);
console.log("Stress: every SYS-1 upgrade up to the tier bought once, against all reachable finite stock:");
for (const t of report.loads)
  console.log(`  tier ${t.tier}: ${Object.entries(t.demand).map(([k, n]) => `${k} ${n}/${t.supply[k] ?? "region"}`).join(", ")}`);
let afterCampaign = null;
if (campaignEconomy) {
  afterCampaign = {};
  const demand = report.loads.at(-1).demand;
  for (const strategy of ["independent", "carrier"]) {
    const run = campaignEconomy.solvency(strategy);
    afterCampaign[strategy] = Object.fromEntries(Object.entries(demand).map(([k, n]) => {
      const left = run.remaining[k].exposed + run.remaining[k].reserve;
      return [k, { need: n, left }];
    }));
    console.log(`  after the ${strategy} campaign (required + optional + failed rescue, zero renewal): ${
      Object.entries(afterCampaign[strategy]).map(([k, v]) => `${k} ${v.need}/${v.left}`).join(", ")}`);
  }
}
console.log("New craft (S9 recipes), deepest first-found material: " +
  craftFrontiers(sources).map((c) => `${c.recipe} ${c.material ?? "-"} ${c.depth} m`).join(", "));
for (const a of report.advisories) console.log(`ADVISORY (registry-owned cost): ${a}`);
for (const f of report.failures) console.log(`FAIL: ${f}`);
console.log(report.ok ? "upgrade economy: PASS" : "upgrade economy: FAIL");
if (out) fs.writeFileSync(out, JSON.stringify({ ok: report.ok, failures: report.failures, advisories: report.advisories,
  placedAll: report.placedAll, rows: report.rows, lines: report.lines, loads: report.loads, afterCampaign }, null, 2));
process.exitCode = report.ok ? 0 : 1;
