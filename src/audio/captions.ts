/** Visual equivalents for cues. Pure; independent of whether a voice was
 * admitted, the context exists, or sound is muted. */
import { CUES, type CueId } from "./cues.js";
import type { CueRequest } from "./mapping.js";
import type { Direction } from "./scene.js";

export interface Caption {
  cue: CueId;
  text: string;
  /** Essential warnings must be shown even with captions off; others follow the setting. */
  essential: boolean;
  dir: Direction | null;
}

/** Repeats of one caption inside this window are suppressed. */
export const CAPTION_REPEAT = 1.5;

export class CaptionGate {
  private readonly last = new Map<CueId, number>();
  caption(req: CueRequest, now: number): Caption | null {
    const spec = CUES[req.cue];
    if (!spec.caption) return null;
    if (now - (this.last.get(req.cue) ?? -Infinity) < Math.max(CAPTION_REPEAT, spec.cooldown)) return null;
    this.last.set(req.cue, now);
    const dir = spec.spatial ? req.dir : null;
    return { cue: req.cue, text: spec.caption.replace("{dir}", dir ?? "nearby"), essential: spec.essential, dir };
  }
  reset(): void { this.last.clear(); }
}
