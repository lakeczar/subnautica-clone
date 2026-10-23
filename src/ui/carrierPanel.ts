/** UX-1: the Hearthline console. The bridge lock console, the vestibule berth
 * panel and V open it. Player-facing: where the carrier is and what it is doing,
 * the helm and vestibule, the lock corridor, each berth with launch, craft
 * nearby to recover, and the berth refit at a repair dock. Every button is an
 * existing carrier command; a refused action shows why, with the exact text the
 * command would give. Developer tools appear only with `?dev`. */
import { HULLS } from "../content/registry.js";
import { captureApproach, carrierCommand, carrierHull, carrierInReach, launchPoint, localToWorld, CARRIER_LAYOUT } from "../sim/carrier.js";
import { aboardCarrier, atCarrierHelm, carrierSpeed, HOLD_SPEED, launchCorridorNow } from "../sim/carrierStations.js";
import { distance, usedCapacity } from "../sim/inventory.js";
import type { GameCommand, GameState, VehicleState, WorldQueries } from "../sim/types.js";
import { escapeHtml, heading } from "./format.js";
import type { CommandButton } from "./panels.js";

type CarrierAction = Extract<GameCommand, { type: "carrier" }>["action"];
/** Free craft this close to the lock mouth are offered for recovery, metres. */
const RECOVERY_RANGE = 60;

/** The refusal `action` would give right now, without changing anything. */
function dryRun(state: GameState, world: WorldQueries, action: CarrierAction, vehicleId?: string): string | null {
  return carrierCommand(structuredClone(state), action, vehicleId, world);
}
const degrees = (yaw: number): string => `${Math.round(((yaw * 180) / Math.PI + 360) % 360).toString().padStart(3, "0")}°`;
const percent = (n: number): string => `${Math.round(n)}%`;

export function berthName(state: GameState, slot: 0 | 1): string {
  return state.fleet.docking?.configuration === "medium" ? "Service berth" : slot === 0 ? "Port berth" : "Starboard berth";
}

/** One status line: under way or holding station, where, and the lock. */
export function carrierStatus(state: GameState): string {
  const h = carrierHull(state), d = state.fleet.docking;
  if (!h || !d) return "";
  const speed = carrierSpeed(h), forward = Math.sin(h.pose.yaw) * h.velocity.x - Math.cos(h.pose.yaw) * h.velocity.z;
  const motion = d.stationKeeping ? "Holding station" : speed < 0.05 ? "Stopped, at the helm"
    : `Under way · ${speed.toFixed(1)} m/s ${forward >= 0 ? "ahead" : "astern"}`;
  const where = d.supportedDock ? " · moored at a repair dock" : "";
  const lock = d.transaction ? (() => {
    const v = state.fleet.vehicles.find((a) => a.id === d.transaction!.vehicleId);
    const craft = v ? HULLS[v.hull].label : "craft";
    return d.transaction.type === "launch" ? `Lock cycling · launching the ${craft}` : `Lock cycling · recovering the ${craft}`;
  })() : "Lock closed";
  return `${motion}${where} · heading ${degrees(h.pose.yaw)} · ${Math.max(0, -h.pose.position.y).toFixed(0)} m · ${lock}`;
}

export function carrierPanel(state: GameState, world: WorldQueries, button: CommandButton, developer: boolean): string {
  const h = carrierHull(state), d = state.fleet.docking;
  if (!h || !d) return '<p class="carrier-empty">No carrier in your fleet yet.</p>';
  const helm = atCarrierHelm(state), aboard = aboardCarrier(state);
  // The console answers aboard, at the helm, or at the vestibule; anywhere else, say where the carrier is.
  if (!carrierInReach(state, h))
    return `<p class="carrier-status">${escapeHtml(carrierStatus(state))}</p><p>The Hearthline's consoles answer aboard, at its helm or at its starboard vestibule hatch. It is ${escapeHtml(heading(state.player.pose.position, h.pose.position))} away.</p>`;
  const act = (label: string, action: CarrierAction, vehicleId?: string, name?: string): string => {
    const no = dryRun(state, world, action, vehicleId);
    return button(label, { type: "carrier", action, ...(vehicleId ? { vehicleId } : {}) }, no !== null, no ?? undefined, name);
  };
  let html = `<p class="carrier-status">${escapeHtml(carrierStatus(state))}</p>`;
  // Where you are: the helm, the rooms, or outside at the hatch.
  const here: string[] = [];
  if (helm) {
    if (!d.stationKeeping) here.push(carrierSpeed(h) > HOLD_SPEED
      ? button("Hold station", { type: "carrier", action: "station-keep" }, true, `Ease off below ${HOLD_SPEED} m/s first: release W, or S astern.`)
      : act("Hold station", "station-keep"));
    here.push(act("Leave the helm", "leave-helm"));
  } else if (aboard) {
    here.push(act("Take the helm", "helm"));
    here.push(act("Leave through the vestibule", "leave-interior"));
  } else here.push(act("Board through the vestibule", "enter-interior"));
  if (d.transaction) here.push(act("Stop the lock cycle", "interrupt"));
  html += `<div class="service-actions carrier-here">${here.join("")}</div>`;
  // The lock corridor, as the helm and the drawn corridor show it.
  // The console is a paused decision beside exact dry-run buttons: an exact status, not the cached one.
  const corridor = launchCorridorNow(state, world);
  if (corridor) html += `<p class="carrier-corridor ${corridor.clear ? "clear" : "blocked"}">${escapeHtml(corridor.advice)}</p>`;
  // A launch refused only for station keeping still names an obstructed corridor: that is the next thing to fix.
  const launch = (v: VehicleState): string => {
    const no = dryRun(state, world, "launch", v.id), label = `Launch ${HULLS[v.hull].label}`;
    const reason = no && !d.stationKeeping && corridor && !corridor.clear && corridor.vehicleId === v.id ? `${corridor.advice} Then hold station.` : no;
    return button(label, { type: "carrier", action: "launch", vehicleId: v.id }, no !== null, reason ?? undefined);
  };
  // Berths and their craft.
  const slots: (0 | 1)[] = d.configuration === "medium" ? [0] : [0, 1];
  html += '<h3 class="carrier-heading">Berths</h3>';
  for (const slot of slots) {
    const v = state.fleet.vehicles.find((a) => a.berth?.carrierId === h.id && a.berth.slot === slot);
    html += `<article class="carrier-berth"><div class="vessel-line"><h4>${berthName(state, slot)} · ${v ? HULLS[v.hull].label : "empty"}</h4>`;
    if (v) html += `<div class="service-actions">${launch(v)}</div></div><p>${craftLine(state, v)}</p>`;
    else html += "</div>";
    html += "</article>";
  }
  // Craft in the water near the lock mouth, to draw in.
  const nearby = state.fleet.vehicles.filter((v) => v.id !== h.id && !v.berth && distance(v.pose.position, launchPoint(h, v)) <= RECOVERY_RANGE);
  if (nearby.length) {
    html += '<h3 class="carrier-heading">Near the lock mouth</h3>';
    for (const v of nearby) {
      const gap = distance(v.pose.position, launchPoint(h, v));
      // As with launch: a craft that is too far away needs bringing in before station keeping matters.
      const no = dryRun(state, world, "capture", v.id), far = gap > 13 || v.disabled;
      const recover = button(`Recover ${HULLS[v.hull].label}`, { type: "carrier", action: "capture", vehicleId: v.id }, no !== null,
        (no && far && !d.stationKeeping ? captureApproach(h, v) : no) ?? undefined);
      html += `<article class="carrier-berth"><div class="vessel-line"><h4>${HULLS[v.hull].label} · ${gap.toFixed(0)} m from the lock mouth</h4><div class="service-actions">${recover}</div></div><p>${craftLine(state, v)}</p></article>`;
    }
  } else html += '<p class="carrier-hint">To recover a craft, leave it settled within 13 m of the lock mouth under the bow, then use this console from aboard.</p>';
  // Refitting the berths: only where a repair dock makes it possible.
  if (d.supportedDock) html += `<div class="service-actions carrier-refit">${act(d.configuration === "compact" ? "Refit: one service berth" : "Refit: two compact berths", "reconfigure")}</div>`;
  if (developer) html += developerTools(state, h, button);
  return html;
}

function craftLine(state: GameState, v: VehicleState): string {
  const hold = state.inventory.containers.find((c) => c.id === v.cargoId);
  return `Power ${percent(v.charge)} · hull ${percent(v.health)}${hold ? ` · hold ${usedCapacity(state, v.cargoId)} / ${hold.capacity} CU` : ""}${v.disabled ? " · disabled" : ""}`;
}

function developerTools(state: GameState, h: VehicleState, button: CommandButton): string {
  const d = state.fleet.docking!;
  const rows = state.fleet.vehicles.filter((v) => v.id !== h.id).map((v) =>
    `<li>${escapeHtml(v.id)} · ${v.berth ? `berth ${v.berth.slot}` : "world"} · charge ${v.charge.toFixed(1)} · damage ${(100 - v.health).toFixed(1)}</li>`).join("");
  const fixture = state.scenario === "carrier-fixture";
  return `<details class="panel-group developer-tools"><summary>Developer · carrier test</summary><p class="fixture-label">${fixture ? "Seeded carrier fixture · not earned progression" : "Developer tools in a campaign carrier"} · ${d.configuration} · transactions ${d.completed.length} · vestibule z ≥ 7 · interface ${CARRIER_LAYOUT.exteriorVestibule.x},${CARRIER_LAYOUT.exteriorVestibule.y},${CARRIER_LAYOUT.exteriorVestibule.z} → ${escapeHtml(JSON.stringify(localToWorld(CARRIER_LAYOUT.exteriorVestibule, h), (_k, n) => typeof n === "number" ? Math.round(n * 10) / 10 : n))}</p><ul>${rows}</ul><div class="service-actions">${fixture ? button("Toggle test obstruction", { type: "carrier", action: "block-exit" }) + button("Incapacity drill (refuge fallback)", { type: "carrier", action: "failure-drill" }) : ""}</div></details>`;
}
