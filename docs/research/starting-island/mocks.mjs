// Concept-card generator for docs/research/STARTING-ISLAND-DESIGN.md.
// Not game code. Run: node docs/research/starting-island/mocks.mjs
// Writes one SVG card per art-direction option plus the blockout map.
import { writeFileSync } from "node:fs";

const OUT = new URL(".", import.meta.url).pathname;
const FONT = "Helvetica, Arial, sans-serif";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const pts = (p) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const poly = (p, fill, extra = "") => `<polygon points="${pts(p)}" fill="${fill}" ${extra}/>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// --- Card frame: elevation seen from the pod (looking west; south is left) ----
const W = 1200, H = 830, WL = 410, CX = 596, PX = 4, PXU = 1.45;
const X = (z) => CX + z * PX;
const Ya = (h) => WL - h * PX;
const Yb = (d) => WL + d * PXU;

/** Faceted low-poly land from a top profile [[z, h]...] closed at the waterline. */
function facetLand(profile, c, seed) {
  const r = rng(seed);
  const top = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [z0, h0] = profile[i], [z1, h1] = profile[i + 1];
    const n = Math.max(1, Math.round(Math.abs(z1 - z0) / 6));
    for (let k = 0; k < n; k++) {
      const t = k / n, edge = i === 0 && k === 0;
      const h = h0 + (h1 - h0) * t + (edge ? 0 : (r() - 0.5) * 0.9);
      top.push([X(z0 + (z1 - z0) * t), Ya(Math.max(0, h))]);
    }
  }
  top.push([X(profile.at(-1)[0]), Ya(profile.at(-1)[1])]);
  const core = top.map(([x, y]) => [x + (r() - 0.5) * 5, WL - (WL - y) * (0.6 + r() * 0.08)]);
  let s = poly([...top, [top.at(-1)[0], WL], [top[0][0], WL]], c.base);
  for (let i = 0; i < top.length - 1; i++) {
    const dy = top[i + 1][1] - top[i][1];
    const lit = dy < -2 ? c.light : dy > 2 ? c.shadow : c.mid;
    s += poly([top[i], top[i + 1], core[i]], r() < 0.2 ? mix(lit, c.mid, 0.3) : lit);
    s += poly([core[i], top[i + 1], core[i + 1]], mix(c.mid, c.shadow, 0.15 + r() * 0.2));
    s += poly([core[i], core[i + 1], [core[i + 1][0], WL], [core[i][0], WL]], i % 2 ? c.base : mix(c.base, c.shadow, 0.15));
  }
  return { svg: s, top };
}

/** Height of the top line at screen x (for placing props on the land). */
function topAt(top, x) {
  for (let i = 0; i < top.length - 1; i++)
    if (x >= top[i][0] && x <= top[i + 1][0]) {
      const t = (x - top[i][0]) / (top[i + 1][0] - top[i][0] || 1);
      return top[i][1] + (top[i + 1][1] - top[i][1]) * t;
    }
  return WL;
}

function plant(kind, x, y, s, c, r) {
  if (kind === "pandanus") {
    let o = `<line x1="${x}" y1="${y}" x2="${x + 2 * s}" y2="${y - 9 * s}" stroke="${c.trunk}" stroke-width="${1.6 * s}"/>`;
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI * (0.1 + 0.8 * (k / 6)), L = (7 + r() * 3) * s;
      o += `<line x1="${x + 2 * s}" y1="${y - 9 * s}" x2="${(x + 2 * s + Math.cos(a) * L).toFixed(1)}" y2="${(y - 9 * s + Math.sin(a) * L * 0.8).toFixed(1)}" stroke="${k % 2 ? c.leaf : c.leaf2}" stroke-width="${1.8 * s}" stroke-linecap="round"/>`;
    }
    return o;
  }
  if (kind === "clump") {
    const p = [];
    for (let k = 0; k < 7; k++) {
      const a = Math.PI + (Math.PI * k) / 6, R = (5 + r() * 2.5) * s;
      p.push([x + Math.cos(a) * R, y + Math.sin(a) * R * 0.9]);
    }
    return poly(p, r() < 0.5 ? c.leaf : c.leaf2) + poly([p[0], p[2], p[3], [x, y]], mix(c.leaf2, "#000000", 0.15));
  }
  if (kind === "fern") {
    let o = `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 12 * s}" stroke="${c.trunk}" stroke-width="${1.4 * s}"/>`;
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI * (0.05 + 0.9 * (k / 5)), L = 8 * s;
      o += `<path d="M${x},${y - 12 * s} q${(Math.cos(a) * L * 0.6).toFixed(1)},${(-4 * s).toFixed(1)} ${(Math.cos(a) * L).toFixed(1)},${(Math.sin(a) * L * 0.3 + 3 * s).toFixed(1)}" stroke="${k % 2 ? c.leaf : c.leaf2}" stroke-width="${2 * s}" fill="none" stroke-linecap="round"/>`;
    }
    return o;
  }
  if (kind === "heath") {
    const w = (6 + r() * 6) * s;
    return `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${2.4 * s}" fill="${r() < 0.6 ? c.leaf : c.leaf2}"/>`;
  }
  return "";
}

function scatter(top, z0, z1, every, kind, c, seed, s = 1) {
  const r = rng(seed);
  let o = "";
  for (let z = z0; z <= z1; z += every * (0.7 + r() * 0.6)) {
    const x = X(z);
    o += plant(kind, x, topAt(top, x) + 1.5, s * (0.8 + r() * 0.5), c, r);
  }
  return o;
}

/** Callout. Text starts at tx; the leader runs to whichever end of the text faces the point. */
function label(x, y, tx, ty, text, col = "#1d2a33") {
  const wTxt = text.length * 6.6;
  const lx = tx + wTxt + 6 < x ? tx + wTxt + 6 : tx - 4;
  return `<line x1="${x}" y1="${y}" x2="${lx}" y2="${ty}" stroke="${col}" stroke-width="1" opacity="0.7"/>` +
    `<circle cx="${x}" cy="${y}" r="2.6" fill="${col}"/>` +
    `<text x="${tx}" y="${ty + 4}" font-family="${FONT}" font-size="12.5" fill="${col}">${esc(text)}</text>`;
}

/** Rounded profile from overlapping domes [centre, half-width, height]; ends are cliffs of the given heights. */
function domes(list, z0, z1, h0 = 0, h1 = 0, step = 3) {
  const p = [[z0, 0], [z0, h0]];
  for (let z = z0 + step; z < z1; z += step) {
    let h = Math.max(h0 * (1 - (z - z0) / 40), h1 * (1 - (z1 - z) / 40), 1);
    for (const [c, w, H] of list) {
      const u = (z - c) / w;
      if (Math.abs(u) < 1) h = Math.max(h, H * Math.pow(1 - u * u, 0.55));
    }
    p.push([z, h]);
  }
  p.push([z1, h1], [z1, 0]);
  return p;
}

// The reef wreck's mast in the foreground water: the first breadcrumb from the pod.
const WRECK_MAST = `<line x1="1140" y1="${WL}" x2="1134" y2="${WL - 120}" stroke="#5a3a26" stroke-width="5"/><line x1="1110" y1="${WL - 92}" x2="1160" y2="${WL - 96}" stroke="#5a3a26" stroke-width="3"/>` +
  `<polygon points="1134,${WL - 118} 1172,${WL - 110} 1136,${WL - 100}" fill="#e2604e"/><ellipse cx="1138" cy="${WL + 2}" rx="22" ry="3" fill="#e4f6f1"/>`;

function sky(bands) {
  const h = WL / bands.length;
  return bands.map((b, i) => `<rect x="0" y="${(i * h).toFixed(1)}" width="${W}" height="${(h + 1).toFixed(1)}" fill="${b}"/>`).join("");
}

const WATER = ["#7fd2c4", "#5fbdb2", "#3f9c9a", "#2b7c83", "#1f5f6e", "#174a5b"];
function water() {
  const h = (650 - WL) / WATER.length;
  let o = WATER.map((w, i) => `<rect x="0" y="${(WL + i * h).toFixed(1)}" width="${W}" height="${(h + 1).toFixed(1)}" fill="${w}"/>`).join("");
  o += `<rect x="0" y="${WL - 3}" width="${W}" height="5" fill="#cfeee6"/>`;
  return o;
}

function palette(sw) {
  const w = (W - 48) / sw.length;
  let o = `<rect x="0" y="662" width="${W}" height="${H - 662}" fill="#f4f1ea"/>`;
  sw.forEach(([name, col], i) => {
    const x = 24 + i * w;
    o += `<rect x="${x.toFixed(1)}" y="676" width="${(w - 8).toFixed(1)}" height="86" rx="4" fill="${col}" stroke="#00000022"/>`;
    o += `<text x="${(x + 2).toFixed(1)}" y="782" font-family="${FONT}" font-size="12.5" font-weight="600" fill="#1d2a33">${esc(name)}</text>`;
    o += `<text x="${(x + 2).toFixed(1)}" y="799" font-family="${FONT}" font-size="11.5" fill="#55636d">${col}</text>`;
  });
  return o;
}

/** Underwater section: rock outline [[z, depth]...] from left edge to right edge. */
function seabed(outline, rock, seed) {
  const r = rng(seed);
  const p = outline.map(([z, d]) => [X(z), Yb(d)]);
  const tint = mix(rock, "#2b7c83", 0.42);
  let o = poly([...p, [W, 662], [0, 662]], tint);
  for (let i = 0; i < p.length - 1; i++)
    o += poly([p[i], p[i + 1], [(p[i][0] + p[i + 1][0]) / 2 + (r() - 0.5) * 20, Math.max(p[i][1], p[i + 1][1]) + 26]], i % 2 ? mix(tint, "#ffffff", 0.1) : mix(tint, "#000000", 0.1));
  // Sand and reef heads on the north shelf.
  const shelf = p.filter(([x, y]) => y > WL + 2 && x > X(95));
  if (shelf.length > 1) o += `<polyline points="${pts(shelf)}" fill="none" stroke="#e8dcb8" stroke-width="4"/>`;
  for (let i = 0; i < 9; i++) {
    const x = X(104 + i * 11 + r() * 6), y = Yb(7 + i * 0.7) - 2;
    o += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(5 + r() * 6).toFixed(1)}" ry="${(3 + r() * 3).toFixed(1)}" fill="${["#e2604e", "#e0a43a", "#4f9a7a", "#c98bb0"][i % 4]}" opacity="0.85"/>`;
  }
  return o;
}

const tube = (d, col, w, dash = "") => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;

function card(o) {
  const land = facetLand(o.profile, o.rock, o.seed);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  s += sky(o.sky) + (o.sun ? `<circle cx="${o.sun[0]}" cy="${o.sun[1]}" r="34" fill="${o.sun[2]}"/>` : "");
  s += o.far ?? "";
  s += water();
  s += seabed(o.seabed, o.rock.base, o.seed + 1);
  s += o.under ?? "";
  s += o.behind ?? "";
  s += land.svg;
  s += (o.dress ?? (() => ""))(land.top);
  s += (o.front ?? "") + WRECK_MAST;
  // Title block
  s += `<rect x="16" y="16" width="430" height="${o.pitch.length * 18 + 52}" rx="6" fill="#f4f1eaee"/>`;
  s += `<text x="30" y="46" font-family="${FONT}" font-size="22" font-weight="700" fill="#1d2a33">${esc(o.title)}</text>`;
  o.pitch.forEach((line, i) => (s += `<text x="30" y="${70 + i * 18}" font-family="${FONT}" font-size="13" fill="#33434e">${esc(line)}</text>`));
  // Ground-level vignette
  s += `<g transform="translate(818,16)"><rect width="366" height="226" rx="6" fill="#f4f1ea"/>` +
    `<svg x="6" y="6" width="354" height="190" viewBox="0 0 354 190">${o.vignette}</svg>` +
    `<text x="10" y="214" font-family="${FONT}" font-size="12.5" fill="#33434e">${esc(o.vignetteCaption)}</text></g>`;
  s += o.labels ?? "";
  s += `<text x="${W - 20}" y="650" font-family="${FONT}" font-size="11.5" fill="#e9f6f2" text-anchor="end">View from the pod, looking west (south ← → north), with the reef wreck's mast in front. Below the water: cutaway, depth compressed.</text>`;
  s += palette(o.palette);
  return s + "</svg>";
}

// Shared below-water outline: south (left) falls into the drop and gully, north shelves shallow.
const SEABED = [[-200, 150], [-175, 120], [-150, 92], [-130, 60], [-115, 40], [-100, 28], [-95, 0], [100, 0], [108, 6], [125, 9], [150, 12], [175, 14], [200, 15]];

// --- Option A: Lifted Reef ---------------------------------------------------
const A = {
  title: "A · Lifted Reef  (recommended)",
  pitch: ["A raised coral-limestone island: pale domes undercut at the", "waterline, sinkholes, a blue shaft. The reef, lifted into the air."],
  seed: 11,
  sky: ["#bfe3e6", "#cbe9e8", "#d8efea", "#e4f3ec", "#eef6ec"],
  sun: [560, 64, "#fbf3d8"],
  rock: { light: "#f1e9d4", mid: "#d6cdb8", shadow: "#a39c8e", base: "#8f897d" },
  profile: domes([[-30, 30, 55], [4, 26, 36], [36, 24, 24], [-74, 22, 24], [66, 22, 10]], -100, 94, 12, 2),
  seabed: SEABED,
  palette: [["Bleached Coral", "#EFE6D0"], ["Karst Crust", "#958F84"], ["Notch Shadow", "#33404F"], ["Pandanus", "#4F7A3A"], ["Fern Lime", "#9BBE4E"], ["Lagoon Glass", "#7FD6C9"], ["Sinkhole Blue", "#1E4E73"], ["Lichen Saffron", "#E0A43A"], ["Hibiscus", "#E2604E"], ["Whitewash", "#F7F4EC"]],
  vignetteCaption: "Ground level: boardwalk under the notch overhang, tide pool.",
};
A.under = [
  tube(`M${X(-99)},${Yb(1)} q40,8 70,-2 t50,10`, "#141d26", 13),
  tube(`M${X(84)},${Yb(5)} q-30,4 -54,-2`, "#141d26", 11),
  `<ellipse cx="${X(68)}" cy="${Yb(1)}" rx="18" ry="7" fill="#bfe3e6"/>`,
  tube(`M${X(-34)},${Yb(0)} L${X(-36)},${Yb(30)} q-10,30 -40,44 t-60,60 t-80,70`, "#0e1820", 12),
  label(X(-96), Yb(2), 20, 470, "the Throat: dark sea cave", "#eaf6f3"),
  label(X(68), Yb(2), 880, 470, "the Bell: air-pocket cave", "#eaf6f3"),
  label(X(-36), Yb(36), 20, 560, "the Under-Stair → gully, ~140 m (150 m suit)", "#eaf6f3"),
].join("");
A.behind = (() => { // satellite mushroom islets on the lagoon rim
  const isle = (z, w, h) => poly([[X(z - w), Ya(h)], [X(z - w * 0.8), Ya(h + 3)], [X(z), Ya(h + 4.5)], [X(z + w * 0.8), Ya(h + 3)], [X(z + w), Ya(h)], [X(z + w * 0.55), Ya(2)], [X(z - w * 0.55), Ya(2)]], "#e3dac4") +
    poly([[X(z - w), Ya(h)], [X(z - w * 0.55), Ya(2)], [X(z - w * 0.2), Ya(h)]], "#c9c0aa") +
    poly([[X(z - w * 0.55), Ya(2.2)], [X(z + w * 0.55), Ya(2.2)], [X(z + w * 0.42), WL], [X(z - w * 0.42), WL]], "#33404f") +
    `<ellipse cx="${X(z)}" cy="${Ya(h + 4)}" rx="${w * 3.4}" ry="8" fill="#4f7a3a"/><ellipse cx="${X(z) + 6}" cy="${Ya(h + 5)}" rx="${w * 2}" ry="5" fill="#6f9a3f"/>`;
  return isle(102, 8, 7) + isle(120, 5, 5) + isle(-116, 6, 6);
})();
A.dress = (top) => {
  const c = { trunk: "#6b5a44", leaf: "#4f7a3a", leaf2: "#6f9a3f" };
  let o = scatter(top, -92, 70, 5, "clump", c, 3, 1.3) + scatter(top, -86, 76, 11, "pandanus", c, 4, 1.4);
  // Notch: a dark undercut band at the waterline with a scalloped lip, and daylight under the end overhangs.
  const n = [];
  for (let z = -100; z <= 94; z += 3) n.push([X(z), WL - 9 - (Math.sin(z * 0.7) + 1) * 2.5]);
  o += poly([...n, [X(94), WL], [X(-100), WL]], "#33404f");
  o += poly([[X(-100), Ya(2.6)], [X(-100), WL], [X(-96), WL]], "#7fd2c4");
  // Window arch (sky through rock), lookout pillar with its red sighting vane, station, cove crane, blowhole.
  o += `<ellipse cx="${X(40)}" cy="${Ya(13)}" rx="12" ry="15" fill="#e4f3ec"/>`;
  const ly = topAt(top, X(-30));
  o += poly([[X(-31), ly], [X(-29), ly], [X(-29.4), ly - 30], [X(-30.6), ly - 30]], "#f7f4ec") + `<rect x="${X(-31.6)}" y="${ly - 36}" width="11" height="6" fill="#e2604e"/>`;
  const sy = topAt(top, X(8));
  o += `<rect x="${X(4)}" y="${sy - 15}" width="30" height="17" fill="#f7f4ec"/><polygon points="${pts([[X(3), sy - 15], [X(8.5), sy - 22], [X(12.5), sy - 15]])}" fill="#b9b2a2"/><line x1="${X(11)}" y1="${sy - 15}" x2="${X(11)}" y2="${sy - 52}" stroke="#33404f" stroke-width="2"/><polygon points="${pts([[X(11), sy - 52], [X(14), sy - 50], [X(11), sy - 47]])}" fill="#e2604e"/>`;
  o += `<line x1="${X(-94)}" y1="${Ya(10)}" x2="${X(-86)}" y2="${Ya(27)}" stroke="#e0a43a" stroke-width="4"/><line x1="${X(-86)}" y1="${Ya(27)}" x2="${X(-76)}" y2="${Ya(27)}" stroke="#e0a43a" stroke-width="4"/><line x1="${X(-77)}" y1="${Ya(27)}" x2="${X(-77)}" y2="${Ya(21)}" stroke="#33404f" stroke-width="1.5"/>`;
  const by = topAt(top, X(-60));
  o += `<path d="M${X(-62)},${by} q-9,-26 3,-56 q11,28 3,56z" fill="#ffffff" opacity="0.9"/>`;
  o += [-42, -24, -72].map((z) => `<ellipse cx="${X(z)}" cy="${topAt(top, X(z)) + 5}" rx="12" ry="3" fill="#e0a43a" opacity="0.95"/>`).join("");
  return o;
};
A.labels = [
  label(X(-30), Ya(64), 200, 140, "Lookout: survey pillar + sighting plate"),
  label(X(9), Ya(42), 560, 112, "Field station on the saddle shoulder"),
  label(X(40), Ya(13), 800, 300, "the Window (natural arch)"),
  label(X(-90), Ya(24), 20, 280, "Workshop crane over the Elbow"),
  label(X(-61), Ya(31), 20, 236, "Blowhole spout (a moving lure)"),
  label(X(102), Ya(10), 880, 352, "Mushroom islets on the lagoon rim"),
].join("");
A.vignette = `<rect width="354" height="190" fill="#d8efea"/><rect y="118" width="354" height="72" fill="#7fd6c9"/><rect y="150" width="354" height="40" fill="#5fbdb2"/>
<polygon points="0,20 70,8 160,14 240,6 354,18 354,92 300,100 230,96 160,104 90,98 0,102" fill="#efe6d0"/>
<polygon points="0,20 70,8 160,14 120,60 40,64" fill="#d6cdb8"/><polygon points="240,6 354,18 354,70 280,60" fill="#a39c8e"/>
<polygon points="0,102 90,98 160,104 230,96 300,100 354,92 354,124 0,124" fill="#33404f"/>
<ellipse cx="80" cy="12" rx="60" ry="10" fill="#4f7a3a"/><ellipse cx="230" cy="8" rx="50" ry="8" fill="#6f9a3f"/><ellipse cx="160" cy="14" rx="16" ry="3" fill="#e0a43a"/>
<rect x="30" y="126" width="300" height="6" fill="#a98a5e"/>${Array.from({ length: 16 }, (_, i) => `<rect x="${32 + i * 18.6}" y="126" width="2" height="6" fill="#6b5a44"/>`).join("")}
<line x1="30" y1="126" x2="30" y2="160" stroke="#6b5a44" stroke-width="3"/><line x1="330" y1="126" x2="330" y2="160" stroke="#6b5a44" stroke-width="3"/>
<ellipse cx="260" cy="168" rx="46" ry="9" fill="#2b7c83"/><circle cx="246" cy="166" r="3" fill="#e2604e"/><circle cx="274" cy="170" r="2.4" fill="#e0a43a"/>
<line x1="340" y1="92" x2="320" y2="40" stroke="#6b5a44" stroke-width="3"/>${[0, 1, 2, 3, 4, 5].map((k) => `<line x1="320" y1="40" x2="${320 + Math.cos(-Math.PI * (0.1 + k * 0.16)) * 26}" y2="${40 + Math.sin(-Math.PI * (0.1 + k * 0.16)) * 18}" stroke="#4f7a3a" stroke-width="3" stroke-linecap="round"/>`).join("")}`;

// --- Option B: Lichen Tor ----------------------------------------------------
function boulder(cx, cy, rx, ry, seed, c) {
  const r = rng(seed), p = [];
  for (let k = 0; k < 9; k++) {
    const a = (Math.PI * 2 * k) / 9 + r() * 0.2;
    p.push([cx + Math.cos(a) * rx * (0.88 + r() * 0.14), cy + Math.sin(a) * ry * (0.86 + r() * 0.16)]);
  }
  let o = poly(p, c.mid);
  o += poly([p[4], p[5], p[6], p[7], [cx, cy]], c.light) + poly([p[0], p[1], p[2], [cx, cy]], c.shadow);
  o += poly([p[6], p[7], [cx + (p[7][0] - cx) * 0.4, cy + (p[7][1] - cy) * 0.6], [cx + (p[5][0] - cx) * 0.5, cy + (p[5][1] - cy) * 0.6]], c.lichen);
  return o;
}
const GRANITE = { light: "#e6e0d6", mid: "#b9b3aa", shadow: "#7d7880", lichen: "#e39a2b" };
const B = {
  title: "B · Lichen Tor",
  pitch: ["Rounded granite stacked into tors, blazing saffron lichen,", "pink thrift and heath over white quartz sand and turquoise."],
  seed: 21,
  sky: ["#c6dfee", "#d2e6ef", "#dfecef", "#ebf2ee", "#f3f4ec"],
  sun: [560, 64, "#fff6dc"],
  rock: { light: "#ddd6cb", mid: "#bdb7ad", shadow: "#8a8489", base: "#76717a" },
  profile: domes([[-24, 62, 42], [40, 48, 20], [-76, 26, 18]], -98, 96, 3, 1),
  seabed: SEABED,
  palette: [["Dove Granite", "#B9B3AA"], ["Shadow Granite", "#6E6A70"], ["Lichen Saffron", "#E39A2B"], ["Lichen Lemon", "#D9C95A"], ["Thrift Pink", "#E59AB0"], ["Heath Mauve", "#8E6A8F"], ["Salt Sage", "#A9B78E"], ["Quartz Sand", "#F2EEE3"], ["Shallows Turquoise", "#5FD3C4"], ["Hut Red", "#A63A2E"]],
  vignetteCaption: "Ground level: tor stack, thrift cushions, a red hut beyond.",
};
B.under = [
  tube(`M${X(-97)},${Yb(2)} q30,-2 54,8`, "#141d26", 10),
  tube(`M${X(-30)},${Yb(0)} L${X(-32)},${Yb(40)} q-30,40 -120,60 t-120,80`, "#0e1820", 9, "10 6"),
  label(X(-94), Yb(3), 20, 470, "zawn: a narrow sea cleft roofed by chockstones", "#eaf6f3"),
  label(X(-32), Yb(44), 20, 560, "deep passage needs a fault or old adit (weaker fit)", "#eaf6f3"),
].join("");
B.dress = (top) => {
  const c = { trunk: "#6b5a44", leaf: "#8e6a8f", leaf2: "#a9b78e" };
  let o = scatter(top, -95, 92, 4, "heath", c, 7, 1.4);
  o += [[-26, 10, 9, 1], [-22, 26, 7, 2], [-27, 37, 5, 3], [-66, 8, 8, 4], [-62, 21, 6, 5], [34, 9, 7, 6], [37, 20, 5, 7], [70, 4, 6, 8], [-84, 3, 6, 9], [8, 6, 6, 10], [52, 5, 5, 11]]
    .map(([z, h, rr, sd]) => boulder(X(z), topAt(top, X(z)) - h * 1.9, rr * 4, rr * 3.2, sd, GRANITE)).join("");
  o += [-86, -52, 0, 22, 60, 80].map((z) => `<ellipse cx="${X(z)}" cy="${topAt(top, X(z)) + 3}" rx="8" ry="3" fill="#e59ab0"/>`).join("");
  const hy = topAt(top, X(10));
  o += `<rect x="${X(6)}" y="${hy - 14}" width="26" height="16" fill="#a63a2e"/><polygon points="${pts([[X(5), hy - 14], [X(9.25), hy - 22], [X(13.5), hy - 14]])}" fill="#5a2a24"/>`;
  o += [[108, 2, 4], [116, 1, 3], [-104, 1, 4]].map(([z, h, rr], i) => boulder(X(z), Ya(h), rr * 4, rr * 3, 40 + i, GRANITE)).join("");
  return o;
};
B.labels = [
  label(X(-27), Ya(78), 560, 112, "Summit tor = the lookout (named rocks)"),
  label(X(10), Ya(46), 600, 150, "Red-roofed field hut"),
  label(X(-64), Ya(38), 20, 230, "Logan stone: it rocks when pushed"),
  label(X(108), Ya(4), 860, 320, "Boulder beach: pools between stones"),
].join("");
B.vignette = `<rect width="354" height="190" fill="#dfecef"/><rect y="132" width="354" height="58" fill="#5fd3c4"/>
<polygon points="0,140 354,128 354,190 0,190" fill="#f2eee3"/><polygon points="0,150 354,146 354,190 0,190" fill="#a9b78e"/>
${boulder(120, 106, 56, 40, 1, GRANITE)}${boulder(130, 52, 40, 26, 2, GRANITE)}${boulder(112, 22, 22, 14, 3, { ...GRANITE, lichen: "#d9c95a" })}${boulder(240, 126, 30, 20, 4, GRANITE)}
<ellipse cx="60" cy="160" rx="22" ry="7" fill="#e59ab0"/><ellipse cx="300" cy="158" rx="30" ry="8" fill="#8e6a8f"/><ellipse cx="200" cy="168" rx="18" ry="6" fill="#e59ab0"/>
<rect x="300" y="108" width="20" height="14" fill="#a63a2e"/><polygon points="298,108 310,98 322,108" fill="#5a2a24"/>`;

// --- Option C: Cloud Spire ---------------------------------------------------
const C = {
  title: "C · Cloud Spire",
  pitch: ["A steep, fluted volcanic plug in a cap of mist: tree ferns,", "a waterfall into the lagoon, and a lookout above the cloud."],
  seed: 31,
  sky: ["#b3d3dc", "#c1dbe0", "#cfe3e3", "#dcebe6", "#e7f1ea"],
  sun: [760, 150, "#fbf6e2"],
  rock: { light: "#86727f", mid: "#65535f", shadow: "#41353f", base: "#352c36" },
  profile: [[-98, 0], [-92, 8], [-84, 18], [-74, 30], [-62, 44], [-50, 58], [-40, 70], [-32, 80], [-26, 84], [-20, 78], [-12, 64], [-2, 52], [10, 42], [22, 32], [34, 24], [48, 16], [62, 10], [76, 5], [88, 2], [96, 0]],
  seabed: SEABED,
  palette: [["Wet Basalt Plum", "#5D4C5A"], ["Night Rock", "#2F2731"], ["Moss Deep", "#2F5B3A"], ["Fern Lime", "#A6C94F"], ["Mist White", "#E8EEF0"], ["Falls Glint", "#CFF3F5"], ["Ohia Red", "#C8423A"], ["Ash Path", "#B98A4E"], ["Black Sand", "#3B3A3C"], ["Lagoon", "#4FC7C0"]],
  vignetteCaption: "Ground level: tree ferns, ridges fading into the cloud.",
};
C.under = [
  tube(`M${X(-97)},${Yb(2)} q30,-2 54,8 t40,-2`, "#120d14", 12),
  tube(`M${X(-30)},${Yb(0)} L${X(-34)},${Yb(30)} q-14,40 -60,60 t-140,90`, "#0e1820", 11),
  label(X(-92), Yb(4), 20, 470, "lava-tube sea cave (echoes the Rift: overlap)", "#eaf6f3"),
  label(X(-36), Yb(36), 20, 560, "lava tube down to the gully", "#eaf6f3"),
].join("");
C.dress = (top) => {
  const c = { trunk: "#4a3a2c", leaf: "#2f5b3a", leaf2: "#a6c94f" };
  let o = scatter(top, -90, 80, 4, "clump", c, 13, 1.4) + scatter(top, -70, 50, 8, "fern", c, 14, 1.5);
  o += `<path d="M${X(-4)},${Ya(50)} C${X(-2)},${Ya(36)} ${X(2)},${Ya(20)} ${X(4)},${Ya(2)}" stroke="#cff3f5" stroke-width="6" fill="none"/>`;
  o += [[-30, 62, 80, 9], [12, 58, 66, 7], [-62, 50, 50, 6]].map(([z, h, w, t]) => `<rect x="${X(z) - w * 1.6}" y="${Ya(h)}" width="${w * 3.2}" height="${t * 3}" rx="${t * 1.5}" fill="#e8eef0" opacity="0.95"/>`).join("");
  o += `<rect x="${X(-27)}" y="${Ya(92)}" width="4" height="32" fill="#b98a4e"/><rect x="${X(-29)}" y="${Ya(93)}" width="12" height="5" fill="#c8423a"/>`;
  return o;
};
C.labels = [
  label(X(-26), Ya(92), 560, 50, "Lookout above the cloud band"),
  label(X(1), Ya(36), 640, 196, "Waterfall: spring → lagoon"),
  label(X(-62), Ya(54), 20, 150, "Mist bands hide the summit from below"),
].join("");
C.vignette = `<rect width="354" height="190" fill="#cfe3e3"/>
<polygon points="0,120 60,60 110,80 170,30 240,70 300,50 354,90 354,190 0,190" fill="#9fb3b5"/>
<rect x="0" y="70" width="354" height="26" rx="13" fill="#e8eef0"/>
<polygon points="0,150 80,100 150,120 230,90 354,130 354,190 0,190" fill="#5d4c5a"/>
<polygon points="0,170 120,140 260,150 354,160 354,190 0,190" fill="#2f5b3a"/>
<path d="M200,92 C204,120 206,150 208,175" stroke="#cff3f5" stroke-width="5" fill="none"/>
${plant("fern", 70, 182, 4, { trunk: "#4a3a2c", leaf: "#2f5b3a", leaf2: "#a6c94f" }, rng(5))}${plant("fern", 300, 186, 3, { trunk: "#4a3a2c", leaf: "#2f5b3a", leaf2: "#a6c94f" }, rng(6))}
<circle cx="150" cy="176" r="4" fill="#c8423a"/><circle cx="160" cy="180" r="3" fill="#c8423a"/>`;

// --- Option D: Keeper's Terraces ----------------------------------------------
const D = {
  title: "D · Keeper's Terraces",
  pitch: ["A plain round hill made legible by people: stepped walls,", "an incline rail, cisterns, all being swallowed by figs and flowers."],
  seed: 41,
  sky: ["#cfe0e8", "#d9e6ea", "#e3ece9", "#ecf1e8", "#f3f3e6"],
  sun: [560, 64, "#fff3d6"],
  rock: { light: "#b2af9e", mid: "#949484", shadow: "#67695f", base: "#585b52" },
  profile: domes([[-14, 84, 48], [50, 40, 14]], -98, 96, 2, 1),
  seabed: SEABED,
  palette: [["Limewash", "#EFE8DA"], ["Terracotta", "#C0643F"], ["Rust", "#8E4A2B"], ["Fig Bark", "#8C8A80"], ["Leaf Deep", "#355E3B"], ["Olive", "#8A8F4A"], ["Bougainvillea", "#C2357A"], ["Verdigris", "#5FA39A"], ["Wall Stone", "#A8A594"], ["Cistern Teal", "#3F8C8A"]],
  vignetteCaption: "Ground level: terrace wall, fig roots over a doorway.",
};
D.under = [
  tube(`M${X(-97)},${Yb(2)} q30,-2 54,8`, "#141d26", 10),
  `<rect x="${X(-36)}" y="${Yb(0)}" width="24" height="24" fill="#0e1820"/>`,
  tube(`M${X(-31)},${Yb(16)} q-20,40 -90,60 t-140,80`, "#0e1820", 9),
  label(X(-31), Yb(30), 20, 560, "flooded cistern stair + drain tunnel", "#eaf6f3"),
  label(X(-94), Yb(3), 20, 470, "boat cave with a rusted gate", "#eaf6f3"),
].join("");
D.dress = (top) => {
  const c = { trunk: "#6b5a44", leaf: "#355e3b", leaf2: "#8a8f4a" };
  let o = "";
  for (let h = 6; h < 46; h += 6) {
    const xs = top.filter(([, y]) => y <= Ya(h)).map(([x]) => x);
    if (xs.length) o += `<rect x="${Math.min(...xs) + 8}" y="${Ya(h) - 1}" width="${Math.max(...xs) - Math.min(...xs) - 16}" height="4" fill="#efe8da"/>`;
  }
  o += scatter(top, -90, 80, 6, "clump", c, 17, 1.4);
  o += `<line x1="${X(86)}" y1="${Ya(3)}" x2="${X(-10)}" y2="${Ya(47)}" stroke="#8e4a2b" stroke-width="3"/>`;
  const hy = topAt(top, X(-14));
  o += `<rect x="${X(-20)}" y="${hy - 22}" width="40" height="24" fill="#efe8da"/><polygon points="${pts([[X(-21), hy - 22], [X(-14), hy - 32], [X(-6.5), hy - 22]])}" fill="#c0643f"/><rect x="${X(-16)}" y="${hy - 14}" width="7" height="10" fill="#2a2e2a"/>`;
  const cy = topAt(top, X(-48));
  o += `<rect x="${X(-52)}" y="${cy - 20}" width="24" height="20" rx="3" fill="#3f8c8a"/><rect x="${X(26)}" y="${topAt(top, X(26)) - 36}" width="3" height="36" fill="#8e4a2b"/>`;
  o += [-70, -40, -4, 20, 46].map((z) => `<circle cx="${X(z)}" cy="${topAt(top, X(z)) + 4}" r="6" fill="#c2357a"/>`).join("");
  return o;
};
D.labels = [
  label(X(-12), Ya(58), 620, 112, "Keeper's house on the crown"),
  label(X(40), Ya(23), 800, 300, "Incline rail from the landing"),
  label(X(-45), Ya(36), 20, 210, "Cistern, terraces, walled plots"),
].join("");
D.vignette = `<rect width="354" height="190" fill="#e3ece9"/>
<rect x="0" y="60" width="354" height="130" fill="#a8a594"/>${[70, 95, 120, 145, 170].map((y) => `<rect x="0" y="${y}" width="354" height="2" fill="#8a8a7a"/>`).join("")}
<rect x="130" y="96" width="60" height="94" fill="#2a2e2a"/><rect x="124" y="90" width="72" height="8" fill="#efe8da"/>
<path d="M90,40 C120,70 110,120 140,190 M100,40 C150,80 150,140 170,190 M230,30 C200,80 210,140 196,190" stroke="#8c8a80" stroke-width="7" fill="none"/>
<ellipse cx="160" cy="40" rx="110" ry="34" fill="#355e3b"/><ellipse cx="60" cy="56" rx="50" ry="20" fill="#8a8f4a"/>
${[[40, 70], [70, 80], [260, 64], [290, 80], [300, 60], [240, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#c2357a"/>`).join("")}
<rect x="0" y="176" width="354" height="14" fill="#c0643f"/>`;

for (const [file, o] of [["option-a-lifted-reef.svg", A], ["option-b-lichen-tor.svg", B], ["option-c-cloud-spire.svg", C], ["option-d-keepers-terraces.svg", D]])
  writeFileSync(OUT + file, card(o));

// --- Blockout map (local metres: origin = island centre; +x east, +z north) ----
const MW = 1120, MH = 1210, S = 2.6;
const mx = (x) => 110 + (x + 150) * S;
const my = (z) => 50 + (120 - z) * S;
const P = (list) => list.map(([x, z]) => [mx(x), my(z)]);
const smooth = (list, close = true) => {
  const p = P(list);
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  const n = p.length;
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + (close ? "Z" : "");
};
const LAND = [[90, -20], [95, 0], [92, 25], [75, 40], [55, 45], [35, 44], [15, 56], [-5, 68], [-30, 70], [-55, 66], [-80, 60], [-102, 46], [-112, 20], [-113, 0], [-108, -25], [-100, -45], [-85, -65], [-65, -80], [-40, -90], [-15, -96], [10, -93], [30, -90], [48, -94], [62, -88], [64, -78], [52, -70], [42, -60], [43, -48], [55, -42], [68, -46], [75, -58], [80, -70], [92, -60], [96, -40]];
const SHELF = [[120, -40], [128, 10], [120, 60], [112, 112], [60, 122], [0, 106], [-60, 102], [-110, 90], [-140, 50], [-146, 0], [-138, -40], [-118, -80], [-80, -110], [-30, -118], [20, -118], [70, -112], [108, -90]];
const C10 = [[78, -14], [80, 10], [66, 30], [40, 36], [12, 46], [-20, 58], [-55, 54], [-90, 40], [-100, 10], [-98, -25], [-84, -52], [-60, -70], [-30, -80], [0, -82], [25, -78], [36, -56], [58, -30]];
const C25 = [[60, -8], [52, 8], [30, 6], [5, 20], [-25, 40], [-55, 40], [-70, 20], [-60, -5], [-50, -40], [-35, -60], [-10, -62], [15, -50], [35, -30]];
const C40 = [[10, -26], [0, -12], [-20, -10], [-38, -22], [-38, -42], [-20, -50], [0, -44]];
const LAGOON = [[35, 46], [75, 42], [92, 32], [103, 58], [100, 86], [72, 99], [42, 95], [24, 80], [18, 62]];

const NUM = [
  [1, 110, 12, "Reef wreck"], [2, 90, 5, "Landing beach"], [3, 62, 74, "Lagoon"], [4, 38, -15, "the Window"],
  [5, -15, -30, "Lookout"], [6, -45, 25, "Field station"], [7, -27, 8, "Sealed hatch (Cold Store)"], [8, -10, 45, "Spring"],
  [9, -75, -10, "Hidden garden"], [10, -96, 56, "Tide pools"], [11, -84, -70, "the Throat (dark)"], [12, -114, 8, "the Bell (air pocket)"],
  [13, 56, -58, "Workshop cove"], [14, 18, -104, "Under-Stair, upper mouth"], [15, -58, -84, "Blowhole"], [16, 122, 44, "Kelp stand"],
  [17, 101, 88, "Tide wheel"], [18, 58, -6, "Fluted Steps"], [19, -126, 66, "Mushroom islets"], [20, -12, -186, "Under-Stair, gully mouth"],
];

let m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MW} ${MH}" width="${MW}" height="${MH}">`;
m += `<rect width="${MW}" height="${MH}" fill="#f4f1ea"/><rect x="0" y="0" width="${MW}" height="${my(-205)}" fill="#5fbdb2"/>`;
m += `<text x="${mx(150)}" y="${my(100)}" font-family="${FONT}" font-size="12" fill="#1f5f6e" text-anchor="middle">Hearth Reef, 8–20 m</text>`;
m += `<path d="M0,${my(-120)} L${mx(-150)},${my(-120)} C${mx(-90)},${my(-130)} ${mx(-60)},${my(-140)} ${mx(-40)},${my(-140)} L${mx(40)},${my(-135)} C${mx(110)},${my(-140)} ${mx(160)},${my(-150)} ${MW},${my(-160)} L${MW},${my(-205)} L0,${my(-205)}Z" fill="#2b7c83"/>`;
m += `<path d="M${mx(-60)},${my(-205)} C${mx(-40)},${my(-170)} ${mx(-30)},${my(-150)} ${mx(-12)},${my(-140)} C${mx(5)},${my(-150)} ${mx(15)},${my(-175)} ${mx(30)},${my(-205)}Z" fill="#174a5b"/>`;
m += `<text x="${mx(-10)}" y="${my(-196)}" font-family="${FONT}" font-size="13" fill="#d9f0ea" text-anchor="middle">Hearth drop gully (→ Basin west lobe)</text>`;
m += `<text x="${mx(-140)}" y="${my(-130)}" font-family="${FONT}" font-size="12" fill="#d9f0ea">shelf break, 30–40 m</text>`;
m += `<path d="${smooth(SHELF)}" fill="#7fd2c4"/><text x="${mx(-140)}" y="${my(95)}" font-family="${FONT}" font-size="12" fill="#1f5f6e">shelf 2–15 m</text>`;
// kelp
const kr = rng(9);
for (let i = 0; i < 40; i++) { const x = 104 + kr() * 34, z = 26 + kr() * 40; m += `<circle cx="${mx(x)}" cy="${my(z)}" r="3" fill="#3f7d4a"/>`; }
for (let i = 0; i < 26; i++) { const x = -40 + kr() * 80, z = 80 + kr() * 26; m += `<circle cx="${mx(x)}" cy="${my(z)}" r="2.6" fill="#3f7d4a"/>`; }
m += `<path d="${smooth(LAND)}" fill="#efe6d0" stroke="#33404f" stroke-width="2"/>`;
m += `<path d="${smooth(LAGOON)}" fill="#a9e6dc" stroke="#7fbfb4"/>`;
m += `<path d="M${mx(92)},${my(28)} C${mx(104)},${my(45)} ${mx(108)},${my(62)} ${mx(105)},${my(78)}" stroke="#d9cfb8" stroke-width="${7 * S}" fill="none" stroke-linecap="round"/>`;
m += `<path d="M${mx(97)},${my(94)} C${mx(85)},${my(104)} ${mx(55)},${my(104)} ${mx(38)},${my(96)} C${mx(26)},${my(88)} ${mx(18)},${my(74)} ${mx(18)},${my(60)}" stroke="#d9cfb8" stroke-width="${6 * S}" fill="none" stroke-linecap="round"/>`;
m += [[-126, 66, 7], [-130, 40, 5], [-120, 84, 4], [70, 84, 4], [50, 72, 3]].map(([x, z, r]) => `<circle cx="${mx(x)}" cy="${my(z)}" r="${r * S}" fill="#d9cfb8" stroke="#33404f"/><circle cx="${mx(x)}" cy="${my(z)}" r="${r * S * 0.6}" fill="#6f9a3f"/>`).join("");
m += `<path d="M${mx(-112)},${my(70)} L${mx(-70)},${my(76)} L${mx(-62)},${my(52)} L${mx(-104)},${my(36)}Z" fill="#d9cfb8"/>`;
for (const [x, z, r] of [[-100, 60, 3], [-92, 66, 2.2], [-84, 58, 2.6], [-96, 48, 1.8], [-78, 66, 2], [-88, 50, 1.6], [-70, 62, 2.4]]) m += `<ellipse cx="${mx(x)}" cy="${my(z)}" rx="${r * S}" ry="${r * S * 0.7}" fill="#5fbdb2"/>`;
m += `<path d="${smooth(C10)}" fill="#e3d8be" stroke="#b5a98f" stroke-width="1"/>`;
m += `<path d="${smooth(C25)}" fill="#cfd8a8" stroke="#a7ad83" stroke-width="1"/>`;
m += `<path d="${smooth(C40)}" fill="#b9c98c" stroke="#8b9a63" stroke-width="1"/>`;
m += [[90, -8, "0"], [72, 20, "10 m"], [40, 0, "25 m"], [-4, -20, "40 m"]].map(([x, z, t]) => `<text x="${mx(x)}" y="${my(z)}" font-family="${FONT}" font-size="10.5" fill="#6d6450">${t}</text>`).join("");
m += `<ellipse cx="${mx(-75)}" cy="${my(-10)}" rx="${16 * S}" ry="${14 * S}" fill="#3f6a34" stroke="#33404f" stroke-width="2"/>`;
for (let i = 0; i < 6; i++) m += `<rect x="${mx(-84) + (i % 3) * 14}" y="${my(-4) + Math.floor(i / 3) * 16}" width="10" height="6" fill="#9bbe4e"/>`;
m += `<path d="M${mx(-10)},${my(45)} C${mx(5)},${my(52)} ${mx(15)},${my(54)} ${mx(30)},${my(52)}" stroke="#4fa9d6" stroke-width="3" fill="none"/>`;
// Paths: trails, boardwalk, cable, shortcuts
const trail = (list, col = "#8a5a2b", dash = "7 5", w = 2.6) => `<path d="${smooth(list, false)}" stroke="${col}" stroke-width="${w}" fill="none" stroke-dasharray="${dash}" stroke-linecap="round"/>`;
m += trail([[84, 0], [66, -6], [52, -2], [38, -15], [20, -25], [4, -20], [-6, -32], [-15, -30]]);
m += trail([[-15, -30], [-26, -12], [-36, 6], [-45, 25]]);
m += trail([[-45, 25], [-28, 40], [-10, 45]]);
m += trail([[88, 26], [62, 38], [40, 47], [25, 55]]);
m += trail([[38, -15], [44, -32], [52, -46]]);
m += trail([[-45, 25], [-60, 18], [-62, 4]], "#8a5a2b", "2 5");
m += trail([[-45, 25], [-66, 42], [-82, 52]], "#c0392b", "3 4", 2.2);
m += trail([[-62, 2], [-70, -4]], "#c0392b", "3 4", 2.2);
m += trail([[-45, 25], [-22, -4], [8, -20], [38, -34], [52, -48]], "#33404f", "1 7", 3);
// Caves and the deep passage
const cave = (list, col = "#141d26", dash = "2 4", w = 4) => `<path d="${smooth(list, false)}" stroke="${col}" stroke-width="${w}" fill="none" stroke-dasharray="${dash}" stroke-linecap="round"/>`;
m += cave([[-84, -70], [-72, -58], [-60, -50], [-50, -44]]);
m += `<circle cx="${mx(-50)}" cy="${my(-44)}" r="9" fill="#141d26"/>`;
m += cave([[-114, 8], [-100, 4], [-88, -4]]);
m += `<circle cx="${mx(-88)}" cy="${my(-4)}" r="11" fill="#bfe3e6" stroke="#141d26" stroke-width="2"/>`;
m += cave([[-88, -4], [-80, -8]], "#141d26", "2 3", 3);
m += cave([[18, -104], [8, -84], [-8, -62]], "#1e4e73", "9 5", 5);
m += cave([[-28, 9], [-30, -10], [-8, -62], [-6, -100], [-8, -140], [-12, -186]], "#1e4e73", "9 5", 5);
// Workshop
m += `<rect x="${mx(46)}" y="${my(-44)}" width="${12 * S}" height="${7 * S}" fill="#f7f4ec" stroke="#33404f" stroke-width="1.5"/>`;
m += `<rect x="${mx(-50)}" y="${my(29)}" width="${12 * S}" height="${7 * S}" fill="#f7f4ec" stroke="#33404f" stroke-width="1.5"/>`;
m += `<rect x="${mx(-31)}" y="${my(12)}" width="${6 * S}" height="${4 * S}" fill="#5d6a73" stroke="#33404f"/>`;
// Pod and wreck
m += `<circle cx="${mx(205)}" cy="${my(19)}" r="14" fill="#f7f4ec" stroke="#33404f" stroke-width="2"/><text x="${mx(205)}" y="${my(19) + 32}" font-family="${FONT}" font-size="13" font-weight="700" fill="#1d2a33" text-anchor="middle">Pod</text>`;
m += `<text x="${mx(205)}" y="${my(19) + 48}" font-family="${FONT}" font-size="11" fill="#1d2a33" text-anchor="middle">world (0, 0, 14)</text>`;
m += `<rect x="${mx(102)}" y="${my(15)}" width="${20 * S}" height="${6 * S}" rx="6" fill="#8e4a2b" transform="rotate(-24 ${mx(112)} ${my(12)})"/>`;
m += `<line x1="${mx(205)}" y1="${my(19)}" x2="${mx(96)}" y2="${my(5)}" stroke="#1f5f6e" stroke-width="1.5" stroke-dasharray="4 4"/>`;
m += `<text x="${mx(160)}" y="${my(30)}" font-family="${FONT}" font-size="11" fill="#1f5f6e" text-anchor="middle">first swim ≈ 200 m, wreck halfway</text>`;
// Sightlines from the lookout
const L0 = [-15, -30];
const ray = (bearing, len, text, col, anchor = "start", dy = -6) => {
  const a = (bearing * Math.PI) / 180, x1 = L0[0] + Math.sin(a) * len, z1 = L0[1] + Math.cos(a) * len;
  return `<line x1="${mx(L0[0])}" y1="${my(L0[1])}" x2="${mx(x1)}" y2="${my(z1)}" stroke="${col}" stroke-width="2" stroke-dasharray="1 0"/>` +
    (text ? `<text x="${mx(x1)}" y="${my(z1) + dy}" font-family="${FONT}" font-size="12.5" font-weight="600" fill="${col}" text-anchor="${anchor}" style="paint-order:stroke;stroke:#f4f1ea;stroke-width:3.5px;stroke-linejoin:round">${esc(text)}</text>` : "");
};
m += `<g opacity="0.9">`;
m += ray(78, 230, "", "#b0541c");
m += `<text x="${mx(28)}" y="${my(-30)}" font-family="${FONT}" font-size="12.5" font-weight="600" fill="#b0541c" style="paint-order:stroke;stroke:#f4f1ea;stroke-width:3.5px;stroke-linejoin:round">→ pod, with the Splitspine stack behind (78–81°, 670 m)</text>`;
m += ray(134, 210, "→ hub beacon (134°, ≈ 760 m)", "#b0541c", "start", -8);
m += ray(294, 140, "← Colonnade arches (294°, 250 m)", "#b0541c", "start", 20);
m += ray(185, 150, "gully head (185°)", "#b0541c", "start", 4);
m += `</g>`;
// Numbered markers
for (const [n, x, z] of NUM) m += `<circle cx="${mx(x)}" cy="${my(z)}" r="11" fill="#1d2a33"/><text x="${mx(x)}" y="${my(z) + 4.5}" font-family="${FONT}" font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle">${n}</text>`;
m += `<polygon points="${mx(-15)},${my(-30) - 22} ${mx(-15) - 6},${my(-30) - 12} ${mx(-15) + 6},${my(-30) - 12}" fill="#e2604e"/>`;
// Scale, north, title
m += `<rect x="40" y="${my(-205) + 30}" width="${50 * S}" height="6" fill="#1d2a33"/><text x="40" y="${my(-205) + 54}" font-family="${FONT}" font-size="12" fill="#1d2a33">50 m</text>`;
m += `<polygon points="${MW - 50},${70} ${MW - 60},${100} ${MW - 40},${100}" fill="#1d2a33"/><text x="${MW - 50}" y="62" font-family="${FONT}" font-size="13" font-weight="700" text-anchor="middle" fill="#1d2a33">N</text>`;
m += `<rect x="14" y="14" width="700" height="56" rx="6" fill="#f4f1eaee"/><text x="28" y="40" font-family="${FONT}" font-size="20" font-weight="700" fill="#1d2a33">Starting island blockout (sketch, metres)</text>`;
m += `<text x="28" y="60" font-family="${FONT}" font-size="12.5" fill="#33434e">Island centre ≈ world (-205, 0, -5): 205 m WSW of the pod, on the reef shelf above the Hearth drop.</text>`;
// Legend
const LY = my(-205) + 80;
m += `<text x="40" y="${LY}" font-family="${FONT}" font-size="14" font-weight="700" fill="#1d2a33">Places</text>`;
NUM.forEach(([n, , , t], i) => {
  const col = i % 3, row = Math.floor(i / 3);
  m += `<text x="${40 + col * 260}" y="${LY + 24 + row * 20}" font-family="${FONT}" font-size="12.5" fill="#1d2a33"><tspan font-weight="700">${n}</tspan>  ${esc(t)}</text>`;
});
const KX = 830;
m += `<text x="${KX}" y="${LY}" font-family="${FONT}" font-size="14" font-weight="700" fill="#1d2a33">Lines</text>`;
[["#8a5a2b", "7 5", "trail / boardwalk"], ["#c0392b", "3 4", "shortcut opened from above or inside"], ["#33404f", "1 7", "power cable on posts (followable)"], ["#141d26", "2 4", "sea cave"], ["#1e4e73", "9 5", "Under-Stair (150 m suit)"], ["#b0541c", "", "lookout sightline"]].forEach(([c, d, t], i) => {
  m += `<line x1="${KX}" y1="${LY + 20 + i * 20}" x2="${KX + 40}" y2="${LY + 20 + i * 20}" stroke="${c}" stroke-width="3" ${d ? `stroke-dasharray="${d}"` : ""}/><text x="${KX + 48}" y="${LY + 24 + i * 20}" font-family="${FONT}" font-size="12" fill="#1d2a33">${esc(t)}</text>`;
});
m += "</svg>";
writeFileSync(OUT + "blockout-map.svg", m);
console.log("wrote 4 option cards and blockout-map.svg to", OUT);
