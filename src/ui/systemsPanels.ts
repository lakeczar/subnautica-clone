/** C4: the systems screens. Functional and concise: each row names the thing,
 * one status line, and the actions it allows; refusals sit beside disabled
 * buttons and longer previews behind a disclosure. Final polish comes later.
 * - Base (O): socket hosts in reach (modules, decodes, planters, survey),
 *   field outposts (deploy, pack and upgrade previews), beacons and the chart.
 * - Fit (U): each owned craft's slots, fitted upgrades and carried modules with
 *   SYS-1's gains-and-losses preview; rearm and bio-cell actions.
 * - Journal (J): the objective line, then SYS-2's six tabs, with the story
 *   notebook as one tab instead of one long scroll. */
import { HULLS, ITEMS, REGIONS, SOURCES } from "../content/registry.js";
import { faunaSocketActions } from "./faunaPanels.js";
import type { RegionId } from "../content/registry.js";
import { CUE_SPECIES, THREATS } from "../content/ecology/species.js";
import { WORLD_CYCLES } from "../content/currents/cycles.js";
import { HAZARD_FIELDS } from "../content/ecology/hazards.js";
import { HULL_SLOTS, UPGRADES, upgradeId } from "../content/upgrades/catalogue.js";
import type { SlotKind, UpgradeId } from "../content/upgrades/catalogue.js";
import { DECODABLES } from "../content/systems/decodes.js";
import { isSeed, SEEDS } from "../content/systems/cultivation.js";
import { MODULES as HOST_MODULES, OUTPOST_TIERS, tierOfKit } from "../content/systems/hosts.js";
import { PLAYER_BEACON_LIMIT, BEACON_CATEGORIES } from "../content/systems/navigation.js";
import { journalEntry } from "../sim/cycles/observe.js";
import { distance } from "../sim/inventory.js";
import { fitTarget, vehicleProfile, upgradeInstallPreview, upgradeRemovePreview, dockOf } from "../sim/fittings.js";
import { slotCapacity, slotOf } from "../sim/upgrades/fitting.js";
import { installModuleRefusal } from "../sim/modules.js";
import {
  beaconViews, buildJournal, chartView, cropLine, cropViews, decodeViews, deployPreview, hostLocal, listHosts, packPreview, upgradePreview,
} from "../sim/systems/index.js";
import type { JournalSection, JournalTabId } from "../sim/systems/journal.js";
import type { CreatureEntry, CycleEntry } from "../sim/systems/index.js";
import { speciesScanId } from "../sim/signatures.js";
import { hostUpgradeOffers } from "../sim/hostUpgrades.js";
import { hostUpgrade } from "../content/upgrades/hosts.js";
import { berthChargePlan, chartOptions, deployPoint, hostPower, hostPowerReason, OUTPOST_SERVICE_RADIUS, outpostRules, siteQuery, surveyTierAt, systemsContext } from "../sim/systemsLink.js";
import { surveyRange } from "../sim/systems/survey.js";
import { serviceLabel, servicePreview } from "../sim/serviceLink.js";
import { currentObjective } from "../sim/objective.js";
import type { GameState, WorldQueries } from "../sim/types.js";
import { bearing, duration as mins, escapeHtml } from "./format.js";
import type { CommandButton } from "./panels.js";

type Group = (id: string, label: string, body: string, open?: boolean) => string;
const esc = escapeHtml;
const label = (kind: string): string => Object.hasOwn(ITEMS, kind) ? ITEMS[kind as keyof typeof ITEMS].label : kind.replaceAll("_", " ");
const pct = (n: number): string => `${Math.round(n * 100)}%`;

// ---------------------------------------------------------------- Base
export function basePanel(s: GameState, world: WorldQueries, button: CommandButton, group: Group): string {
  const sys = s.systems, hosts = listHosts(s, sys);
  const here = hosts.filter((h) => h.available && hostLocal(s, h));
  const carried = s.inventory.items.filter((i) => i.containerId === "diver");
  let html = `<p class="panel-status">${here.length ? `At ${here.map((h) => esc(h.label)).join(", ")}` : "No base in reach · stand at a host's work area"} · outposts ${sys.outposts.length} / ${3 + outpostRules(s).limitBonus}</p>`;
  for (const host of here) {
    const powered = hostPower(host, s), reason = powered ? null : hostPowerReason(s, host);
    const rows = host.sockets.map((k) => {
      const occ = k.occupant;
      if (!occ) {
        const fits = carried.filter((i) => { const m = HOST_MODULES; return Object.values(m).some((d) => d.item === i.kind && k.accepts.includes(Object.keys(m).find((x) => m[x as keyof typeof m].item === i.kind) as never)); });
        return `<li><b>${esc(k.id)}</b> · empty ${fits.map((i) => button(`Fit ${label(i.kind)}`, { type: "install-host-module", hostId: host.id, socket: k.id, itemId: i.id })).join("") || "<small>carry a module to fit it</small>"}</li>`;
      }
      const actions: string[] = [];
      if (occ.itemId) actions.push(button("Remove", { type: "remove-host-module", hostId: host.id, socket: k.id }));
      if (occ.module === "decoder" && occ.itemId) {
        const job = sys.decodes.find((j) => j.moduleId === occ.itemId);
        if (job) {
          const view = decodeViews(s, sys, systemsContext(s)).find((v) => v.moduleId === occ.itemId);
          actions.unshift(`<small>Decoding ${esc(DECODABLES[job.decodable].label)} · ${view ? `${Math.round(view.progress / view.required * 100)}% · ${view.status === "running" ? `${mins(view.remaining)} left` : view.status.replaceAll("-", " ")}` : ""}</small>`);
        } else for (const d of sys.found.filter((x) => !sys.decoded.includes(x) && !sys.decodes.some((j) => j.decodable === x)))
          actions.push(button(`Decode ${DECODABLES[d].label}`, { type: "start-decode", hostId: host.id, socket: k.id, decodable: d }, !powered, reason ?? undefined));
      }
      if (occ.module === "planter" && occ.itemId) {
        const crop = cropViews(sys, s, hostPower).find((c) => c.moduleId === occ.itemId);
        if (crop) {
          actions.unshift(`<small class="crop-line">${esc(cropLine(crop))}</small>`);
          if (crop.ready) actions.push(button("Harvest", { type: "harvest", hostId: host.id, socket: k.id }));
        } else for (const seed of carried.filter((i) => isSeed(i.kind)))
          actions.push(button(`Plant ${SEEDS[seed.kind as keyof typeof SEEDS].label}`, { type: "plant", hostId: host.id, socket: k.id, seed: seed.kind }));
      }
      if (occ.module === "survey") actions.push(button("Survey", { type: "survey", hostId: host.id }, !powered, reason ?? undefined));
      // SIG-1 and LS-1: a module upgrade fits in place (a decoder lattice, a survey array, a
      // locker extension, a heated grow bed); the shared offer authority decides which
      // sockets take one, and the offer is the command's own plan.
      if (occ.itemId) {
        const fitted = sys.moduleUpgrades[occ.itemId];
        if (fitted) actions.unshift(`<small>${esc(hostUpgrade(fitted).label)}</small>`);
        for (const offer of hostUpgradeOffers(s, host.id, k.id))
          actions.push(button(`Fit ${offer.label}`, { type: "upgrade-host-module", hostId: host.id, socket: k.id, upgrade: offer.upgrade },
            !!offer.refusal, offer.refusal ?? `${offer.benefit} Costs ${offer.cost}.`));
      }
      actions.push(...faunaSocketActions(s, host.id, k.id, occ.module, button));
      return `<li><b>${esc(k.id)}</b> · ${esc(occ.label)} ${actions.join("")}</li>`;
    }).join("");
    const outpost = sys.outposts.find((o) => o.id === host.id);
    let extra = "";
    // HUB-2: a fixed host's built-in survey array (the crown station's).
    if (host.kind !== "outpost" && host.builtIn.includes("survey"))
      extra += `<p>${button("Survey", { type: "survey", hostId: host.id }, !powered, reason ?? undefined)} <small>Built-in array · scanned materials within ${surveyRange(surveyTierAt(s, host))} m.</small></p>`;
    if (outpost) {
      const pack = packPreview(s, sys, outpost.id), up = upgradePreview(s, sys, outpost.id);
      // The outpost's charger: each craft moored within its reach, through the same
      // composed preview as Cargo's Service (real power payment shown).
      const moored = s.fleet.vehicles.filter((v) => !v.berth && v.hull !== "hearthline" && distance(v.pose.position, host.position) <= OUTPOST_SERVICE_RADIUS);
      const charges = moored.map((v) => {
        const p = servicePreview(s, v.id);
        return p.kind === "outpost"
          ? `<p>${button(serviceLabel(p), { type: "service", vehicleId: v.id }, !!p.refusal, p.refusal ?? `Pays ${p.plan.cost}.`)}${p.refusal ? "" : ` <small>Pays ${esc(p.plan.cost)}.</small>`}</p>`
          : "";
      }).join("");
      extra = `${charges}<div class="service-actions">${button("Pack up", { type: "pack-outpost", outpostId: outpost.id }, !!pack.refusal, pack.refusal ?? undefined)}${
        up.to ? button(`Upgrade to ${up.to}`, { type: "upgrade-outpost", outpostId: outpost.id }, !!up.refusal, up.refusal ?? undefined) : ""}</div>${
        group(`pack:${outpost.id}`, "Pack preview", `<p>Spends ${pack.loss.lines.map((l) => `${l.quantity} ${esc(label(l.kind))}`).join(", ") || "nothing"}. Moves ${pack.locker.length} locker stack${pack.locker.length === 1 ? "" : "s"} and ${pack.modules.length} module${pack.modules.length === 1 ? "" : "s"} to your hold (${pack.needCu} CU, ${pack.freeCu} free).</p>${pack.work.map((w) => `<p>${esc(w)}</p>`).join("")}`)}`;
    }
    // The carrier's charging dock: a socketed charger fills the berths from the carrier.
    if (host.kind === "carrier") {
      const carrierId = host.id.slice("carrier:".length), plan = berthChargePlan(s, carrierId);
      if (plan && plan.craft.length) extra += `<p>${button("Charge berthed craft", { type: "charge-berths", carrierId }, !!plan.refusal, plan.refusal ?? undefined)}${plan.refusal ? ""
        : ` <small>${plan.craft.map((c) => `${esc(HULLS[s.fleet.vehicles.find((v) => v.id === c.id)!.hull].label)} ${Math.round(c.from)}% → ${Math.round(c.to)}%`).join(" · ")} · carrier ${Math.round(plan.carrierFrom)}% → ${Math.round(plan.carrierTo)}%</small>`}</p>`;
    }
    html += `<article class="host"><h3>${esc(host.label)} <small>${esc(host.kind)} · ${powered ? `${esc(host.power === "plant" ? "station power" : host.power)} power` : `no power: ${esc(reason ?? "")}`}</small></h3>${host.unique ? `<p><small>${esc(host.unique)}</small></p>` : ""}<ul class="sockets">${rows}</ul>${extra}</article>`;
  }
  // Kits in the hold: deploy here, with the site check up front.
  for (const kit of carried.filter((i) => tierOfKit(i.kind))) {
    const p = deployPreview(s, sys, kit.id, deployPoint(s, world), siteQuery(world), outpostRules(s));
    html += `<article class="kit"><h3>${esc(label(kit.kind))}</h3><p>${p.refusal ? esc(p.refusal) : `Deploys here · ${esc(p.power ?? "")} power${p.refit.length ? ` · refits ${p.refit.length} module${p.refit.length === 1 ? "" : "s"}` : ""}`}</p>${button("Deploy here", { type: "deploy-outpost", itemId: kit.id }, !!p.refusal, p.refusal ?? undefined)}</article>`;
  }
  const away = sys.outposts.filter((o) => !here.some((h) => h.id === o.id));
  if (away.length) html += group("outposts", `Outposts <small>${away.length}</small>`, away.map((o) =>
    `<p><b>${esc(o.name)}</b> · ${esc(OUTPOST_TIERS[o.tier].label)} · ${esc(o.power)} power · ${bearing(s.player.pose.position, o.position)}</p>`).join(""));
  html += beacons(s, button, group) + chart(s, group);
  return html;
}
function beacons(s: GameState, button: CommandButton, group: Group): string {
  const views = beaconViews(s, s.systems), players = views.filter((v) => v.category === "player");
  const carried = s.inventory.items.filter((i) => i.kind === "nav_beacon" && i.containerId === "diver").reduce((n, i) => n + i.quantity, 0);
  const place = button("Place beacon here", { type: "place-beacon", name: `Beacon ${players.length + 1}` }, carried === 0 || players.length >= PLAYER_BEACON_LIMIT,
    carried === 0 ? "Fabricate navigation beacons at the pod bench" : undefined);
  const cats = BEACON_CATEGORIES.map((c) => button(`${s.systems.categoriesOff.includes(c) ? "Show" : "Hide"} ${c}`, { type: "beacon-switch", category: c, on: s.systems.categoriesOff.includes(c) })).join("");
  const rows = views.map((b) => `<p>${b.on ? "●" : "○"} <b>${esc(b.name)}</b> · ${esc(b.category)} · ${bearing(s.player.pose.position, b.position)} ${
    button(b.on ? "Off" : "On", { type: "beacon-switch", beaconId: b.id, on: !b.on })}${b.removable && distance(b.position, s.player.pose.position) < 6 ? button("Collect", { type: "collect-beacon", beaconId: b.id }) : ""}</p>`).join("");
  return group("beacons", `Beacons <small>${views.length}</small>`, `<div class="service-actions">${place}</div><div class="service-actions">${cats}</div>${rows}`);
}
/** A compact SVG of the explored chart: only what you explored, scanned or decoded. */
function chart(s: GameState, group: Group): string {
  const view = chartView(s, s.systems, chartOptions(s));
  if (!view.cells.length) return "";
  const xs = view.cells.map((c) => c.x), zs = view.cells.map((c) => c.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs) + 50, minZ = Math.min(...zs), maxZ = Math.max(...zs) + 50;
  const w = maxX - minX, h = maxZ - minZ;
  // +Z is north: draw it up.
  const cells = view.cells.map((c) => `<rect x="${c.x - minX}" y="${maxZ - c.z - 50}" width="50" height="50" class="chart-${c.reveal.includes("decoded") ? "decoded" : c.reveal.includes("scanned") ? "scanned" : "explored"}"/>`).join("");
  const marks = view.markers.map((m) => `<circle cx="${m.position.x - minX}" cy="${maxZ - m.position.z}" r="${Math.max(4, w / 120)}" class="chart-${m.kind}"><title>${esc(m.label)}</title></circle>`).join("");
  const you = view.player ? `<circle cx="${view.player.x - minX}" cy="${maxZ - view.player.z}" r="${Math.max(6, w / 80)}" class="chart-you"><title>You</title></circle>` : "";
  return group("chart", `Chart <small>${view.cells.length} cells</small>`,
    `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Personal chart: explored ${view.cells.length} cells, ${view.markers.length} markers">${cells}${marks}${you}</svg><p><small>North is up. Your live position shows once the chart position fix is made.</small></p>`);
}

// ---------------------------------------------------------------- Fit
const SLOT_NAMES: Readonly<Record<SlotKind, string>> = { socket: "sockets", hull: "hull bays", major: "major mount", tool: "tool hardpoint",
  system: "system sockets", structure: "structure", refit: "refit" };
export function fitPanel(s: GameState, button: CommandButton, group: Group): string {
  const craft = s.fleet.vehicles;
  if (!craft.length) return "<p>Build a craft first. Upgrade modules fit at the pod, the workshop, a restored stop, a carrier berth or an outpost.</p>";
  const modules = s.inventory.items.filter((i) => upgradeId(i.kind) && i.fitted === null && !craft.some((v) => v.modules.includes(i.id)));
  return craft.map((v) => {
    const p = vehicleProfile(s, v), t = fitTarget(s, v), dock = dockOf(s, v);
    const slots = (Object.keys(HULL_SLOTS[v.hull]) as SlotKind[]).filter((k) => slotCapacity(v.hull, k, p) > 0)
      .map((k) => `${SLOT_NAMES[k]} ${t.fitted.filter((f) => slotOf(v.hull, f.kind) === k).length}/${slotCapacity(v.hull, k, p)}`).join(" · ");
    const fitted = t.fitted.map((f) => {
      const r = upgradeRemovePreview(s, v, f.itemId);
      return `<li><b>${esc(UPGRADES[f.kind].label)}</b> ${button("Remove", { type: "remove-module", vehicleId: v.id, itemId: f.itemId }, !!r.refusal, r.refusal ?? undefined)}</li>`;
    }).join("");
    const offers = modules.filter((i) => slotOf(v.hull, i.kind as UpgradeId)).map((i) => {
      const r = upgradeInstallPreview(s, v, i), no = installModuleRefusal(s, v.id, i.id);
      return `<li>${group(`fit:${v.id}:${i.id}`, `<b>${esc(label(i.kind))}</b>`, `<p>${r.gains.map(esc).join(" · ")}</p><p class="losses">${r.losses.map(esc).join(" · ")}</p>${r.warnings.map((w) => `<p class="warning">${esc(w)}</p>`).join("")}`)}${
        button("Fit", { type: "install-module", vehicleId: v.id, itemId: i.id }, !!no, no ?? undefined)}</li>`;
    }).join("");
    const tools = [
      p.tools.includes("flare") || p.tools.includes("ballast") ? button("Rearm", { type: "upgrade", action: "rearm" }, s.player.controlledVehicleId !== v.id, "Pilot the craft at a dock") : "",
      s.inventory.items.some((i) => i.kind === "bio_cell") ? button("Feed bio-cell", { type: "upgrade", action: "bio-cell" }) : "",
    ].join("");
    return `<article class="fit-craft"><h3>${esc(HULLS[v.hull].label)} <small>${p.rating ? `${p.rating} m · ` : ""}${dock ? `at ${esc(dock.replaceAll("_", " "))}` : "no dock here"}</small></h3><p><small>${slots}</small></p>${
      fitted ? `<ul>${fitted}</ul>` : "<p><small>Nothing fitted.</small></p>"}${offers ? `<h4>Carried modules</h4><ul>${offers}</ul>` : ""}${tools ? `<div class="service-actions">${tools}</div>` : ""}</article>`;
  }).join("");
}

// ---------------------------------------------------------------- Journal
/** Creatures met: every species of a region whose habitats you have worked. */
function creatures(s: GameState): CreatureEntry[] {
  const regions = new Set(s.knowledge.scans.filter((id) => Object.hasOwn(SOURCES, id)).map((id) => SOURCES[id as keyof typeof SOURCES].region as RegionId));
  // SIG-1: a species the Dart's range tagger filed is known wherever it was met.
  const known = (id: string, region: RegionId): boolean => regions.has(region) || s.knowledge.scans.includes(speciesScanId(id));
  const tagged = (id: string): readonly string[] => s.knowledge.scans.includes(speciesScanId(id)) ? ["Tagged at range by the Dart."] : [];
  return [
    ...Object.entries(THREATS).filter(([id, t]) => known(id, t.region)).map(([id, t]) => ({ id, label: t.label, region: t.region, behaviour: t.scan, danger: "hunter" as const, notes: tagged(id) })),
    ...Object.entries(CUE_SPECIES).filter(([id, c]) => known(id, c.region)).map(([id, c]) => ({ id, label: c.label, region: c.region, behaviour: c.scan, danger: "cue" as const, notes: tagged(id) })),
  ];
}
/** Natural cycles the player has watched (C4B-07): only timings seen from a
 * phase's start to its end, from the saved observation records. */
function cycles(s: GameState): CycleEntry[] {
  return s.knowledge.cycles.flatMap((record) => {
    const c = WORLD_CYCLES.find((x) => x.id === record.cycleId);
    const f = Object.values(HAZARD_FIELDS).find((x) => "cycleId" in x && x.cycleId === record.cycleId);
    if (!c || !f) return [];
    const e = journalEntry(c, record), active = c.phases.filter((p) => p.level === 1);
    const window = active.every((p) => record.measured.includes(p.id)) ? active.reduce((n, p) => n + p.seconds, 0) : null;
    return [{ id: c.id, label: c.label, region: f.region, periodSeconds: e.periodS, windowSeconds: window, alternative: f.cue,
      phases: e.phases.map((p) => `${p.label}: ${p.seconds === null ? "not yet timed" : mins(p.seconds)}`),
      cues: e.cues.map((w) => `${w.leadS} s before: ${w.cue}`) }];
  });
}
export const JOURNAL_TABS: readonly JournalTabId[] = ["notebook", "materials", "tech", "creatures", "cycles", "decodes"];
export function journalPanel(s: GameState, notebook: string, tab: JournalTabId, tabButton: (id: JournalTabId, label: string, current: boolean) => string): string {
  const j = buildJournal(s, s.systems, { creatures: creatures(s), cycles: cycles(s), decoder: systemsContext(s) });
  const objective = currentObjective(s);
  const nav = JOURNAL_TABS.map((id) => {
    const t = j.tabs.find((x) => x.id === id)!;
    return tabButton(id, `${t.label}${id === "notebook" ? "" : ` ${t.count}`}`, id === tab);
  }).join("");
  const render = (sections: readonly JournalSection[]): string => sections.map((sec) => `<section><h3>${esc(sec.title)}</h3>${sec.entries.map((e) =>
    `<article class="journal-entry"><p><b>${esc(e.title)}</b>${e.subtitle ? ` · <small>${esc(e.subtitle)}</small>` : ""}</p>${(e.lines ?? []).map((l) => `<p>${esc(l)}</p>`).join("")}${
      (e.logs ?? []).map((l) => `<p class="log">${esc(l)}</p>`).join("")}</article>`).join("")}</section>`).join("");
  // The story notebook stays S5/S8's; the shared model's LS-1 sections (found notes, door
  // codes) follow it, so the one journal model reaches the real panel.
  const LS1_NOTEBOOK = ["notes", "codes"];
  const body = tab === "notebook"
    ? notebook + render(j.tabs.find((x) => x.id === "notebook")!.sections.filter((sec) => LS1_NOTEBOOK.includes(sec.id)))
    : (() => {
      const t = j.tabs.find((x) => x.id === tab)!;
      if (!t.count) return `<p class="empty">${esc(t.empty)}</p>`;
      return render(t.sections);
    })();
  return `<p class="objective ${objective.kind}"><b>Now</b> · ${esc(objective.step)}</p><nav class="journal-tabs" aria-label="Journal tabs">${nav}</nav><div class="journal-body">${body}</div>`;
}
export { pct, REGIONS };
