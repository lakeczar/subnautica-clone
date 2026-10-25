# M1 completion batches — independent Sol review, round 1

2026-10-17. **Both batches require changes.** This is an independent initial batch verdict, not integrated M1 acceptance. Accepted `game/siltwake` remains M0-only.

| Named batch | Verdict | Blocking finding |
| --- | --- | --- |
| **M1 core/physical-feasibility** | **CHANGES REQUIRED** | SOL-M1-01: an ordinary distraction command can make the current expedition unsaveable and unexportable. |
| **M1 first-expedition presentation** | **CHANGES REQUIRED** | SOL-M1-02: recovery-cache meshes from the previous expedition remain enabled after in-page New/import. |

Both findings are **P2 functional defects requiring correction for their batch**, with high confidence. No other blocking implementation finding was identified in this bounded review. The evidence limits below remain explicit; this report grants no milestone or release acceptance.

**Identity and independence.** Actual model **`gpt-6.1-sol`**, reasoning effort **`max`**, running as the fresh non-author T3-owned child in isolated worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-5d26f8e7`. Before review, `git status --porcelain` was empty and full HEAD equalled frozen candidate **`ac5988c1472da8f8f81b097ed235f33f48c62c7d`**. The supplied base **`a2cb19f1d4cd2d795b82642a2bd357f681d1c293`** was verified as the merge-base. Clean candidate identity was checked again before authoring this report and retained in `review-context.json`. Production/test/script/config paths byte-match **`20451a8dafd014012986e0c8aa1e60df0da7ff25`**; subsequent candidate differences are records. Reviewed the full M1 delta since accepted M0, not just the final correction.

No children/delegation, peer findings/status inspection, source/test/config/spec edits, push, PR, parent mutation or coordination work. Author/coordinator checks were treated as evidence and independently assessed. This report is the only authored repository path.

**Specification and standards used.** Read AGENTS and STATUS first, then PLAN/CONTRACTS, the committed [round brief](../tasks/M1-BATCH-REVIEW-R1.md), `prompts/BUILD_GAME_REVISED.md`, M1-01/COORDINATION/PARALLEL and applicable EXPEDITION_INTEGRATION, FLEET_AND_SURVIVAL, WORLD_PROGRESSION, STORY_DESIGN, GRAPHICS_PIPELINE and DELIVERY_AND_ACCEPTANCE requirements. Consulted the settled map, historical tracker, selected richer-cel study at `20711d1`, and early narrative against the fixed canon. No major story spoilers are needed in this report. Used the code-review skill's standards/spec distinction without its delegation, following this task's explicit no-children instruction.

**Checked scope and method.** Inspected all affected production paths across both batches; tests were reviewed by coverage and focused bodies rather than claiming every test assertion received equal scrutiny.

| Scope | Checked paths and risks |
| --- | --- |
| Core/content/economy | `src/content/registry.ts`; all changed `src/sim/{types,state,step,inventory,progression,survival,vehicles,recovery,carrier,world}.ts`; `scripts/check-m1-economy.mjs`. Sources/prerequisites/output capacity, protected maintenance, identity/conservation, both early orders, finite air, damage/exit boundaries, local tow/patch/salvage, full carrier paths/transforms/transactions. |
| Persistence/runtime | `src/save/{codec,foundation,validation}.ts`, unchanged repository/writer-lock authority, `src/runtime/{session,app,input}.ts`. Strict schema2/content expedition.2, actual schema1 migration, writer snapshots/cancellation, immediate-command saves, interruption/pause/focus, runtime authority boundaries. |
| Presentation | All changed `src/render/{atmosphere,ecology,environment,expedition,geometry,landmarks,materials,palette,renderer}.ts`, `src/ui/view.ts`, `src/audio/sound.ts`, CSS and index. Shared geometry/camera transforms, apertures/depth/air optics, habitat/craft/wildlife readability, notebook/source ordering, command focus/feedback, local audio lifecycle and threat versus body origins. |
| Tests and records | Changed app support/app, command snapshots, expedition, carrier/clearance, hull clearance, migration, save, simulation, presentation and sound-origin tests; underlying M1/A0 assembly, presentation/render, recovery correction, combined expedition/recovery/carrier and final CR1 records. Historical records were read with their source attribution, not as current acceptance. |

Fresh `npm ci`, then **`npm run check`: strict typecheck, 140/140 tests and production build passed**. The first pre-install attempt lacked `tsc`; dependency installation resolved setup. The committed economy checker passed: public preparation/Dart spend **16 alloy / 11 glass / 13 membrane, 56 raw CU**, with the protected allocation separate. Existing large-bundle warning and low dependency advisory remain disclosed; no dependency change was made.

Independent final build: **`index-fUae0k5W.js`**, SHA256 **`8993d62a8c97f8dea5749cf7943e0fd3d169da57ad3dc7ded83fa58d49e80e8b`**, matching the frozen final evidence. Logs and all fresh diagnostics are under `/tmp/siltwake-m1-batch-r1-sol/`.

**SOL-M1-01 — P2, blocking core: projected distraction location can violate the save schema.**

Source: [step.ts:112](../../../src/sim/step.ts#L112), [validation.ts:29](../../../src/save/validation.ts#L29) and [validation.ts:290](../../../src/save/validation.ts#L290). `distraction` projects a target 16 m ahead without checking shared WORLD_BOUNDS. The strict validator correctly requires this saved target to be a world position. A player can therefore issue a valid ordinary command while still inside the playable area and create a state rejected by both Save and Export.

Independent production-rule reproduction, with no injected pose/inventory/damage/geometry:

1. Decode the unchanged earned combined-expedition `main-final.json` (source 4d0a7f0; SHA256 `91e531020ec16cfd9cf7c513f8822cb368be3952b592892a78db5e408103a928`).
2. Through production look/move commands, face south and move to `(10.170568,-0.514722,54.031842)`, yawπ, tick22585. The entire envelope encodes successfully.
3. Execute `distraction`. TargetZ becomes **70.031842**, beyond maxZ **66**. The current envelope now fails `encodeSave` with the gameplay-data-invalid error.
4. After721 ordinary no-input steps the target expires and encoding succeeds again.

Fresh actual final-production UI replay independently confirmed the consequence. Imported that same untouched earned save through the real file input/confirmation, then used bounded normal keyboard events through PlayerInput. At `(13.922668,-0.514722,54.803801)`, yaw3.1, **tick22717**, manual Save settled successfully with autosave enabled. Resume → G → Escape leaves a 12 second pulse at `(14.587959,-0.514722,70.789964)`. **Save refuses and disables autosave; actual Export also refuses.** The prior valid journal remains byte-for-byte unchanged. Pause freezes pulse expiry, and the UI's advice to export cannot preserve this current state. There is no claim that an invalid state overwrites a good save. Latest progress can be lost if the player closes/reloads; recovery requires resuming until expiry and explicitly retrying Save.

Evidence: `reproduce-boundary.mjs`, `boundary-sim-result.json`, full before/derived-invalid envelopes, command arrays, `boundary-browser-before.json`, `boundary-browser.json` and actual [refusal screenshot](/tmp/siltwake-m1-batch-r1-sol/boundary-save-refused.png). The raw UI envelope was observed through a temporary serialization observer restored in `finally`; it was not assigned to simulation. Browser and simulator reproductions have different exact input schedules/poses and are not claimed identical. The browser log retains all 28 generated balanced key edges.

Recommended correction: constrain the projected target through the shared world authority, or refuse atomically before mutation when no valid target exists. Preserve strict validation. Add boundary/diagonal command regressions verifying immediate Save/Export validity and normal pulse expiry. The passing hunter-distraction test covers an interior encounter, not this boundary.

**SOL-M1-02 — P2, blocking presentation: cache visuals survive replacement of their owning expedition.**

Source: [expedition.ts:855](../../../src/render/expedition.ts#L855). The cache map only visits caches present in the incoming state. Unlike the vehicle map immediately above, it never disposes/deletes or disables IDs absent from that state. The renderer and expedition art instance are reused across in-page New/import ([renderer.ts:67](../../../src/render/renderer.ts#L67), [renderer.ts:120](../../../src/render/renderer.ts#L120); app/session replacement does not recreate the scene).

Independent executable reproduction used the actual final compiled render factories under Babylon NullEngine, with only a stub text canvas. Input was unchanged **earned** recovery trace 070, tick 26383, SHA256 **`9f2f11a7172279fc410fb4d909e293c37d6d18f387d3310c2d8e5fbea4fa3eac`**; this is the main earned continuation, not the seeded obstruction branch.

- Present that valid state: nonempty `cache_20` is enabled at `(127.208568,-96.374243,-103.748102)`.
- Present a fresh `createGame()`: its recovery cache list is empty, but the same cache mesh remains **enabled, undisposed and at its old position**.
- Present the cache-free earned expedition input, then `null`: the old mesh remains enabled in both cases.

Evidence: `reproduce-cache-lifecycle.mjs` and `cache-lifecycle.json`. This is a real enabled-mesh lifecycle diagnostic, not a fresh WebGL screenshot or a claim that new gameplay cargo was created. Source inspection supplies the normal New/import lifecycle connection. The player can see a physical cache visual with no corresponding cargo/interaction in the replacement expedition; distinct old IDs also retain unnecessary meshes until full scene disposal/page reload. This violates truthful recovery presentation and session lifecycle, rather than being an art preference.

Recommended correction: reconcile absent cache IDs before updating current caches, disposing/deleting their meshes while retaining shared materials. Cover nonempty-cache → New, cache-free import and null, plus normal empty-cache and reused-ID updates. No source correction was made in this review.

**Evidence assessed beyond the findings.** The retained main expedition shows actual New/opening, C01–C04, preparation, Dart/useful cargo return/storage/service and reload, with a separate fresh alternate early order and no optional-note gate. The recovery lineage retains paid patch/original hull and cargo identities, physical guided tow, repeated loss/caches and final reload. Seeded carrier F0–F3 remains feasibility evidence; actual craft obstruction and prepared/lock interruption cases were not relabelled as campaign acquisition. Source/tests support full-path checks and exactly-once ownership.

Inspected actual authored images including combined orientation/deck, preparation, lab record, alternate intake and recovered cockpit; render reef/island/lab-out/deep-up; carrier medium non-cardinal pane and the recovery ready-notice video frame. Compared the selected study source and retained richer-cel look-reference images (author-attributed to20711d1). These show recognizable habitat/facility language, readable prompts/panels, a usable cockpit centre, and deep attenuation without the previous bright overhead edge. Aperture extraction/opaque seals, hull-local seat/yaw and optics were checked in source against the retained geometry/WebGL artifacts. Close collision views, excluded reverse-berth stages and misleading historical filenames were not used as blanket art-quality or completed-action proof. I did not independently re-run every old shader/geometry matrix.

Early records retain observations versus hypotheses and provenance, both early leads, regional guidance and an explicitly later Basin lead; no canon contradiction or premature major reveal was identified. The fixed semantic command focus and successful-transfer feedback are present with regressions. Audio source and executable origin/lifecycle tests preserve directional hunter origins and centred equipment/body cues. Muted host artifacts establish no audible mix.

The final correction's retained author analyzers were copied into this review's temporary directory before execution against the candidate's compiled modules. Reproduced **13 exact timed full-state comparisons, two exact actual-export comparisons, 22 valid envelope round-trips, and 224 affected replay states**, all saveable and identical to the old baseline except negative-health saturation. The one non-exact walking/boarding reconstruction remains retained and excluded; signed-zero JSON normalization is the only normalization. These are independent executions of author harnesses on retained author inputs, distinct from my independently authored reproductions and fresh browser replay.

**Artifact consistency.** Independently verified every indexed payload locally and inside each original archive, including hashes, unique/safe regular members and manifest bytes. Independently byte-compared captured source snapshots with Git: expedition 39 files, recovery 155 files and carrier 37 files at e3ed566/production4d0a7f0; final correction 54 files at20451a8. Original artifacts/analyzer outputs remained unchanged. Details: `artifact-verification.json`, `source-verification.json` and their independent verifier scripts.

| Original archive | Verified payloads | SHA256 |
| --- | ---: | --- |
| `/tmp/siltwake-m1-combined-expedition-artifacts.tar.gz` |477| `a9f1c598f7dcf131a5133339439ad7c2d39b3c0605b42fd8707a755e341163f8` |
| `/tmp/siltwake-m1-combined-recovery-artifacts.tar.gz` |554| `af7503a802f1ba4159b25f6770cdef3c45f4363832b4786191e62685c2ac8abf` |
| `/tmp/siltwake-m1-combined-carrier/M1-COMBINED-CARRIER-artifacts.tar.gz` |327| `40967b3044db4017d6a9715b911e3520692337cad4fa357ea3fd29e7235a0819` |
| `/tmp/siltwake-m1-cr1-fix-artifacts.tar.gz` |282| `335120dcea0818ed9000381c9602f32b3965886ac0acaadfd72516e2de49e2dd` |
| `/tmp/siltwake-m1-render-artifacts.tar.gz` |204| `81d8030fa27c801f2f35784b8abfae04e5ebf60a76f3bd9916bc9575179e6f4c` |

**Unresolved proof limits and scope judgment.**

| Limit | Judgment |
| --- | --- |
| Complete composed routes are 4d0a7f0; final 20451a8 has targeted replay and only three damage saturations/two text corrections. | Relevant earlier provenance is preserved. Current source/build/tests and targeted replay support assessing those corrections; this is not another fresh final-source preparation/multi-loss/carrier matrix. Separate integrated M1 verification/review remains required. |
| Ordinary geometric-blocked construction and thin throat solids were not achieved through player controls. | Synthetic/detached production-world rules and actual craft obstruction provide useful path/atomicity coverage, not ordinary solid-placement proof. No additional batch blocker inferred from the lack of an unavailable player construction tool; arbitrary continuous geometry is not proved. |
| Healthy-battery exhaustion was not driven to zero in ordinary browser play. | **Ordinary depleted-power runtime evidence remains open** under M1-01; zero-power diagnostics are supplemental. Source/endpoint/finite-air coverage permits bounded implementation assessment, not signing off that unexecuted play line. Root must retain/close it in integrated M1 verification. I do not invent a failed exhaustion case or require an hours-long run as an additional code finding. |
| One final walking/boarding reconstruction is non-exact; one older pitch save read is stale. | Neither is exact persistence proof. Use the separately retained actual camera/saves and exact egress/depth rows; no field omissions waive mismatches. |
| Carrier fixture/pod fallback, shallow Bobbin route and first expedition only. | No campaign carrier acquisition, registered mobile-home fallback, full advanced-fleet/deep rescue, M2–M4/six-fleet/ten-hour completion follows. Those obligations remain. |
| SwiftShader/muted host and guided agent play. | No consumer-GPU performance, audible mix, fresh-human duration/enjoyment or release-readiness verdict. Existing bundle/dependency warnings are nonblocking disclosed issues for this review. |

These are implementation defects plus explicit evidence limits, not a reduction of campaign scope. Neither batch receives acceptance or a proof waiver from this report.

**Owned resources and terminal closure.** Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Verified factory-worker Linux and actual Linux Chromium154, task-owned incognito storage, T3 preview_status → preview_open, checked-free **5196**, Rich 1280×800, WebGL2 ANGLE Vulkan SwiftShader; host muted. No Windows automation or real desktop pointer/cursor capture. Bounded key helpers released all keys; no persistent controller or recording was left.

Closed only owned tab **`tab_24_0430977b-1ed3-45f2-ac72-3683f9fe8942`** through T3 lifecycle. Stopped only owned preview exec **64524** with Ctrl-C, exit130; **5196 verified free**. Historical tab14 and every shared/user/peer resource were preserved. `cleanup.json` records closure. All diagnostic commands finished.

Review evidence: [README](/tmp/siltwake-m1-batch-r1-sol/README.md), [portable archive](/tmp/siltwake-m1-batch-r1-sol/review-artifacts.tar.gz), **798925 bytes**, SHA256 **`cbf841a672e6737ff8cbfb876b508b45e7e9364cb5fc78404856fb30a1616226`**; 112 payload files plus manifest. Manifest SHA256 **`a80ff34b5bafae5d2d69e23600fe228b515be469d2c79cce9dcc807274a5494e`**. This bounded independent initial review ends at report handoff; root owns dispositions, fixes and any fresh paired review.
