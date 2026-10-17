# Siltwake independent Astra review — fresh round three

Date: 2026-10-17. Reviewer: independent non-author **gpt-6-astra / xhigh**, identified by the injected T3 runtime. The live catalog confirms inherited model `gpt-6-astra` and availability of `xhigh`; catalog defaults are not the selected runtime effort. No children delegated. Read all four prior independent reports and both dispositions; no other round-three findings were received, consulted or shared.

- Frozen candidate: **`50f5569a92a6e18aac8970ecdb7918e5e217a455`**.
- Original foundation author: `8d72dd2ac2822873e36fe339f8ed2db8c837084b`.
- Latest correction author: `1e2c581c28d209a9a3263071a638d6652b7d60e1`, integrated as `2c25b8b`; evidence `bcef1e1`.
- Previous candidate: `0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`; feature base `a3e400b`; full bootstrap/spec base `b3c3231b99ca5f1bd1159c5611216f2866e05a37`.
- Isolated review worktree: `/home/worker/.t3/worktrees/subnautica-clone/t3-67db0ab6`.

HEAD matched before work and after checks/cleanup; the tracked/untracked worktree remained clean. Installation and builds ran exclusively here. No candidate code/docs, commits, pushes, PRs or branches were changed. Only ignored install/build/test outputs and external review artifacts were created.

## Separate explicit verdicts

**FND-01: ACCEPT at `50f5569a92a6e18aac8970ecdb7918e5e217a455`.** The three original findings remain resolved, and the shared round-two interruption race is resolved. Source, composition tests, fresh ordinary-input production smoke, focused native-lock/interruption diagnostics and actual restored scene images support acceptance of the bounded foundation. No new actionable blocking defect or hidden campaign reduction was found.

**ECO-01: ACCEPT at `50f5569a92a6e18aac8970ecdb7918e5e217a455`, only as the provisional arithmetic/design proposal.** The three proposal files are unchanged from both prior accepted candidates. Fresh execution and source/arithmetic inspection support carrying the qualified acceptance forward. This does not accept runtime registry adoption, physical rescue, playable routes, return margins, balance or measured playtime.

**Integrated M0 remains a separate pending gate.** This report is one independent component review, not the other reviewer's verdict or an integrated milestone/merge approval.

## Scope inspected

Read AGENTS; build STATUS, PLAN, CONTRACTS, PLAYTEST and CONTENT_MANIFEST; the complete revised input and delivery/acceptance contract; FND evidence and both actual correction reports; all four complete prior independent reports, both dispositions and both correction assignments. The assignments were reviewed, not executed. Read all three ECO files, expedition integration, world progression, fleet/survival, graphics guidance, glossary, settled-decision map and historical tracker. Inspected production modules, tests/configuration, README and feature/correction/spec diffs. No canon appendix was needed.

Production source/tests/config/README match the latest correction author's tree. Save/session/simulation/content/dependencies/economy are unchanged since round two; the original 35 tests are unchanged. The authoritative revised prompt and substantive integration/world/fleet/delivery/graphics documents have no diff from the supplied full bootstrap base. README and milestones preserve the full campaign, six craft, carrier, recovery and duration target. Their absence from this foundation is intentional, not a finding.

## Findings and correction dispositions

There are **no new change-required findings** in either acceptance scope.

| Prior finding | Verdict | Evidence at this candidate |
| --- | --- | --- |
| FND-A1 P1: exposed Vite 7.3.1 | Resolved, retained | Package/lock pin Vite 7.3.7; dependencies unchanged from independently audited round two. Fresh installation/check/build succeeds. No separate advisory audit was repeated here; npm ci reports the disclosed one low vulnerability. |
| FND-A2 / FND-SOL-01 P2: write refusal blocks exportable New/import | Resolved, retained | `src/runtime/session.ts:106` onward preserves active/local state, offers explicit fallback only for eligible failures, and disables autosave for accepted unsaved sessions. Typed conflict/invalid/protection/size refusals remain distinct. Existing failure/export/cancellation tests pass, with additional real-app fallback/entry-intent tests. Inspected retained actual quota/import/export/native-competition observations; those browser measurements are historical, not fresh repetitions. |
| FND-A3 / FND-SOL-02 P2: compare/write race | Resolved, retained | `src/save/repository.ts:68` snapshots before waiting and performs compare/preservation/journal write inside the shared exclusive Web Lock; `src/save/writer-lock.ts:2` fixes the common name and has no uncoordinated fallback. Adversarial competing repositories, rejection/release, snapshots and cancellation tests pass. Fresh browser diagnostics verify the real app queues and cancels native requests. The earlier two-context competition remains separately attributed evidence. |
| FND-A4 / FND-SOL-R2-01 P2: delayed entry overrides interruption | **Resolved** | `src/runtime/app.ts:134` accepts entry permission only for a permitted request; `:156` revokes it for interruptions/player pauses; preparation callback at `:58` preserves it; completion at `:142` consumes it; `:149` refuses busy/confirming/hidden/unavailable Resume without queuing permission. Both source paths and real-app tests cover New/import, slow read, fallback, recovery before completion, ongoing loss/hidden state, fresh later requests, cancellation and disposal. Fresh production reproductions below remain paused without Resume. |

The related graphics-readiness concern is also resolved for the tested renderer. `src/render/renderer.ts:60` forwards engine loss, `:66` waits for engine restoration and `scene.executeWhenReady`, and `:79` gates presentation. Disposal at `:107` removes owned observers/readiness callbacks; generation/disposal guards reject stale work. The app rejects late callbacks at `app.ts:73`. Babylon 9.31 installed source confirms its native event schedules reconstruction asynchronously and its restored observable follows resource rebuilding. Scene readiness checks can run without the app presenting stale resources. Readiness only marks a paused redraw dirty; it grants no simulation Resume.

The 30 added tests execute the real app/session/repository/codec/clock/simulation with substituted view/input/renderer ports. They test composition outcomes, not merely callback counts. They **do not execute the real Babylon renderer**; source inspection and production restoration/image evidence supply that part of this review. Native engine disposal at every possible internal reconstruction instruction remains untested.

## FND acceptance criteria

1. Strict TypeScript 5.9.3, Vite 7.3.7 and Babylon 9.31.0 are exactly pinned with lockfile and documented commands. Runtime assets are local. WebGL2 startup failure has readable handling; unsupported-WebGL startup was not browser-exercised here.
2. Serializable state and typed IDs/commands/events remain separate from DOM/Babylon. One roster authority preserves accepted regions/materials/hulls. The 60 Hz clock caps stalls and resets interruptions. Right-handed metres, Y-up/water zero and capsule-base save coordinates are explicit; rendering consumes the shared terrain/pod/rib definitions.
3. Original procedural cel scene visibly provides pod/refuge, ramp, reef silhouettes, waterline and island landmark. Ordinary movement and usable menu/HUD are demonstrated. Sparse early art is accurately disclosed.
4. New/Continue, current/previous/preserved single-record storage, validated imports/exports, explicit replacement/repair, native writer exclusion and unsaved fallback are substantive. Schema 1/content foundation.1 remain exact and require future reviewed migrations. The interruption completion/readiness defects are corrected without changing those save contracts.
5. Meaningful clock, movement/collision, save, concurrency, async session and app-composition tests pass. Required normal production loading/control/pause/reload evidence exists, with focused fresh interruption checks. Browser diagnostic and hardware limitations remain explicit below.
6. Commit/path/interface/evidence handoff is concrete, and reconciled CONTRACTS matches the changed required renderer callback and preparation-pause semantics. No dependent implementation was dispatched by this reviewer.

## Checks actually run

Factory-worker Linux; Node **24.21.0**, npm **11.19.0**.

| Check | Result / artifact |
| --- | --- |
| `npm ci --no-fund` | Pass; `/tmp/siltwake-astra-r3-install.log`. Existing esbuild install-script notice and one low vulnerability reported. |
| `npm run check` | Pass: strict typecheck, **65/65 tests**, production build; `/tmp/siltwake-astra-r3-check.log`. |
| `node docs/build/design/check-economy.mjs` | Pass; `/tmp/siltwake-astra-r3-economy.log`. |
| `git diff --check a3e400b...HEAD` | Pass. |
| Latest-author source/config/test comparison | No diff. |
| ECO comparison against `0a8ef04` and `2eb0244` | No diff in all three proposal files. |

Production artifact **`index-DLXkZ6jy.js`**, **1,134.38 kB / 280.16 kB gzip**; SHA-256 **`a3be0c5477cce93887ddf7626c34349061b951591f11afc25e182674d047a92b`**, matching author evidence. Main-chunk warning persists. The unchanged low esbuild Windows-development-server advisory, GHSA-g7r4-m6w7-qqqr, remains disclosed; this is neither a new clean audit nor an asserted static-runtime exploit.

## Fresh production browser and actual images

Read both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Verified hostname/kernel and local T3 chrome-headless-shell processes on **factory-worker Linux**, then used `preview_status` and a new owned incognito `preview_open`. Served this checkout's dist using `npm run preview -- --host 127.0.0.1 --port 5182 --strictPort`. Used only tab **`tab_1h_0430977b-1ed3-45f2-ac72-3683f9fe8942`**. Actual page UA: Linux Chromium **154**. Renderer: **ANGLE / Vulkan SwiftShader Device (Subzero)**; 1280×800 viewport, DPR 2, 12 meshes / 79,005 vertices. No Windows desktop, human/shared tab or pointer lock was operated.

**Ordinary controls:** New, R cruise, Escape and F5 moved off the pod into swimming and saved at **tick 923**, position **`(0, -1.6499143648749348, -15.168126779886416)`**, yaw 0, pitch -0.05. Separate paused observations retained tick 923 and frame 159. Actual navigation/reload, Continue and immediate Escape retained tick 923 and the displayed pose. Read-only HUD/journal observations measured this route; no state setter or teleport produced it. The retained save is `/tmp/siltwake-astra-r3-ordinary-save.json`.

**Controlled adapter diagnostics:** each delayed case held the genuine native writer Web Lock and used ordinary replacement controls, with one held and one pending request confirmed before interruption.

- Delayed New plus **synthetic blur then focus** completed at menu/tick **0**, frame **9**. It remained there across a separate **8.72-second** observation interval. Explicit Return to the water subsequently advanced to tick **579** before ordinary Escape. Synthetic events are not real OS focus evidence.
- Delayed valid import of the ordinary save plus induced **WEBGL_lose_context loss/restoration before lock release** retained old tick **579**. At native restoration, graphics still reported lost/not ready, frame **121**; later engine/scene readiness produced frame **122**, still busy/paused. After releasing the lock, import completed at menu/tick **923**, frame **123**. It remained unchanged across a separate **18.09-second** interval. Explicit Resume advanced to tick **2679** before Escape. Complete imported envelope equality was checked against the ordinary save; WebGL getError returned **0**.
- Queued New plus actual Escape removed the pending request before holder release, kept active tick **2679**, preserved the entire journal bytes and never re-entered after release. Held/pending native queues were empty afterward.

These are native-lock/synthetic-focus/induced-graphics diagnostics, not a real GPU fault, a new multi-context competing-writer proof or ordinary campaign runs. Uninterrupted delayed New/import, import+blur, New+graphics, early/busy Resume, fallback and additional cancellation permutations are supported by inspected author observations and the fresh composition suite; I did not independently replay the entire author matrix.

Fresh **actual screenshots were opened and visually inspected**, not inferred from dataset counters:

- Engine-ready import still queued: `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcmmi97-4554e25b.png`.
- Completed import still paused: `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcmmrvl-ac835d42.png`.

Both show populated scenes: island silhouette/foliage, water/shore treatment, stones and the pod ramp where in view. Also inspected the author's actual restored queued-New (`…mvcm2bp4-c5863da4.png`) and completed-import (`…mvcm476n-c20cd053.png`) captures, plus original island overview (`…mvcijskw-8b2b7875.png`) and corrected pod/ramp (`…mvcicmq9-f602c913.png`), under the same artifact directory. They establish early scene continuity and stable paused recovery on this renderer.

My console contained startup logs and the one expected context-lost/restored warning pair, with **no invalid-resource warnings, console errors or failed production requests**. Retained fresh data, console/network/action records and image paths: `/tmp/siltwake-astra-r3-browser-observations.json`. Inspected the author's actual `/tmp/siltwake-fnd01-r2-fix/browser-observations.json` (41 labelled observations, native event timings, three restoration cycles), and previous correction observations separately. Historical measurements are not labelled as new tests.

**Evidence limits:** real host focus changes and real hidden-tab transitions remain unobserved; Node visibility events and browser synthetic blur do not establish them. Unsupported-WebGL startup, all storage/permission adapters, other browsers, real driver faults and exhaustive restoration/disposal timing are unverified. I did not repeat the unchanged real-quota/export/competing-context matrix or full original ramp/island routes. Intermediate lost/rebuilding frames were not exhaustively sampled. SwiftShader proves no representative dedicated-GPU performance; no human duration/enjoyment, later campaign, physical recovery or fleet evidence exists. These are correctly bounded open checks, not missing later features promoted into foundation blockers. Core FND playable and correction evidence is sufficient for this acceptance.

## ECO-01 arithmetic/design assessment

Read JSON, checker and prose against integration/world/fleet requirements; independently checked the main arithmetic and fresh output. No actual contradiction or incorrect claimed total was found.

- **Dependencies:** 7 regions, 8 material families, 6 hulls, 33 source patches and 39 reachable recipes. Starter material access fits 60 m; Canopy fits suit 150 plus early hull. Cool ceramic/core at 260–315 m precede their refits; flushed lattice at 365/385 m precedes 800 protection. Personal/hull/environment checks are separate. Initial carrier needs early stock, two distinct frame patches and complementary investigations, not advanced materials or a compulsory Creel. Main paths use neither reserve replenishment nor hot/brine rich seams.
- **Both routes and optional recipes:** eight route/starter/optional scenarios debit before granting capabilities and match all published cost vectors. Suit refits, service stops, reserves, final supplies and five failed-recovery patches are paid. Minimum Creel-first completes with Creel alone; carrier requires its starter, Hearthline and Mantle. Six independent purchase branches quantitatively cover all 39 recipes. This is additional affordability after a completed minimum ledger, not simultaneous ownership of every optional hull or every purchase order.
- **Cargo:** final load `12+8+12+6+4+2+4 = 48/52 CU`; equipped suits/tools are separately paid. Pre-final Creel load `11+13+16 = 40/52`; Mantle `13+16 = 29/52`. District restoration precedes the final return, so that cost is not omitted. Carrier/Mantle raw stock **106/71 CU**; carrier components **40/34/32 CU** each fit Dart+buoy 56 CU with 16 CU reserve. First-hull bundled loads including allowance are Dart **32**, Creel **40**, within diver+buoy **40 CU**. Packed assemblies, loose materials and the buoy's separate deployed container are distinguished.
- **Protected stock:** `(16 A,1 G,10 M) - (2,1,3) - 5×(2,0,1) = (4,0,2)`, exactly two more patches. Public optional purchases never consume it. Bound recovery renewal is an explicit proposal/implementation obligation, not free public stock silently funding paths.
- **Twenty cycles:** each scenario zeros hull ratings, verifies shallow kit-source reachability, refunds frame/advanced-frame/module escrow and debits rebuilding entirely from that wallet. Ordinary cargo cache conservation is separate. Public/protected stock stays unchanged; 80% advanced-frame refund is rejected. These are 20 numeric salvage/rebuild transactions, not 20 physical rescues or 20 extra paid failures. Full recovery depends on the stated 100% critical salvage and material-free baseline tow assumptions.
- **Food and limits:** 25 meals fit 32 first-stock meals with four emergency meals untouched. No thirst, predator trophy, mandatory optional log/hull or new material family was introduced. Collection times, nominal endurance, carrier workload premium and ten-hour duration are appropriately unvalidated. Six rejection fixtures detect relevant broken proposals.

Retain actionable adoption risks: `check-economy.mjs:106` uses current blueprint reachability, while numeric rebuilding at `:248` bypasses production recipe preconditions; learned knowledge must persist after fleet loss. Global environmental flags at `:89` and `:117` need actual transferable module identity/sockets and stored cabin/rack/head state. Protected renewal provenance and single usable kit eligibility need real conservation transactions through repairs, salvage, caches and reload. The four-CU final margin and aggregate loads need physical packing/transfer/exit checks. Settle service-pallet compatibility, external 650 m stop placement and carrier-independent final fabrication before adoption. Validate actual >=25% return reserves, full starter-accessible rescue corridors, both routes, all hull niches and midcampaign carrier timing. None of those claims is currently made by this proposal.

## Separate M0 concerns for the coordinator

1. Keep this result separate until the independent Sol round-three verdict returns. Record both exact-SHA verdicts and dispositions. Component acceptance does not replace the required integrated M0 review after feature integration.
2. On the integrated artifact, run clean install/check/launch plus ordinary movement/pause/save/reload and a focused delayed-entry interruption check. Exercise real focus/visibility where supported and retain any adapter gaps honestly. Actual recovered images and engine readiness must remain part of graphics recovery evidence.
3. Preserve the reconciled renderer callback and preparation-versus-interruption contract. Readiness must never resume gameplay; disabled actions must not authorize later entry. Keep awaited snapshots, cancellation/disposal, cooperative Web Locks and HTTPS/localhost requirements intact.
4. Before survival consumers, explicitly choose gameplay pressure-depth reference: saved position is capsule base, HUD uses eye depth and rendering smooths eye height. Presentation offsets must not silently control protection. New inventory/knowledge/world/fleet/recovery data requires reviewed schema/content migration.
5. ECO remains a proposal. Own the registry adoption, protected provenance, module/container identities, physical route/rescue/cargo gates and final-load decisions separately. Preserve dedicated-GPU/human exceptions and sparse-art/chunk-size work; no later acceptance is implied.

## Cleanup

Restored initially empty task-origin storage, cleared file selection and removed the page helper after confirming no native held/pending locks. Closed only the owned T3 tab through its lifecycle tool. Stopped only owned preview terminal session **84377** (SIGINT, exit 130); port **5182** was verified free. Shared hosts and other tasks' tabs were preserved. Final HEAD remains the frozen SHA and worktree status is clean.

Full report: `/tmp/siltwake-fnd-eco-astra-r3.md`.
