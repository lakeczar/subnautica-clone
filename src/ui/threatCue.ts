/** ENC-1: directional threat cues. Every animal that is warning, closing or
 * attacking gets a pulse on the screen edge toward it, beside the caption
 * banner that names the same stage and the way out. The model is pure and
 * derived from saved state; ThreatEdgeView only draws it. */
import { THREATS } from "../content/ecology/species.js";
import { speciesOf } from "../sim/ecology/agents.js";
import { eyeHeight } from "../sim/state.js";
import { exposure } from "../sim/survival.js";
import type { GameState, Vec3 } from "../sim/types.js";

export type ThreatStage = "warning" | "closing" | "attack";
export interface ThreatCue {
  /** "sound-hunter" or the ecology roster ID. */
  readonly id: string;
  readonly label: string;
  readonly stage: ThreatStage;
  /** Radians from the view heading, + right; elevation from the view pitch, + up. */
  readonly bearing: number;
  readonly elevation: number;
  readonly distance: number;
  /** Inside the cone the camera shows: the animal itself is the cue. */
  readonly onScreen: boolean;
}
/** Approximate half-angles of the visible view (16:9-ish at Babylon's 0.8 rad fov).
 * A piloted craft's dash hides the water below `sill`. */
export const VIEW_HALF = { horizontal: 0.62, vertical: 0.36, sill: 0.15 } as const;

type HunterMode = GameState["world"]["threat"]["mode"];
const HUNTER_STAGE: Partial<Record<HunterMode, ThreatStage>> = { warn: "warning", investigate: "closing", pursue: "attack" };
const AGENT_STAGE: Readonly<Record<string, ThreatStage>> = { alert: "warning", investigate: "closing", commit: "attack" };

/** The persistent caption for the sound hunter, in the HUD's banner style. */
export function hunterBanner(mode: HunterMode): string | null {
  return mode === "warn" ? "SOUND HUNTER · paired calls · it hears your engine · Z quiet · L lamp off · back away"
    : mode === "investigate" ? "SOUND HUNTER · passing ahead · Z quiet · L lamp off · back away"
    : mode === "pursue" ? "SOUND HUNTER · pursuit · each bite harder while loud · Z quiet + L dark · rib cover / retreat"
    : null;
}

/** Bearing and elevation of `point` from the actor's eye, relative to its view. */
export function viewBearing(state: GameState, point: Vec3): { bearing: number; elevation: number; distance: number } {
  const p = state.player.pose.position, yaw = state.player.pose.yaw;
  const dx = point.x - p.x, dy = point.y - p.y - eyeHeight(state), dz = point.z - p.z;
  const right = dx * Math.cos(yaw) + dz * Math.sin(yaw), forward = dx * Math.sin(yaw) - dz * Math.cos(yaw);
  const pitch = Math.atan2(dy, Math.hypot(right, forward)) - state.player.pose.pitch;
  return { bearing: Math.atan2(right, forward), elevation: Math.atan2(Math.sin(pitch), Math.cos(pitch)),
    distance: Math.hypot(dx, dy, dz) };
}

/** Every engaged threat, nearest first. Empty in a refuge, before the opening ends or outside the expedition. */
export function threatCues(state: GameState): ThreatCue[] {
  if (state.opening.phase < 4 || state.scenario !== "expedition" || exposure(state).refuge) return [];
  const out: ThreatCue[] = [], below = state.player.mode === "piloting" ? VIEW_HALF.sill : VIEW_HALF.vertical;
  const add = (id: string, label: string, stage: ThreatStage, at: Vec3): void => {
    const b = viewBearing(state, at);
    out.push({ id, label, stage, ...b,
      onScreen: Math.abs(b.bearing) < VIEW_HALF.horizontal && b.elevation < VIEW_HALF.vertical && b.elevation > -below });
  };
  const t = state.world.threat, hunter = HUNTER_STAGE[t.mode];
  if (hunter) add("sound-hunter", "Sound hunter", hunter, { ...t.position, y: t.position.y + 0.7 });
  for (const a of state.world.ecology.agents) {
    const stage = AGENT_STAGE[a.mode];
    if (stage) add(a.id, THREATS[speciesOf(a.id)].label, stage, a.position);
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/** Where an edge mark sits for a cue: the border point on the ray from the
 * screen centre toward the animal, in percent of the viewport. Behind the
 * actor, the mark keeps to the side the animal is on. */
export function edgePoint(cue: Pick<ThreatCue, "bearing" | "elevation">): { x: number; y: number } {
  const behind = Math.abs(cue.bearing) > Math.PI / 2;
  const sx = behind ? Math.sign(cue.bearing) || 1 : Math.sin(cue.bearing) / VIEW_HALF.horizontal;
  const sy = -Math.sin(cue.elevation) / VIEW_HALF.vertical;
  const n = Math.max(Math.abs(sx) / 0.44, Math.abs(sy) / 0.4, 1e-9);
  return { x: 50 + (sx / n) * 100, y: 50 + (sy / n) * 100 };
}

const PULSE_HZ: Readonly<Record<ThreatStage, number>> = { warning: 0.75, closing: 1.5, attack: 3 };
const SIZE: Readonly<Record<ThreatStage, number>> = { warning: 150, closing: 210, attack: 280 };
/** Seconds a bite's flash holds at full strength toward its origin. */
export const BITE_FLASH_SECONDS = 0.7;

/** One element of marks; at most three threats, nearest first. Sim time drives
 * the pulse, so pause freezes it and replays are deterministic. */
export class ThreatEdgeView {
  private flashOrigin: Vec3 | null = null;
  private flashUntil = -Infinity;
  private shown = "";
  constructor(private readonly element: HTMLElement) {}

  /** A bite: flash toward where it came from, even if the animal is in view. */
  flash(origin: Vec3 | undefined, state: GameState): void {
    if (!origin || ![origin.x, origin.y, origin.z].every(Number.isFinite)) return;
    this.flashOrigin = { ...origin };
    this.flashUntil = state.tick / 60 + BITE_FLASH_SECONDS;
  }

  update(state: GameState): void {
    const now = state.tick / 60, marks: string[] = [];
    for (const cue of threatCues(state).slice(0, 3)) {
      if (cue.onScreen) continue;
      const wave = 0.5 + 0.5 * Math.sin(now * Math.PI * 2 * PULSE_HZ[cue.stage]);
      marks.push(mark(cue.stage, edgePoint(cue), (cue.stage === "warning" ? 0.35 : 0.5) + 0.45 * wave, SIZE[cue.stage]));
    }
    if (this.flashOrigin && now < this.flashUntil && !exposure(state).refuge) {
      const left = (this.flashUntil - now) / BITE_FLASH_SECONDS;
      marks.push(mark("attack", edgePoint(viewBearing(state, this.flashOrigin)), 0.6 + 0.4 * left, 340));
    } else this.flashOrigin = null;
    const html = marks.join("");
    if (html === this.shown) return;
    this.shown = html;
    this.element.innerHTML = html;
    this.element.hidden = !html;
  }

  reset(): void {
    this.flashOrigin = null;
    this.flashUntil = -Infinity;
    this.shown = "";
    this.element.innerHTML = "";
    this.element.hidden = true;
  }
}

function mark(stage: ThreatStage, at: { x: number; y: number }, strength: number, size: number): string {
  return `<i class="threat-mark" data-stage="${stage}" style="left:${at.x.toFixed(1)}%;top:${at.y.toFixed(1)}%;--size:${size}px;opacity:${strength.toFixed(2)}"></i>`;
}
