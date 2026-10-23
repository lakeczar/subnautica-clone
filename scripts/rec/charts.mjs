// REC-1 pack charts as SVG strings (rendered to PNG for agents, inlined in the
// owner's timeline page). One y-axis per chart; categorical hues in the
// dataviz reference order (blue, orange, aqua, yellow); text in ink tokens;
// thin 2 px lines; a legend for two or more series plus direct end labels.
export const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#8a8984", grid: "#e6e5e1", surface: "#fcfcfb" };
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const CRITICAL = "#c62f2f", HOLD = "#8a8984";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function frame({ w, h, title, xs, ys, yTicks, yFmt, xLabel, body, legend = [] }) {
  const L = 52, R = 70, T = 30, B = 34, pw = w - L - R, ph = h - T - B;
  const X = (v) => L + ((v - xs[0]) / Math.max(1e-9, xs[1] - xs[0])) * pw, Y = (v) => T + ph - ((v - ys[0]) / Math.max(1e-9, ys[1] - ys[0])) * ph;
  const xt = niceTicks(xs[0], xs[1], 8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="system-ui,sans-serif" font-size="11">
<rect width="${w}" height="${h}" fill="${INK.surface}"/>
<text x="${L}" y="18" font-size="13" font-weight="600" fill="${INK.primary}">${esc(title)}</text>
${legend.map((l, i) => `<g transform="translate(${w - R - (legend.length - i) * 128},8)"><rect width="14" height="3" y="5" rx="1.5" fill="${l.color}"/><text x="19" y="10" fill="${INK.secondary}">${esc(l.label)}</text></g>`).join("")}
${yTicks.map((v) => `<line x1="${L}" x2="${L + pw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${INK.grid}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" fill="${INK.muted}">${esc(yFmt(v))}</text>`).join("")}
${xt.map((v) => `<text x="${X(v)}" y="${T + ph + 15}" text-anchor="middle" fill="${INK.muted}">${esc(fmtTime(v))}</text>`).join("")}
<text x="${L + pw}" y="${h - 4}" text-anchor="end" fill="${INK.muted}">${esc(xLabel)}</text>
${body(X, Y, { L, T, pw, ph })}
</svg>`;
}
export function niceTicks(a, b, n) {
  const span = b - a || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
export const fmtTime = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : `${Math.round(s)}s`);
const path = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");

/** Frame time: per-bucket worst and median rAF gap, the 16.7 and 33 ms lines,
 * holds shaded, attention entries flagged by id. xs in seconds from the start. */
export function frameTimeSvg({ frames, t0, holds = [], attention = [], w = 1200, h = 300 }) {
  const end = frames.length ? (frames.at(-1).t - t0) / 1000 : 1;
  const buckets = Math.min(600, Math.max(1, frames.length)), size = Math.max(end / buckets, 0.05), b = [];
  for (const f of frames) {
    if (!(f.gap > 0)) continue;
    const i = Math.floor((f.t - t0) / 1000 / size);
    (b[i] ??= []).push(f.gap);
  }
  const pts = b.map((g, i) => g && { x: i * size, max: Math.max(...g), med: g.sort((a, c) => a - c)[Math.floor(g.length / 2)] }).filter(Boolean);
  const top = Math.min(250, Math.max(50, ...pts.map((p) => p.max)) * 1.08);
  return frame({ w, h, title: "Frame time (rAF gap), worst and median per bucket", xs: [0, end], ys: [0, top], yTicks: niceTicks(0, top, 5), yFmt: (v) => `${v} ms`, xLabel: "time since start",
    legend: [{ label: "worst in bucket", color: SERIES[0] }, { label: "median", color: SERIES[1] }],
    body: (X, Y, { T, ph }) => [
      ...holds.map(([a, c]) => `<rect x="${X(a)}" y="${T}" width="${Math.max(2, X(c) - X(a))}" height="${ph}" fill="${HOLD}" fill-opacity=".18"/><text x="${X(a) + 2}" y="${T + 10}" fill="${INK.secondary}">hold</text>`),
      `<line x1="${X(0)}" x2="${X(end)}" y1="${Y(16.7)}" y2="${Y(16.7)}" stroke="${INK.muted}" stroke-dasharray="3 3"/><text x="${X(end) + 4}" y="${Y(16.7) + 4}" fill="${INK.muted}">16.7</text>`,
      `<line x1="${X(0)}" x2="${X(end)}" y1="${Y(33)}" y2="${Y(33)}" stroke="${CRITICAL}" stroke-dasharray="4 3"/><text x="${X(end) + 4}" y="${Y(33) + 4}" fill="${CRITICAL}">33 ms</text>`,
      `<path d="${path(pts.map((p) => [X(p.x), Y(Math.min(top, p.med))]))}" fill="none" stroke="${SERIES[1]}" stroke-width="2"/>`,
      `<path d="${path(pts.map((p) => [X(p.x), Y(Math.min(top, p.max))]))}" fill="none" stroke="${SERIES[0]}" stroke-width="1.5"/>`,
      ...attention.filter((a) => a.kind === "long-frame").slice(0, 40).map((a) => `<text x="${X(a.s)}" y="${Y(Math.min(top, a.detail?.gap ?? 33)) - 6}" text-anchor="middle" font-size="10" fill="${INK.primary}">${a.id}</text>`),
    ].join("\n") });
}

/** Memory series (MiB) on one axis: [{ label, points: [{ s, v }] }] (at most four). */
export function memorySvg({ series, end, w = 1200, h = 260 }) {
  const all = series.flatMap((x) => x.points.map((p) => p.v));
  const top = (all.length ? Math.max(...all) : 100) * 1.1;
  return frame({ w, h, title: "Memory (MiB)", xs: [0, Math.max(1, end)], ys: [0, top], yTicks: niceTicks(0, top, 5), yFmt: (v) => `${v}`, xLabel: "time since start",
    legend: series.map((x, i) => ({ label: x.label, color: SERIES[i] })),
    body: (X, Y) => series.map((x, i) => x.points.length ? `<path d="${path(x.points.map((p) => [X(p.s), Y(p.v)]))}" fill="none" stroke="${SERIES[i]}" stroke-width="2"/><text x="${X(x.points.at(-1).s) + 4}" y="${Y(x.points.at(-1).v) + 4}" fill="${INK.secondary}">${Math.round(x.points.at(-1).v)}</text>` : "").join("\n") });
}

export const PACE = { travelling: SERIES[0], doing: SERIES[1], waiting: SERIES[2], menus: "#b9b8b2" };
/** Pacing: the activity band over time, milestones as ticks, and the shares. */
export function pacingSvg({ pacing, t0, end, w = 1200, h = 220 }) {
  const L = 52, R = 70, pw = w - L - R, X = (s) => L + (s / Math.max(1, end)) * pw;
  const share = pacing.share, total = Object.values(share).reduce((a, b) => a + b.s, 0) || 1;
  let acc = 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="system-ui,sans-serif" font-size="11">
<rect width="${w}" height="${h}" fill="${INK.surface}"/>
<text x="${L}" y="18" font-size="13" font-weight="600" fill="${INK.primary}">Pacing: what the time went on, and when something new arrived</text>
${pacing.spans.map((sp) => `<rect x="${X((sp.from - t0) / 1000)}" y="34" width="${Math.max(0.5, X((sp.to - t0) / 1000) - X((sp.from - t0) / 1000))}" height="34" fill="${PACE[sp.cls]}"/>`).join("")}
${pacing.milestones.map((m) => `<line x1="${X(m.s)}" x2="${X(m.s)}" y1="72" y2="92" stroke="${INK.primary}" stroke-width="1.5"/>`).join("")}
<text x="${L}" y="106" fill="${INK.secondary}">▲ milestones (${pacing.milestones.length})</text>
${niceTicks(0, end, 8).map((v) => `<text x="${X(v)}" y="124" text-anchor="middle" fill="${INK.muted}">${fmtTime(v)}</text>`).join("")}
${Object.entries(share).map(([k, v]) => { const x = L + (acc / total) * pw, wd = (v.s / total) * pw; acc += v.s; return `<rect x="${x}" y="146" width="${Math.max(0, wd - 2)}" height="22" rx="3" fill="${PACE[k]}"/>${wd > 70 ? `<text x="${x + 6}" y="186" fill="${INK.primary}">${k} ${v.pct}%</text>` : ""}`; }).join("")}
${Object.keys(share).map((k, i) => `<g transform="translate(${L + i * 120},${h - 14})"><rect width="12" height="10" y="-9" rx="2" fill="${PACE[k]}"/><text x="17" fill="${INK.secondary}">${k}</text></g>`).join("")}
</svg>`;
}
