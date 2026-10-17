# Siltwake integrated M0 — independent Astra review, round 1

Date: 2026-10-17. Reviewer: independent **non-author GPT-6 Astra, xhigh**, as identified by the injected T3 runtime. The live catalog confirms inherited model `gpt-6-astra` on `codex` and availability of `xhigh`; the catalog's provider default is not the task's selected effort. No children were delegated. No other independent M0 review was received, consulted or shared. The earlier component reports are historical input.

**Verdict: ACCEPT integrated M0 foundation at `d41543694bd68e8e41a01465df7141634a5567f2`.**

No actionable correctness, contract-integration or scope finding requires a change. Integration preserves the accepted FND-01 foundation, ECO-01's qualified arithmetic/design status, and the uncut future campaign scope. This is one independent M0 opinion; the coordinator must separately obtain the Sol 6.1 max opinion and complete the paired milestone record. This verdict does not accept M1, a first expedition, fleet/world gameplay, the campaign, public deployment or a main merge.

## Revision and review integrity

- Isolated T3 checkout used exclusively: `/home/worker/.t3/worktrees/subnautica-clone/t3-af19c806`.
- Verified HEAD before work and after verification/cleanup: `d41543694bd68e8e41a01465df7141634a5567f2`; working-tree status was clean both times.
- Feature base: `a3e400b0ab1f822a9007a93f8433dafc43a34a3b`; planning/spec base: `b3c3231b99ca5f1bd1159c5611216f2866e05a37`.
- Accepted component candidate: `50f5569a92a6e18aac8970ecdb7918e5e217a455`; latest source `2c25b8b`, author `1e2c581c28d209a9a3263071a638d6652b7d60e1`.
- Feature tip `dbcebfcfb4e7f0f488044ef93f1652bd7a0b4dcc` and integration merge `1bba23aa734dddc0b32774ed6cd0755d05d39396` have identical tree `2eb8e948216f198f4aa8b0bd498bac2594761076`. Their full diff is empty.
- Production source, tests, configuration, dependencies, public assets, README and all three economy proposal files have no diff from component-accepted `50f5569` to this candidate. CONTRACTS changed only its acceptance-status paragraph. The final candidate adds coordinator evidence/status after the merge, without functional changes.
- Revised input and substantive integration/world/fleet/graphics/story/delivery specifications have no changes from the supplied planning/spec base. No integration conflict or lost feature scope was found.

No candidate code/docs, branch, commit, push or PR was created or changed. Installation/builds ran only in this worktree. Generated dependency/build/test outputs are ignored. This report and fresh review records are outside the candidate under `/tmp`.

## Sources and review method

Read AGENTS; build STATUS, PLAN, CONTRACTS, PLAYTEST and CONTENT_MANIFEST; the revised input; delivery/acceptance; all R1/R2/R3 component reports and consolidated dispositions; original FND and both correction evidence reports; M0-INTEGRATION; the settled map and historical tracker. Inspected the integration/world/fleet/graphics requirements, all production modules, tests/configuration, README, economy proposal and pertinent checker logic, and the relevant diffs. No canon appendix or major story spoiler was needed.

Applied the code-review skill's standards/spec distinction within the explicit no-children reviewer assignment. No additional CONTRIBUTING or coding-standards file was found. Standards: no actionable violation of the repository's ownership, plain-data, lifecycle or persistence contracts. Spec: no missing bounded M0 promise or hidden scope reduction. Stylistic preferences and deliberately absent later systems are not findings.

This review independently ran installation/checks, inspected actual integrated browser observations and rendered captures, checked the fresh production artifact over HTTP, and validated retained save data against the candidate codec. It did **not** launch or operate a browser, repeat the unchanged component browser matrices, or present coordinator/author measurements as new reviewer play.

## Full bounded foundation assessment

1. **Reproducible scaffold — pass.** Strict TypeScript 5.9.3, Vite 7.3.7, Babylon 9.31.0 and Node types 24.10.0 are exactly pinned with a working lockfile. README provides clean install/dev/check/build/preview commands. The production artifact bundles the used code, original geometry and shaders. Renderer startup checks WebGL 2 and routes failure to readable UI while retaining export access. Actual unsupported-WebGL startup remains unexercised.
2. **Plain contracts — pass.** `src/sim/` and save data contain no renderer objects. The single registry seeds the seven region, eight material and six hull IDs plus Bobbin. Independent comparison found the economy proposal's roster keys identical. The 60 Hz clock caps elapsed time/eight updates and resets interruption accumulation. Commands/events, Y-up/right-handed metres, water at zero and capsule-base saved poses are explicit. Terrain, ramp/deck and rib layout are shared by simulation and presentation. Empty/null extension collections and exact schema 1/content `foundation.1` validation preserve a reviewed migration boundary.
3. **Recognizable original foundation — pass.** Actual images show the pod exterior/deck and amber ramp, rib silhouettes, marine forms, waterline and split island in a consistent cel palette. The menu/HUD clearly identify an early foundation. Procedural source and metadata support the stated original-art provenance. Sparse island/reef art and decorative non-interactive ecology remain disclosed first-expedition work.
4. **New/Continue/save/import/export/input/pause — pass within stated evidence limits.** `SiltwakeApp` is the composition owner; all save commits flow through the awaited session boundary. Validation precedes replacement. A shared native exclusive Web Lock encloses comparison and the single current/previous/preserved journal write. Unsupported coordination has no unsafe write fallback. Explicit eligible unsaved play retains old active/local data until acceptance, disables autosave and keeps export available. Confirmation, protected repair, stale-conflict refusal, immutable snapshots, deduplication and cancellation/disposal fit together. Input clearing and clock reset prevent held movement or catch-up across pauses. Per-request entry permission preserves interruptions across asynchronous completion, while ordinary fresh requests remain usable. Graphics restoration requests a paused redraw only after engine reconstruction and scene readiness; it cannot itself resume simulation.
5. **Meaningful checks and runtime coverage — pass.** The 65 tests cover save validity/round trips/protection, concurrency/refusal/cancellation, fixed timing, collision/ramp/shore movement and app composition. The 30 app cases run the actual app/session/repository/codec/clock/simulation with substituted view/input/renderer ports; they do not prove Babylon internals. The separately inspected actual production evidence supplies ordinary controls, save/reload and renderer behavior. Synthetic focus/visibility and induced graphics diagnostics retain their narrower meanings.
6. **Reviewable handoff — pass.** Exact source, interfaces, evidence and remaining gates are recorded. The merge preserves the reviewed implementation and the reconciled awaited persistence/readiness seams. No dependent implementation was dispatched by this reviewer.

## Prior findings retained as resolved

| Finding | Independent M0 assessment |
| --- | --- |
| FND-A1, P1: vulnerable exposed Vite pin | Resolved: exact 7.3.7 package/lock remains and fresh install/build pass. No new separate advisory audit was performed. |
| FND-A2 / FND-SOL-01, P2: quota refusal blocks exportable New/import | Resolved: `src/runtime/session.ts:106` onward retains the explicit eligible fallback and old-session preservation. Fresh tests pass; historical actual quota/cancel/import/export observations were inspected. Retained exported files still decode with this candidate. |
| FND-A3 / FND-SOL-02, P2: compare/write race | Resolved: `src/save/repository.ts:68` snapshots before queuing, then compares/preserves/writes inside native exclusion; `src/save/writer-lock.ts` supplies the common name and no racing fallback. Fresh adversarial tests pass. Earlier native two-context competition remains attributed historical evidence. |
| FND-A4 / FND-SOL-R2-01, P2: delayed entry overrides interruption | Resolved: `src/runtime/app.ts:134–163` scopes/consumes/revokes entry permission and rejects busy/blocked Resume. Internal preparation does not revoke permission. Composition tests and the actual integrated held-write/synthetic-blur observation agree. |
| Related restored-resource/blank paused-scene observation | Resolved for the identified timing issue: `src/render/renderer.ts:60–79` follows engine restoration plus scene readiness and gates presentation; disposal removes/invalidates callbacks. Actual restored paused images are populated. Broader driver compatibility is not inferred. |

There are no declined prior findings or unresolved objections, and no new severity/file/line/reproduction finding to return.

## Fresh checks and artifact evidence

Environment: Node `v24.21.0`, npm `11.19.0`, isolated Linux worktree.

| Check performed here | Result / retained evidence |
| --- | --- |
| `npm ci --no-fund` | Pass; `/tmp/siltwake-m0-astra-checks/install.log`. Installed 18 packages; existing esbuild install-script notice and one low vulnerability reported. |
| `npm run check` | Pass: strict typecheck, **65/65 tests, 0 failures**, production build; `/tmp/siltwake-m0-astra-checks/check.log`. |
| `node docs/build/design/check-economy.mjs` | Pass; `/tmp/siltwake-m0-astra-checks/economy.log`. |
| `git diff --check a3e400b..HEAD` | Pass. |
| Component-to-candidate production comparison; feature-to-merge tree comparison; authoritative-spec comparison | No functional/source/spec difference as detailed above. |
| Production preview on assigned port 5186, mounted at `/siltwake/` | Pass. Started `npm run preview -- --host 127.0.0.1 --port 5186 --strictPort --base /siltwake/`. HTTP checked HTML, relative entry/CSS/icon references, all **26 emitted resources** and **55 relative module references**. Every requested resource returned 200 with exact disk bytes and non-HTML asset content type; module targets exist. `/tmp/siltwake-m0-astra-checks/artifact-paths.json`. This is an HTTP/artifact check, not browser execution under a subdirectory. |
| Candidate codec against integrated and retained historical saves | Pass. Integrated ordinary save equals reload envelope; journal predecessor equals that save; current/previous decode. Both retained R1 unsaved exports decode at tick 0 with matching session ID; R2 ordinary save decodes at tick 941. `/tmp/siltwake-m0-astra-checks/evidence-consistency.json`. |

Fresh main artifact: `dist/assets/index-DLXkZ6jy.js`, **1,134.38 kB / 280.16 kB gzip**; SHA-256 **`a3be0c5477cce93887ddf7626c34349061b951591f11afc25e182674d047a92b`**, identical to accepted component and integrated coordinator evidence. The >500 kB chunk warning remains. The previously disclosed low esbuild 0.27.7 Windows-dev-server advisory remains; this is not a zero-vulnerability or new clean-audit claim.

## Actual runtime evidence inspected, with attribution

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. Existing artifacts answered this unchanged-integration review without browser operation. No user/shared page or root tab14 was touched.

Inspected the actual `/tmp/siltwake-m0/browser-observations.json`, including environment, complete saved envelope, reload, native queue, interrupted completion, explicit Resume, console/network and action records. Its source is integration `1bba23a`, whose runtime/artifact matches this candidate exactly. It records Linux Chromium 154, WebGL 2/Babylon 9.31.0, ANGLE Vulkan **SwiftShader**, 1280×800 CSS viewport/DPR2, 12 meshes/79,005 vertices.

Coordinator's ordinary New/R-cruise/Escape/F5 route moved from the pod into swimming: saved **tick 720**, position **(0, -2.219177102867941, -26.543892245785315)**. Tick/frame stayed **720/193** across the paused observation; actual reload/Continue/Escape retained the saved envelope and pose. The native-held New plus explicitly synthetic blur/focus completed at menu **tick 0/frame 8**, stable across the later observation, with journal current 0/previous 720 and empty lock queues. Later explicit Resume advanced to tick 165. These are inspected coordinator measurements, not my own input run. Its collected production requests succeeded and console contains only two startup logs.

Also inspected the actual R1 correction quota/export/native-competition record and relevant R2 correction restoration/entry observations, event timings and console. They are historical component diagnostics. R1 has distinct native pending clients, one success/one conflict and retained predecessor; R2 shows unavailable native-restored events followed by ready paused redraws. No unchanged browser matrix was rerun.

Opened and visually inspected these actual filesystem images under `/home/worker/.t3/userdata/browser-artifacts/`:

- Integrated paused completion: `browser-screenshot-localhost-mvcn6c2m-f6988411.png` — populated island, water, ramp and usable paused menu.
- Original final island-to-pod/reef view: `browser-screenshot-localhost-mvcijskw-8b2b7875.png`.
- Corrected underwater reef: `browser-screenshot-localhost-mvci4lwt-30d8a30f.png`.
- Corrected pod access: `browser-screenshot-localhost-mvcicmq9-f602c913.png`.
- R2 restored, still-queued New: `browser-screenshot-localhost-mvcm2bp4-c5863da4.png`.
- R2 completed paused import: `browser-screenshot-localhost-mvcm476n-c20cd053.png`.

The latter two show actual populated recovered scenes, rather than using readiness counters alone as appearance evidence. I did not replay the earlier videos or produce fresh screenshots.

## Qualified economy and future scope

ECO-01 remains **accepted provisional arithmetic/design evidence**, preserved unchanged in M0. Fresh checker output covers 39 recipes, 33 patches, eight scenarios, six independent optional branches, five budgeted failed-recovery patches and 20 numeric disable/salvage/rebuild transactions per scenario, plus six rejection fixtures. Its roster agrees with the production seed registry; no economy JSON was imported as a competing runtime authority. Reported final load 48/52 CU and protected reserve remainder 4 alloy/2 membrane agree with the checked proposal.

Carry forward the existing integration obligations: persistent learned knowledge after loss; concrete fitted/stored/transferred module and container identity; protected recovery provenance and one-usable-kit/renewal conservation; actual cargo/pallet clearance and four-CU final margin; carrier-independent supplies and service-stop placement; physical rescue/tether topology, both routes' return reserves and meaningful hull use. Numeric cycles are not physical rescue or runtime adoption. Optional branches are independent affordability cases, not one all-purchases campaign. No route, playtime or human balance proof is accepted.

Opening/story, functional pod facilities, gathering/crafting, survival drains/recovery, fleet/carrier and full world remain intentionally absent M1+ work. Vitals at 100 and empty extensions are honest foundation boundaries. The approximately ten-hour target, all seven habitats, six craft, both strategies and later technical/human gates remain intact.

## Limits and cleanup

No fresh browser play was performed in this review; the independent verdict relies on source/test/artifact verification plus inspected actual integrated and historical rendered/runtime evidence. That is sufficient for this source-identical M0 integration. It does not close real OS focus or hidden-tab transitions, unsupported-WebGL startup, broader browser/storage-permission matrices, exhaustive context/disposal timing or real GPU-driver failures. Synthetic events and induced loss remain diagnostics. SwiftShader does not qualify dedicated-GPU performance; no fresh-human enjoyment/duration or later gameplay evidence exists.

Only owned preview session **50807** was stopped with SIGINT (exit 130); port **5186** was verified no longer accepting connections. No browser tabs, storage fixtures, pointer locks or children were created. Shared browser hosts, root tab14 and all other tasks were preserved. Final HEAD is the exact requested candidate and `git status --short` is empty.

**Final disposition: ACCEPT M0 at `d41543694bd68e8e41a01465df7141634a5567f2`; no changes required within the bounded milestone.**
