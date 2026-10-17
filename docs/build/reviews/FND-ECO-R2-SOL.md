# Siltwake independent Sol review — round 2

Date: 2026-10-17. Reviewer: separate non-author **gpt-6.1-sol / max**, as selected by the injected T3 runtime. Live `orchestrator_capabilities` confirms inherited model `gpt-6.1-sol` and availability of `max`; provider defaults are not this task's runtime effort. This is a fresh round-two review. Both supplied round-one reports and the coordinator dispositions were read; no other round-two review was consulted or shared. No children were delegated.

## Frozen revision and separate verdicts

- Candidate: **`0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`**.
- Original FND author source: `8d72dd2ac2822873e36fe339f8ed2db8c837084b`.
- Correction source: integrated `417a7ec`, author `79423ec8a82fe222e36c2311db127a8b41c1f519`; evidence `fbb4b5e`; coordinator reconciliation `0a8ef04`.
- Feature base: `a3e400b0ab1f822a9007a93f8433dafc43a34a3b`.
- Full bootstrap/spec-change base: `b3c3231b99ca5f1bd1159c5611216f2866e05a37`.
- Isolated worktree used exclusively: `/home/worker/.t3/worktrees/subnautica-clone/t3-de8f4f45`. HEAD matched before work and after cleanup; tracked/untracked status remained clean.

**FND-01: CHANGES REQUIRED at `0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`.** All three original findings are resolved. One new P2 app/session integration defect remains: a delayed New/import completion can override an interruption pause and resume without input. The corrected persistence mechanism, unsaved-session fallback, ordinary foundation and most required evidence are otherwise sound.

**ECO-01: ACCEPT at `0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`, exclusively as provisional arithmetic/design evidence.** No blocking numeric contradiction or unsupported arithmetic claim was found. This does not adopt a runtime registry or accept physical rescue, playable routes, return margins, campaign duration or gameplay balance.

**Integrated M0: not accepted by this report.** The component reviews, coordinator checks and later integrated milestone gate remain separate.

## New finding: FND-SOL-R2-01 — P2 — delayed replacement resumes after an interruption pause

**Location:** `src/runtime/app.ts:54` (the `entered` callback unconditionally calls `resume()`), `src/runtime/session.ts:109–114` / `:71–76` (successful asynchronous replacement always enters), with interruption handlers at `src/runtime/app.ts:73–74,89–90` and resume gating at `:125–129`.

**Requirement:** FND acceptance 4's pause/focus behavior; the shared lifecycle contract; README's explicit resume after interruptions. This is an implementation defect in that existing foundation behavior, not a request for later survival systems.

A New Game or confirmed import can wait behind another compatible context's Web Lock. While it waits, blur or graphics loss pauses the app. If graphics restore before the write completes, the completion still invokes `entered → resume`. The app checks only its current graphics/visibility/busy conditions; it does not retain the intervening pause or require a new resume action. Blur similarly leaves no guard against the delayed completion. The session is correctly protected from cancellation/disposal, but an interruption pause does not cancel or invalidate automatic entry.

**Focused reproduction against the actual production bundle on port 5183:**

1. Continue a saved expedition and pause. In diagnostic page code, acquire the genuine native `siltwake.save.journal.v1.writer` lock, retaining a release function:
   ```js
   window.review = {};
   await new Promise(held => {
     review.holder = navigator.locks.request(
       'siltwake.save.journal.v1.writer',
       () => new Promise(release => {
         review.release = release;
         held();
       })
     );
   });
   ```
2. Use the ordinary **New expedition** and **Start new & save** controls. Confirm that the app is busy with its write queued behind the native holder.
3. Use `canvas.getContext('webgl2').getExtension('WEBGL_lose_context')` to induce context loss; await its event. In a subsequent diagnostic evaluation, restore the context and await restoration. Do not press Resume or Escape.
4. The real handlers leave the app at `screen=menu`, `busy=true`, tick **962**, frames **8**, with notification **“Graphics restored. Resume when ready.”** Native lock query shows one holder and one pending request.
5. Release only the diagnostic holder: `review.release(); await review.holder`. With no game input, 800 ms later the actual app reports `screen=playing`, `busy=false`, tick **46** in the new expedition, frames **19**, and empty held/pending lock lists. The interruption pause has been replaced by running simulation.

This is an **induced context-loss and native-lock diagnostic**, not a real GPU-driver failure or ordinary campaign run. It needs no gameplay state setter. The ordinary New/confirmation controls exercise the production replacement path.

An independent diagnostic with the same delayed empty New Game and a **synthetic** `window.dispatchEvent(new Event('blur'))` also reproduced it: the handler displayed “Paused because the window lost focus,” then release resumed play to tick **36**. That establishes the handler/completion race; it does not establish a real host focus transition.

**Impact:** completion of earlier I/O overrides the explicit interruption pause and starts ticking without a fresh player decision. Vitals currently do not drain, but this is a required lifecycle property before gameplay consumers arrive. The same unconditional completion path is shared by validated import.

**Requested correction:** preserve whether an interruption happened after the start/import request, or cancel the pending replacement on interruption. If the replacement completes after an interruption, keep it paused until explicit Resume. Preserve ordinary successful New/import entry when no interruption occurred. Add an app-adapter regression for delayed New/import plus blur/context loss/restoration; session tests that merely count `entered` and `pause` callbacks do not detect their ordering at the composition boundary. Repeat the focused production diagnostic on the corrected frozen revision.

**Actual artifacts and measurements:**

- Before releasing the queued write: `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcl0ppc-f4c2157a.png`.
- After release, running without Resume: `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcl0qzk-c71d9e69.png`.
- Exact before/after data, synthetic-blur result and native lock queries: `/tmp/siltwake-sol-r2-observations.json`.

The before screenshot's paused background was temporarily blank after induced restoration; Chromium logged invalid-context/program/VAO warnings before Babylon reported restoration. Active rendering subsequently recovered. This limits what the restored paused-frame evidence establishes; it is not used to claim successful visual recovery at every intermediate frame.

## Round-one findings: individual dispositions

| Initial finding | Round-two disposition | Independently verified evidence |
| --- | --- | --- |
| FND-A1 P1 — exposed vulnerable Vite 7.3.1 | **Resolved** | Exact Vite **7.3.7** pin/lock; fresh installation, production build and audit. Audit contains no Vite entry and zero moderate/high/critical entries. One low transitive esbuild 0.27.7 advisory remains and is disclosed. |
| FND-A2 / FND-SOL-01 P2 — write refusal prevents playable/exportable New/import | **Resolved** | `session.ts:115–119` offers a separate explicit unsaved-session choice only for eligible storage/exclusion failures. Current session remains until acceptance. Own actual-quota browser checks exercised New, valid import, cancellation and real exported files; tests cover existing sessions/records, disabled autosave, retry and invalid/conflict/protected/size refusals. |
| FND-A3 / FND-SOL-02 P2 — stale check/write not atomic across contexts | **Resolved** | `repository.ts:71–73` snapshots before waiting; `:78–101` runs the comparison, journal construction and single write under the shared native exclusive lock. No unsupported-lock write fallback. The adversarial two-repository read/write-gap test passes. Own same-origin iframe/app competition queued **two independent requests** behind a native holder: one saved and the other reported conflict, retaining the predecessor. |

Additional correction assessment:

- The repository's typed failures distinguish validation, unavailable/read-refused storage, write refusal, missing/failed exclusion, conflicts, protected/oversized records and cancellation. Snapshot and returned save data are detached from running simulation.
- `ExpeditionSession` owns one operation/choice; awaiting writes and slow file reads cannot replace a newer session after cancellation or resurrect a disposed app. Autosave deduplicates, and failure disables automatic retries until explicit success. Useful tests exercise these outcomes.
- Own queued-save Escape check cleared busy, kept tick **962**, stayed at the menu, preserved the entire journal and left no native held/pending locks. The new finding concerns interruption pauses that do not invoke that cancellation path.
- The locking guarantee correctly requires cooperative compatible writing builds. README explicitly directs closing older builds. Unsupported exclusion is read/export plus explicit unsaved play; secure-context requirements are recorded.
- Save schema **1**, content **foundation.1**, journal format and key remain unchanged. The correction does not quietly introduce later inventory/fleet/recovery data.
- The manifest now points to the actual `public/siltwake.svg`; the round-one typo is resolved.
- No original finding is carried forward as unresolved or rejected. The new finding is separate.

## Scope, source and test review

Read AGENTS; build STATUS, PLAN, CONTRACTS, PLAYTEST and CONTENT_MANIFEST; the revised build input; delivery/acceptance; both complete original independent reports and consolidated dispositions; correction assignment and actual evidence; original FND evidence; all three economy files; expedition integration, world progression, fleet/survival, graphics guidance, glossary, settled decision map and historical tracker. Inspected all production modules, tests/configuration, README, and the bootstrap/spec-change diff.

Used the code-review skill's standards/spec checklist without its child workflow, as this reviewer assignment prohibits delegation. No separate coding-standard/CONTRIBUTING file was found. No style-only preference is an acceptance finding.

Source/config/tests/README/assets match the corrected author tree at `79423ec8a82fe222e36c2311db127a8b41c1f519`. Compared the correction against `2eb0244` as well as the feature baseline. Renderer, simulation/world, content registry, codec and economy files have no diff from round one. The authoritative revised prompt and substantive integration/world/fleet/delivery/graphics/story documents have no changes against the full bootstrap base; construction bookkeeping does not reduce campaign scope.

FND criterion assessment:

1. **Scaffold:** strict TypeScript 5.9.3, Vite 7.3.7, Babylon 9.31.0, exact lockfile and clean run/build/check commands exist. Runtime code/art/shaders are bundled. WebGL2 failure has a readable code/UI path; unsupported-WebGL startup was not browser-tested here.
2. **Plain contracts:** simulation/save state contains no DOM/Babylon objects; typed commands/events, fixed 60 Hz timing and explicit empty extension boundaries are coherent. Region/material/hull IDs follow the accepted roster. Metres, Y-up, water=0, right-handed coordinates and capsule-base saves are explicit. Terrain, pod ramp/deck and rib/collider layout share authorities.
3. **Scene/input:** actual original cel scene contains recognizable refuge, rib silhouettes, shallow water and split island, with ordinary swimming/walking evidence. It is clearly early art. Menus, HUD, settings and optional mouse-lock semantics are coherent; no copied/generated raster substitutes or remote dependencies were found.
4. **Persistence/pause:** current/previous/preserved single-record semantics, guarded repair, strict import/export and cross-context exclusion are substantive and tested. Unsaved fallback now works. **FND-SOL-R2-01 still violates interruption pause behavior.**
5. **Checks/evidence:** 35 meaningful tests pass, including deterministic timing, stalls/pause reset, collision/ramp/shore movement, strict save validation, refusal/recovery, concurrency and async session lifecycles. Core ordinary production movement/pause/save/reload evidence exists. The added tests cover the original failures but omit the app-level interruption/completion regression.
6. **Handoff:** actual exports, corrections, evidence, source match and known limitations are recorded. No dependent work was dispatched by this reviewer. Component acceptance remains separate from M0.

Crafting, survival drains, story, fleet, full world and changing vitals are intentionally absent from this foundation. None is an additional FND blocker.

## Checks actually run in this isolated worktree

Environment: factory-worker Linux, Node **v24.21.0**, npm **11.19.0**.

| Check | Result |
| --- | --- |
| `npm ci` / fresh `npm ci --no-fund` | Pass; 18 packages installed. Existing esbuild install-script allowScripts notice remains; build succeeds. No install ran in the parent checkout. |
| `npm run check` | Pass: strict typecheck, **35/35 tests**, production build. Log: `/tmp/siltwake-sol-r2-check.log`. |
| `npm audit --json` | Exit 1 solely for one low transitive esbuild finding, **GHSA-g7r4-m6w7-qqqr**, the Windows esbuild development-server file-read path. No Vite entry; moderate/high/critical zero. JSON: `/tmp/siltwake-sol-r2-audit.json`. This is not a zero-vulnerability claim. |
| `node docs/build/design/check-economy.mjs` | Pass: 39 recipes, 33 patches, eight route/starter/optional scenarios, six independent optional branches, five paid failures and 20 numeric recovery cycles per scenario, six rejection fixtures. |
| `git diff --check a3e400b...HEAD` | Pass. |
| Corrected-author runtime/config/test/assets comparison | No diff. |
| Own actual exported JSON through compiled `decodeSave` | Both valid. New export tick 0; imported export tick 962, exact original fixture state and session ID. |

Production artifact **`index-BMj4o6i9.js`**, 1,133.41 kB / 279.83 kB gzip, 478 modules. SHA-256 **`37e69ff9bc1ceaf4c2ff00bf850b4f1c335c436a90866233c376a5e28fbbdb51`** matches correction evidence. The >500 kB main-chunk warning remains.

## Actual browser/artifact review

Read both fleet and repository browser rules before browser work. Verified local T3 chrome-headless-shell processes on **factory-worker Linux**, used `preview_status → preview_open`, a task-owned incognito profile and own production preview on assigned port **5183**. Actual page UA: Linux Chromium **154**. Actual WebGL2 renderer: **ANGLE / Vulkan SwiftShader Device (Subzero)**. Viewport 1280×800 CSS pixels, DPR 2, Rich canvas 1280×800; 12 meshes / 79,005 vertices. This is software rendering with no dedicated-GPU qualification.

Own ordinary-input observations, with read-only HUD/journal measurements:

- Actual New/Continue, R cruise, Escape, F5 save and navigation/reload. Moved from the pod/ramp into swimming, saved at tick **962**, position **(0, -0.9078902984362865, -0.3400145805558507)**, yaw 0. Continue and immediate Escape retained that exact tick/pose. A later paused observation retained tick 962 and frame **197**.
- Real export and file-upload controls were used. Malformed JSON and schema 99 imports each cleared busy, gave distinct readable errors, left confirmation hidden, retained tick 962 and preserved whole local bytes.
- No teleports, game-state setters or fixture poses established those movements. The original author's longer ramp return/island routes were inspected as evidence rather than claimed as my own replay.

Own diagnostics, explicitly distinct from ordinary play:

- Genuine quota refusal: filled only `sol-r2-quota` to **5,242,868 characters**, observing a real `QuotaExceededError` while reads worked. Empty New offered and accepted the explicit unsaved option, producing an exportable tick 0 session, visible warning, disabled autosave and no local record.
- Valid imported tick 962 similarly reached quota refusal. Cancelling the fallback retained active tick 0 and null journal; repeating and accepting restored the chosen tick 962 session with autosave off. Actual downloaded export decoded and matched its full state/session ID. Removing the quota fixture and explicitly saving restored automatic saving.
- Existing-record failed replacements and prolonged disabled-autosave coverage are additionally supported by the actual correction-author observation file and regression tests; I did not repeat the author's growing-journal quota fixture or a 7,262-tick unsaved run.
- Native competition used an actual same-origin iframe running the production app, with its own repository and native LockManager client. Both contexts loaded the same record and queued behind one native holder. The frame won; the parent returned the explicit stale-slot error, cleared busy and disabled autosave. Current/previous saved-at values were **16:01:56.264Z / 16:01:28.865Z** on 2026-10-17; the preceding generation survived. This is a controlled context/storage diagnostic, not a forced multi-process instruction interleaving. The unit fixture supplies the adversarial read/write-gap schedule.
- Native queued-save Escape cancellation passed. Induced graphics loss/restoration and synthetic blur uncovered the new finding above.
- A separate incognito-tab attempt had independent storage and was unsuitable for competing writers; it was not counted. An initial iframe attempt targeted only one save. Only the final native query showing one holder and **two** distinct pending client requests is counted as competition evidence.

Inspected actual author screenshots for final dry-island overview (`…mvcijskw-8b2b7875.png`), corrected pod/ramp (`…mvcicmq9-f602c913.png`) and underwater reef (`…mvci4lwt-30d8a30f.png`), plus correction fallback (`…mvckl7yb-a8fe755d.png`) and unsaved HUD (`…mvckom0o-4e3d54dd.png`) under `/home/worker/.t3/userdata/browser-artifacts/`. Also inspected my live production result and the two new diagnostic captures. Original art/readability and the new unsaved warning are visible. Reviewed the actual `/tmp/siltwake-fnd01-r1-fix/final-browser-observations.json`, not just its Markdown description.

Limits: real host focus loss remains unobserved; the synthetic blur remains diagnostic. Actual hidden-tab transitions, unsupported-WebGL startup and the full storage/browser matrix were not tested here. Induced WebGL restoration is not device-failure compatibility; it logged transient graphics warnings and exposed the pending-replacement race. No failed production network requests were observed. No fresh humans, dedicated GPU, campaign completion or duration/enjoyment evidence exists.

## ECO-01 arithmetic/design review

The three proposal files are **unchanged** against `2eb0244`; the same-candidate verdict was nevertheless checked against the full bounded scope. Reran the checker and read its implementation/JSON/report against integration, world and fleet requirements.

- **Source/dependency graph:** 7 shared regions, 8 material families, 6 hulls, 33 patches and 39 recipes. The predecessor DAG and first-access checks use preceding equipment, separately testing personal and hull protection. Starter reef/island access is within 60 m, Canopy within suit 150 plus early hull, cool ceramic/core at 260–315 m precede 450 protection, and flushed lattice at 365/385 m precedes 800 protection. Main paths use no warm/brine-rich seams or finite reserve extraction. Initial carrier needs early materials and complementary island/Basin knowledge and two distinct frame patches, with no compulsory Creel or late material.
- **Both routes/optional coverage:** all eight public-spend vectors and safe-shelf remainders match execution. The minimum Creel-first route completes with Creel alone; carrier/Dart uses Dart+Hearthline+Mantle. All 39 recipes are quantitatively exercised through the eight runs plus six **independent** optional-purchase branches. These branches are not cumulative affordability for every optional hull/order.
- **Cargo arithmetic:** final load is **12 + 8 + 12 + 6 + 4 + 2 + 4 = 48/52 CU**, with suit/tools equipped and paid separately. Creel's service head excludes its cabin. Divide+District repairs+reserves are **11 + 13 + 16 = 40/52 CU**; Mantle's District load is **13 + 16 = 29/52 CU**. The District stop is paid/restored before the final return. Carrier raw stock **106 CU** versus Mantle **71 CU**; component loads **40/34/32 CU**, each plus 16 reserve fitting the 56 CU Dart+buoy aggregate. These are selected payload inequalities, not physical handling/range proof.
- **Protected recovery reserve:** `16A+1G+10M – (2A+1G+3M) – 5×(2A+1M) = 4A+2M`, enough for two extra patches. Public optional purchases cannot spend that allocation. Repeated shallow recovery draw is explicitly bound-output policy, with anti-siphoning requirements carried forward.
- **Twenty numeric cycles:** each scenario actually zeros every hull pressure rating, checks shallow kit-source access, credits frame/advanced-frame/module escrow, debits rebuilding and conserves ordinary cargo cache quantities without drawing public/protected stock. An 80% advanced-frame return is rejected. The 100% return and material-free baseline tow assumptions are explicit. These are 20 arithmetic transactions per scenario, not 20 physical rescues, 20 additional paid failures or implemented salvage operations.
- **Food/scope:** 25 meals fit 32 public first-stock meals with 4 emergency meals untouched. No thirst, predator trophy, mandatory optional journal/hull, new material family or assumed ten-hour validation was added. Collection time, nominal endurance and 49% raw-space carrier premium are qualified hypotheses/proxies.

No blocking ECO numeric/spec contradiction found. Carry these actionable integration risks into later adoption:

1. `check-economy.mjs:106–114` checks blueprint locations against current capabilities; production must preserve learned knowledge after loss. Numeric rebuild at `:248–266` does not exercise crafting/fabrication preconditions after fleet disablement.
2. Transferable environmental flags and mount grants (`:89–99,117–134`) abstract concrete module identity, sockets, storage and cabin/rack/head swaps. One purchased set must not silently protect unlimited simultaneous hulls.
3. Bound renewal provenance, public/maintenance separation and single usable kit eligibility must survive crafting, repair, salvage, dismantling, caches and reload through real transactions.
4. Approve service-pallet compatibility, 48/52 holds and physical cargo/container transfers; locate the external 650 m stop without replacing independent final supplies. Validate both routes' 25% air/power return margins and starter-accessible full tether corridors.
5. Carrier midcampaign timing, useful hull missions, food pacing and duration/enjoyment require actual integrated play and fresh humans. Neither global ledgers nor the 106 CU workload establishes them.
6. Adopt approved values into the sole production registry through reviewed save/content changes; retain or retire this proposal as evidence rather than introduce a second runtime authority.

These are retained proposal limitations/integration obligations, not invented runtime acceptance claims.

## Separate M0 concerns for the coordinator

1. Fix FND-SOL-R2-01, freeze the resulting source/contracts/evidence and return the full bounded scopes plus this finding/disposition to **both** independent reviewers. This report does not stand in for the other review or later M0 acceptance.
2. After component integration, run clean install/check/launch and ordinary input/pause/save/reload against the integrated artifact. Exercise real focus/visibility changes where supported; retain explicit gaps. Include delayed replacement and interruption ordering in the integrated check.
3. The native restored event can precede Babylon's resource rebuild: my induced restoration logged invalid handles and an initially blank paused background before active redraw recovered. Recheck readiness/paused rendering using actual images and engine restoration timing, rather than only frame/dataset counts. This is a bounded diagnostic observation, not an asserted general GPU failure.
4. Keep consumers on the reconciled awaited persistence boundary, with snapshot/cancellation/disposal ownership. Preserve the cooperative Web Lock protocol and HTTPS/localhost requirement; do not add an optimistic fallback. Later inventory/knowledge/depletion/fleet/recovery data needs explicit reviewed migration from v1.
5. Choose the gameplay pressure-depth reference before survival consumers: saved pose is capsule base while HUD uses eye depth and rendering smooths eye height. Presentation offsets must not change gameplay protection.
6. ECO acceptance remains a provisional proposal; physical hauling, protection/module identity, salvage/renewal conservation, rescue topology, route margins and both eventual playable strategies still need integration evidence.
7. Retain sparse-art/chunk-size work and dedicated-GPU/human exceptions. No later milestone, campaign completion or merge approval follows from foundation captures.

## Resource cleanup and candidate integrity

No candidate source/docs, commits, branches, pushes or PRs were changed. Only ignored dependency/build/test outputs were generated inside this isolated worktree; report/fixtures/logs are under `/tmp`, plus browser-owned artifact/download storage.

Owned T3 tabs `tab_1b_0430977b-1ed3-45f2-ac72-3683f9fe8942` and temporary `tab_1d_0430977b-1ed3-45f2-ac72-3683f9fe8942` were closed through app lifecycle tools. Owned iframes were removed. The task quota key and task-origin save were removed, restoring the initially empty slot; native held/pending locks were empty. Only the owned preview server session was stopped (SIGINT), and port 5183 was confirmed free. No shared browser host, human tab, other task's storage, Windows desktop or physical pointer lock was operated.

Final HEAD remains `0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`; worktree status is clean. No canon appendix or major story spoiler was needed.

Full report: `/tmp/siltwake-fnd-eco-sol-r2.md`. Measurements: `/tmp/siltwake-sol-r2-observations.json`.
