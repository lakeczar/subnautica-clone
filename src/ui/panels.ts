import {
  BLUEPRINTS, EVIDENCE, HULLS, ITEMS, MODULES, OPTIONAL_RECORD, PLACES,
  RECOVERY_STAGE, RECIPES, REGIONS, SOURCES,
} from "../content/registry.js";
import type { ItemKind, RecipeId } from "../content/registry.js";
import {
  available, containerAccessible, distance, equipped, fabricationContainers,
  facility, hasRoom, localBenchSite, materialStoragePreview, nearPod,
  nearWorkshop, usedCapacity,
} from "../sim/inventory.js";
import { craftingRefusal, personalLimit } from "../sim/progression.js";
import { aimedInteraction } from "../sim/targeting.js";
import { RECOVERY_NOTICES, recoveryOccupancyRefusal } from "../sim/recovery.js";
import { cellRechargePreview, distractionPreview, PULSE_CHARGE_COST } from "../sim/vehicles.js";
import { dartPerformance, installModuleRefusal, removeModuleRefusal } from "../sim/modules.js";
import type { GameCommand, GameState, WorldQueries } from "../sim/types.js";
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
  private storageTo: string | null = null;
  private highlightTimer = 0;

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
    else this.storageTo = value;
  }

  refresh(kind: PanelKind, state: GameState): void {
    const content = this.get("panel-content");
    const restoreFocus = content.contains(document.activeElement);
    const restoreKey = restoreFocus ? (document.activeElement as HTMLElement | null)?.dataset.commandKey : undefined;
    this.commands.clear();
    this.get("carrier-nav").hidden = state.scenario !== "carrier-fixture";
    const button: CommandButton = (label, command, disabled = false) => {
      const id = `command-${this.commands.size}`;
      this.commands.set(id, command);
      // Every operand identifies the action, independently of its label or render order.
      const key = JSON.stringify(command, Object.keys(command).sort());
      return `<button data-action="${id}" data-command-key="${escapeHtml(key)}"${disabled ? " disabled" : ""}>${escapeHtml(label)}</button>`;
    };
    this.get("panel-title").textContent = {
      inventory: "Hold & preparation",
      craft: "Fabrication & services",
      notebook: "Field notebook",
      carrier: "Carrier feasibility fixture",
    }[kind];
    for (const nav of this.get("game-panel").querySelectorAll<HTMLButtonElement>("nav button"))
      nav.setAttribute("aria-current", nav.dataset.action === `${kind}-panel` ? "page" : "false");
    let html = "";
    if (kind === "inventory") {
      const buoy = state.inventory.buoy,
        buoyItem = state.inventory.items.find((i) => i.id === buoy.itemId),
        diver = state.inventory.containers.find((c) => c.id === "diver");
      html = `<p class="panel-intro">Personal suit ${personalLimit(state)} m · diver hold ${usedCapacity(state, "diver")} / ${diver?.capacity ?? 0} CU. A hull protects you only while aboard; check the side exit before leaving it.</p><div class="service-actions">${button("Eat a meal", { type: "eat" })}${button(buoy.deployed ? "Pack empty buoy" : "Deploy carried buoy", { type: "buoy" }, !buoyItem)}${button("Request emergency refuge meal", { type: "emergency-meal" })}</div>`;
      html += `<div class="preparation-grid">${this.powerPreparation(state, button)}${this.materialStorageControls(state, button)}</div>`;
      html += this.moduleFitting(state, button);
      html += `<p class="equipment-note"><b>Reusable buoy</b> · ${!buoyItem ? "Not built. Discover the intake record, then fabricate at the pod." : buoy.deployed ? `Deployed · ${usedCapacity(state, "buoy_hold")} / ${state.inventory.containers.find((c) => c.id === "buoy_hold")?.capacity ?? 0} CU · ${bearing(state.player.pose.position, buoy.position)}. Empty it, approach the collar and keep 2 CU free to pack it.` : `Packed in ${containerLabel(state, buoyItem.containerId).toLowerCase()} · 2 CU. Carry it in your diver hold before deploying.`}</p>`;
      const bins = state.inventory.containers.filter((c) => containerAccessible(state, c.id));
      const distant = state.inventory.containers.filter((c) => !containerAccessible(state, c.id) && c.kind !== "cache" && (c.kind !== "buoy" || buoy.deployed));
      if (distant.length)
        html += `<p class="equipment-note"><b>Out of reach</b> · ${distant.map((c) => `${escapeHtml(containerLabel(state, c.id))} (${usedCapacity(state, c.id)} / ${c.capacity} CU)`).join(" · ")}. Approach a locker, deployed buoy or craft to transfer. A workshop locker opens after its services are restored.</p>`;
      html += '<div class="container-grid">';
      for (const c of bins) {
        html += `<article class="container" id="container-${escapeHtml(c.id)}" tabindex="-1"><h3>${escapeHtml(containerLabel(state, c.id))} <small>${usedCapacity(state, c.id)} / ${c.capacity} CU</small></h3>`;
        for (const i of state.inventory.items.filter(
          (i) => i.containerId === c.id,
        )) {
          const installed = state.fleet.vehicles.find((v) => v.modules.includes(i.id));
          html += `<div class="item-row"><strong>${ITEMS[i.kind].label} × ${i.quantity}</strong><small>${installed ? `Installed in ${HULLS[installed.hull].label} · ${ITEMS[i.kind].cu * i.quantity} CU · remove at collar before transfer` : i.fitted ? "Fitted / retained" : `${ITEMS[i.kind].cu * i.quantity} CU`}${i.charge !== null ? ` · charge ${i.charge.toFixed(0)}%` : ""}${i.provenance === "maintenance" ? " · rescue stock" : ""}</small><div>`;
          if (!i.fitted && !installed)
            for (const d of bins.filter(
              (d) => d.id !== c.id && d.kind !== "equipment",
            )) {
              html += button(
                `${d.id === "diver" ? "Take to diver" : "To " + containerLabel(state, d.id)} · ${i.quantity}${usedCapacity(state, d.id) + ITEMS[i.kind].cu * i.quantity > d.capacity ? " (needs space)" : ""}`,
                {
                  type: "transfer",
                  itemId: i.id,
                  to: d.id,
                  quantity: i.quantity,
                },
              );
              if (i.quantity > 1)
                html += button(`${d.id === "diver" ? "Take to diver" : "To " + containerLabel(state, d.id)} · 1`, {
                  type: "transfer", itemId: i.id, to: d.id, quantity: 1,
                });
            }
          html += "</div></div>";
        }
        html += "</article>";
      }
      html += "</div>";
      for (const v of state.fleet.vehicles.filter((v) => !v.berth && v.hull !== "hearthline")) {
        const local = distance(state.player.pose.position, v.pose.position) < 7;
        const occupied = recoveryOccupancyRefusal(state, v.id);
        const cells = state.inventory.items.filter((i) => i.kind === "reserve_cell" && (i.containerId === "diver" || i.containerId === v.cargoId));
        html += `<article class="vessel-service" id="vessel-${escapeHtml(v.id)}" tabindex="-1"><h3>${HULLS[v.hull].label} · ${v.disabled ? "disabled transponder" : "available"}</h3><p>${bearing(state.player.pose.position, v.pose.position)} · ${local ? "service socket in reach" : "approach the service socket"}. Power ${v.charge.toFixed(0)}% · hull ${v.health.toFixed(0)}% · hull ${HULLS[v.hull].initialDepth} m / suit ${personalLimit(state)} m.</p>`;
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
        html += `<div class="service-actions">${button("Supported charge / repair", { type: "service", vehicleId: v.id })}${button("Use reserve cell for hull power", { type: "reserve", vehicleId: v.id })}</div><small>Approach within 7 m of the craft at pod waters or the restored workshop cradle.${v.disabled ? " Patch the hull before routine charging." : ""}</small><details class="service-details"><summary>Reserve power & hull service</summary><p>Cells in diver / this craft: ${cells.length ? cells.map((i) => `${escapeHtml(i.id)} · ${(i.charge ?? 0).toFixed(0)}%`).join(", ") : "none"}. A full cell supplies up to 35% hull power; a pulse spends 25 of that cell’s charge points. Reserve power requires the craft’s local socket.</p><p>Supported service restores hull battery, health and emergency air, plus cells in your hold or this craft. For cells in the local locker or buoy, use Recharge local cells at the bench.</p></details></article>`;
      }
      html += this.returnInformation(state);
    } else if (kind === "craft") {
      html = `<p class="panel-intro">${nearPod(state) ? "At the home pod bench" : nearWorkshop(state) ? "At the Splitspine workshop" : "Away from a fabrication bench"}. Each recipe counts only its local sources, including a craft hold at this site’s supported cradle. The unrestored workshop locker stays locked; restore it with carried materials or a nearby deployed buoy.</p>`;
      html += this.powerPreparation(state, button);
      html += this.moduleFitting(state, button);
      for (const [key, r] of Object.entries(RECIPES)) {
        const id = key as RecipeId;
        if (!state.knowledge.blueprints.includes(r.bp)) continue;
        const done = r.once && state.knowledge.crafted.includes(id);
        const refusal = done ? null : craftingRefusal(state, id, this.world);
        const bins = fabricationContainers(state, r.site).filter((c) => containerAccessible(state, c));
        const missingSteps = r.needs.filter((n) => !state.knowledge.crafted.includes(n as RecipeId));
        const trim = state.inventory.items.find((i) => i.kind === "dart_acoustic_trim");
        const trimInstalled = trim && state.fleet.vehicles.some((v) => v.modules.includes(trim.id));
        html += `<article class="recipe" data-recipe="${id}"><div><h3>${r.label}${done ? id === "dart_acoustic_trim" ? trimInstalled ? " · installed" : " · fabricated" : " · completed" : ""}</h3>${done ? '<small>Current recipe reference</small>' : ""}<p>${Object.entries(r.cost).map(([k, q]) => {
          const kind = k as ItemKind;
          if (done) return `<span class="ingredient">${ITEMS[kind].label}: ${q}</span>`;
          const have = r.maintenance
            ? kind === "structural_alloy" ? state.world.maintenance.alloy : kind === "silica_glass" ? state.world.maintenance.glass : state.world.maintenance.membrane
            : available(state, kind, bins);
          return `<span class="ingredient${have < q ? " missing" : ""}">${ITEMS[kind].label}: ${have} / ${q}${have < q ? ` · need ${q - have}` : " · ready"}</span>`;
        }).join("")}</p><small>${r.site === "island_workshop" ? PLACES.island_workshop.label : "Home pod bench"}${r.maintenance ? " · rescue stock only" : " · gathered materials"}</small>${!done && !r.maintenance ? `<p class="recipe-sources">Local sources: ${bins.length ? bins.map((c) => escapeHtml(containerLabel(state, c))).join(" · ") : "none at this recipe’s bench"}${bins.some((c) => state.fleet.vehicles.some((v) => v.cargoId === c)) ? " (includes supported-cradle cargo)" : ""}.</p>` : ""}${missingSteps.length ? `<p class="recipe-status">First complete: ${missingSteps.map((n) => RECIPES[n as RecipeId].label).join(" → ")}</p>` : ""}${refusal ? `<p class="recipe-status">${escapeHtml(refusal)}</p>` : !done ? '<p class="recipe-ready">Ready at this bench</p>' : ""}</div>${done ? "" : button(`Fabricate · ${r.label}`, { type: "craft", recipeId: id })}</article>`;
      }
      html += this.knownHabitats(state);
      if (!state.knowledge.blueprints.length)
        html += "<p>Inspect the pod regulator to recover its checklist.</p>";
      html += `<p>Rescue stock: ${state.world.maintenance.alloy} alloy / ${state.world.maintenance.glass} glass / ${state.world.maintenance.membrane} membrane. Reserved for Bobbin and field patches; unavailable for other recipes.</p>`;
      const n = aimedInteraction(state, this.world);
      if (n && n.id in SOURCES) {
        const id = n.id as keyof typeof SOURCES;
        html +=
          button("Sort finite source reserve · 20 active seconds", {
            type: "sort",
            sourceId: id,
          }) +
          button("Sort recovery-only patch · if allocation empty", {
            type: "sort",
            sourceId: id,
            maintenance: true,
          });
      }
      if (facility(state, "island_workshop"))
        html +=
          "<article><h3>The unfinished large berth</h3><p>The carrier cradle needs complementary surveys and frame recovery from Pale Basin. It is a future construction opportunity; no campaign carrier is available here yet.</p></article>";
    } else if (kind === "notebook") {
      html = `<p class="panel-intro">Observations retain their source. Hypotheses are interpretations, not established facts. Hints sharpen regional leads voluntarily.</p>${button("Request a regional hint", { type: "hint" })}`;
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
      html += `<article><h3>Before committing to a dive</h3><p>Current personal suit: ${personalLimit(state)} m. A Dart hull is rated to ${HULLS.dart.initialDepth} m, but it cannot protect you outside. Prepare a 150 m suit for the upper laboratory. Your full tank lasts 180 seconds submerged. Carry a meal and charged reserve cell; plan to return with at least a quarter of your air and power.</p><p>Z reduces movement noise. Quiet movement, the tall rib’s cover and retreat cost no cell charge. G releases a 12-second directional distraction for ${PULSE_CHARGE_COST} points from one carried cell, then a controlled-craft cell; it cannot use remote locker cells or repeat while active. Move quietly away from the pulse. The same charge can instead supply reserve hull power at the craft’s socket.</p><p>Recharge local cells at a restored pod or workshop bench, before or after owning a craft. Hull battery, health and emergency air need separate supported craft service. Warning calls also appear with direction in the HUD, with sound muted or opening captions off.</p>${found("C04") ? "<p>The Canopy return can improve your next trip: two crust + two resin fabricate optional Dart acoustic trim at the workshop. Fit it at the cradle for faster quiet travel in exchange for boost speed, one socket and 2 CU. Pale Basin remains a future expedition in this build.</p>" : ""}</article>`;
      html += this.returnInformation(state);
      html += `<p>Recovered research: ${state.knowledge.blueprints.length} / ${BLUEPRINTS.length} in this expedition. Later fleets and deeper regions remain under construction.</p>`;
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
      (next ?? this.get("panel-return")).focus({ preventScroll: true });
    }
  }

  private powerPreparation(state: GameState, button: CommandButton): string {
    const pulse = distractionPreview(state);
    const cell = pulse.refusal === null ? state.inventory.items.find((i) => i.id === pulse.cellId) : undefined;
    const recharge = cellRechargePreview(state);
    const site = localBenchSite(state);
    const charging = recharge.cellIds.map((id) => state.inventory.items.find((i) => i.id === id)!);
    return `<article class="power-preparation"><h3>Pulse or reserve power</h3><p><kbd>G</kbd> Directional pulse · ${PULSE_CHARGE_COST} charge points from one cell · 12 seconds.</p>${cell && pulse.refusal === null
      ? `<p class="recipe-ready">Next payment: ${escapeHtml(cell.id)} in ${escapeHtml(containerLabel(state, cell.containerId))} · ${cell.charge!.toFixed(0)} → ${pulse.remainingCharge.toFixed(0)}%.</p>`
      : `<p class="recipe-status">${escapeHtml(pulse.refusal ?? "")}${state.world.threat.distractionSeconds > 0 ? ` ${Math.ceil(state.world.threat.distractionSeconds)} seconds remain.` : ""}</p>`}
      ${button(`Release pulse · ${PULSE_CHARGE_COST} cell points`, { type: "distraction" }, pulse.refusal !== null)}<small class="no-charge-options">No charge needed: Z quiet · cover behind the tall rib · retreat. A full cell can instead supply up to 35% hull power at the craft’s local socket.</small>
      <div class="bench-charge"><h4>Bench cell recharge</h4><p>${site ? `${site === "home_pod" ? "Pod" : "Workshop"} bench · ${fabricationContainers(state, site).map((id) => escapeHtml(containerLabel(state, id))).join(" · ")}.` : "Use a restored pod or workshop bench; no vessel is required."}</p>${charging.length ? `<p>${charging.map((i) => `${escapeHtml(i.id)} · ${escapeHtml(containerLabel(state, i.containerId))} · ${(i.charge ?? 0).toFixed(0)} → 100%`).join("<br />")}</p>` : ""}${recharge.refusal ? `<p class="recipe-status">${escapeHtml(recharge.refusal)}</p>` : ""}${button("Recharge local cells", { type: "recharge-cells" }, recharge.refusal !== null)}<small>Cells only. Hull battery, health and emergency air require supported service beside the craft.</small></div></article>`;
  }

  private materialStorageControls(state: GameState, button: CommandButton): string {
    const bins = state.inventory.containers.filter((c) => c.kind !== "equipment" && containerAccessible(state, c.id));
    if (bins.length < 2) return '<article class="bulk-storage"><h3>Store materials</h3><p>Approach a local locker, deployed buoy or craft hold to choose a destination. Meals, cells, tools and modules stay put.</p></article>';
    this.storageFrom = bins.find((c) => c.id === this.storageFrom)?.id
      ?? bins.find((c) => materialStoragePreview(state, c.id, bins.find((d) => d.id !== c.id)!.id).items.length)?.id
      ?? bins[0]!.id;
    const destinations = bins.filter((c) => c.id !== this.storageFrom);
    this.storageTo = destinations.find((c) => c.id === this.storageTo)?.id
      ?? destinations.find((c) => c.kind === "locker")?.id ?? destinations[0]!.id;
    const preview = materialStoragePreview(state, this.storageFrom, this.storageTo);
    const options = (choices: typeof bins, selected: string): string => choices.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === selected ? " selected" : ""}>${escapeHtml(containerLabel(state, c.id))} · ${usedCapacity(state, c.id)} / ${c.capacity} CU</option>`).join("");
    return `<article class="bulk-storage"><h3>Store materials</h3><div class="storage-operands"><label>From<select id="storage-from">${options(bins, this.storageFrom)}</select></label><span aria-hidden="true">→</span><label>To<select id="storage-to">${options(destinations, this.storageTo)}</select></label></div><p class="storage-quantities">${preview.items.length ? Object.entries(preview.quantities).map(([k, q]) => `${q} × ${ITEMS[k as ItemKind].label}`).join("<br />") : "No material stacks selected"}<br /><b>${preview.totalCu} CU · whole stacks</b></p><small>Meals, cells, tools and modules stay with their container. Individual transfers are below.</small>${preview.refusal ? `<p class="recipe-status">${escapeHtml(preview.refusal)}</p>` : '<p class="recipe-ready">The complete set fits.</p>'}${button(`Store materials · ${containerLabel(state, this.storageFrom)} → ${containerLabel(state, this.storageTo)}`, { type: "store-materials", from: this.storageFrom, to: this.storageTo })}</article>`;
  }

  private moduleFitting(state: GameState, button: CommandButton): string {
    if (!state.knowledge.blueprints.includes(RECIPES.dart_acoustic_trim.bp)) return "";
    const item = state.inventory.items.find((i) => i.kind === "dart_acoustic_trim");
    const spec = MODULES.dart_acoustic_trim;
    const cost = Object.entries(RECIPES.dart_acoustic_trim.cost).map(([k, q]) => `${q} ${ITEMS[k as ItemKind].label}`).join(" + ");
    let html = `<article class="module-fitting"><h3>Dart acoustic trim · ${item ? state.fleet.vehicles.some((v) => v.modules.includes(item.id)) ? "installed" : "fabricated / stored" : "not fabricated"}</h3><p>Quiet 3 → ${spec.quietSpeed} m/s · normal 8 → 8 · boost 11 → ${spec.boostSpeed} m/s.</p><small>Faster quiet travel. Noise, power use per second and pressure rating stay the same. Uses one socket and ${ITEMS.dart_acoustic_trim.cu} CU of the Dart hold.</small>${item ? `<p>Retained item ${escapeHtml(item.id)} · ${escapeHtml(containerLabel(state, item.containerId))}.</p>` : `<p>Fabricate at the workshop: ${escapeHtml(cost)}. Then fit it at a supported cradle.</p>`}`;
    for (const v of state.fleet.vehicles.filter((v) => v.hull === "dart")) {
      const perf = dartPerformance(state, v.id)!;
      const installed = item && v.modules.includes(item.id);
      html += `<section class="fitting-choice"><h4>${HULLS[v.hull].label} · ${perf.socketsUsed} / ${perf.sockets} sockets · ${usedCapacity(state, v.cargoId)} / ${state.inventory.containers.find((c) => c.id === v.cargoId)?.capacity ?? 0} CU hold</h4><p>Now: quiet ${perf.quietSpeed} · normal ${perf.normalSpeed} · boost ${perf.boostSpeed} m/s${perf.cargoCu ? ` · trim occupies ${perf.cargoCu} CU` : ""}.</p>`;
      if (item) {
        const refusal = installed ? removeModuleRefusal(state, v.id, item.id, this.world) : installModuleRefusal(state, v.id, item.id);
        html += `${installed ? `<small>Remove intact into this hold before transferring. ${v.disabled ? "Eligible local collar removal is available before frame salvage; bring the service tool and Bobbin kit." : "Use the pod or restored workshop cradle."}</small>` : ""}${refusal ? `<p class="recipe-status">${escapeHtml(refusal)}</p>` : '<p class="recipe-ready">Local fitting available.</p>'}${button(installed ? "Remove trim into Dart hold" : "Install acoustic trim", { type: installed ? "remove-module" : "install-module", vehicleId: v.id, itemId: item.id })}`;
      }
      html += "</section>";
    }
    return html + "</article>";
  }

  private knownHabitats(state: GameState): string {
    const known = Object.entries(SOURCES).filter(([id]) => state.knowledge.scans.includes(id));
    return `<article class="habitat-notes"><h3>Known source habitats</h3>${known.length ? known.map(([id, s]) => {
      const stock = state.world.resources.find((r) => r.id === id);
      return `<p><b>${ITEMS[s.item].label} · ${s.label}</b><br />${REGIONS[s.region].label} · ${s.context}<br /><small>${stock?.stock ?? 0} exposed · ${stock?.reserve ?? 0} finite reserve · ${s.bundle} per hand bundle. ${s.item === "meal" ? "When empty, tend here for 20 active seconds for two more portions." : "Sort the host’s finite reserve locally if exposed stock is empty."}</small></p>`;
    }).join("") : "<p>Collect or scan a source to retain its habitat here. Inspecting a record does not reveal every deposit.</p>"}</article>`;
  }

  private returnInformation(state: GameState): string {
    let html = '<article class="return-plan"><h3>Return & recovery</h3><p>Knowledge, blueprints and retained equipment survive incapacity. Ordinary cargo may remain in a visited cache; disabled craft keep their own holds. Recovering takes a local expedition.</p>';
    // The saved report survives toast expiry, panel reopening and reload. Only
    // recovery transitions belong here; other command feedback stays transient.
    if (Object.values(RECOVERY_NOTICES).some((message) => message === state.feedback))
      html += `<p class="recipe-status"><b>Last recovery report</b><br />${escapeHtml(recoveryDisplay(state.feedback))}</p>`;
    for (const id of ["home_pod", "island_workshop", "canopy_lab"] as const) {
      if (id !== "home_pod" && !state.knowledge.markers.includes(id) && !facility(state, id)) continue;
      html += `<p><b>${PLACES[id].label}</b> · ${bearing(state.player.pose.position, PLACES[id].position)}<br />${id === "home_pod" ? `Air, healing, locker and emergency meal. ${facility(state, "pod_fabricator") ? "Equipment fabrication restored." : "Repair its bench for equipment fabrication."} Routine craft service is in the nearby pod waters.` : id === "island_workshop" ? facility(state, id) ? "Restored: air, healing, locker, charging and hull fabrication. Craft service is at the launch cradle." : "Known workshop: restore its services for air, healing, locker, charging and hull fabrication." : "Laboratory air pocket and gradual healing. It has no cargo locker or craft charging service."}</p>`;
    }
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
    return html + "</article>";
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
