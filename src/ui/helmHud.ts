/** UX-1: the Hearthline helm's instruments and prompts.
 *
 * At the helm a small readout replaces the generic pilot lines: heading, way
 * on, depth and water under the keel, station keeping, and the lock corridor's
 * state with what to do about it. The prompts name the helm's own keys. */
import type { GameState, WorldQueries } from "../sim/types.js";
import { HULL_COLLIDERS } from "../content/registry.js";
import { atCarrierHelm, carrierSpeed, HOLD_SPEED, launchCorridorView, type CarrierStationId } from "../sim/carrierStations.js";
import { escapeHtml } from "./format.js";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** The helm's control line (shown while at the helm). */
export const HELM_CONTROLS = "A/D turn · W/S ahead / astern · Space/C rise / dive · mouse looks around · V berths and lock";

/** The interaction verb of each carrier station (the HUD prompt). */
export const CARRIER_STATION_VERBS: Readonly<Record<CarrierStationId, string>> = {
  "carrier:helm": "Take the helm",
  "carrier:lock": "Berths and lock",
  "carrier:berths": "Berths and lock",
  "carrier:stores": "Open stores",
  "carrier:hatch": "Leave through the vestibule",
  "carrier:board": "Board",
};

/** Pilot guidance at the helm: what X does now. Null away from the helm. */
export function helmGuidance(state: GameState): string | null {
  const h = atCarrierHelm(state), d = state.fleet.docking;
  if (!h || !d) return null;
  const speed = carrierSpeed(h);
  if (d.transaction) return "<kbd>X</kbd> Leave the helm<small>Lock cycling · the helm answers when it closes</small>";
  if (d.stationKeeping) return "<kbd>X</kbd> Leave the helm<small>Holding station · W/S or A/D takes her back</small>";
  if (speed > HOLD_SPEED) return `<kbd>X</kbd> Ease off to leave the helm<small>${speed.toFixed(1)} m/s · release W, or S astern</small>`;
  return "<kbd>X</kbd> Hold station and leave the helm";
}

export interface HelmReading {
  readonly heading: string;
  readonly way: string;
  readonly depth: string;
  readonly keel: string;
  readonly corridor: { readonly clear: boolean; readonly text: string } | null;
}

/** The helm's numbers, for the readout and tests. Null away from the helm. */
export function helmReading(state: GameState, world: WorldQueries): HelmReading | null {
  const h = atCarrierHelm(state), d = state.fleet.docking;
  if (!h || !d) return null;
  const deg = ((h.pose.yaw * 180) / Math.PI + 360) % 360, speed = carrierSpeed(h);
  const ahead = Math.sin(h.pose.yaw) * h.velocity.x - Math.cos(h.pose.yaw) * h.velocity.z;
  const p = h.pose.position, keel = p.y + (HULL_COLLIDERS.hearthline.bottom ?? 0);
  const under = keel - world.groundHeight(p.x, p.z);
  const status = launchCorridorView(state, world);
  return {
    heading: `${Math.round(deg).toString().padStart(3, "0")}° ${COMPASS[Math.round(deg / 45) % 8]}`,
    way: d.stationKeeping ? "Holding station" : speed < 0.05 ? "Stopped" : `${speed.toFixed(1)} m/s ${ahead >= 0 ? "ahead" : "astern"}`,
    depth: `${Math.max(0, -p.y).toFixed(0)} m`,
    keel: Number.isFinite(under) ? `${Math.max(0, under).toFixed(0)} m under the keel` : "",
    corridor: status ? { clear: status.clear, text: status.advice } : null,
  };
}

export class HelmReadout {
  private html = "";
  constructor(private readonly element: HTMLElement, private readonly world: WorldQueries) {}
  update(state: GameState): void {
    const r = state.opening.phase >= 4 ? helmReading(state, this.world) : null;
    const html = !r ? "" : `<span class="helm-title">Hearthline · helm</span><span class="helm-figures"><b>${r.heading}</b><span>${escapeHtml(r.way)}</span><span>${r.depth}</span>${r.keel ? `<span>${escapeHtml(r.keel)}</span>` : ""}</span>${r.corridor ? `<span class="helm-corridor ${r.corridor.clear ? "clear" : "blocked"}">${escapeHtml(r.corridor.text)}</span>` : ""}`;
    if (html !== this.html) { this.element.innerHTML = html; this.html = html; }
    this.element.hidden = !r;
  }
}
