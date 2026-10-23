// REC-1 fixed views: capture until two successive pictures are the same pixels
// (R1-F2). Stability is a successful comparison, kept apart from the pictures:
// running out of tries leaves the view unstable, with its last two different
// pictures, never a false "stable".
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/**
 * @param capture () => Promise<string>  one picture (base64)
 * @param wait () => Promise<void>        the pause between pictures
 * @param same (a, b) => Promise<boolean | { same: boolean, jitter?: number }>  the comparison
 *   (default: identical bytes; capture.mjs counts pixels that changed noticeably)
 * @returns { image, stable, tries, previous, jitter } — `previous` is the last different picture when unstable
 */
export async function untilStable(capture, wait, tries, same = async (a, b) => a === b) {
  let image = await capture(), jitter = null;
  for (let n = 0; n < tries; n++) {
    await wait();
    const next = await capture();
    const verdict = await same(image, next), ok = typeof verdict === "boolean" ? verdict : verdict.same;
    if (typeof verdict === "object") jitter = verdict.jitter ?? null;
    if (ok) return { image: next, stable: true, tries: n, previous: null, jitter };
    const previous = image;
    image = next;
    if (n === tries - 1) return { image, stable: false, tries: tries, previous, jitter };
  }
  return { image, stable: false, tries, previous: null, jitter };
}

const here = path.dirname(fileURLToPath(import.meta.url));
/** The view set with each quarantined view's reason attached (quarantine.json). */
export function loadViewSet(file = path.join(here, "views.json"), quarantineFile = path.join(here, "quarantine.json")) {
  const set = JSON.parse(readFileSync(file, "utf8"));
  const q = existsSync(quarantineFile) ? JSON.parse(readFileSync(quarantineFile, "utf8")).views : {};
  for (const v of set.views) if (q[v.id]) v.quarantine = q[v.id];
  return set;
}
