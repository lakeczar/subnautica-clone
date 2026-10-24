/** SYS-2 journal lab: a rough panel mock of the field journal over a scripted
 * mid-game state, so the coordinator can judge how easy it is to browse. Not
 * final UI. Run under Vite dev on its own port:
 *   npx vite --port 5199 --strictPort --host 127.0.0.1
 *   open http://127.0.0.1:5199/tools/journal-lab.html
 * The model is exposed as window.__journalLab for scripted checks. */
import { completeOpening, discover } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { createGame } from "../src/sim/state.js";
import type { GameState, Vec3 } from "../src/sim/types.js";
import { advanceSystems } from "../src/sim/systems/step.js";
import { buildJournal, searchJournal } from "../src/sim/systems/journal.js";
import type { CreatureEntry, CycleEntry, FieldJournal, JournalEntry, JournalTabId } from "../src/sim/systems/journal.js";
import { chartView, visitChart } from "../src/sim/systems/navigation.js";
import type { ChartView } from "../src/sim/systems/navigation.js";
import { createSystems } from "../src/sim/systems/state.js";
import type { SystemsState } from "../src/sim/systems/state.js";
import { deployOutpost, packPreview } from "../src/sim/systems/outposts.js";
import type { OutpostSiteQuery } from "../src/sim/systems/outposts.js";
import { installModule, listHosts, outpostLockerId } from "../src/sim/systems/hosts.js";
import { discoverSite, startDecode } from "../src/sim/systems/decoder.js";
import { plant } from "../src/sim/systems/cultivation.js";
import { addStack } from "../src/sim/systems/ledger.js";

/** Demo creatures and cycles stand in for the slots other builders fill. */
const CREATURES: CreatureEntry[] = [
  { id: "demo_grazer", label: "Ledge grazer", region: "refuge_reef", behaviour: "Scrapes algae from exposed glass ledges.", danger: "harmless" },
  { id: "demo_hunter", label: "Sound hunter", region: "suspended_garden", behaviour: "Investigates noise in the lower channel.", notes: ["Quiet running avoids it."], danger: "hunter" },
];
const CYCLES: CycleEntry[] = [
  { id: "demo_slack", label: "Slack current", region: "suspended_garden", periodSeconds: 300, windowSeconds: 45, alternative: "the long way round the outer crowns" },
];

function demo(): { s: GameState; sys: SystemsState } {
  const s = createGame(), sys = createSystems();
  completeOpening(s);
  addItem(s, "essential_tools", 1, "equipment", "tools");
  s.knowledge.blueprints.push("bp_reef_recovery", "bp_island_workshop", "bp_canopy_reinforcement");
  (s.knowledge.blueprints as string[]).push("bp_field_outpost", "bp_cultivation", "bp_decoder", "bp_signal_relay", "bp_survey_station");
  s.knowledge.crafted.push("pod_repair", "essential_tools", "suit_150");
  s.knowledge.scans.push("reef_glass_ridge_north", "reef_ribbon_catch_north", "reef_service_scraps_east", "island_resin_cove_east",
    "canopy_grounding_fins_upper", "basin_keel_plate");
  discover(s, "C02");
  discover(s, "C03");
  s.world.resources.find((r) => r.id === "reef_ribbon_catch_north")!.stock = 6;
  addStack(s, "brine_lattice", 2, "pod_locker");
  const site: OutpostSiteQuery = { sample: () => ({ ground: "ledge", slope: 4, clear: true, depth: 40, ventDistance: 12, covered: false, region: "suspended_garden" }) };
  const setUp = (p: Vec3, modules: string[]): string => {
    s.player.pose.position = { ...p };
    const kit = addStack(s, "outpost_kit_standard", 1, "diver").id;
    deployOutpost(s, sys, kit, p, site);
    modules.forEach((m, n) => installModule(s, sys, kit, `s${n}`, addStack(s, m, 1, "diver").id));
    return kit;
  };
  const a = setUp({ x: 90, y: -60, z: -80 }, ["mod_decoder", "mod_planter", "mod_survey"]);
  addStack(s, "seed_ribbon_fan", 1, "diver");
  plant(s, sys, a, "s1", "seed_ribbon_fan");
  addStack(s, "meal", 3, outpostLockerId(a));
  addStack(s, "structural_alloy", 2, outpostLockerId(a));
  addStack(s, "flex_membrane", 1, outpostLockerId(a));
  discoverSite(sys, "demo_relay_hut");
  discoverSite(sys, "demo_survey_cairn");
  startDecode(s, sys, a, "demo_hut_fragment");
  for (let n = 0; n < 200; n++) advanceSystems(s, sys, {}, 1);
  startDecode(s, sys, a, "demo_cairn_survey");
  for (let n = 0; n < 90; n++) advanceSystems(s, sys, {}, 1);
  for (const p of [{ x: 0, y: -10, z: 10 }, { x: 20, y: -10, z: -20 }, { x: 45, y: -20, z: -45 }, { x: 70, y: -40, z: -65 }]) visitChart(sys, p);
  return { s, sys };
}

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function entryHtml(e: JournalEntry): string {
  return `<details class="entry" data-status="${e.status ?? ""}"><summary><span class="title">${esc(e.title)}</span><span class="sub">${esc(e.subtitle)}</span>${
    e.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</summary>${e.lines.map((l) => `<p>${esc(l)}</p>`).join("")}</details>`;
}
function chartSvg(view: ChartView): string {
  if (!view.cells.length) return "";
  const xs = view.cells.map((c) => c.x), zs = view.cells.map((c) => c.z), size = view.cells[0]!.size;
  const minX = Math.min(...xs), minZ = Math.min(...zs), w = Math.max(...xs) - minX + size, h = Math.max(...zs) - minZ + size;
  const fill = (r: string[]) => r.includes("decoded") ? "#4a3d6b" : r.includes("scanned") ? "#2f5a52" : "#24404a";
  return `<svg viewBox="${minX} ${minZ} ${w} ${h}" width="260" height="${Math.round(260 * h / w)}">${view.cells.map((c) =>
    `<rect x="${c.x}" y="${c.z}" width="${size}" height="${size}" fill="${fill(c.reveal)}" stroke="#0b1418" stroke-width="2"><title>${c.reveal.join(", ")}</title></rect>`).join("")}${
    view.markers.map((m) => `<circle cx="${m.position.x}" cy="${m.position.z}" r="${m.kind === "beacon" ? 9 : 6}" fill="${m.kind === "beacon" ? "#f2b94d" : m.kind === "site" ? "#ff8a7a" : "#6fd3a2"}"><title>${esc(m.label)}</title></circle>`).join("")}</svg>`;
}

function render(journal: FieldJournal, s: GameState, sys: SystemsState, active: JournalTabId, query: string): void {
  const tabs = journal.tabs.map((t) => `<button data-tab="${t.id}" class="${t.id === active ? "on" : ""}">${t.label} <small>${t.count}</small></button>`).join("");
  const results = query.trim() ? searchJournal(journal, query) : null;
  const tab = journal.tabs.find((t) => t.id === active)!;
  const body = results
    ? `<h3>${results.length} result${results.length === 1 ? "" : "s"} for “${esc(query)}”</h3>${results.map((r) => `<div class="from">${r.tab}</div>${entryHtml(r.entry)}`).join("")}`
    : tab.sections.length ? tab.sections.map((sec) => `<section><h3>${esc(sec.title)} <small>${sec.entries.length}</small></h3>${sec.entries.map(entryHtml).join("")}</section>`).join("")
      : `<p class="empty">${esc(tab.empty)}</p>`;
  const hosts = listHosts(s, sys).filter((h) => h.kind === "outpost").map((h) => {
    const pack = packPreview({ ...s, player: { ...s.player, pose: { ...s.player.pose, position: h.position } } } as GameState, sys, h.id);
    return `<p><b>${esc(h.label)}</b> · ${h.power} · ${h.sockets.map((k) => k.occupant?.label ?? "empty").join(", ")}<br><small>Pack preview: ${esc(`${pack.refusal ?? `ready, ${pack.needCu} CU`} ${pack.work.join(" ")}`)}</small></p>`;
  }).join("");
  document.querySelector("#app")!.innerHTML = `<nav>${tabs}</nav><input id="q" placeholder="Search the journal" value="${esc(query)}"><div class="cols"><main>${body}</main><aside><h3>Chart</h3>${chartSvg(chartView(s, sys))}<h3>Outposts</h3>${hosts}</aside></div>`;
  document.querySelectorAll<HTMLButtonElement>("nav button").forEach((b) => b.onclick = () => render(journal, s, sys, b.dataset.tab as JournalTabId, ""));
  const q = document.querySelector<HTMLInputElement>("#q")!;
  q.oninput = () => { render(journal, s, sys, active, q.value); const next = document.querySelector<HTMLInputElement>("#q")!; next.focus(); next.setSelectionRange(q.value.length, q.value.length); };
}

const { s, sys } = demo();
const journal = buildJournal(s, sys, { creatures: CREATURES, cycles: CYCLES });
(window as unknown as { __journalLab: unknown }).__journalLab = { journal, state: s, systems: sys };
render(journal, s, sys, "materials", "");
