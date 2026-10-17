# Siltwake independent Astra review — round 1

Reviewer: non-author GPT-6 Astra, reasoning effort **xhigh**, as identified by the T3/Codex runtime. No children delegated. No other independent review was received or consulted.

**Frozen candidate:** `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`
**FND author source:** `8d72dd2ac2822873e36fe339f8ed2db8c837084b`
**Feature base:** `a3e400b`
**Full bootstrap/spec-change base:** `b3c3231b99ca5f1bd1159c5611216f2866e05a37`
**Review date:** 2026-10-17
**Isolated worktree:** `/home/worker/.t3/worktrees/subnautica-clone/t3-0f9f1e6b`

HEAD was verified before review and again after verification. Both checks returned the frozen candidate; the tracked worktree remained clean. Runtime/config/test/artifact-source files have no diff between the FND author source and this candidate. Installation, builds and checks ran only in this isolated checkout. No candidate source/docs were edited, committed or pushed; no PR was created.

## Explicit verdicts

- **FND-01: CHANGES REQUIRED at `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`.** Three actionable findings below: one P1 dependency exposure and two P2 persistence behavior defects. Ordinary playable foundation and visual evidence otherwise meet this bounded batch's intent.
- **ECO-01: ACCEPT at `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`, exclusively as a provisional arithmetic/design deliverable.** No blocking contradiction or incorrect reported numeric total found. This accepts neither registry adoption nor physical rescue, route margins, playtime or gameplay balance.
- **Integrated M0: not accepted by this report.** Component review does not replace the later integrated milestone gate or the other independent review.

## Scope and standards inspected

Read `AGENTS.md`; build `STATUS`, `PLAN`, `CONTRACTS`, `PLAYTEST`, `CONTENT_MANIFEST`; revised build input; delivery/acceptance contract; FND author evidence; all three ECO files; expedition integration, world progression, fleet/survival and graphics contracts; glossary, settled-decision map and historical tracker. Inspected all production source, both test files, build/package configuration, README and the bootstrap/spec-document changes. The authoritative revised prompt and substantive campaign design documents were not reduced by this diff. No canon appendix was needed.

Used the code-review skill's standards/spec distinction without its child-agent workflow because this assignment expressly prohibits delegation. Standards review found the intended separation of plain simulation, content IDs, persistence, renderer and DOM adapters intact. Fixed-step ownership, explicit handedness, shared terrain/pod/rib geometry, conservative swept collision and original procedural art are present. No speculative later system is represented as delivered gameplay. No style-only smell is promoted to an acceptance blocker. The findings below concern concrete correctness/security and player-facing persistence semantics.

## FND-01 findings

### FND-A1 — P1: upgrade the network-exposed vulnerable Vite pin

**Location:** `package.json:19`, with exposure enabled at `package.json:8`; corresponding lockfile and `vite.config.ts` defaults.

The documented `npm run dev` binds Vite **7.3.1** to `0.0.0.0`. This exact version and configuration match the published high-severity arbitrary-file-read advisory **GHSA-p9ff-h696-f583**: a client that can reach the dev server's WebSocket can bypass `server.fs` through `fetchModule`. WebSockets are not disabled here. This matters to the development machine/container running the documented command; it is not a claim that the generated static game bundle contains this server vulnerability.

**Reproduction/evidence:** run `npm ci`, then `npm audit --json` in this checkout. The audit reports direct Vite high severity and recommends the non-major update to 7.3.7. I independently retrieved the GitHub advisory and verified its two conditions: explicit network exposure and enabled WebSocket. Its affected Vite 7 range is `>=7.0.0 <=7.3.1`, first patched 7.3.2. The audit also identifies later advisories through 7.3.4, so merely selecting the first fix for this one advisory is insufficient. No sensitive files were read and no exploit against a running dev server was attempted.

References:

- https://github.com/advisories/GHSA-p9ff-h696-f583
- https://github.com/advisories/GHSA-v2wj-q39q-566r

**Requested correction:** pin a currently patched compatible Vite release, regenerate the lockfile, and rerun clean install/check plus relevant production smoke. Retain intentional network access only with a patched dependency. The audit's separate low-severity esbuild advisory concerns its Windows development server; I do not treat that as an established exploit in this Linux/Vite runtime.

### FND-A2 — P2: failed initial storage writes leave no playable/exportable session

**Location:** `src/runtime/app.ts:127–130` and analogous import branch at `src/runtime/app.ts:206–209`; message at `src/save/repository.ts:85`.

When storage reads work but writes fail, the repository is `empty`/`ready`, not `unavailable`. New Game therefore tries the initial commit and returns on failure **before** creating an in-memory session. A fresh player remains at the title menu, cannot Continue, and cannot export. The error nevertheless says “Export this session to keep it.” The same early return prevents entering a validated imported session when its initial commit fails. This contradicts the documented fallback at `docs/build/evidence/FND-01.md:52` and makes a recoverable storage problem a launch blocker.

**Actual production-browser reproduction:** on the review-owned incognito origin `http://localhost:5182/`, preserve/remove only the review save, fill task-owned localStorage keys with 1,024-character values until a genuine `QuotaExceededError`, reload, and use the ordinary **New expedition** button. After 5,008 successful filler writes, this candidate returned:

```json
{
  "menuVisible": true,
  "hudVisible": false,
  "notification": "Browser storage refused the save (quota or permissions). The previous local record is unchanged. Export this session to keep it.",
  "exportVisible": false,
  "continueDisabled": true,
  "journal": null
}
```

This is a deliberately prepared storage diagnostic followed by an ordinary button click, not an ordinary-input campaign test. It uses the browser's actual quota refusal, not a mocked `setItem`. All filler keys were removed and the review save restored afterward. Candidate files and other origins/tabs were untouched.

**Requested correction:** provide a usable, clearly unsaved start/import fallback after a write refusal, while preserving existing local progress and requiring the normal replacement decision when appropriate. Do not silently replace an existing in-memory expedition on a failed operation. Cover read-success/write-failure at the app/session boundary, including availability of export and disabled autosave; the current repository test proves record preservation but never exercises session creation.

### FND-A3 — P2: the stale-tab check is not atomic with the journal write

**Location:** `src/save/repository.ts:68–79`; claimed guarantee at `docs/build/CONTRACTS.md:11` and README save instructions.

The single `setItem` correctly makes the **current/previous pair** atomic. It does not make the preceding compare-and-write atomic across independent contexts. Two tabs can both observe the same original value, both pass line 68, then write successive journals built from their cached original. The second overwrites the first successful save and its backup points to the older generation. The sequential stale-tab test does not cover this interleaving.

**Reproducible StoragePort diagnostic:** after `npm run check`, this runs against the candidate's compiled pure modules. The callback models another context committing between the first context's read and write; it is not a claim to have induced simultaneous browser-tab writes.

```js
// node --input-type=module, from the review checkout
import { SaveRepository } from './.test-build/src/save/repository.js';
import { createGame } from './.test-build/src/sim/state.js';
import { createEnvelope } from './.test-build/src/save/codec.js';
const make = tick => {
  const state = createGame(); state.tick = tick;
  return createEnvelope(state, {
    sessionId: 'review-race-01',
    createdAt: '2026-10-17T12:00:00.000Z',
    savedAt: '2026-10-17T12:00:00.000Z'
  });
};
let raw = null, interleave = null;
const storage = {
  getItem() {
    const observed = raw;
    if (interleave) { const f = interleave; interleave = null; f(); }
    return observed;
  },
  setItem(_key, value) { raw = value; }
};
const initial = new SaveRepository(storage);
initial.load(); initial.commit(make(10));
const a = new SaveRepository(storage), b = new SaveRepository(storage);
a.load(); b.load();
let bResult;
interleave = () => { bResult = b.commit(make(20)); };
const aResult = a.commit(make(30));
const j = JSON.parse(raw);
console.log(aResult.ok, bResult.ok,
  JSON.parse(j.current).state.tick, JSON.parse(j.previous).state.tick);
// Observed: true true 30 10. Successfully committed tick 20 is lost.
```

**Requested correction:** serialize ownership or perform the compare/write in a cross-context transactional mechanism, such as a suitable Web Lock or IndexedDB transaction. Keep the previous-good journal semantics. Add a competing-writer test; an optimistic read comparison alone cannot support the documented guarantee.

## FND-01 acceptance evidence and limits

**Checks actually run here:** Node 24.21.0 / npm 11.19.0; `npm ci` passed; `npm run check` passed strict typecheck, **18/18 tests** and production build; `git diff --check a3e400b...HEAD` passed. The main artifact is `assets/index-UKKifhai.js`, 1,128.19 kB / 278.41 kB gzip, matching the author evidence. Vite's main-chunk warning remains. The extra dependency audit and storage diagnostics are reported above, not hidden behind the passing test count.

**Ordinary-input production smoke performed by this reviewer:** served this checkout's `dist/` using `npm run preview -- --port 5182 --strictPort`. T3 New expedition, R cruise and Escape moved from the pod to swimming at `(0, -1.9982691746915504, -22.129416094839463)`, tick 636. Across the subsequent paused interval, HUD tick 636 and presented frames 156 stayed unchanged. F5 saved while paused. Actual navigation/reload, Continue and immediate Escape retained tick 636 and the same pose. DOM datasets and the journal were read only for these observations; no game-state injection produced the route. Production network resources returned 200; snapshots showed Babylon startup and no game console error during this smoke.

**Browser isolation:** read both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Host was `factory-worker`, Linux; local T3 `chrome-headless-shell` processes and page Linux UA agreed. Used `preview_status`, then a task-owned incognito `preview_open`, tab `tab_17_0430977b-1ed3-45f2-ac72-3683f9fe8942`, at the assigned port. Actual renderer was **ANGLE / Vulkan SwiftShader Device (Subzero)**, Chromium 154, 1280×800 CSS viewport, DPR 2, Rich canvas 1280×800, 12 meshes / 79,005 vertices. No Windows desktop, human tab or shared host was operated. Only the owned tab and preview server were closed.

**Actual rendered evidence inspected:** opened the author's final dry-island sea/pod view `browser-screenshot-localhost-mvcijskw-8b2b7875.png`, corrected pod/ramp `browser-screenshot-localhost-mvcicmq9-f602c913.png`, and corrected underwater reef `browser-screenshot-localhost-mvci4lwt-30d8a30f.png` from `/home/worker/.t3/userdata/browser-artifacts/`. Also inspected a live production menu/camera image after reload. These show recognizable refuge, ribs, waterline, distinct marine silhouettes and consistent cel/palette treatment. The scene is sparse early art, as disclosed. No raster mockup is being used as proof of rendering. I did not independently replay the author's two videos or reproduce every author route/import action.

**Criterion assessment:** pinned/strict/bundled scaffold exists, subject to FND-A1; plain state/content authority/shared world/fixed-step contracts are sound for this foundation; original early scene and usable ordinary controls are demonstrated; versioned import/export validation and single-record rollback protection are substantive, subject to FND-A2/A3; meaningful tests and required core production smoke exist. Readiness for a complete game is not inferred from this evidence.

The author provides ordinary-input ramp/shore and malformed/future import evidence beyond my shorter smoke. Real OS focus switching, actual hidden-tab transitions, context loss/restoration and WebGL-unavailable adapters remain unverified by me; the author's synthetic blur is only diagnostic. This review adds a real-quota browser diagnostic but does not close every storage-failure scenario. SwiftShader establishes neither dedicated-GPU performance nor FPS qualification. No fresh humans, enjoyment or campaign duration were measured. These disclosed gaps are not misrepresented as passes, and absence of crafting, survival drains, story, fleet, full world or changing vitals is **not** a FND acceptance defect.

## ECO-01 review

`node docs/build/design/check-economy.mjs` passed in this exact checkout. Source inspection agrees with the logged scope: 7 regions, 8 materials, 6 hulls, 33 patches, predecessor DAG and fixed-point access over 39 recipes; 8 route/starter/optional scenarios; 6 independent optional-purchase branches; 5 budgeted failure patches per scenario; 20 numeric disable/salvage/rebuild cycles per scenario; and 6 rejection fixtures.

Key cross-system checks:

- **First access:** initial reef/island supplies are available to 60 m starter access. Canopy stock is within suit 150 plus an early hull. Cool ceramic/core are at 260–315 m before their refits; flushed lattice is at 365/385 m before deep protection. Personal and hull pressure/environment checks are separate. Neither hot seams, protected brine fissures nor finite replenishment reserves fund the tested main paths. Hearthline's early-material/frame path does not require advanced stock or a Creel.
- **Numeric recipes and optional purchases:** all eight reported public-spend vectors match execution. Extra branches cover every one of the 39 recipes quantitatively. These branches start from a completed minimum Creel ledger and are independent, which proves additional affordability rather than every optional ordering or buying all hulls at once; the report states that distinction adequately. Minimum Creel completion uses Creel alone; carrier completion uses starter + Hearthline + Mantle.
- **Cargo:** recomputed final packed load is `12 + 8 + 12 + 6 + 4 + 2 + 4 = 48 CU`, within either 52-CU service hold. Equipped suits/tools are separately paid. Pre-final Creel repairs/reserves total `11 + 13 + 16 = 40 CU`; Mantle totals `13 + 16 = 29 CU`. District stop restoration occurs before the final return, so its cost is not omitted. Carrier raw stock is 106 CU versus Mantle 71; component loads 40/34/32 CU plus 16-CU allowances fit the proposed 56-CU Dart+buoy aggregate. This is space arithmetic, not handling/air/endurance evidence.
- **Protected reserve:** Bobbin `2 A + 1 G + 3 M` plus five failures at `2 A + 1 M` spends `12 A + 1 G + 8 M` from `16 A + 1 G + 10 M`, leaving `4 A + 2 M`, exactly two additional patches. Public and protected ledgers remain separate. The bound-output renewal exception and anti-siphon obligations are explicit proposals, not silently assumed freely spendable inventory.
- **Twenty recovery cycles:** the checker numerically disables all hull ratings, checks shallow-source access, credits 100% frame/advanced-frame/module escrow and debits reconstruction from that wallet. Public/protected stock is unchanged, ordinary cargo cache arithmetic conserves stock, and the 80% advanced-frame-return fixture fails. These are correctly labelled arithmetic transactions. They do not execute 20 physical rescues, 20 additional paid patch failures, actual salvage commands, kit-renewal eligibility or saved ownership transitions.
- **Food and scope:** 25 campaign/recovery meals fit the 32 first-stock meals with 4 emergency meals untouched. No thirst, predator-trophy requirement, compulsory optional log/hull or new material family was introduced. Nominal endurance, collection seconds, carrier acquisition timing and ten-hour duration are explicitly not validated results.

No arithmetic/spec contradiction warrants ECO rejection in this deliberately provisional scope. Accepting the design evidence must not convert the checker's abstract flags or escrow into implementation proof.

### ECO integration risks to retain, not current proposal blockers

1. `check-economy.mjs:106–114` tests blueprint locations against **current** capabilities, not persistent discovered knowledge. `:248–266` rebuilds numerically without invoking recipe preconditions. When adopting the model, persist learned blueprints and allow salvage rebuild from retained knowledge after all hulls are disabled; do not transplant the current-reachability predicate into production crafting.
2. `check-economy.mjs:89–99,117–134` abstracts transferable environmental equipment globally. Implement concrete module identity, compatible sockets and stored/swapped Creel cabin/rack/head state. A paid thermal set must not become an unlimited simultaneous protection flag. The draft does not claim to prove simultaneous fitting.
3. Bound maintenance provenance and the single usable kit must survive repair, salvage, dismantling, caches and reload. The checker asserts policy flags; actual anti-siphon transactions and shallow-renewal eligibility still need simulation tests.
4. The 48/52 hold leaves only 4 CU; service pallet, independent support, equipped tools, passenger access and cargo transfer need actual layouts. Validate first deep investigation, external service-stop placement, final machinery independence and both routes' >=25% return reserves before treating this as viable gameplay.
5. The 106-CU carrier workload is about 49% above Mantle by raw space, not demonstrated acquisition effort. Preserve complementary island/Basin investigations, medium-versus-compact berth limits, and the requirement that the carrier arrive with substantial campaign remaining. Repeat hauling or food waiting cannot fill the duration target.

## Separate M0 integrated-check concerns for the coordinator

1. Reconcile the three FND findings, fix accepted findings through the assigned builder, freeze a new candidate and return it to **both** non-author reviewers with dispositions. A fix in shared persistence/build code needs exact-revision revalidation. This report does not combine with an unseen Sol verdict.
2. Run the integrated clean-install/build/launch/input/pause/reload check after merging reviewed components. Record real focus/visibility/context-unavailable behavior where feasible; keep any unresolved adapter coverage explicit. The core normal-input FND smoke is present, so missing later-campaign and hardware/human results must not be used as an accidental foundation scope expansion.
3. Before survival/progression consumers arrive, define the pressure-depth reference explicitly. `src/ui/view.ts:132` displays unsmoothed eye depth while `WorldPose.position` is capsule base and the renderer smooths eye height. Keep pressure logic tied to the intended world-state reference, with presentation offsets unable to change gameplay protection.
4. Preserve schema/content migration ownership. Foundation's intentionally empty/null extension arrays reject future data; inventory, knowledge, depletion, modules, escrow, docking and recovery must enter through reviewed migrations, not relaxed validation or a parallel economy registry.
5. Fix the manifest's harmless stale asset pointer (`docs/build/CONTENT_MANIFEST.md:11` names `public/siltwake-mark.svg`; the shipped file is `public/siltwake.svg`) when recording the integration. This is documentation cleanup, not another FND blocker.

All existing rendering/human/performance limits remain. Early graphics acceptance is not full campaign art acceptance; ECO acceptance is not runtime integration acceptance; and this independent report is not a full M0 merge approval.
