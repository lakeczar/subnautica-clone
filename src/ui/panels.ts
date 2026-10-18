import {
  EVIDENCE, HULLS, ITEMS, MODULES, OPTIONAL_RECORD, PLACES,
  RECOVERY_STAGE, RECIPES, REGIONS, SOURCES,
} from "../content/registry.js";
import type { ItemKind, RecipeId } from "../content/registry.js";
import {
  available, containerAccessible, distance, equipped, fabricationContainers,
  facility, hasRoom, localBenchSite, materialStoragePreview, nearPod,
  nearWorkshop, supportedServiceSite, usedCapacity,
} from "../sim/inventory.js";
import { craftingRefusal, personalLimit } from "../sim/progression.js";
import { RECOVERY_NOTICES, recoveryOccupancyRefusal } from "../sim/recovery.js";
import { cellRechargePreview, distractionPreview, PULSE_CHARGE_COST } from "../sim/vehicles.js";
import { dartPerformance, installModuleRefusal, removeModuleRefusal } from "../sim/modules.js";
import type { GameCommand, GameState, ItemStack, VehicleState, WorldQueries } from "../sim/types.js";
import { bearing, escapeHtml, recoveryDisplay } from "./format.js";

export type PanelKind = "inventory" | "craft" | "notebook" | "carrier";
type CommandButton = (label: string, command: GameCommand, disabled?: boolean) => string;

function containerLabel(state: GameState, id: string): string {
  if (id === "diver") return "Diver hold";
  if (id === "equipment") return "Retained equipment";
  if (id === "buoy_hold") return "Deployed buoy";
  if (id === "pod_locker") return "Pod locker";
  if (id === "workshop_locker") return "Workshop locker";
  const v = state.fleet.vehicles.find((v) => v.cargoId === id);
  return v ? `${HULLS[v.hull].label} hold` : "Visited cargo cache";
}

// GameView owns panel visibility, the latest state and all input listeners.
// This owner builds content and retains only panel-local command/selection state.
export class PanelView {
  private readonly commands = new Map<string, GameCommand>();
  private storageFrom: string | null = null;
  // A default is never promoted to explicit intent by rendering it.
  private storageToChosen: string | null = null;
  private storageContext: string | null = null;
  private storageNotice = "";
  private readonly expansions = new Map<string, boolean>();
  private highlightTimer = 0;
  private renderedKind: PanelKind | null = null;

  constructor(private readonly root: HTMLElement, private readonly world: WorldQueries) {}

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing UI element ${id}`);
    return element;
  }

  command(action: string): GameCommand | undefined {
    return this.commands.get(action);
  }

  selectStorage(id: "storage-from" | "storage-to", value: string): void {
    if (id === "storage-from") this.storageFrom = value;
    else this.storageToChosen = value;
    this.storageNotice = "";
  }

  refresh(kind: PanelKind, state: GameState): void {
    const content = this.get("panel-content");
    const restoreFocus = content.contains(document.activeElement);
    const focused = restoreFocus ? document.activeElement as HTMLElement : null;
    const restoreKey = focused?.dataset.commandKey;
    const restoreLocalKey = focused?.dataset.focusKey;
    const fallbackKey = focused?.dataset.focusFallback;
    for (const group of content.querySelectorAll<HTMLDetailsElement>("details[data-panel-group]"))
      if (group.dataset.panelGroup) this.expansions.set(group.dataset.panelGroup, group.open);
    const context = this.storageAnchor(state);
    if (context !== this.storageContext) {
      this.storageContext = context;
      this.storageFrom = this.storageToChosen = null;
      this.storageNotice = "";
    }
    if (this.renderedKind !== kind) this.get("game-panel").scrollTop = 0;
    this.renderedKind = kind;
    this.commands.clear();
    this.get("carrier-nav").hidden = state.scenario !== "carrier-fixture";
    const button: CommandButton = (label, command, disabled = false) => {
      const id = `command-${this.commands.size}`;
      this.commands.set(id, command);
      // Every operand identifies the action, independently of its label or render order.
      const key = JSON.stringify(command, Object.keys(command).sort());
      const fallback = command.type === "craft" ? `recipe:${command.recipeId}`
        : command.type === "install-module" || command.type === "remove-module" ? `fitting:${command.vehicleId}` : "";
      return `<button data-action="${id}" data-command-key="${escapeHtml(key)}" data-focus-fallback="${escapeHtml(fallback)}"${disabled ? " disabled" : ""}>${escapeHtml(label)}</button>`;
    };
    this.get("panel-title").textContent = {
      inventory: "Hold",
      craft: "Fabricate",
      notebook: "Notebook",
      carrier: "Carrier feasibility fixture",
    }[kind];
    for (const nav of this.get("game-panel").querySelectorAll<HTMLButtonElement>("nav button"))
      nav.setAttribute("aria-current", nav.dataset.action === `${kind}-panel` ? "page" : "false");
    let html = "";
    if (kind === "inventory") {
      html = this.hold(state, button);
    } else if (kind === "craft") {
      html = this.fabricate(state, button);
    } else if (kind === "notebook") {
      html = this.diveCheck(state) + button("Request a regional hint", { type: "hint" });
      const found = (id: string): boolean => state.knowledge.evidence.some((e) => e.id === id);
      html += `<article class="next-question"><h3>Current question</h3><p>${found("C04") ? "What changed in the water before the equipment failed? Compare the field sheet with the intake and workshop records. On returning, Canopy crust and resin can fund optional Dart acoustic trim at the workshop; fit it for a faster quiet approach. The Basin lead is for a later expedition." : found("C02") && found("C03") ? "Why were the intake and workshop left behind? The upper laboratory beside the Canopy’s tall rib may preserve another observation." : found("C03") ? "Why were departure supplies left unused? The reef intake is an independent lead; the laboratory lies beyond the eastern buoyant crowns." : found("C02") ? "Why is the intake abandoned while its filters still live? The workshop by Splitspine’s landing may preserve a different account." : "Why is the pod damaged? Compare its regulator with the intake below the reef ribs, or investigate the workshop above the island landing."}</p><small>Either early lead can be investigated first. Personal field notes add context; they do not unlock the investigation.</small></article>`;
      if (
        state.knowledge.evidence.some((e) => e.id === "C02") &&
        state.knowledge.evidence.some((e) => e.id === "C03")
      )
        html +=
          '<p class="interpretation">Together: the living intake and unspent shore supplies suggest disrupted services. The reason people left these sites is still unconfirmed, whichever record you found first.</p>';
      for (const found of state.knowledge.evidence) {
        const e = EVIDENCE[found.id];
        html += `<article class="finding" id="finding-${found.id}" tabindex="-1"><h3>${e.label}</h3><p class="provenance">Source · ${escapeHtml(found.provenance)}</p><p><b>Observed</b> · ${e.observation}</p><p><b>Hypothesis</b> · ${e.hypothesis}</p><p class="lead"><b>Regional lead</b> · ${e.lead}</p></article>`;
      }
      for (const id of state.knowledge.scans)
        html += `<article><h3>${id === "filter_flow" ? "Current-facing filters" : SOURCES[id as keyof typeof SOURCES]?.label}</h3><p>${id === "filter_flow" ? "Open fans face the current. Harvest loose membrane from downstream catch hollows." : (SOURCES[id as keyof typeof SOURCES]?.scan ?? "")}</p></article>`;
      if (state.knowledge.journals.includes(OPTIONAL_RECORD.id))
        html += `<article><h3>Personal record · optional</h3><p>${OPTIONAL_RECORD.text}</p></article>`;
      html += this.knownHabitats(state);
      html += this.group("dive-preparation", "Dive preparation & safety", `<p>Current personal suit: ${personalLimit(state)} m. A Dart hull is rated to ${HULLS.dart.initialDepth} m, but it cannot protect you outside. Prepare a 150 m suit for the upper laboratory. Full-tank rating: 180 seconds submerged; current oxygen is shown in Dive check. Carry a meal and charged reserve cell; plan to return with at least a quarter of your air and power.</p><p>Z reduces movement noise. Quiet movement, the tall rib’s cover and retreat cost no cell charge. G releases a 12-second directional distraction for ${PULSE_CHARGE_COST} points from one carried cell, then a controlled-craft cell; it cannot use remote locker cells or repeat while active. Move quietly away from the pulse. The same charge can instead supply reserve hull power at the craft’s socket.</p><p>Recharge local cells at a restored pod or workshop bench, before or after owning a craft. Hull battery, health and emergency air need separate supported craft service. Warning calls also appear with direction in the HUD, with sound muted or opening captions off.</p>${found("C04") ? "<p>The Canopy return can improve your next trip: two crust + two resin fabricate optional Dart acoustic trim at the workshop. Fit it at the cradle for faster quiet travel in exchange for boost speed, one socket and 2 CU. Pale Basin remains a future expedition in this build.</p>" : ""}`);
      html += this.places(state);
      html += this.returnInformation(state);
      if (facility(state, "island_workshop"))
        html += this.group("unfinished-berth", "The unfinished large berth", "<p>The carrier cradle needs complementary surveys and frame recovery from Pale Basin. It is a future construction opportunity; no campaign carrier is available here yet.</p>");
    } else {
      const d = state.fleet.docking;
      html =
        '<p class="fixture-label">SEEDED FEASIBILITY · no earned campaign progression · station keeping only, no underway walking</p>';
      if (!d)
        html += "<p>Open the separate carrier fixture from the main menu.</p>";
      else {
        html += `<p>${d.stationKeeping ? "Station keeping" : "Under helm control"} · ${d.configuration} configuration · ${d.transaction ? `${d.transaction.type} / ${d.transaction.phase}` : "lock closed"} · completed transactions ${d.completed.length}</p><div class="service-actions">`;
        for (const [label, a] of [
          ["Engage station keeping", "station-keep"],
          ["Take helm", "helm"],
          ["Leave helm", "leave-helm"],
          ["Leave aft vestibule", "leave-interior"],
          ["Enter exterior vestibule", "enter-interior"],
          ["Reconfigure empty supported berth", "reconfigure"],
          ["Toggle fixture obstruction", "block-exit"],
          ["Interrupt lock transaction", "interrupt"],
          ["Fixture incapacity / refuge fallback", "failure-drill"],
        ] as const)
          html += button(label, { type: "carrier", action: a });
        html += "</div>";
        for (const v of state.fleet.vehicles.filter(
          (v) => v.id !== d.vehicleId,
        ))
          html += `<article><h3>${HULLS[v.hull].label} · ${v.berth ? "dry isolated berth " + v.berth.slot : "world craft"}</h3><p>Identity ${v.id} · power ${v.charge.toFixed(1)} · damage ${(100 - v.health).toFixed(1)} · cargo ${usedCapacity(state, v.cargoId)} CU</p>${button(v.berth ? "Launch through lock" : "Capture from corridor", { type: "carrier", action: v.berth ? "launch" : "capture", vehicleId: v.id })}</article>`;
      }
    }
    this.get("panel-content").innerHTML = html;
    if (restoreFocus) {
      const next = restoreKey ? [...content.querySelectorAll<HTMLButtonElement>("button:not([disabled])")].find((b) => b.dataset.commandKey === restoreKey) : undefined;
      const local = [...content.querySelectorAll<HTMLElement>("[data-focus-key]")].find((e) => e.dataset.focusKey === (restoreLocalKey ?? fallbackKey));
      const outcomeGroup = local?.closest<HTMLDetailsElement>("details");
      const outcome = local?.checkVisibility() ? local
        : outcomeGroup?.tagName === "DETAILS" ? outcomeGroup.querySelector<HTMLElement>("summary") : null;
      (next?.checkVisibility() ? next : outcome?.checkVisibility() ? outcome : this.get("panel-return")).focus({ preventScroll: true });
    }
  }

  resetSession(): void {
    this.cancelFeedback();
    this.storageFrom = this.storageToChosen = this.storageContext = null;
    this.storageNotice = "";
    this.expansions.clear();
    this.renderedKind = null;
    this.commands.clear();
    // Do not re-read the previous session's native details on its next render.
    this.get("panel-content").innerHTML = "";
    this.get("panel-feedback").classList.remove("error");
    this.get("panel-feedback").textContent = "";
    this.get("panel-feedback").hidden = true;
  }

  private group(id: string, label: string, body: string, initiallyOpen = false): string {
    return `<details class="panel-group" data-panel-group="${escapeHtml(id)}"${(this.expansions.get(id) ?? initiallyOpen) ? " open" : ""}><summary data-focus-key="group:${escapeHtml(id)}">${label}</summary>${body}</details>`;
  }

  private itemLabel(state: GameState, item: ItemStack): string {
    if (item.kind !== "reserve_cell") return ITEMS[item.kind].label;
    const cells = state.inventory.items.filter((i) => i.kind === "reserve_cell").sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return `Reserve cell ${cells.findIndex((i) => i.id === item.id) + 1}`;
  }

  private storageAnchor(state: GameState): string {
    // Bench and cradle are one meaningful site; restoration and a fluctuating
    // cargo roster cannot change an explicit choice at that site.
    if (nearPod(state)) return "site:home_pod";
    if (nearWorkshop(state)) return "site:island_workshop";
    const local = state.fleet.vehicles.filter((v) => !v.berth &&
      (v.id === state.player.controlledVehicleId || distance(state.player.pose.position, v.pose.position) < 7))
      .sort((a, b) => distance(state.player.pose.position, a.pose.position) - distance(state.player.pose.position, b.pose.position) || a.id.localeCompare(b.id));
    const supported = local.map((v) => supportedServiceSite(state, v)).find((site) => site !== null);
    if (supported) return `site:${supported}`;
    if (containerAccessible(state, "buoy_hold")) return "anchor:buoy";
    if (local[0]) return `craft:${local[0].id}`;
    const cache = state.recovery.caches.find((c) => containerAccessible(state, c.containerId));
    return cache ? `cache:${cache.id}` : state.player.interiorId ? `interior:${state.player.interiorId}` : "field";
  }

  private knownContainer(state: GameState, id: string): boolean {
    if (id === "workshop_locker") return nearWorkshop(state) || facility(state, "island_workshop") || state.knowledge.markers.includes("island_workshop");
    if (id === "buoy_hold") return state.inventory.buoy.deployed;
    return true;
  }

  private itemRows(state: GameState, containerId: string, button: CommandButton): string {
    const bins = state.inventory.containers.filter((c) => c.kind !== "equipment" && containerAccessible(state, c.id));
    const items = state.inventory.items.filter((i) => i.containerId === containerId);
    return items.map((i) => {
      const installed = state.fleet.vehicles.find((v) => v.modules.includes(i.id));
      let actions = "";
      if (i.kind === "salvage_buoy") actions += button(state.inventory.buoy.deployed ? "Pack empty buoy" : "Deploy carried buoy", { type: "buoy" });
      if (!i.fitted && !installed)
        for (const d of bins.filter((d) => d.id !== containerId)) {
          const label = d.id === "diver" ? "Take to diver" : `To ${containerLabel(state, d.id)}`;
          actions += button(`${label} · ${i.quantity}${hasRoom(state, d.id, ITEMS[i.kind].cu * i.quantity) ? "" : " (needs space)"}`, { type: "transfer", itemId: i.id, to: d.id, quantity: i.quantity });
          if (i.quantity > 1) actions += button(`${label} · 1`, { type: "transfer", itemId: i.id, to: d.id, quantity: 1 });
        }
      return `<div class="item-row"><div><strong>${escapeHtml(this.itemLabel(state, i))}${i.quantity > 1 ? ` × ${i.quantity}` : ""}</strong><small>${installed ? `Installed in ${HULLS[installed.hull].label} · remove at collar before transfer` : i.fitted ? "Fitted / retained" : `${ITEMS[i.kind].cu * i.quantity} CU`}${i.charge !== null ? ` · charge ${i.charge.toFixed(0)}%` : ""}${i.provenance === "maintenance" ? " · rescue stock" : ""}</small></div><div class="item-actions">${actions}</div></div>`;
    }).join("") || '<p class="empty-hold">Empty</p>';
  }

  private hold(state: GameState, button: CommandButton): string {
    const diver = state.inventory.containers.find((c) => c.id === "diver");
    const retained = state.inventory.items.filter((i) => i.fitted);
    let html = `<p class="panel-status">Suit ${personalLimit(state)} m · Carried ${usedCapacity(state, "diver")} / ${diver?.capacity ?? 0} CU${retained.length ? ` · ${retained.map((i) => escapeHtml(this.itemLabel(state, i))).join(" · ")}` : ""}</p>`;
    html += `<article class="container carried" id="container-diver" tabindex="-1"><h3>Carried items</h3>${this.itemRows(state, "diver", button)}<div class="service-actions">${button("Eat a meal", { type: "eat" })}${button("Request emergency refuge meal", { type: "emergency-meal" })}${!state.inventory.buoy.itemId ? button("Deploy carried buoy", { type: "buoy" }, true) : ""}</div></article>`;
    html += this.materialStorageControls(state, button);
    const bins = state.inventory.containers.filter((c) => c.id !== "diver" && containerAccessible(state, c.id));
    html += '<div class="container-grid">';
    for (const c of bins) {
      const name = c.kind === "equipment" ? "Retained equipment" : containerLabel(state, c.id);
      const body = `<div id="container-${escapeHtml(c.id)}" tabindex="-1">${this.itemRows(state, c.id, button)}</div>`;
      html += this.group(`container:${c.id}`, `${escapeHtml(name)} <small>${usedCapacity(state, c.id)} / ${c.capacity} CU</small>`, body);
    }
    html += '</div>';
    const vessels = state.fleet.vehicles.filter((v) => !v.berth && v.hull !== "hearthline");
    const here = vessels.filter((v) => distance(state.player.pose.position, v.pose.position) < 7 || localBenchSite(state) !== null && supportedServiceSite(state, v) === localBenchSite(state));
    for (const v of here) html += this.vesselService(state, v, button);
    // Fitting stays discoverable before a Dart exists, without duplicating hull controls.
    if (!vessels.some((v) => v.hull === "dart")) html += this.moduleFitting(state, button);
    html += this.powerPreparation(state, button);
    const distant = state.inventory.containers.filter((c) => !containerAccessible(state, c.id) && this.knownContainer(state, c.id));
    let elsewhere = distant.map((c) => `<p><b>${escapeHtml(containerLabel(state, c.id))}</b> · ${usedCapacity(state, c.id)} / ${c.capacity} CU · ${c.id === "workshop_locker" && !facility(state, "island_workshop") ? "Locked · restore workshop services with carried materials or a nearby deployed buoy." : "Out of reach · approach to transfer."}</p>`).join("");
    for (const v of vessels.filter((v) => !here.includes(v))) elsewhere += this.vesselService(state, v, button);
    html += this.group("elsewhere", `Elsewhere <small>${distant.length} known container${distant.length === 1 ? "" : "s"}${vessels.some((v) => !here.includes(v) && v.disabled) ? " · disabled craft recovery" : ""}</small>`, elsewhere || "<p>No other known containers.</p>");
    if (state.recovery.operation || state.recovery.losses.length || state.recovery.caches.some((c) => state.inventory.items.some((i) => i.containerId === c.containerId)) || Object.values(RECOVERY_NOTICES).some((message) => message === state.feedback))
      html += this.returnInformation(state);
    return html;
  }

  private vesselService(state: GameState, v: VehicleState, button: CommandButton): string {
    const local = distance(state.player.pose.position, v.pose.position) < 7;
    const occupied = recoveryOccupancyRefusal(state, v.id);
    const cells = state.inventory.items.filter((i) => i.kind === "reserve_cell" && (i.containerId === "diver" || i.containerId === v.cargoId));
    let html = `<article class="vessel-service" id="vessel-${escapeHtml(v.id)}" tabindex="-1" data-focus-key="vessel:${escapeHtml(v.id)}"><h3>${HULLS[v.hull].label} · ${v.disabled ? "disabled transponder" : "available"}</h3><p>${bearing(state.player.pose.position, v.pose.position)} · ${local ? "service socket in reach" : "approach the service socket"}. Power ${v.charge.toFixed(0)}% · hull ${v.health.toFixed(0)}% · hull ${HULLS[v.hull].initialDepth} m / suit ${personalLimit(state)} m.</p>`;
    if (v.disabled && v.hull === "dart") {
      const frame = Object.entries(v.investment).map(([k, q]) => `${q} ${ITEMS[k as ItemKind].label}`).join(" / ") || "No frame materials recorded";
      const cu = Object.entries(v.investment).reduce((n, [k, q]) => n + ITEMS[k as ItemKind].cu * q, 0);
      const destination = state.inventory.buoy.deployed && distance(state.inventory.buoy.position, state.player.pose.position) < 6 && hasRoom(state, "buoy_hold", cu)
        ? "Deployed buoy" : hasRoom(state, "diver", cu) ? "Diver hold" : null;
      const eligibleHolds = [
        (state.inventory.containers.find((c) => c.id === "diver")?.capacity ?? 0) >= cu ? "the diver hold" : null,
        (state.inventory.containers.find((c) => c.id === "buoy_hold")?.capacity ?? 0) >= cu ? "a deployed buoy within 6 m" : null,
      ].filter(Boolean).join(" or ");
      const patchAlloy = Math.min(14, state.world.maintenance.alloy + v.boundRepairs * 2) - state.world.maintenance.alloy;
      const patchMembrane = Math.min(7, state.world.maintenance.membrane + v.boundRepairs) - state.world.maintenance.membrane;
      html += `<p class="recovery-kit">${equipped(state, "bobbin_kit") ? "Bobbin kit retained" : "Requires Bobbin kit · fabricate at the pod"} · Rescue stock: ${state.world.maintenance.alloy} alloy / ${state.world.maintenance.membrane} membrane.</p><div class="recovery-choices" aria-label="Dart recovery choices">
        <section class="recovery-choice"><h4>Patch here</h4><p class="recovery-cost">2 alloy + 1 membrane · rescue stock</p><p>At the collar, within 7 m. Restores hull to 65%; keeps cargo and charge.</p>${button("Patch here", { type: "recover", vehicleId: v.id, method: "repair" })}</section>
        <section class="recovery-choice"><h4>Tow home</h4><p class="recovery-cost">No materials · to the shallow rescue bench</p><p>Empty hull; cargo stays aboard. Start at the staging bench or collar, within 7 m.</p><small>Upper-Canopy corridor only, within 230 m of staging. Blocked routes stop the tow. No repair or recharge.</small>${button(state.recovery.operation?.vehicleId === v.id && state.recovery.operation.phase === "ready" ? "Attach collar / confirm tow" : "Tow home · deploy Bobbin", { type: "recover", vehicleId: v.id, method: "tow" }, occupied !== null)}</section>
        <section class="recovery-choice"><h4>Salvage frame</h4><p class="recovery-cost">No materials · returns the frame’s ingredients</p><p>At the collar, within 7 m. Empty the hull, hold and module sockets first.</p><small>${escapeHtml(frame)} · ${cu} CU.<br />${destination ? `Return to ${destination}.` : eligibleHolds ? `Make ${cu} CU free in ${eligibleHolds}.` : `Requires a container large enough for the complete ${cu} CU return.`}${v.boundRepairs ? `<br />Past patches return ${patchAlloy} alloy / ${patchMembrane} membrane to rescue stock only (limits 14 / 7).` : ""}</small>${button("Salvage frame", { type: "recover", vehicleId: v.id, method: "salvage" }, occupied !== null)}</section>
      </div>${occupied ? `<p class="recipe-status">${escapeHtml(occupied)}</p>` : ""}`;
    }
    html += `<div class="service-actions">${button("Supported charge / repair", { type: "service", vehicleId: v.id })}${button("Use reserve cell for hull power", { type: "reserve", vehicleId: v.id })}</div>${v.disabled ? '<p class="recipe-status">Patch the hull before routine charging.</p>' : ""}${this.moduleFitting(state, button, v)}${this.group(`service:${v.id}`, "Reserve power & hull service", `<p>Cells in diver / this craft: ${cells.length ? cells.map((i) => `${escapeHtml(this.itemLabel(state, i))} · ${(i.charge ?? 0).toFixed(0)}%`).join(", ") : "none"}. A full cell supplies up to 35% hull power; a pulse spends 25 of that cell’s charge points. Reserve power requires the craft’s local socket.</p><p>For routine service, approach within 7 m at pod waters or the restored workshop cradle; patch a disabled hull first. Supported service restores hull battery, health and emergency air, plus cells in your hold or this craft. For cells in the local locker or buoy, use Recharge local cells at the bench.</p>` )}</article>`;
    return html;
  }


  private powerPreparation(state: GameState, button: CommandButton): string {
    const pulse = distractionPreview(state);
    const cell = pulse.refusal === null ? state.inventory.items.find((i) => i.id === pulse.cellId) : undefined;
    const recharge = cellRechargePreview(state);
    const site = localBenchSite(state);
    const charging = recharge.cellIds.map((id) => state.inventory.items.find((i) => i.id === id)!);
    const summary = `Power <small>Pulse G · −${PULSE_CHARGE_COST} points${cell && pulse.refusal === null ? ` · next: ${escapeHtml(this.itemLabel(state, cell))} ${cell.charge!.toFixed(0)} → ${pulse.remainingCharge.toFixed(0)}%` : " · no usable pulse"} · recharge / reserve</small>`;
    return this.group("power", summary, `<article class="power-preparation"><p><kbd>G</kbd> Directional pulse · ${PULSE_CHARGE_COST} charge points from one cell · 12 seconds.</p>${cell && pulse.refusal === null
      ? `<p class="recipe-ready">Next payment: ${escapeHtml(this.itemLabel(state, cell))} in ${escapeHtml(containerLabel(state, cell.containerId))} · ${cell.charge!.toFixed(0)} → ${pulse.remainingCharge.toFixed(0)}%.</p>`
      : `<p class="recipe-status">${escapeHtml(pulse.refusal ?? "")}${state.world.threat.distractionSeconds > 0 ? ` ${Math.ceil(state.world.threat.distractionSeconds)} seconds remain.` : ""}</p>`}
      ${button(`Release pulse · ${PULSE_CHARGE_COST} cell points`, { type: "distraction" }, pulse.refusal !== null)}<small class="no-charge-options">No charge needed: Z quiet · cover behind the tall rib · retreat. A full cell can instead supply up to 35% hull power at the craft’s local socket.</small>
      <div class="bench-charge"><h4>Bench cell recharge</h4><p>${site ? `${site === "home_pod" ? "Pod" : "Workshop"} bench · ${fabricationContainers(state, site).map((id) => escapeHtml(containerLabel(state, id))).join(" · ")}.` : "Use a restored pod or workshop bench; no vessel is required."}</p>${charging.length ? `<p>${charging.map((i) => `${escapeHtml(this.itemLabel(state, i))} · ${escapeHtml(containerLabel(state, i.containerId))} · ${(i.charge ?? 0).toFixed(0)} → 100%`).join("<br />")}</p>` : ""}${recharge.refusal ? `<p class="recipe-status">${escapeHtml(recharge.refusal)}</p>` : ""}${button("Recharge local cells", { type: "recharge-cells" }, recharge.refusal !== null)}<small>Cells only. Hull battery, health and emergency air require supported service beside the craft.</small></div></article>`);
  }

  private materialStorageControls(state: GameState, button: CommandButton): string {
    const bins = state.inventory.containers.filter((c) => c.kind !== "equipment" && containerAccessible(state, c.id));
    this.storageFrom = bins.find((c) => c.id === this.storageFrom)?.id
      ?? bins.find((c) => c.id === "diver")?.id ?? bins[0]?.id ?? null;
    const destinations = bins.filter((c) => c.id !== this.storageFrom);
    if (this.storageToChosen && !destinations.some((c) => c.id === this.storageToChosen)) {
      this.storageNotice = `${containerLabel(state, this.storageToChosen)} ${this.storageToChosen === this.storageFrom ? "is now the source" : "is out of reach"}.`;
      this.storageToChosen = null;
    }
    const to = this.storageToChosen
      ?? destinations.find((c) => c.kind === "locker")?.id
      ?? destinations.find((c) => c.kind === "buoy")?.id
      ?? destinations.find((c) => c.kind === "vehicle")?.id
      ?? destinations[0]?.id;
    if (!this.storageFrom || !to) return `<article class="bulk-storage"><h3>Store materials</h3><p>${escapeHtml(this.storageNotice)}${this.storageNotice ? " " : ""}Approach a local locker, deployed buoy or craft hold to choose a destination.</p><small>Meals, cells, tools and modules stay put.</small></article>`;
    const preview = materialStoragePreview(state, this.storageFrom, to);
    const options = (choices: typeof bins, selected: string): string => choices.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === selected ? " selected" : ""}>${escapeHtml(containerLabel(state, c.id))} · ${usedCapacity(state, c.id)} / ${c.capacity} CU</option>`).join("");
    return `<article class="bulk-storage"><h3>Store materials</h3><div class="storage-operands"><label>From<select id="storage-from">${options(bins, this.storageFrom)}</select></label><span aria-hidden="true">→</span><label>To<select id="storage-to">${options(destinations, to)}</select></label>${button(`Store materials · ${containerLabel(state, this.storageFrom)} → ${containerLabel(state, to)}`, { type: "store-materials", from: this.storageFrom, to })}</div>${this.storageNotice ? `<p class="storage-context">${escapeHtml(this.storageNotice)} Using ${escapeHtml(containerLabel(state, to))}.</p>` : ""}<p class="storage-quantities">${preview.items.length ? Object.entries(preview.quantities).map(([k, q]) => `${q} × ${ITEMS[k as ItemKind].label}`).join(" · ") : "No material stacks selected"} · <b>${preview.totalCu} CU · whole stacks</b></p>${preview.refusal ? `<p class="recipe-status">${escapeHtml(preview.refusal)}</p>` : ""}<small>Meals, cells, tools and modules stay put. Individual transfers are with each container.</small></article>`;
  }

  private moduleFitting(state: GameState, button: CommandButton, vessel?: VehicleState): string {
    if (!state.knowledge.blueprints.includes(RECIPES.dart_acoustic_trim.bp)) return "";
    const item = state.inventory.items.find((i) => i.kind === "dart_acoustic_trim");
    const spec = MODULES.dart_acoustic_trim;
    const cost = Object.entries(RECIPES.dart_acoustic_trim.cost).map(([k, q]) => `${q} ${ITEMS[k as ItemKind].label}`).join(" + ");
    let html = `<article class="module-fitting"><h3>Dart acoustic trim · ${item ? state.fleet.vehicles.some((v) => v.modules.includes(item.id)) ? "installed" : "fabricated / stored" : "not fabricated"}</h3><p>Quiet 3 → ${spec.quietSpeed} m/s · normal 8 → 8 · boost 11 → ${spec.boostSpeed} m/s.</p><small>Faster quiet travel. Noise, power use per second and pressure rating stay the same. Uses one socket and ${ITEMS.dart_acoustic_trim.cu} CU of the Dart hold.</small>${item ? `<p>${escapeHtml(ITEMS[item.kind].label)} · ${escapeHtml(containerLabel(state, item.containerId))}.</p>` : `<p>Fabricate at the workshop: ${escapeHtml(cost)}. Then fit it at a supported cradle.</p>`}`;
    for (const v of state.fleet.vehicles.filter((v) => v.hull === "dart" && (!vessel || vessel.id === v.id))) {
      const perf = dartPerformance(state, v.id)!;
      const installed = item && v.modules.includes(item.id);
      html += `<section class="fitting-choice" tabindex="-1" data-focus-key="fitting:${escapeHtml(v.id)}"><h4>${HULLS[v.hull].label} · ${perf.socketsUsed} / ${perf.sockets} sockets · ${usedCapacity(state, v.cargoId)} / ${state.inventory.containers.find((c) => c.id === v.cargoId)?.capacity ?? 0} CU hold</h4><p>Now: quiet ${perf.quietSpeed} · normal ${perf.normalSpeed} · boost ${perf.boostSpeed} m/s${perf.cargoCu ? ` · trim occupies ${perf.cargoCu} CU` : ""}.</p>`;
      if (item) {
        const refusal = installed ? removeModuleRefusal(state, v.id, item.id, this.world) : installModuleRefusal(state, v.id, item.id);
        html += `${installed ? `<small>Remove intact into this hold before transferring. ${v.disabled ? "Eligible local collar removal is available before frame salvage; bring the service tool and Bobbin kit." : "Use the pod or restored workshop cradle."}</small>` : ""}${refusal ? `<p class="recipe-status">${escapeHtml(refusal)}</p>` : '<p class="recipe-ready">Local fitting available.</p>'}${button(installed ? "Remove trim into Dart hold" : "Install acoustic trim", { type: installed ? "remove-module" : "install-module", vehicleId: v.id, itemId: item.id })}`;
      }
      html += "</section>";
    }
    return html + "</article>";
  }

  private fabricate(state: GameState, button: CommandButton): string {
    const recipes = (Object.keys(RECIPES) as RecipeId[]).filter((id) => state.knowledge.blueprints.includes(RECIPES[id].bp)).map((id) => {
      const r = RECIPES[id];
      const done = r.once && state.knowledge.crafted.includes(id);
      const refusal = done ? null : craftingRefusal(state, id, this.world);
      // The command's actual refusal determines the primary group, including
      // earlier site/prerequisite/clearance checks when stock is also short.
      const group = done ? "completed" : refusal === null ? "ready"
        : refusal.startsWith("Missing public materials.") || refusal.startsWith("Rescue stock is low.") ? "materials" : "blocked";
      return { id, r, done, refusal, group };
    });
    const atPod = nearPod(state), atWorkshop = nearWorkshop(state) && !state.player.interiorId;
    const current = atPod ? `Home pod bench · ${facility(state, "pod_fabricator") ? "restored" : "repair needed"}`
      : atWorkshop ? `Splitspine workshop bench · ${facility(state, "island_workshop") ? "restored" : "repair needed; locker locked"}`
      : `No bench here${state.player.controlledVehicleId ? " · exit the craft to use a bench" : ""}`;
    const required = [...new Set(recipes.filter((r) => !r.done && (r.r.site === "island_workshop" ? !atWorkshop : !atPod)).map((r) => r.r.site === "island_workshop" ? "island_workshop" : "home_pod"))] as ("home_pod" | "island_workshop")[];
    const directions = required.filter((id) => id === "home_pod" || state.knowledge.markers.includes(id) || facility(state, id))
      .map((id) => `${PLACES[id].label} · ${bearing(state.player.pose.position, PLACES[id].position)}`);
    let html = `<p class="panel-status">${current}</p>${directions.length ? `<p class="bench-direction">Required bench${directions.length > 1 ? "es" : ""}: ${escapeHtml(directions.join(" · "))}</p>` : ""}<p class="recipe-count-label">Ingredients: usable here / cost</p>`;
    const render = ({ id, r, done, refusal }: typeof recipes[number]): string => {
      const bins = fabricationContainers(state, r.site);
      const missingSteps = r.needs.filter((n) => !state.knowledge.crafted.includes(n as RecipeId));
      const isWorkshop = r.site === "island_workshop";
      const atSite = isWorkshop ? atWorkshop : atPod;
      const restored = facility(state, isWorkshop ? "island_workshop" : "pod_fabricator");
      const bench = isWorkshop ? "Splitspine workshop bench" : r.site === "home_pod" ? "Home pod repair bench" : "Home pod fabricator";
      const trim = state.inventory.items.find((i) => i.kind === "dart_acoustic_trim");
      const completion = id === "dart_acoustic_trim" ? trim && state.fleet.vehicles.some((v) => v.modules.includes(trim.id)) ? "installed" : "fabricated" : "completed";
      const costs = Object.entries(r.cost).map(([k, q]) => {
        const kind = k as ItemKind;
        if (done) return `<span class="ingredient">${ITEMS[kind].label}: ${q}</span>`;
        const have = r.maintenance ? kind === "structural_alloy" ? state.world.maintenance.alloy : kind === "silica_glass" ? state.world.maintenance.glass : state.world.maintenance.membrane : available(state, kind, bins);
        const carried = r.maintenance || bins.includes("diver") ? 0 : available(state, kind, ["diver"]);
        const elsewhere = r.maintenance ? 0 : available(state, kind, state.inventory.containers.filter((c) => c.id !== "diver" && !bins.includes(c.id)).map((c) => c.id));
        return `<span class="ingredient${have < q ? " missing" : ""}">${ITEMS[kind].label}: ${have} / ${q}${carried ? ` <small>(+${carried} carried, unavailable here)</small>` : ""}${elsewhere ? ` <small>(+${elsewhere} elsewhere, unavailable here)</small>` : ""}</span>`;
      }).join("");
      // Replace only redundant generic refusals. Specific space, cradle,
      // duplicate-hull and recovery-stock refusals remain beside their action.
      const generic = refusal === "Use the fabrication bench at the required refuge." || refusal?.startsWith("Missing public materials.");
      const reason = done ? "" : missingSteps.length ? `Needs: ${missingSteps.map((n) => RECIPES[n as RecipeId].label).join(" → ")}`
        : refusal === "Restore these fabrication services first." ? `First: ${isWorkshop ? RECIPES.restore_workshop.label : RECIPES.pod_repair.label}`
        : generic ? "" : refusal;
      const sources = r.maintenance ? "Rescue stock only · protected from ordinary fabrication" : `Local sources: ${bins.length ? bins.map((c) => containerLabel(state, c)).join(" · ") : "none at this recipe’s bench"}${bins.some((c) => state.fleet.vehicles.some((v) => v.cargoId === c)) ? " (includes supported-cradle cargo)" : ""}`;
      return `<article class="recipe" data-recipe="${id}" data-readiness="${done ? "completed" : refusal === null ? "ready" : "blocked"}" data-focus-key="recipe:${id}" tabindex="-1"><div><h3>${r.label}${done ? ` · ${completion}` : ""}</h3>${done ? '<small>Current recipe reference</small>' : ""}<p class="recipe-costs">${costs}</p><small>${bench} · ${restored ? "restored" : id === "pod_repair" || id === "restore_workshop" ? "repair available before restoration" : "restore services first"}${!atSite ? " · away from this bench" : ""}${r.maintenance ? " · rescue stock only" : ""}</small>${reason ? `<p class="recipe-status">${escapeHtml(reason)}</p>` : ""}${done ? "" : this.group(`recipe-sources:${id}`, "Material sources", `<p class="recipe-sources">${escapeHtml(sources)}.</p>${isWorkshop && !restored ? "<p>The unrestored workshop locker stays locked. Restore with carried materials or a nearby deployed buoy.</p>" : ""}`)}</div>${done ? "" : button(`Fabricate · ${r.label}`, { type: "craft", recipeId: id })}</article>`;
    };
    for (const [group, label] of [["ready", "Ready here"], ["materials", "Needs materials"], ["blocked", "Needs preparation / another bench"]] as const) {
      const rows = recipes.filter((r) => r.group === group);
      if (rows.length) html += `<section class="recipe-group" data-recipe-group="${group}"><h3>${label} <small>${rows.length}</small></h3>${rows.map(render).join("")}</section>`;
    }
    const completed = recipes.filter((r) => r.done);
    if (completed.length) html += this.group("completed-recipes", `Completed <small>${completed.length} one-time reference${completed.length === 1 ? "" : "s"}</small>`, completed.map(render).join(""));
    if (!recipes.length) html += "<p>Inspect the pod regulator to recover its checklist.</p>";
    return html;
  }

  private diveCheck(state: GameState): string {
    const meals = state.inventory.items.filter((i) => i.kind === "meal" && i.containerId === "diver").reduce((n, i) => n + i.quantity, 0);
    const cells = state.inventory.items.filter((i) => i.kind === "reserve_cell" && i.containerId === "diver");
    const hulls = state.fleet.vehicles.filter((v) => !v.berth && v.hull !== "hearthline");
    return `<article class="dive-check"><h3>Dive check</h3><p>Suit ${personalLimit(state)} m · Oxygen ${state.player.vitals.oxygen.toFixed(0)}% · Full-tank rating 180 s · Food ${state.player.vitals.food.toFixed(0)}% · Carried meals ${meals}</p><p>${cells.length ? cells.map((i) => `${escapeHtml(this.itemLabel(state, i))} ${(i.charge ?? 0).toFixed(0)}%`).join(" · ") : "No carried reserve cell"}${hulls.length ? ` · ${hulls.map((v) => `${HULLS[v.hull].label} ${HULLS[v.hull].initialDepth} m · hull ${v.health.toFixed(0)}% · power ${v.charge.toFixed(0)}%${v.disabled ? " · disabled" : ""}`).join(" · ")}` : " · No craft"}</p></article>`;
  }

  private knownHabitats(state: GameState): string {
    const known = Object.entries(SOURCES).filter(([id]) => state.knowledge.scans.includes(id));
    return `<article class="habitat-notes"><h3>Known source habitats</h3>${known.length ? known.map(([id, s]) => {
      const stock = state.world.resources.find((r) => r.id === id);
      return `<p><b>${ITEMS[s.item].label} · ${s.label}</b><br />${REGIONS[s.region].label} · ${s.context}<br /><small>${stock?.stock ?? 0} exposed · ${stock?.reserve ?? 0} finite reserve · ${s.bundle} per hand bundle. ${s.item === "meal" ? "When empty, tend here for 20 active seconds for two more portions." : "Sort the host’s finite reserve locally if exposed stock is empty."}</small></p>`;
    }).join("") : "<p>Collect or scan a source to retain its habitat here. Inspecting a record does not reveal every deposit.</p>"}</article>`;
  }

  private places(state: GameState): string {
    const rows = (["home_pod", "island_workshop", "canopy_lab"] as const).filter((id) => id === "home_pod" || state.knowledge.markers.includes(id) || facility(state, id)).map((id) => {
      const capabilities = id === "home_pod" ? `Air · healing · locker · emergency meal · ${facility(state, "pod_fabricator") ? "equipment bench restored" : "bench needs repair"} · craft service in pod waters`
        : id === "island_workshop" ? facility(state, id) ? "Air · healing · locker · charging · hull bench · craft service at cradle" : "Services offline · restore at workshop bench; locker locked"
        : "Air pocket · healing · no locker or craft charging";
      return `<p><b>${PLACES[id].label}</b> · ${bearing(state.player.pose.position, PLACES[id].position)}<br /><small>${capabilities}</small></p>`;
    });
    return `<article class="known-places"><h3>Places</h3>${rows.join("")}</article>`;
  }

  private returnInformation(state: GameState): string {
    let html = '<article class="return-plan"><h3>Return & recovery</h3><p>Knowledge, blueprints and retained equipment survive incapacity. Ordinary cargo may remain in a visited cache; disabled craft keep their own holds. Recovering takes a local expedition.</p>';
    // The saved report survives toast expiry, panel reopening and reload. Only
    // recovery transitions belong here; other command feedback stays transient.
    if (Object.values(RECOVERY_NOTICES).some((message) => message === state.feedback))
      html += `<p class="recipe-status"><b>Last recovery report</b><br />${escapeHtml(recoveryDisplay(state.feedback))}</p>`;
    for (const cache of state.recovery.caches) {
      const items = state.inventory.items.filter((i) => i.containerId === cache.containerId);
      if (!items.length) continue;
      html += `<p><b>Visited cargo cache</b> · ${bearing(state.player.pose.position, cache.position)}<br />${items.map((i) => `${i.quantity} ${ITEMS[i.kind].label}`).join(" / ")}. Approach within 4 m, then open Hold to transfer.</p>`;
    }
    for (const loss of state.recovery.losses.filter((l) => l.visited)) {
      const v = state.fleet.vehicles.find((v) => v.id === loss.vehicleId);
      if (!v) continue;
      html += `<p><b>${HULLS[v.hull].label} loss transponder</b> · ${bearing(state.player.pose.position, v.pose.position)} · hold ${usedCapacity(state, v.cargoId)} CU.<br />${v.hull === "dart" ? "Use the retained Bobbin kit for local tow, a bound field patch, or salvage after emptying the hold. Tow does not restore damage or charge." : "This fixture hull is outside the expedition’s implemented Dart recovery options."}</p>`;
    }
    if (equipped(state, "bobbin_kit") || state.recovery.losses.length) {
      html += `<p><b>Shallow rescue staging</b> · east of Splitspine · ${Math.max(0, -RECOVERY_STAGE.y)} m depth. Start the upper-Canopy tow here or at the disabled Dart’s collar. A deep collar may exceed your suit: stage the tow first. No remote passenger transport or story interactions.</p>`;
      const op = state.recovery.operation;
      if (op) html += `<p class="recipe-status">Bobbin: ${op.phase === "ready" ? "at the exterior collar — confirm tow in Hold to attach" : op.phase === "tow" ? "guiding the original hull back to shallow staging" : "following the local tether corridor toward the collar"}. Progress pauses while this panel is open.</p>`;
    }
    return this.group("return-recovery", "Return & recovery", html + "</article>", state.recovery.losses.length > 0 || state.recovery.operation !== null || state.recovery.caches.length > 0 || Object.values(RECOVERY_NOTICES).some((message) => message === state.feedback));
  }

  focusTarget(kind: PanelKind, state: GameState, targetId: string): void {
    let id: string | null = null;
    if (kind === "notebook" && state.knowledge.evidence.some(e => e.id === targetId)) id = `finding-${targetId}`;
    if (kind === "inventory") {
      const cache = state.recovery.caches.find(c => c.id === targetId);
      if (cache) id = `container-${cache.containerId}`;
      else if (state.fleet.vehicles.some(v => v.id === targetId)) id = `vessel-${targetId}`;
      else if (targetId === "rescue_staging") id = "panel-content";
    }
    if (kind === "craft") id = "panel-title";
    if (!id) return;
    const element = this.get(id);
    let group = element.closest<HTMLDetailsElement>("details");
    while (group?.tagName === "DETAILS") {
      group.open = true;
      if (group.dataset.panelGroup) this.expansions.set(group.dataset.panelGroup, true);
      group = group.parentElement?.closest<HTMLDetailsElement>("details") ?? null;
    }
    element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest" });
    element.classList.add("interaction-focus");
    window.clearTimeout(this.highlightTimer);
    this.highlightTimer = window.setTimeout(() => element.classList.remove("interaction-focus"), 1400);
  }

  notify(message: string, error: boolean): void {
    // Keep the last result after the transient HUD toast fades.
    this.get("panel-feedback").textContent = message;
    this.get("panel-feedback").hidden = false;
    this.get("panel-feedback").classList.toggle("error", error);
  }

  cancelFeedback(): void {
    window.clearTimeout(this.highlightTimer);
    for (const element of this.root.querySelectorAll<HTMLElement>(".interaction-focus"))
      element.classList.remove("interaction-focus");
  }
}
