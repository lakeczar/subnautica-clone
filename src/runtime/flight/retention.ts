/** REC-1 storage budget (R1-S2). One budget covers every recording on this
 * computer, the current one included. When it is exceeded, video goes first
 * (oldest segment first, older recordings before this one, never the segment
 * being written), then whole older recordings, then this recording's own
 * pictures. What a recording keeps last is its telemetry (frames, samples,
 * events), which is small. Every removal is reported, so a pack can say what
 * it lost. DOM-free: tests drive it with an accelerated session. */

export type StoredKind = "video" | "snapshot" | "telemetry" | "export";
export interface StoredFile { session: string; file: string; bytes: number; kind: StoredKind }
export interface Removal { session: string; file: string | null; bytes: number; why: string }
export interface RetentionPlan { remove: Removal[]; totalAfter: number; overAfter: boolean }

/** Default budget, and never more than this share of the quota the browser grants. */
export const DEFAULT_BUDGET_BYTES = 2 * 1024 ** 3;
export const QUOTA_SHARE = 0.5;
/** Below this, there is no room for video at all: telemetry and pictures only. */
export const MIN_VIDEO_BUDGET_BYTES = 64 * 1024 ** 2;

export function budgetFor(quota: number | undefined, requested = DEFAULT_BUDGET_BYTES): number {
  return quota && Number.isFinite(quota) ? Math.min(requested, Math.floor(quota * QUOTA_SHARE)) : requested;
}

const segmentOrder = (a: StoredFile, b: StoredFile): number =>
  a.session === b.session ? (a.file < b.file ? -1 : 1) : a.session < b.session ? -1 : 1;

/**
 * What to remove so everything fits `budget`. `current` is this recording's
 * session; `active` the files being written (never removed). `pinned` files
 * count against the budget but are never chosen: a recording another capture
 * in this page still holds exportable, or a file whose removal was refused (R3-2).
 */
export function planRetention(files: readonly StoredFile[], current: string, active: readonly string[], budget: number,
  pinned: (f: StoredFile) => boolean = () => false): RetentionPlan {
  let total = files.reduce((a, f) => a + f.bytes, 0);
  const remove: Removal[] = [];
  const gone = new Set<StoredFile>();
  const drop = (f: StoredFile, why: string) => { if (gone.has(f)) return; gone.add(f); total -= f.bytes; remove.push({ session: f.session, file: f.file, bytes: f.bytes, why }); };
  const live = (f: StoredFile) => (f.session === current && active.includes(f.file)) || pinned(f);
  // 0. Old exports (they are copies).
  for (const f of files.filter((x) => x.kind === "export" && !live(x))) { if (total <= budget) break; drop(f, "an earlier export (a copy)"); }
  // 1. Older recordings' video, oldest first.
  for (const f of files.filter((x) => x.kind === "video" && x.session !== current && !live(x)).sort(segmentOrder)) { if (total <= budget) break; drop(f, "video of an older recording, over the storage budget"); }
  // 2. Whole older recordings, oldest first (one with a pinned file is never removed whole).
  const older = [...new Set(files.filter((x) => x.session !== current && !x.session.startsWith("export:")).map((x) => x.session))].sort()
    .filter((session) => !files.some((x) => x.session === session && live(x)));
  for (const session of older) {
    if (total <= budget) break;
    const rest = files.filter((x) => x.session === session && !gone.has(x));
    const bytes = rest.reduce((a, x) => a + x.bytes, 0);
    rest.forEach((x) => gone.add(x));
    total -= bytes;
    remove.push({ session, file: null, bytes, why: "an older recording, over the storage budget" });
  }
  // 3. This recording's own video, oldest segment first, never the one being written.
  for (const f of files.filter((x) => x.kind === "video" && x.session === current && !live(x)).sort(segmentOrder)) { if (total <= budget) break; drop(f, "this recording's oldest video, over the storage budget"); }
  // 4. This recording's pictures, oldest first.
  for (const f of files.filter((x) => x.kind === "snapshot" && x.session === current && !live(x)).sort(segmentOrder)) { if (total <= budget) break; drop(f, "this recording's oldest pictures, over the storage budget"); }
  return { remove, totalAfter: total, overAfter: total > budget };
}

/** What may record at all: no private storage means no video (it cannot be bounded in memory). */
export function videoAllowed(mode: "driver" | "playtest", spooled: boolean, budget: number, minVideo = MIN_VIDEO_BUDGET_BYTES): { ok: boolean; why?: string } {
  if (mode === "playtest" && !spooled) return { ok: false, why: "this browser has no private file storage: the video cannot be kept within a budget" };
  if (mode === "playtest" && budget < minVideo) return { ok: false, why: `the storage budget (${Math.round(budget / 1048576)} MiB) leaves no room for video` };
  return { ok: true };
}
