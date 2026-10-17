# Siltwake independent Astra review — fresh round two

Reviewer: independent non-author **GPT-6 Astra / xhigh**, as identified by the injected T3/Codex runtime. Date: 2026-10-17. No children were delegated. Both original round-one reports and their dispositions were read as required; no other round-two review was consulted or received.

- Frozen candidate: **`0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`**.
- Foundation original author source: `8d72dd2ac2822873e36fe339f8ed2db8c837084b`.
- Correction author source: `79423ec8a82fe222e36c2311db127a8b41c1f519`, integrated as `417a7ec`; correction evidence integrated as `fbb4b5e`.
- Feature base: `a3e400b0ab1f822a9007a93f8433dafc43a34a3b`.
- Full bootstrap/spec-change base: `b3c3231b99ca5f1bd1159c5611216f2866e05a37`.
- Prior reviewed candidate: `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`.
- Isolated checkout: `/home/worker/.t3/worktrees/subnautica-clone/t3-4eae09bf`.

HEAD matched the frozen candidate before any review and again after checks/resource cleanup. The worktree remained clean. Installation and checks ran exclusively here. No candidate code or documentation was edited, and no commit, push or PR work occurred. The report and extra observations/logs are under `/tmp`; the browser tool retained one screenshot outside the repository.

## Explicit separate verdicts

**FND-01: CHANGES REQUIRED at `0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`.** All three original findings are resolved. One new P2 regression at the async session/app boundary can override an interruption pause when a pending New Game or import completes. The required pause behavior needs correction and relevant regression coverage before this bounded feature is accepted.

**ECO-01: ACCEPT at `0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`, exclusively as the provisional arithmetic/design proposal.** Its three files are byte-for-byte unchanged from the prior reviewed candidate. Independent source/arithmetic inspection and a fresh checker run found no blocking contradiction or incorrect reported total. This is not runtime registry adoption, physical rescue proof, validated route margins, playtime or gameplay balance.

**Integrated M0: not accepted by this report.** The integrated milestone and the separate Sol round-two verdict remain distinct gates.

## Scope and standards

Read `AGENTS.md`; build `STATUS`, `PLAN`, `CONTRACTS`, `PLAYTEST`, `CONTENT_MANIFEST`; the complete revised build input and delivery/acceptance contract; original FND evidence; both complete original reviews and consolidated dispositions; correction task and actual correction evidence; all three ECO files; expedition integration, world progression, fleet/survival and graphics guidance; glossary, settled-decision map and historical tracker. Inspected all production modules, all test files, configuration, README and relevant diffs. No canon appendix was needed and no major spoilers are included.

Applied the code-review skill's standards/spec distinction without delegation, in accordance with the explicit reviewer brief. The intended separation of plain simulation, registry, persistence, renderer and UI remains intact. There is one composition/lifecycle owner and a narrow renderer-free session seam. No style-only issue is promoted to a blocker. The new finding is a concrete behavior mismatch with the pause/explicit-resume contract, not a request for later gameplay.

The revised prompt and substantive world/fleet/integration/delivery documents have no diff from the supplied full bootstrap/spec base. README and build records retain the approximately ten-hour campaign, seven habitats, six hulls, inhabited carrier and recoverable expeditions as later work. Empty foundation extension collections and vitals remaining at 100 are intentional and are not FND blockers.

## Original findings — all resolved

| Finding | Disposition at this SHA | Independently checked evidence |
| --- | --- | --- |
| FND-A1, P1: exposed vulnerable Vite 7.3.1 | **Resolved** | `package.json:19` pins 7.3.7; lockfile agrees. Fresh install, 35 tests/build and production smoke pass. Fresh audit contains no Vite entry and zero moderate/high/critical findings. One low transitive esbuild advisory remains disclosed. |
| FND-A2 / FND-SOL-01, P2: write refusal prevents an exportable New/import session | **Resolved** | `src/runtime/session.ts:106–140` preserves the old session and record until the explicit eligible fallback choice; accepting enters the chosen detached state with autosave off. Invalid/future/conflict/protection/size refusals stay distinct. Session tests cover empty New, empty/existing valid import, both cancellations, retained export, disabled retries and successful explicit retry. Inspected actual fallback/HUD captures and final author quota observations, plus decoded retained real export copies. |
| FND-A3 / FND-SOL-02, P2: unprotected compare/write loses a successful generation | **Resolved** | `src/save/repository.ts:68–105` snapshots before queuing and runs comparison, journal construction and replacement inside the shared lock. `src/save/writer-lock.ts:2–15` uses native per-origin exclusive Web Locks with abort, without a racing fallback. Fresh adversarial competing-repository/rejection/snapshot/cancellation tests pass. Author native iframe evidence shows one success, one conflict, preserved predecessor and empty queues afterward. This review separately observed actual native lock acquisition, queued application writes and completion. |

The corrected source/config/tests/README exactly match correction author `79423ec8...`. Renderer/simulation/content/codec/economy files have no changes since `2eb0244`. Schema 1, content `foundation.1`, the key and journal structure remain compatible. The corrected async exports in `CONTRACTS.md` agree with implementation; all production commit callers await the result through `ExpeditionSession`.

The unsupported-lock path permits read/export and explicit unsaved play with no storage write. The compatible-writer requirement is honestly documented: an older build that ignores Web Locks cannot be serialized by this one. Missing/rejected safe exclusion is not silently downgraded to an in-process lock.

## New FND finding

### FND-A4 — P2: a completed replacement overrides an interruption pause

**Location:** `src/runtime/app.ts:54` (the new `entered` callback); related `src/runtime/app.ts:73–90,125–129` and `src/runtime/session.ts:106–114`.

Every successful asynchronous replacement invokes `entered`, which unconditionally calls `resume()`. A blur, visibility change or graphics interruption that happened while that replacement was waiting is not remembered. `resume()` only checks the current hidden/context flags and current operation state. Thus a visible but unfocused window resumes after blur; an interruption that has recovered before the save finishes also loses its explicit-resume requirement. The same successful replacement path serves validated import.

This violates FND acceptance 4 and the interruption contract in `CONTRACTS.md`/README. README explicitly says resume is explicit after interruptions; the graphics handler itself says “Graphics restored. Resume when ready.” The immediate foundation consequence is a dismissed pause screen and advancing simulation/rendering after an interruption, without a Resume command. It also makes this shared seam unsafe for dependent survival consumers. No actual survival drain is claimed in the current foundation.

**Reproduced on the final production artifact `index-BMj4o6i9.js`, using the real app and native Web Lock, with no game-state setter:**

1. Start/Continue a session, pause, then hold `siltwake.save.journal.v1.writer` in task-owned diagnostic JavaScript.
2. Use the ordinary **New expedition** and **Start new & save** controls. Native `navigator.locks.query()` shows the diagnostic holder plus the pending app request; UI is busy and paused.
3. Deliver `window.dispatchEvent(new Event('blur'))`. The app displays “Paused because the window lost focus.” This is explicitly a **synthetic blur adapter diagnostic**, not a measured OS/window focus transition.
4. Release the native holder without sending any Resume input. After 1.2 seconds, the new session is playing and ticks are advancing.

Actual observations:

```json
{
  "queued": {"screen":"menu", "busy":"true", "tick":932},
  "blurred": {"screen":"menu", "busy":"true", "tick":932,
    "reason":"Paused because the window lost focus."},
  "afterRelease": {"screen":"playing", "busy":"false", "tick":64,
    "menuVisible":false}
}
```

Ticks 932 and 64 belong to the old and new expeditions respectively; the finding is automatic running of the replacement, not a tick-conservation claim across New Game.

**Independent second trigger, actual induced WebGL loss/restoration:** repeated the same pending replacement setup, called the browser's `WEBGL_lose_context.loseContext()`, and then restored the context before releasing the lock. At restoration the app remained busy/menu at old tick 80, canvas ready, and displayed **“Graphics restored. Resume when ready.”** Releasing the holder switched to `screen: playing`; the new session reached tick 72, with presented frames increasing from 26 to 41. No Resume input occurred. This is an induced browser graphics diagnostic, not a physical GPU-driver fault or ordinary gameplay.

The delayed native lock is a controlled fixture for an explicitly supported competing-context wait. The synthetic event limitation does not obscure the cause: the production pause handler executes, and the later production completion overrides it. The context-loss variant independently demonstrates the same ordering with a native browser interruption adapter. While a context remains lost, the existing graphics flag does gate resume; this failure occurs when recovery happens before the pending replacement completes.

**Requested correction:** preserve interruption intent across an asynchronous session entry. A successful replacement may enter its new state while remaining paused if an interruption occurred since initiation, or interruption may cancel the pending replacement subject to the existing completed-write semantics. Only a subsequent explicit player action should clear that interruption. A current `hasFocus()` check alone would not preserve the requirement when focus or graphics has already returned. Add composition-boundary regression coverage for New/import completion after an interruption, including interruption recovery before completion; retain the existing Escape cancellation and no-resurrection guarantees. Do not change the save schema or unrelated renderer/world code for this fix.

Reproduction fixture outline, run only in an isolated task-owned page after reading the browser rules:

```js
// Acquire before clicking New expedition / Start new & save.
window.reviewHeld = false;
window.reviewDone = navigator.locks.request(
  'siltwake.save.journal.v1.writer',
  () => new Promise(resolve => {
    window.reviewRelease = resolve;
    window.reviewHeld = true;
  })
);
// Wait for reviewHeld; click the ordinary UI controls; inspect a pending lock.
window.dispatchEvent(new Event('blur')); // diagnostic, not real focus evidence
// Or induce and restore WEBGL_lose_context while the app write remains queued.
window.reviewRelease();
await window.reviewDone;
// Without Resume: inspect #app.dataset.screen, #hud.dataset.tick and menu.hidden.
```

Full measured observations are retained at `/tmp/siltwake-astra-r2-browser-observations.json`.

## FND acceptance evidence and limits

**Fresh checks in this isolated checkout:** Node 24.21.0 / npm 11.19.0; `npm ci --no-fund` passed; `npm run check` passed strict typecheck, **35/35 tests**, production build; `git diff --check a3e400b...HEAD` passed. Main artifact `index-BMj4o6i9.js` matches the author hash `37e69ff9bc1ceaf4c2ff00bf850b4f1c335c436a90866233c376a5e28fbbdb51`. Main chunk is 1,133.41 kB / 279.83 kB gzip; the size warning remains. Check log: `/tmp/siltwake-astra-r2-check.log`.

`npm audit --json` exits 1 for exactly one low esbuild 0.27.7 advisory, GHSA-g7r4-m6w7-qqqr, concerning its Windows development server. No Vite/moderate/high/critical entry remains. This is not described as zero vulnerabilities or an established static-game exploit. Audit: `/tmp/siltwake-astra-r2-audit.json`.

**Ordinary-input production smoke independently performed:** served this checkout's `dist/` with `npm run preview -- --host 127.0.0.1 --port 5182 --strictPort`. Used New expedition, R cruise, Escape and F5; the route crossed from the pod through water to the island shore, reaching tick **932**, walking at **`(0, 0.5999274579989475, -39.22050753461539)`**, yaw 0. Tick 932 and presented frame 225 remained unchanged across a separate paused observation. Actual navigation/reload → Continue → Escape retained tick 932 and the displayed saved pose. Save bytes provided the exact pose; HUD datasets were readonly observations. The route used no injected pose or direct simulation command. Production resources returned 200 and startup reported Babylon 9.31.0 WebGL2.

**Browser isolation and renderer:** both fleet and repository browser rules were read before browser work. Verified host `factory-worker`, Linux, and locally owned T3 `chrome-headless-shell` processes; page UA also reported Linux Chromium 154. Used `preview_status`, then one task-owned incognito tab, `tab_1c_0430977b-1ed3-45f2-ac72-3683f9fe8942`, at port 5182. Actual renderer: **ANGLE / Vulkan SwiftShader Device (Subzero)**; 1280×800 CSS viewport, DPR 2, Rich canvas 1280×800, 12 meshes / 79,005 vertices. No Windows desktop, human tab, shared tab or pointer lock was operated. Native lock lists were empty at cleanup; only this owned tab and terminal preview session were closed. No shared host was killed.

**Actual rendered evidence inspected:** correction fallback/import choice `…/browser-screenshot-localhost-mvckl7yb-a8fe755d.png`, unsaved HUD `…/browser-screenshot-localhost-mvckom0o-4e3d54dd.png`, original final island overview `…mvcijskw-8b2b7875.png`, corrected pod/ramp `…mvcicmq9-f602c913.png`, and underwater reef `…mvci4lwt-30d8a30f.png`, all under `/home/worker/.t3/userdata/browser-artifacts/`. Also inspected this review's paused shore capture `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcky1rr-f5f04d6f.png`. These are real renderer captures, with recognizable pod, island, waterline, reef and cel treatment; sparse early art remains honestly labelled.

Read the actual correction `final-browser-observations.json`, including quota New/import/cancel/disabled-autosave and native iframe results. Decoded both retained exports `/tmp/siltwake-fnd01-r1-fix/final-unsaved-{new,import}.json` using this candidate's codec and independently compared complete state and session ID: both match, tick 0, session `b88dcb87-fb40-413c-ad6c-484627188a32`. The original incognito download path recorded for the import is no longer present (ENOENT); the retained `/tmp` copies are available. I do not claim to have independently re-performed the author's entire quota/import/download matrix or replayed both historical videos.

Criterion assessment: the strict/pinned/bundled scaffold, pure fixed-step state, typed stable ID roster, shared coordinates/terrain/colliders, original early scene, meaningful persistence/simulation tests and ordinary core controls/reload are supported. The save corrections resolve the original refusal/concurrency defects and preserve validation/migration boundaries. The new interruption race prevents an acceptance of criterion 4 despite the passing 35-test suite; those tests do not exercise the app's delayed-entry callback against interruption events.

Real OS focus switching and actual hidden-tab transitions remain unobserved. This review extends induced context-loss coverage only for the described race, not GPU-driver/browser compatibility. WebGL-unavailable startup and the full permissions/locking browser matrix remain unverified. SwiftShader proves no representative dedicated-GPU performance. No fresh humans, duration/enjoyment or later campaign evidence exists. These limits remain explicit; absent M1+ systems are not added to the FND acceptance scope.

## ECO-01 arithmetic/design assessment

Fresh `node docs/build/design/check-economy.mjs` passed; log `/tmp/siltwake-astra-r2-economy.log`. Reviewed the JSON, checker and prose against the world/fleet/integration contracts. This candidate retains the same bounded proposal accepted in round one, without source changes or an expanded implementation claim.

- **Prerequisite/source reachability:** seven region IDs, eight materials, six hulls, 33 distinct patches and 39 recipes. Predecessor DAG and fixed-point checks preserve personal versus hull protection. Starter stock is shallow; Canopy stock fits the initial suit/hull; cool ceramic/core at 260–315 m precede the 450 refits; flushed lattice at 365/385 m precedes 800 protection. Two matching ordinary patches support first access. Initial Hearthline needs early materials, two distinct frame sources and complementary knowledge, not late minerals or Creel/Dart-350. Main-path quantities do not rely on finite reserve extraction, hot seams or brine fissures.
- **Scenario quantities and optional coverage:** all eight reported route/starter/optional vectors match the fresh run. Costs debit before capability grants; suit refits, service stops, final repairs, reserve cells and five failure patches are included. Minimum Creel can use Creel alone; carrier uses its starter, Hearthline and Mantle. Six independent additional branches exercise all 39 recipes quantitatively. They do not promise buying all optional equipment simultaneously or every purchase ordering; the report explicitly retains that limit.
- **Cargo:** final assemblies `12+8+12`, kit 6, cells 4, meals 2 and spares 4 total **48/52 CU** for both service Creel and Mantle. Creel's cabin cannot coexist with the service head. Pre-final Divide + District + reserve is **11+13+16=40/52**; Mantle District + reserve is **13+16=29/52**. The external stop is restored before the final return, so its repair stock is not omitted. Raw carrier/Mantle loads are **106/71 CU**; carrier components **40/34/32 CU**, each plus 16 CU fitting the proposed 56-CU Dart+buoy aggregate. First-hull bundled loads plus allowance are **32/40 CU** for Dart/Creel within the 40-CU diver+buoy aggregate. Packed output, raw materials and deployed buoy container capacity are distinguished.
- **Protected recovery allocation:** `16 A / 1 G / 10 M` minus Bobbin `2/1/3` minus five patches `10/0/5` leaves **`4/0/2`**, exactly two additional patches. Optional spending never uses that ledger. The public carrier/Creel stress vector leaves three glass, four membrane and four safe-shelf lattice units. The renewable bound-output exception is a declared recovery rule, not secretly available public stock.
- **Twenty numeric cycles per scenario:** the checker disables all hull ratings, verifies shallow kit-source access, credits ordinary/advanced-frame/module escrow, debits reconstruction, and separately conserves an ordinary cargo cache. A 100% salvage return prevents compounding advanced rebuild debt; an 80% advanced-frame fixture fails. There are no actual rescue coordinates, salvage commands or physical tether paths in this proof, and none are claimed. The 20 cycles are not 20 additional paid failure patches.
- **Food/limits:** 25 meals fit 32 first-stock meals; four protected emergency meals are untouched. No thirst, predator-trophy or optional-journal dependency appears. Collection times, nominal speed/endurance, carrier acquisition timing and human duration are explicitly unvalidated inputs. Six rejection fixtures meaningfully exercise relevant broken proposals.

No new ECO change is required within this proposal scope.

### Retain these ECO integration risks

1. Blueprint access in `check-economy.mjs:106–114` uses current reachability, while `:248–266` reconstructs numerically without crafting preconditions. Production must persist discovered knowledge and support rebuilding after total fleet disable; do not transplant current-reachability as a prerequisite for already learned blueprints.
2. Global transferable environment flags are an arithmetic abstraction. Production needs concrete module identities, compatible sockets and preserved stored/swapped cabin/rack/head state; one purchased set cannot protect unlimited simultaneous hulls.
3. Bound maintenance provenance must survive repair, salvage, dismantling, caches and reload. A policy boolean is not implementation of renewal eligibility or anti-siphon transactions. Preserve public/maintenance/escrow identity in the reviewed save migration.
4. Coordinator must explicitly settle service pallet compatibility, 52-CU holds, external 650 m stop placement, carrier-independent final supply fabrication and the 106-CU carrier workload. Four CU of final slack and aggregate hold inequalities do not establish actual loading/transfer/exit clearance, physical recovery or >=25% return reserves.
5. Future gameplay must demonstrate both complete strategies, all hull niches, midcampaign carrier timing, shallow recovery staging and tether routes, food/power pacing and human route learning. Proposal acceptance does not waive them or adopt this draft as a second runtime registry.

## Separate M0 integrated-check concerns for the coordinator

1. Correct FND-A4 in the app/session interruption boundary, then send one frozen revision and these findings/dispositions to both fresh independent reviewers. The three original findings may remain recorded as resolved; this new regression must remain open until retested.
2. Reconcile the interruption/resume semantics alongside the already reconciled async commit/session APIs before dependent consumers. Preserve snapshot ownership, awaited results, deduplicated autosave, cancellation, completed-write disclosure and disposal guarantees. An accepted component still needs the integrated M0 clean-install/build/launch/input/pause/reload gate after integration.
3. Exercise real focus/visibility adapters where the isolated harness supports them; otherwise retain the precise evidence gap. Synthetic blur and induced WebGL loss must keep their diagnostic labels. Do not infer all interruption orderings from pure clock tests.
4. Preserve schema/content migration ownership for inventory, knowledge, resources, fleet, docking and recovery. Define the future pressure-depth reference explicitly: saved position is capsule base; HUD uses eye depth and renderer smooths eye height. Presentation offsets must not silently determine protection.
5. Retain the ECO adoption decisions and runtime obligations above. The content manifest's logo pointer is now corrected to the shipped `public/siltwake.svg`. Keep the main-chunk warning, low esbuild advisory and dedicated-GPU/human exceptions visible without treating them as demonstrated campaign or performance passes.

This is one independent round-two report. It neither combines with an unseen Sol result nor approves the integrated M0 milestone or merge.
