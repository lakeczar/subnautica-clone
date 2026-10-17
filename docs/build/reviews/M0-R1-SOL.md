# Siltwake integrated M0 — independent Sol review, round 1

**M0: ACCEPT at `d41543694bd68e8e41a01465df7141634a5567f2`.** No actionable correctness, integration or scope defect requires a candidate change. The integration preserves the accepted foundation and ECO-01's qualified arithmetic/design scope, with the complete future campaign still required.

Reviewer: independent non-author **gpt-6.1-sol / max**, identified by the injected T3 runtime. The live orchestration catalog corroborates inherited model `gpt-6.1-sol` and availability of `max`; its provider defaults are not the task's runtime effort. Date: 2026-10-17. Isolated worktree: `/home/worker/.t3/worktrees/subnautica-clone/t3-23538657`, branch `t3/23538657`. No other M0 review was received or consulted. No children were created.

This is the independent Sol milestone opinion. It does not assert that the separate Astra opinion or the coordinator's combined acceptance has been completed, and it authorizes no main merge or public deployment.

## Candidate and integration integrity

HEAD was verified before review and after verification/cleanup as the exact frozen SHA above. Working-tree status remained clean. No candidate source/docs, commits, branches, parent checkout, pushes or PRs were changed. Installation/build/test outputs are ignored; the report and retained review data are under `/tmp`.

- Feature base: `a3e400b0ab1f822a9007a93f8433dafc43a34a3b`. Planning/spec base: `b3c3231b99ca5f1bd1159c5611216f2866e05a37`.
- Independent component acceptance: `50f5569a92a6e18aac8970ecdb7918e5e217a455`. Latest integrated source: `2c25b8b`; correction author: `1e2c581c28d209a9a3263071a638d6652b7d60e1`.
- Feature tip `dbcebfcfb4e7f0f488044ef93f1652bd7a0b4dcc` and integration merge `1bba23aa734dddc0b32774ed6cd0755d05d39396` have the identical Git tree `2eb8e948216f198f4aa8b0bd498bac2594761076`. There is no merge-induced tree difference.
- Compared source, tests, public assets, configuration, dependencies/lockfile, README and economy files against the accepted component, integrated source and correction author: no differences.
- The frozen candidate changes only `docs/build/{PLAYTEST,STATUS,TASKS}.md` and adds `docs/build/evidence/M0-INTEGRATION.md` relative to the merge.
- The revised prompt and authoritative integration/world/fleet/graphics/delivery/story specifications have no differences from the supplied planning/spec base. The bounded M0 does not cut the campaign.

Machine-readable comparisons: `/tmp/siltwake-m0-sol-r1/integrity.json`.

## Scope and source assessment

Read AGENTS; build STATUS, PLAN, CONTRACTS, PLAYTEST and CONTENT_MANIFEST; the revised build prompt; delivery/acceptance; expedition integration, world progression, fleet/survival and graphics guidance; settled-decision map and historical tracker; all nine round-one/two/three component reports/dispositions; the original and both correction-author evidence reports; and coordinator M0 evidence. Inspected production modules, tests and build configuration, the economy proposal and relevant checker logic. No canon appendix was needed.

Used the code-review skill's standards/spec distinction within the explicit no-children reviewer assignment. No additional coding-standard/CONTRIBUTING file was found. No stylistic preference was treated as a defect.

| Bounded FND/M0 criterion | Assessment at the frozen integrated candidate |
| --- | --- |
| 1. Pinned reproducible scaffold | Strict TypeScript **5.9.3**, Vite **7.3.7**, Babylon **9.31.0**, Node types **24.10.0** and lockfile agree with the fresh install. README documents install/dev/check/build/preview. Actual production launch succeeds. Renderer startup has a readable WebGL 2 failure path; unsupported-WebGL startup remains unexercised. |
| 2. Plain contracts and one authority | State, commands/events, content IDs, codec, clock and world queries remain renderer-independent. The roster preserves seven regions, eight material families, six hull roles and Bobbin. One app owns lifecycle and composes input/session/save/UI/renderer. Coordinates are right-handed metres, Y up, water zero, with capsule-base saved pose. Simulation and renderer share terrain, ramp/deck and rib geometry authorities. The fixed 60 Hz clock caps stalls/eight steps and resets interruptions. |
| 3. Recognizable original foundation | Source and actual images show original procedural cel art, recognizable pod/deck/ramp, reef ribs, waterline, marine silhouettes and split island. My ordinary production inputs moved from pod to swimming. Menu/HUD and controls work. Sparse art and the early-build notice accurately describe this milestone; decorative life is not represented as functional ecology/resources. |
| 4. Session/save/input/pause boundary | New, Continue, local save, export and validated import compose successfully. Exact schema 1/content `foundation.1`, strict validation, guarded replacement/repair, current/previous/preserved journal, native writer exclusion and explicit unsaved fallback remain intact. Request-scoped entry intent and engine/scene readiness preserve interruption semantics. Future collections remain empty/null and require reviewed migration. |
| 5. Meaningful tests and actual runtime | Fresh 65/65 tests/typecheck/build pass. Tests cover timing, movement/collision, strict saves/protection, refusal, concurrency, snapshots, async cancellation/disposal and app entry/interruption ordering. Browser evidence below establishes real production launch, ordinary movement/pause/save/reload, export/import and nested artifact paths. The app tests substitute view/input/renderer ports and do not prove Babylon internals; source and rendered evidence supply that coverage within the stated limits. |
| 6. Reviewable handoff/contracts | Source/evidence/export contracts and remaining gaps are recorded and reconcile with production callers. In particular, async commits are awaited through the session, and `createRenderer(canvas, availabilityChanged)` has one production app caller. Component acceptance is correctly distinguished from integrated M0. No dependent implementation or acceptance beyond this milestone is claimed here. |

## Prior findings and objections

All previously accepted findings remain resolved. No declined finding or unresolved objection needs reopening.

| Prior finding | Current disposition and evidence |
| --- | --- |
| R1 FND-A1 P1 — exposed Vite 7.3.1 | Resolved. Exact 7.3.7 package/lock/install retained; fresh production build passes. No separate dependency audit was repeated. |
| R1 FND-A2 / FND-SOL-01 P2 — quota refusal blocks exportable New/import | Resolved. `src/runtime/session.ts:106` preserves the old session/record until an explicit eligible fallback choice, then permits export with autosave off. Invalid/conflict/protected/size failures remain distinct. Fresh regression/composition tests pass; historical actual quota/export observations remain attributed to their original runs. |
| R1 FND-A3 / FND-SOL-02 P2 — compare/write race | Resolved. `src/save/repository.ts:68` snapshots before waiting; comparison and single journal write occur inside the native shared exclusive lock at `:78`. `src/save/writer-lock.ts:9` provides no unsafe fallback. Adversarial independent-repository and cancellation tests pass. Historical native-context competition records one success/one conflict with predecessor retained. |
| R2 FND-A4 / FND-SOL-R2-01 P2 — delayed entry overrides interruption | Resolved. `src/runtime/app.ts:134` owns request permission, preparation preserves it, `:156` revokes it on external/player pause, `:142` consumes it, and busy/blocked Resume at `:149` cannot grant later entry. The fresh composition suite and coordinator's integrated native-lock/synthetic-focus evidence support this unchanged seam. |
| Related premature graphics availability/blank paused frame | Resolved for the bounded observed issue. `src/render/renderer.ts:60` handles engine loss, `:64` waits for restored observable plus scene readiness, and disposal removes/invalidates owned callbacks. Availability requests a paused redraw without granting Resume. Inspected historical restored images and native-event timings; this review did not repeat induced graphics loss. |

No new severity/file/line/reproduction finding is required: no actionable candidate defect was substantiated.

## Fresh reproducible checks

All checks ran exclusively in this review worktree. Host: **factory-worker Linux**. Node **v24.21.0**, npm **11.19.0**.

| Check | Result / retained evidence |
| --- | --- |
| `npm ci --no-fund` | PASS; 18 packages installed. `/tmp/siltwake-m0-sol-r1/install.log`. npm reported the existing esbuild install-script notice and one low vulnerability. |
| `npm run check` | PASS: strict typecheck, **65/65 tests**, zero failures, production build. `/tmp/siltwake-m0-sol-r1/check.log`. |
| `npm ls --depth=0` | Exact installed direct versions match the pins listed above. |
| `node docs/build/design/check-economy.mjs` | PASS. `/tmp/siltwake-m0-sol-r1/economy.log`. 39 recipes/33 patches, eight scenarios, six independent optional branches, five budgeted failures and 20 numeric salvage/rebuild cycles per scenario; six rejection fixtures. |
| `git diff --check a3e400b...HEAD` | PASS. |
| Exact tree/source/spec comparisons and clean status | PASS; `integrity.json`. |
| Production artifact nested-path HTTP check | All **27** production files served HTTP 200 and byte-identically under `/siltwake/`: HTML, SVG, CSS and all JS/shader chunks. `/tmp/siltwake-m0-sol-r1/artifact-http.json`. |
| Retained real UI export through candidate `decodeSave` | PASS; complete envelope equals the ordinary saved expedition; schema-99 fixture is rejected. `/tmp/siltwake-m0-sol-r1/{export,ordinary-save,future}.json`. |

Fresh production entry is **`dist/assets/index-DLXkZ6jy.js`**, **1,134.38 kB / 280.16 kB gzip**. SHA-256 **`a3be0c5477cce93887ddf7626c34349061b951591f11afc25e182674d047a92b`** matches the component and coordinator evidence. The >500 kB chunk warning remains. The previously disclosed low esbuild 0.27.7 Windows-development-server advisory remains; this is no new clean-audit or zero-vulnerability claim.

## Independent production browser and rendered evidence

Read both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Verified hostname/kernel and local worker-owned T3 chrome-headless-shell processes on Linux. Used `preview_status` then one new owned incognito tab **`tab_1l_0430977b-1ed3-45f2-ac72-3683f9fe8942`** at assigned port **5187**. No shared/human/root tab, Windows desktop or pointer lock was operated.

Actual UA: Linux Chromium **154**. Renderer: WebGL 2, Babylon **9.31.0**, **ANGLE / Vulkan SwiftShader Device (Subzero)**. Viewport **1280×800 CSS pixels**, DPR **2**, Rich canvas **1280×800**, **12 meshes / 79,005 vertices**. These are software-rendered functional observations, not target-GPU performance measurements.

Fresh ordinary-control results:

1. Launched this checkout's fresh `dist/` through `npm run preview -- --host 127.0.0.1 --port 5187 --strictPort`. Used actual New expedition, R cruise and Escape. Moved from pod deck into swimming without any state setter, teleport or direct simulation command.
2. Paused at **tick 404**, displayed pose `0.000,-1.341,-8.999`, presented frame **101**. Before/after observations across **90 RAF** retained the same tick and frame. Read-only DOM/journal queries measured the result.
3. Actual F5 save was awaited until the operation settled. Saved exact position **`(0, -1.341209696013056, -8.999179338180227)`**, yaw **0**, pitch **-0.05**, tick **404**. Production navigation/reload → ordinary Continue → Escape retained tick 404, the pose and byte-for-byte unchanged journal.
4. Stopped the owned Vite preview, mounted the unchanged `dist/` beneath a task-owned `/tmp` static-server root, and served `/siltwake/` on the same port. Actual nested-path browser launch loaded the CSS, main bundle and dynamic shader chunks. Separately requested and byte-compared every production file; no candidate artifact was edited to make the mount work.
5. Actual Export save downloaded **1,219 bytes**. Copied it to `/tmp` before closing the incognito tab. Its full decoded envelope equals the ordinary saved expedition. Actual schema-99 file upload showed a readable unsupported-schema error, no replacement confirmation and unchanged complete journal bytes.
6. Actual valid exported-file upload showed Import confirmation. In an initial attempt I sent Escape while the async operation was pending; it correctly cancelled without entering a session and left the local journal unchanged. That attempt is not counted as a successful import. Repeated through the real controls and explicitly awaited completion: **playing, busy false, tick 404**, “Imported and saved locally.” The saved current envelope exactly matched the file, with previous tick 404 retained. Subsequent Escape paused the naturally advanced active tick **407** at the same pose. Native held/pending lock lists were empty.

Final snapshot contained only **three Babylon startup log entries**, no console errors/warnings and **no failed production requests** across root/reload/subdirectory navigation. Detailed observations, action/network/console records and cleanup are retained at **`/tmp/siltwake-m0-sol-r1/browser-observations.json`**. No synthetic focus or induced graphics events were used in this fresh smoke.

Fresh paused screenshot was opened and visually inspected: `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcnfba9-7fab3709.png`.

Also opened and visually inspected these actual, explicitly historical captures:

- Coordinator integrated paused completion: `…/browser-screenshot-localhost-mvcn6c2m-f6988411.png`.
- Original dry-island view toward sea/pod/ribs: `…/browser-screenshot-localhost-mvcijskw-8b2b7875.png`.
- Corrected underwater reef: `…/browser-screenshot-localhost-mvci4lwt-30d8a30f.png`.
- Corrected completed import after graphics readiness: `…/browser-screenshot-localhost-mvcm476n-c20cd053.png`.

All abbreviated image paths above begin `/home/worker/.t3/userdata/browser-artifacts/`. These show populated renderer output and coherent early cel treatment, rather than mockups or dataset-only appearance assertions.

Inspected actual retained R1 correction quota/native-competition observations and R2 readiness event/observation records. Independently checked coordinator `/tmp/siltwake-m0/browser-observations.json`: its saved/reloaded envelopes agree, pause comparisons are stable, and queued synthetic-focus New completion is paused with empty native queues and previous tick 720 retained. Those remain **author/coordinator/historical** observations. I did not relabel them as new runs or repeat unchanged quota, competing-context or context-loss matrices.

## Qualified economy and uncut future scope

ECO-01 remains **accepted exclusively as provisional arithmetic/design evidence** at this integrated candidate. Files are unchanged from accepted `50f5569`; the fresh checker passes, and no production import/adoption was introduced. Its source graph, chosen payload inequalities and 20 numeric cycles do not prove physical routes, recovery, timing or balance.

Retain the existing adoption obligations: persistent learned knowledge after fleet loss; concrete transferable module and container identities; public/protected/escrow provenance through all transactions and reload; one usable recovery kit and bound renewal; actual service-pallet/52-CU hold compatibility and the 48-CU final load; independent final supplies/external service stop; physical loading, rescue staging/full tether routes and oxygen/power margins. Carrier timing, all hull niches and human balance remain unvalidated. The draft must not become a competing runtime registry.

M1–M4 still require opening/story, gathering/crafting, functional pod facilities, food/air/power/damage and recovery, full world, functional fleet/carrier/interiors, both completion strategies, authored campaign and polish/audio. The approximately ten-hour target and human validation remain intact. Vitals at 100 and empty/null extension collections are intentional M0 boundaries. Future inventory/knowledge/world/fleet/recovery changes require explicit reviewed migration; before survival consumers, choose the gameplay pressure-depth reference independently of presentation eye offsets. No missing later system is treated as an M0 promise or accepted as already delivered.

Remaining evidence limits: no dedicated-GPU profile, fresh humans, duration/enjoyment or campaign completion; no fresh actual OS focus/hidden-tab transition, unsupported-WebGL startup, broad browser/storage-permission matrix, real driver fault or exhaustive restoration/disposal ordering. Historical synthetic blur and induced context loss establish only their labelled diagnostic behavior. Sparse art, chunk-size work and the low advisory remain disclosed. These limits do not prevent this bounded M0 acceptance.

## Cleanup and final disposition

Restored the initially empty task-origin save slot, retained null settings and cleared the file input. Native held/pending queues were empty. Closed only the owned T3 tab through app lifecycle. Stopped only owned Vite preview session **86771** and static-server session **73196** through their terminal sessions. Port **5187** was verified free. Removed the task-owned `/tmp` mount symlink; shared browser hosts, root tab14 and all other tasks were preserved. Retained logs, real copied export and fixtures are under `/tmp`; browser-managed screenshot storage is outside the candidate. No live child work exists.

Final HEAD is **`d41543694bd68e8e41a01465df7141634a5567f2`**, clean. **Independent Sol verdict: ACCEPT M0.** No candidate edits are requested. The accepted foundation, qualified economy and full continuing specification are preserved.
