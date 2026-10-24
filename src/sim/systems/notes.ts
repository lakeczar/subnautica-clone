/** Which found notes the player can read (LS-1). Derived from saved state only:
 * an `always` note reads once its host's chart cell is explored, a `decode` note
 * once its decode is done. A note at a deferred site never reads until that site
 * is placed. */
import { PLACES } from "../../content/registry.js";
import { SITES } from "../../content/regions/sites.js";
import { isDecodable, LOST_SITES } from "../../content/systems/decodes.js";
import { FOUND_NOTE_TEXTS } from "../../content/systems/notes.js";
import type { FoundNoteText, NoteHost } from "../../content/systems/notes.js";
import type { SystemsState } from "./state.js";
import { cellOf } from "./navigation.js";

/** Where a note is posted, or null when its host is not in the world yet. */
export function noteHostPosition(host: NoteHost): { x: number; y: number; z: number } | null {
  switch (host.kind) {
    case "place": return Object.hasOwn(PLACES, host.id) ? { ...PLACES[host.id as keyof typeof PLACES].position } : null;
    case "site": { const s = SITES.find((x) => x.id === host.id); return s ? { x: s.at.x, y: typeof s.at.y === "number" ? s.at.y : 0, z: s.at.z } : null; }
    case "lost-site": return Object.hasOwn(LOST_SITES, host.id) ? { ...LOST_SITES[host.id as keyof typeof LOST_SITES].position } : null;
    case "deferred": return null;
  }
}
export function noteReadable(sys: SystemsState, n: FoundNoteText): boolean {
  if (n.readable.kind === "decode") return isDecodable(n.readable.decode) && sys.decoded.includes(n.readable.decode);
  const at = noteHostPosition(n.host);
  return !!at && sys.chart.includes(cellOf(at.x, at.z));
}
export const readableNotes = (sys: SystemsState): FoundNoteText[] => FOUND_NOTE_TEXTS.filter((n) => noteReadable(sys, n));
