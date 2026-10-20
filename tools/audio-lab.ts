/** S6 audio lab: offline renders of the real engine with level, loudness,
 * spectrum and voice analysis. Run under Vite dev on port 5198:
 *   npx vite --port 5198 --strictPort --host 127.0.0.1
 *   open http://127.0.0.1:5198/tools/audio-lab.html  (?auto=1 renders on load)
 * The report is also exposed as window.__audioLab for scripted checks. */
import { levels, OCTAVES, spectrum, type Levels, type Spectrum } from "../src/audio/analysis.js";
import { CUES, CUE_IDS, cueDuration, type Bus, type CueId } from "../src/audio/cues.js";
import { AudioEngine, type EngineStats } from "../src/audio/engine.js";
import type { CueRequest } from "../src/audio/mapping.js";
import { VOICE_LIMITS } from "../src/audio/mixer.js";
import { HULL_LAYERS, REGION_AMBIENCE } from "../src/audio/profiles.js";
import type { AudioScene } from "../src/audio/scene.js";
import { rng } from "../src/audio/synth.js";
import { HULLS, REGIONS, type HullId, type RegionId } from "../src/content/registry.js";

const RATE = 48000, STEP = 1024;
const BUSES: readonly Bus[] = ["ambience", "vehicle", "sfx", "alert", "music"];

function scene(p: Partial<AudioScene> = {}): AudioScene {
  return {
    active: true, region: "refuge_reef", depth: 25, medium: "water", shelter: "open", hull: null,
    throttle: 0, boost: 0, hullStress: 0, power: 1, disabled: false, overPressure: false, tow: false,
    threat: { mode: "idle", interest: 0, pan: 0, distance: Infinity, dir: "ahead" },
    listener: { position: { x: 0, y: -25, z: 0 }, yaw: 0 }, ...p,
  };
}
const cue = (id: CueId, p: Partial<CueRequest> = {}): CueRequest => ({ cue: id, intensity: 1, pan: 0, distance: 0, dir: null, ...p });

interface Scenario {
  id: string;
  group: string;
  seconds: number;
  /** Analysis window in seconds. */
  window: [number, number];
  scene(t: number): AudioScene;
  events?(t: number, frame: number): CueRequest[];
  solo?: Bus[];
  check(r: Result): string[];
}
export interface Result {
  id: string;
  group: string;
  levels: Levels;
  spectrum: Spectrum;
  peakVoices: number;
  peakBus: Record<Bus, number>;
  nodesStart: number;
  nodesEnd: number;
  /** Continuous-layer nodes (live minus voice nodes) at start and end; equal unless layers changed. */
  layerNodesStart: number;
  layerNodesEnd: number;
  stats: EngineStats;
  /** Essential cues that were admitted, for the adverse case. */
  admittedEssential: number;
  requestedEssential: number;
  failures: string[];
  buffer: AudioBuffer;
}

const common = (r: Result): string[] => [
  ...(r.levels.peakDb > -0.3 ? [`peak ${r.levels.peakDb} dBFS above the -0.3 ceiling`] : []),
  ...(r.levels.clipped ? [`${r.levels.clipped} clipped samples`] : []),
  ...(Math.abs(r.levels.dc) > 0.002 ? [`DC ${r.levels.dc}`] : []),
  ...(r.peakVoices > VOICE_LIMITS.total ? [`${r.peakVoices} voices > ${VOICE_LIMITS.total}`] : []),
  ...BUSES.filter(b => r.peakBus[b] > VOICE_LIMITS.bus[b]).map(b => `${b} bus ${r.peakBus[b]} > ${VOICE_LIMITS.bus[b]}`),
];
const range = (what: string, v: number, lo: number, hi: number): string[] => (v < lo || v > hi ? [`${what} ${v} outside ${lo}..${hi}`] : []);

/** Momentary-max targets (LUFS at full volume) by cue class. Beds sit near -31. */
const CLASS_TARGET = {
  "essential alarm": [-22, -12], alarm: [-32, -12], feedback: [-36, -20], click: [-48, -30], music: [-26, -16],
} as const satisfies Record<string, readonly [number, number]>;
type CueClass = keyof typeof CLASS_TARGET;
function cueClass(id: CueId): CueClass {
  if (id === "action.panel") return "click";
  if (CUES[id].bus === "music") return "music";
  if (CUES[id].bus === "alert") return CUES[id].essential ? "essential alarm" : "alarm";
  return "feedback";
}

const midDepth = (r: RegionId): number => r === "island_chain" ? 20 : (REGIONS[r].depth[0] + REGIONS[r].depth[1]) / 2;

function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  const bed = (r: Result) => range("bed LUFS", r.levels.lufs, -38, -24);
  for (const region of Object.keys(REGION_AMBIENCE) as RegionId[]) out.push({
    id: `region/${region}`, group: "Regional ambience (swimming, mid-depth)", seconds: 14, window: [5, 14],
    scene: () => scene({ region, depth: midDepth(region) }), check: bed,
  });
  out.push(
    { id: "region/surface", group: "Regional ambience (swimming, mid-depth)", seconds: 14, window: [5, 14], scene: () => scene({ region: "island_chain", depth: -0.5, medium: "air" }), check: bed },
    { id: "depth/reef-5m", group: "Depth layer", seconds: 12, window: [5, 12], scene: () => scene({ depth: 5 }), check: bed },
    { id: "depth/district-760m", group: "Depth layer", seconds: 12, window: [5, 12], scene: () => scene({ region: "deep_district", depth: 760 }), check: bed },
    { id: "refuge/home-pod", group: "Refuge and interiors", seconds: 14, window: [6, 14], scene: () => scene({ shelter: "refuge", medium: "air", depth: -0.2 }), check: bed },
    { id: "refuge/hearthline-interior", group: "Refuge and interiors", seconds: 14, window: [6, 14], scene: () => scene({ shelter: "interior", region: "suspended_garden", depth: 160 }), check: bed },
  );
  for (const hull of Object.keys(HULL_LAYERS) as HullId[]) {
    const depth = hull === "spindle" ? 0.5 : Math.min(HULLS[hull].initialDepth * 0.5, 120) || 20;
    for (const [label, throttle, boost] of [["idle", 0, 0], ["cruise", 1, 0], ...(HULL_LAYERS[hull].boost ? [["boost", 1, 1] as const] : [])] as const)
      out.push({
        id: `hull/${hull}/${label}`, group: "Hull layers (vehicle bus solo)", seconds: 6, window: [2, 6], solo: ["vehicle"],
        scene: () => scene({ hull, throttle, boost, depth }), check: r => range("hull LUFS", r.levels.lufs, -50, -20),
      });
  }
  out.push({
    id: "hull/bobbin/tow", group: "Hull layers (vehicle bus solo)", seconds: 6, window: [2, 6], solo: ["vehicle"],
    scene: () => scene({ tow: true }), check: r => range("bobbin LUFS", r.levels.lufs, -50, -24),
  });
  for (const id of CUE_IDS) {
    const len = Math.min(cueDuration(CUES[id]) + 1, 60);
    out.push({
      id: `cue/${id}`, group: id.startsWith("music.") ? "Music (solo)" : "Cues (solo, one instance)", seconds: len, window: [0, len],
      solo: [CUES[id].bus], scene: () => scene({ active: false }), events: (_, f) => (f === 4 ? [cue(id, CUES[id].spatial ? { pan: -0.5, distance: 15, dir: "left" } : {})] : []),
      check: r => [...range(`${cueClass(id)} momentary max`, r.levels.momentaryMaxLufs, CLASS_TARGET[cueClass(id)][0], CLASS_TARGET[cueClass(id)][1]),
        ...(r.levels.peakDb > -6 ? [`solo peak ${r.levels.peakDb} dBFS above -6`] : [])],
    });
  }
  // Alarm audibility: the bed while it is ducked by the alarm, with the alarm
  // itself muted, compared against the alarm's solo loudness (masking margin).
  const at = Math.round(6 * RATE / STEP), t0 = at * STEP / RATE;
  const masked = (id: string, sc: AudioScene, alarm: CueId): Scenario => ({
    id, group: "Alarm masking margins", seconds: 9, window: [t0 + 0.02, t0 + Math.min(1.2, cueDuration(CUES[alarm]))],
    solo: ["ambience", "vehicle", "sfx", "music"], scene: () => sc, events: (_, f) => (f === at ? [cue(alarm)] : []), check: () => [],
  });
  const working = scene({ region: "thermal_rift", depth: 300, hull: "creel", throttle: 1 });
  out.push(
    { id: "mix/rift-creel-bed", group: "Alarm masking margins", seconds: 9, window: [5, 9], scene: () => working, check: () => [] },
    masked("mix/rift-creel-ducked-by-hull-stress", working, "alert.hull-stress"),
    masked("mix/reef-swim-ducked-by-oxygen", scene({ region: "refuge_reef", depth: 40 }), "alert.oxygen"),
    masked("mix/basin-dart-ducked-by-power", scene({ region: "silt_basin", depth: 170, hull: "dart", throttle: 1 }), "alert.power"),
    masked("mix/canopy-ducked-by-threat-call", scene({ region: "suspended_garden", depth: 120, threat: { mode: "warn", interest: 1, pan: -0.5, distance: 15, dir: "left" } }), "alert.threat-call"),
    {
      id: "mix/canopy-pursuit", group: "Mix and encounters", seconds: 12, window: [4, 12],
      scene: t => scene({ region: "suspended_garden", depth: 120, threat: { mode: t < 4 ? "warn" : "pursue", interest: 3, pan: -0.6, distance: 22, dir: "left" } }),
      events: (_, f) => (f === 20 || f === 200 ? [cue("alert.threat-call", { pan: -0.6, distance: 22, dir: "left" })] : f % 47 === 0 && f > 250 ? [cue("hit.damage", { pan: -0.4, distance: 6, dir: "left" })] : []),
      check: r => range("pursuit momentary max", r.levels.momentaryMaxLufs, -30, -8),
    },
    {
      id: "mix/hush-listening", group: "Mix and encounters", seconds: 10, window: [3, 10],
      scene: () => scene({ region: "suspended_garden", depth: 120, hull: "hush", throttle: 0.6, threat: { mode: "investigate", interest: 2, pan: 0.5, distance: 30, dir: "right" } }),
      check: () => [],
    },
  );
  // Adverse case: a burst of 400 mixed requests in two seconds over a busy scene.
  out.push({
    id: "adverse/burst-400", group: "Adverse case", seconds: 12, window: [0, 12],
    scene: () => scene({ region: "refuge_reef", depth: 30, hull: "dart", throttle: 1, boost: 1, threat: { mode: "pursue", interest: 4, pan: 0.3, distance: 15, dir: "right" } }),
    events: (() => {
      const r = rng(4242);
      return (t: number) => {
        if (t < 2 || t >= 4) return [];
        const n = Math.round(400 / (2 * RATE / STEP)), reqs: CueRequest[] = [];
        for (let i = 0; i < n; i++) {
          const id = CUE_IDS[Math.floor(r() * CUE_IDS.length)]!;
          reqs.push(cue(id, CUES[id].spatial ? { pan: r() * 2 - 1, distance: r() * 60, dir: "right" } : { intensity: r() }));
        }
        return reqs;
      };
    })(),
    check: r => [
      ...range("burst momentary max", r.levels.momentaryMaxLufs, -40, -6),
      ...(r.layerNodesEnd !== r.layerNodesStart ? [`layer nodes ${r.layerNodesStart} → ${r.layerNodesEnd}`] : []),
      ...(r.admittedEssential === 0 ? ["no essential warning got through"] : []),
    ],
  });
  return out;
}

async function render(sc: Scenario): Promise<Result> {
  const ctx = new OfflineAudioContext(2, Math.ceil(sc.seconds * RATE / STEP) * STEP, RATE);
  const engine = new AudioEngine(ctx);
  engine.setVolume(1);
  if (sc.solo) for (const b of BUSES) engine.setBusTrim(b, sc.solo.includes(b) ? 1 : 0);
  engine.update(sc.scene(0));
  const first = engine.stats(), nodesStart = first.liveNodes, layerNodesStart = first.liveNodes - first.voiceNodes;
  let peakVoices = 0, admittedEssential = 0, requestedEssential = 0;
  const peakBus = Object.fromEntries(BUSES.map(b => [b, 0])) as Record<Bus, number>;
  const frames = ctx.length / STEP;
  for (let f = 1; f < frames; f++) {
    const t = f * STEP / RATE;
    void ctx.suspend(t).then(() => {
      engine.update(sc.scene(t));
      for (const r of sc.events?.(t, f) ?? []) {
        if (CUES[r.cue].essential) requestedEssential++;
        const a = engine.play(r);
        if (a.play && CUES[r.cue].essential) admittedEssential++;
      }
      const s = engine.stats();
      peakVoices = Math.max(peakVoices, s.voices);
      for (const b of BUSES) peakBus[b] = Math.max(peakBus[b], s.bus[b]);
      void ctx.resume();
    });
  }
  const buffer = await ctx.startRendering();
  const stats = engine.stats(), nodesEnd = stats.liveNodes, layerNodesEnd = stats.liveNodes - stats.voiceNodes;
  engine.dispose();
  const [a, b] = sc.window, start = Math.floor(a * RATE), end = Math.min(buffer.length, Math.floor(b * RATE));
  const chans = [0, 1].map(c => buffer.getChannelData(c).slice(start, end));
  const r: Result = {
    id: sc.id, group: sc.group, levels: levels(chans, RATE), spectrum: spectrum(chans, RATE),
    peakVoices, peakBus, nodesStart, nodesEnd, layerNodesStart, layerNodesEnd, stats, admittedEssential, requestedEssential, failures: [], buffer,
  };
  r.failures = [...common(r), ...sc.check(r)];
  return r;
}

/** Cross-scenario expectations: relative loudness that gives each hull and alarm its role. */
function relations(rs: Map<string, Result>): string[] {
  const lufs = (id: string): number => rs.get(id)?.levels.lufs ?? NaN;
  const mom = (id: string): number => rs.get(id)?.levels.momentaryMaxLufs ?? NaN;
  const out: string[] = [];
  const expect = (ok: boolean, msg: string) => { if (!ok) out.push(msg); };
  expect(lufs("hull/hush/cruise") < lufs("hull/dart/cruise") - 8, "Hush cruise is not clearly quieter than Dart");
  expect(lufs("hull/creel/cruise") > lufs("hull/dart/cruise"), "Creel is not louder than Dart");
  expect(lufs("hull/hearthline/cruise") > lufs("hull/dart/cruise"), "Hearthline is not louder than Dart");
  expect(lufs("hull/dart/boost") > lufs("hull/dart/cruise") + 1.5, "Dart boost is not audibly louder than cruise");
  for (const h of Object.keys(HULL_LAYERS)) expect(lufs(`hull/${h}/cruise`) > lufs(`hull/${h}/idle`), `${h} cruise not above idle`);
  for (const [bed, alarm] of [["mix/rift-creel-ducked-by-hull-stress", "alert.hull-stress"], ["mix/reef-swim-ducked-by-oxygen", "alert.oxygen"],
    ["mix/basin-dart-ducked-by-power", "alert.power"], ["mix/canopy-ducked-by-threat-call", "alert.threat-call"]] as const) {
    const margin = mom(`cue/${alarm}`) - mom(bed);
    expect(margin >= 10, `${alarm} only ${margin.toFixed(1)} LU above its ducked bed (${bed})`);
  }
  expect(lufs("mix/hush-listening") > lufs("region/suspended_garden") - 6, "Hush listening scene lost the threat presence");
  return out;
}

function svgBands(s: Spectrum): string {
  const w = 10, h = 26;
  const bars = s.bands.map((db, i) => {
    const v = Math.max(0, Math.min(1, (db + 90) / 80));
    return `<rect x="${i * (w + 2)}" y="${h - v * h}" width="${w}" height="${v * h}" fill="var(--bar)"><title>${OCTAVES[i]} Hz: ${db} dB</title></rect>`;
  }).join("");
  return `<svg class="spec" width="${OCTAVES.length * (w + 2)}" height="${h}">${bars}</svg>`;
}

const fmt = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : "−∞");
let live: AudioContext | null = null;
function listen(buffer: AudioBuffer): void {
  live ??= new AudioContext();
  const src = live.createBufferSource();
  src.buffer = buffer; src.connect(live.destination); src.start();
}

export interface Report { results: Omit<Result, "buffer">[]; relations: string[]; margins: Record<string, number>; failures: number; generated: string }

async function runAll(): Promise<Report> {
  const rows = document.getElementById("rows")!, progress = document.getElementById("progress")!, summary = document.getElementById("summary")!;
  const button = document.getElementById("run") as HTMLButtonElement;
  button.disabled = true; rows.innerHTML = ""; summary.textContent = "";
  const list = scenarios(), results = new Map<string, Result>();
  let group = "";
  for (const [i, sc] of list.entries()) {
    progress.textContent = ` ${i + 1}/${list.length} ${sc.id}`;
    const r = await render(sc);
    results.set(r.id, r);
    if (r.group !== group) { group = r.group; rows.insertAdjacentHTML("beforeend", `<tr class="group"><td colspan="11">${group}</td></tr>`); }
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.id}</td><td class="num">${fmt(r.levels.lufs)}</td><td class="num">${fmt(r.levels.momentaryMaxLufs)}</td>`
      + `<td class="num">${fmt(r.levels.peakDb)}</td><td class="num">${fmt(r.levels.rmsDb)}</td><td class="num">${r.peakVoices}</td>`
      + `<td class="num">${r.nodesEnd}</td><td>${svgBands(r.spectrum)}</td><td class="num">${r.spectrum.centroidHz} Hz</td>`
      + `<td class="${r.failures.length ? "fail" : "pass"}">${r.failures.length ? r.failures.join("; ") : "pass"}</td><td></td>`;
    const play = document.createElement("button");
    play.textContent = "▶"; play.title = "Play the rendered buffer";
    play.onclick = () => listen(r.buffer);
    tr.lastElementChild!.append(play);
    rows.append(tr);
  }
  const rel = relations(results);
  const margins = Object.fromEntries([...results.keys()].filter(k => k.includes("-ducked-by-")).map(k => {
    const alarm = `cue/alert.${k.split("-ducked-by-")[1]}`;
    return [k, Math.round(((results.get(alarm)?.levels.momentaryMaxLufs ?? NaN) - results.get(k)!.levels.momentaryMaxLufs) * 10) / 10];
  }));
  const failures = [...results.values()].reduce((n, r) => n + r.failures.length, 0) + rel.length;
  summary.textContent = `${results.size} scenarios · ${failures ? `${failures} check(s) failed` : "all checks pass"}${rel.length ? " · " + rel.join("; ") : ""}`;
  summary.style.color = failures ? "var(--bad)" : "var(--ok)";
  progress.textContent = "";
  button.disabled = false;
  const report: Report = {
    results: [...results.values()].map(({ buffer: _buffer, ...r }) => r), relations: rel, margins, failures, generated: new Date().toISOString(),
  };
  (window as unknown as { __audioLab: unknown }).__audioLab = { ...lab, report };
  return report;
}

const lab = { run: runAll, report: null as Report | null };
(window as unknown as { __audioLab: unknown }).__audioLab = lab;
document.getElementById("run")!.addEventListener("click", () => void runAll());
if (new URLSearchParams(location.search).has("auto")) void runAll();
