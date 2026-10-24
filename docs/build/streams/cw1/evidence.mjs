// CW-1 remeasure evidence table: one row per segment, from its heavy-check
// receipt (TST-16 context) and its traverse.mjs result.
// usage: node evidence.mjs <run dir, e.g. docs/build/streams/cw1/runs/r12>
// (tickets.txt names each segment's ticket; receipts/<name>.json is its
// heavy-check receipt, `wait --json`; <kind>/segment-<k>.json its result, a
// rerun's under rerun/).
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { classify, OURS } from "./frame-class.mjs";
/** factory-worker's vCPUs (nproc 8); recorded runs predate result.ncpu. */
const NCPU = 8;
const H = "/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh";
const [runDir] = process.argv.slice(2), ticketsFile = `${runDir}/tickets.txt`;
const DIRS = { tour: "tour", deep: "deep", hop: "hops", surf: "surf" };
const rows = readFileSync(ticketsFile, "utf8").trim().split("\n").map(l => l.split(" "));
const q = (s, f) => s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : null;
const hm = (ms) => new Date(ms).toISOString().slice(11, 16);
/** The nightly backup window, UTC minutes: 08:30–09:45. */
const inWindow = (ms) => { const d = new Date(ms), m = d.getUTCHours() * 60 + d.getUTCMinutes(); return m >= 510 && m < 585; };
/** The gate's other conditions (unsliced builds, holds, dark cave frames). */
const gateOther = (s) => !(s.gate?.failures ?? []).some(f => !/streaming frame/.test(f));
const f1 = (v) => v == null ? "–" : (+v).toFixed(1);
const out = [];
out.push("| Run | Ticket | Admitted UTC (window) | Min | Caves | Gate | >34 ms streaming / other | Long frames: host / host-stopped label (ours) / mixed / clean | Streaming over 34 ms: raw → removed by host → ours (host-stopped labels) | Gate (R4-1 rule) | Pass max ms: wanted · build · evict · light list · upload · place · scan · select · optics | Light lag: sent worst / sent within 30 m (frames) / nearest lag m | Chunk max ms: plan · evict · dispose (updates) | Steal p95 / max % | Major faults | Swap-ins | Boost | Disturbed | Power |");
out.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const pending = [];
for (const [name, ticket] of rows) {
  // The saved receipt, else the queue's (while the ticket is still known).
  let r = null;
  if (existsSync(`${runDir}/receipts/${name}.json`)) try { r = JSON.parse(readFileSync(`${runDir}/receipts/${name}.json`, "utf8")); } catch { r = null; }
  if (!r) try { r = JSON.parse(execFileSync(H, ["wait", ticket, "--json", "--max", "0"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").find(l => l.startsWith("{"))); }
  catch (e) { const s = String(e.stdout ?? ""); const l = s.split("\n").find(x => x.startsWith("{")); r = l ? JSON.parse(l) : null; }
  if (!r || r.pending) { pending.push(`${name} (${ticket})`); continue; }
  // "r10-tour4" → tour/segment-4.json; a rerun "r10b-tour4" → rerun/segment-4.json.
  const [, run, kind, n] = name.match(/^(r\d+[a-z]?)-([a-z]+)(\d+)$/), k = Number(n);
  const file = `${runDir}/${/[a-z]$/.test(run) ? "rerun" : DIRS[kind]}/segment-${k}.json`;
  const s = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const c = r.context, w = c?.windows ?? [];
  const steal = w.map(x => x.steal).sort((a, b) => a - b);
  const p = s?.parts ?? {}, mx = (n) => f1(p[n]?.max);
  const lb = s?.longByCause ?? {};
  // Reclassified with the shared rule: needs the stolen-time samples (CW-1 harness at e60108f1+).
  // A run with no long frame at all is judged trivially (nothing to excuse).
  const cls = s && ((s.long ?? []).length === 0 || s.long.some(l => l.thread?.stolenMs !== undefined || l.raw)) ? (() => {
    const n = { host: 0, "host-stopped": 0, mixed: 0, clean: 0, unsampled: 0 };
    let raw = 0, byHost = 0, byStopped = 0, ours = 0, legacy = false;
    for (const l of s.long ?? []) {
      if (l.gap <= 34) continue;
      const cl = classify(l, NCPU), c = cl.cause;
      legacy ||= cl.rule === "legacy";
      n[c]++;
      if (!l.streaming) continue;
      raw++;
      // Host-stopped is a label only (R4-1): it stays ours.
      if (c === "host") byHost++; else if (OURS.has(c)) ours++;
      if (c === "host-stopped") byStopped++;
    }
    return { n, raw, byHost, byStopped, ours, legacy };
  })() : null;
  const other = s ? (s.long ?? []).filter(l => l.gap > 34 && !l.streaming).length : null;
  const pw = s?.power?.length ? s.power.map(x => `${/cell/.test(x.action) ? "cell" : "call"} ${x.pressed ? "ok" : "NOT PRESSED"}`).join(", ") : "no calls";
  const end = s?.powerEnd ? `; end ${s.powerEnd.charge}%, home ${s.powerEnd.homeOk ? "ok" : s.powerEnd.homeOk === false ? "**short**" : "–"}` : "";
  out.push(`| ${name} | ${ticket} | ${hm(r.admittedAt)}${inWindow(r.admittedAt) || inWindow(r.endedAt) ? " **in window**" : ""} | ${s ? (s.seconds / 60).toFixed(1) : "–"} | ` +
    `${s ? `${s.reached.length}/${s.reached.length + s.skipped.length}` : "–"} | ${s ? (s.gate?.pass ? "pass" : `**fail**: ${s.gate?.failures?.join("; ")}`) : `exit ${r.code}`} | ` +
    `${s ? `${lb.streamingOver34 ?? "–"} / ${other}` : "–"} | ${cls ? `${cls.n.host} / ${cls.n["host-stopped"]} / ${cls.n.mixed} / ${cls.n.clean}${cls.n.unsampled ? ` +${cls.n.unsampled} unsampled` : ""}${cls.legacy ? " (legacy rule, upper bound)" : ""}` : "not measured"} | ` +
    `${cls ? `${cls.raw} → −${cls.byHost} → **${cls.ours}**${cls.byStopped ? ` (${cls.byStopped} labelled host-stopped)` : ""}` : "–"} | ${cls ? (cls.ours > 0 || !gateOther(s) ? "**fail**" : cls.legacy && cls.byHost > 0 ? "**unresolved** (passes only by legacy excuses)" : "pass") : "–"} | ${[mx("caveWanted"), mx("caveBuild"), mx("caveEvict"), mx("caveLightList"), mx("caveUpload"), mx("lightPlace"), mx("lightScan"), mx("lightSelect"), mx("optics")].join(" · ")} | ` +
    `${s?.lightLag ? `${s.lightLag.worstSentFrames} / ${s.lightLag.worstSentWithin30m} / ${s.lightLag.nearestM ?? "none"}` : "not measured"} | ` +
    `${p.chunkPlan ? `${mx("chunkPlan")} · ${mx("chunkEvict")} · ${mx("chunkDispose")} (${mx("chunkUpdates")})` : "not measured"} | ` +
    `${f1(q(steal, 0.95))} / ${f1(steal.at(-1))} | ${c?.job?.majorFaults ?? "–"} (worst ${c?.job?.majorFaultsWorst ?? "–"}) | ${c?.job?.swapIns ?? "–"} | ` +
    `${c?.boost ? `${c.boost.status}, throttled ${c.boost.throttled?.periods ?? 0}` : "–"} | ${c ? (c.disturbed ? `**yes**: ${c.reasons.join("; ")}` : "no") : "no context"} | ${pw}${end} |`);
}
console.log(out.join("\n"));
if (pending.length) console.log(`\nPending: ${pending.join(", ")}`);
