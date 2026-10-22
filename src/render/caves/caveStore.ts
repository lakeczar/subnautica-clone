import { decodeKitCavePack, type KitCaveCollision } from "../../world/caves/kitCollision.js";
import { inflate } from "../biomes/terrainAssets.js";
import { decodeLightField, type CaveLightField } from "./lightField.js";

/** The baked kit caves (CW-1) over HTTP: `caves/manifest.json`, one
 * collision pack (every cave's rock, collar and inside water; about 0.6 MiB
 * compressed, fetched once at start) and one light field per cave, fetched
 * by the streamer as the player approaches. Fetch and inflate are async
 * (`DecompressionStream`), so nothing here blocks a frame; decoding a
 * finished file is a copy. Absent or stale files leave the game on its live
 * fallback (generation), which only a dev build without a bake should see. */
export interface CaveStore {
  /** Decoded collision records once the pack has arrived and matches the
   * manifest, else null. */
  readonly collision: ReadonlyMap<string, KitCaveCollision> | null;
  /** Settled: the pack arrived, or failed (no bake: live fallback). */
  readonly settled: boolean;
  /** The decoded light field, or null while it is fetched (this starts it). */
  light(id: string): CaveLightField | null;
  /** True once the light field's fetch has settled (decoded or absent). */
  lightSettled(id: string): boolean;
  /** Decoded light fields to keep (the rest are dropped, nearest kept). */
  retainLight(ids: readonly string[]): void;
  readonly stats: { fetches: number; failures: number; lightBytes: number; collisionMs: number };
}

interface Manifest {
  readonly sourceHash: string;
  readonly collision: { readonly file: string };
  readonly light: Readonly<Record<string, { readonly file: string }>>;
}

export function httpCaveStore(base: string, options: { readonly keepLight?: number } = {}): CaveStore {
  const root = new URL(base, globalThis.location?.href ?? "http://localhost/");
  const keep = options.keepLight ?? 12;
  const stats = { fetches: 0, failures: 0, lightBytes: 0, collisionMs: 0 };
  const fetchBytes = async (name: string): Promise<Uint8Array | null> => {
    stats.fetches++;
    const r = await fetch(new URL(name, root));
    // A dev server answers a missing file with its HTML fallback page.
    if (!r.ok || (r.headers.get("content-type") ?? "").includes("text/html")) return null;
    return new Uint8Array(await r.arrayBuffer());
  };
  let manifest: Manifest | null = null, collision: Map<string, KitCaveCollision> | null = null, settled = false;
  const started = performance.now();
  const ready = (async () => {
    const text = await fetchBytes("manifest.json");
    if (!text) return;
    manifest = JSON.parse(new TextDecoder().decode(text)) as Manifest;
    const packed = await fetchBytes(manifest.collision.file);
    if (!packed) return;
    const records = decodeKitCavePack(await inflate(packed));
    collision = new Map(records.map(r => [r.id, r]));
    stats.collisionMs = performance.now() - started;
  })().catch(() => { stats.failures++; }).finally(() => { settled = true; });
  const fields = new Map<string, CaveLightField>(), pending = new Map<string, Promise<void>>(), absent = new Set<string>();
  const start = (id: string): void => {
    if (fields.has(id) || pending.has(id) || absent.has(id)) return;
    pending.set(id, ready.then(async () => {
      const entry = manifest?.light[id];
      const packed = entry ? await fetchBytes(entry.file) : null;
      if (!packed) { absent.add(id); return; }
      const field = decodeLightField(await inflate(packed));
      fields.set(id, field); stats.lightBytes += field.data.byteLength + field.rock.data.byteLength;
    }).catch(() => { absent.add(id); stats.failures++; }).finally(() => { pending.delete(id); }));
  };
  return {
    get collision() { return collision; },
    get settled() { return settled; },
    light(id) { const f = fields.get(id); if (!f) start(id); return f ?? null; },
    lightSettled: id => fields.has(id) || absent.has(id),
    retainLight(ids) {
      const wanted = new Set(ids.slice(0, keep));
      for (const id of ids.slice(0, keep)) start(id);
      for (const [id, f] of fields) if (!wanted.has(id)) { fields.delete(id); stats.lightBytes -= f.data.byteLength + f.rock.data.byteLength; }
    },
    stats,
  };
}

let store: CaveStore | null | undefined;
/** The game's cave store: the baked `caves/` beside the page in a browser,
 * none elsewhere (Node tests and tools generate live). */
export function gameCaveStore(): CaveStore | null {
  if (store === undefined) {
    let base: string | null = null;
    // Only a real page with a usable base URL (not Node's test doubles).
    try { base = typeof document !== "undefined" && typeof fetch === "function" ? new URL("caves/", document.baseURI).href : null; } catch { base = null; }
    store = base ? httpCaveStore(base) : null;
  }
  return store;
}
