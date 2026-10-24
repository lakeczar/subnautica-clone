// Per-second CPU of every process on this machine, for N seconds: which process runs on a 300 s wall-clock period?
// node sample.mjs SECONDS OUT.ndjson   (reads /proc only)
import fs from "node:fs";
const [secs = "660", out = "samples.ndjson"] = process.argv.slice(2);
const HZ = 100, w = fs.createWriteStream(out);
const read = () => {
  const m = new Map();
  for (const p of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(p)) continue;
    try {
      const s = fs.readFileSync(`/proc/${p}/stat`, "utf8"), r = s.lastIndexOf(")"), f = s.slice(r + 2).split(" ");
      m.set(p, { comm: s.slice(s.indexOf("(") + 1, r), ppid: f[1], t: +f[11] + +f[12] });
    } catch {}
  }
  return m;
};
const cmd = (p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, "utf8").replace(/\0/g, " ").slice(0, 160); } catch { return ""; } };
const stat = () => fs.readFileSync("/proc/stat", "utf8").split("\n")[0].split(/\s+/).slice(1).map(Number);
let prev = read(), ps = stat();
const end = Date.now() + +secs * 1000;
const tick = () => {
  const cur = read(), cs = stat();
  const total = cs.reduce((a, b) => a + b, 0) - ps.reduce((a, b) => a + b, 0);
  const idle = cs[3] + cs[4] - ps[3] - ps[4], steal = (cs[7] ?? 0) - (ps[7] ?? 0);
  const top = [];
  for (const [p, v] of cur) { const d = v.t - (prev.get(p)?.t ?? v.t); if (d >= 5) top.push({ pid: +p, comm: v.comm, ms: d * (1000 / HZ), cmd: prev.has(p) ? undefined : cmd(p) }); }
  const born = [...cur.keys()].filter((p) => !prev.has(p)).length;
  top.sort((a, b) => b.ms - a.ms);
  w.write(JSON.stringify({ t: new Date().toISOString(), busyCores: +((total - idle) / HZ).toFixed(2), steal, born, top: top.slice(0, 8).map((x) => ({ ...x, cmd: x.cmd || cmd(x.pid) })) }) + "\n");
  prev = cur; ps = cs;
  if (Date.now() < end) setTimeout(tick, 1000); else w.end();
};
setTimeout(tick, 1000);
