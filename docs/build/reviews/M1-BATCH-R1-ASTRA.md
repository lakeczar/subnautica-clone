# M1 completion batches — independent Astra review, round 1

2026-10-17. **Independent initial review; both batches require changes.**

| Batch | Verdict | Blocking findings |
| --- | --- | --- |
| **M1 core/physical-feasibility** | **CHANGES REQUIRED** | M1-ASTRA-R1-01: occupied Dart tow/salvage violates persistence invariants. M1-ASTRA-R1-02: a reachable distraction command creates an out-of-world save field. |
| **M1 first-expedition presentation** | **CHANGES REQUIRED** | M1-ASTRA-R1-03: recovery-cache geometry survives replacement with a session that has no such cache. R1-01 also exposes unsafe actions through the Hold UI. |

These are implementation defects, not requests to complete M2–M4. This report does not accept integrated M1, change the accepted M0 branch, or substitute for the later game-design critique. The author's and coordinator's checks were evidence, not this verdict. No peer findings or peer status were consulted.

## Identity, specification and scope

- Actual runtime model/effort: **`gpt-6-astra`, `xhigh`**. Fresh non-author, T3-owned review child in isolated worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-411048b7`.
- Frozen candidate: **`ac5988c1472da8f8f81b097ed235f33f48c62c7d`**. Before review, `git status --short` was empty and `git rev-parse HEAD` equalled that full SHA. Rechecked before writing this report.
- Diff base: **`a2cb19f1d4cd2d795b82642a2bd357f681d1c293`**, accepted M0. The entire M1 delta was the review scope, not just the final correction.
- Verified no source/test/script/package/config/index delta between candidate and **`20451a8dafd014012986e0c8aa1e60df0da7ff25`**. Earlier complete composed author runs remain attributed to `4d0a7f00e939f5535020ddf674fadee39f5e6bd4`; the final source changes three damage saturations and two guidance literals.
- Read STATUS first, then PLAN/CONTRACTS and the committed [round-1 brief](../tasks/M1-BATCH-REVIEW-R1.md). Applied `prompts/BUILD_GAME_REVISED.md`, M1-01/COORDINATION/PARALLEL, EXPEDITION_INTEGRATION, FLEET_AND_SURVIVAL, WORLD_PROGRESSION, STORY_DESIGN, GRAPHICS_PIPELINE and DELIVERY_AND_ACCEPTANCE. Consulted settled decisions/tracker and applicable early canon. No major story spoiler is needed for these findings.

All changed paths were inventoried. Substantive inspection covered the following source and test scopes; decorative geometry was sampled alongside actual images rather than treating line count as visual proof.

| Scope | Checked paths and risks |
| --- | --- |
| Registry, progression and economy | `src/content/registry.ts`, `src/sim/{inventory,progression,state,types}.ts`, `scripts/check-m1-economy.mjs`; source/facility/recipe links, both early orders, optional notes, quantities, capacity and protected maintenance. |
| Physics, survival, recovery and carrier | `src/sim/{world,step,vehicles,survival,recovery,carrier}.ts`; movement/collision, pressure versus hull protection, threat behavior, emergency air, ownership, tow path, service/salvage, carrier transforms and transaction boundaries. |
| Persistence and runtime | `src/save/{codec,foundation,validation}.ts`, `src/runtime/{app,input,session}.ts`; strict schema/content checks, actual-schema1 migration, immediate-command snapshots, atomic journal/session boundaries, focus/pause and entry. |
| Presentation | `src/render/{atmosphere,ecology,environment,expedition,geometry,landmarks,materials,palette,renderer}.ts`, `src/audio/sound.ts`, `src/ui/view.ts`, `src/style.css`, `index.html`; actual hull/camera transforms, apertures/glass/water ordering, lifecycle, richer-cel source readability, early text, notebook, control feedback and local audio event ownership. |
| Verification | M1 changes in app/browser-support, carrier/clearance, command-snapshot, expedition, hull-clearance, migration, presentation, save, simulation and sound-origin tests; build/check and economy script. Reviewed assembly/A0/component and presentation/render/recovery/combined-expedition/combined-recovery/combined-carrier/CR1 author and integration records. |

## Independent checks and evidence provenance

Independent `npm ci` followed by **`npm run check` passed: 140 tests, strict typecheck and production build**. The first pre-install attempt lacked dependencies; installing resolved setup. Logs are `install.log` and `check.log` under the review artifact directory below. No tests or source were changed to obtain this result. The arithmetic-only economy script also passed, retaining positive public margins and separate maintenance accounting; `economy.json` does not establish a playable route by itself.

Built production assets match the supplied final build:

| Asset | SHA256 |
| --- | --- |
| `dist/assets/index-fUae0k5W.js` | `8993d62a8c97f8dea5749cf7943e0fd3d169da57ad3dc7ded83fa58d49e80e8b` |
| `dist/assets/index-DONjl4IF.css` | `14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797` |

Fresh executable probes used this checkout's compiled final rules. Fresh browser checks used this checkout's production preview and actual import/confirmation, Hold commands, bounded resume/pause and F5. Browser helpers dispatched page keyboard/click events and read HUD/storage; they did not inject simulation state into the earned recovery branches. This is focused reviewer reproduction, **not a new independently earned full expedition**.

Two unchanged author-earned inputs were copied and byte-compared:

| Input | Provenance and copied SHA256 |
| --- | --- |
| `/tmp/siltwake-m1-cr1-fix/saves/disabled-actual-export.json` → `disabled-earned-input.json` | Final-source author export, tick 25277, still piloting disabled `dart_16`. `6f08bd12b84ff37791debb1be3f3623bf759e6c3d5ab954a2c375d30d3114db4`. |
| `/tmp/siltwake-m1-combined-expedition/pod-prepared.json` → `earned-input.json` | Author-earned preparation at source `4d0a7f0`, replayed through final candidate commands. `738c9f2c7e28bed59707b901cdbb80a170866a1ab9b57c3c6fc142d7041ee3f4`. |

The cache lifecycle check separately uses **explicitly synthetic, validator-accepted appearance fixtures**, not earned acquisition or loss evidence. `cache-stage.mjs` preserves their construction. The detached NullEngine probe is a lifecycle/mesh diagnostic; the subsequent screenshots are actual production rendering.

Inspected actual author images include combined expedition `media/06-canopy-warning-cockpit.png`, `09-reloaded-workshop.png`, `10-island-first-intake.png`; render `bay-comparison.png` and `captures/after/hunter.png`; combined carrier `captures/f2-creel-nonzero-heading-pane.png`. Compared selected richer-cel reference imagery, copied into `reference-reef.webp` and `reference-scout.webp` from `origin/pr-assets:prototype-siltwake-art-directions/cel-refined-*.webp`, with the implementation/reference-generator context. These support the chosen color/silhouette vocabulary and show actual interaction/camera contexts. Close collision/berth captures are not blanket aesthetic proof, and the carrier image does not independently prove all transitions.

## M1-ASTRA-R1-01 — P1: occupied Dart recovery creates invalid live state

**Classification:** implementation defect; core blocker, also unsafe recovery UI behavior.

**Source:** `src/sim/recovery.ts:120` (eligibility), `:147` (salvage), `:179` (hull removal), `:202` (local tow), `:252` (tow movement); `src/sim/step.ts:378` and `:549` (occupant synchronization precedes recovery movement). `src/ui/view.ts:560` offers both actions while piloting. The strict rejection is correct at `src/save/validation.ts:615`–`:623`.

The recovery command checks disabled/local/kit/cargo conditions but never rejects an occupied hull. Two ordinary actions on the same retained earned checkpoint break different sides of the player–vehicle invariant:

1. **Tow while inside:** import the unchanged disabled export, open Hold and choose **Deploy Bobbin / local tow** without exiting the Dart. Resume briefly, reopen Hold and Save. Recovery moves the hull after the player pose has been copied from it. Each sampled active tow step leaves a **0.11666666666667 m** separation; validation permits at most **0.01 m**. The independent rule replay fails encoding on the first step and all sampled steps through 120. The production UI reproduces the save rejection after 32 active ticks (25285 → 25317) and disables automatic saving.
2. **Salvage while inside:** import the unchanged checkpoint again, deploy the buoy, transfer reserve cell `item_10` and meal `item_17` from the Dart hold to the diver, then choose **Salvage empty frame locally**. All commands are offered and succeed while the panel is paused. The hull/hold disappear and the frame investment returns to the buoy, but the player remains `mode:"piloting"`, `controlledVehicleId:"dart_16"` with no such vehicle. Immediate F5 fails at tick 25285. The normal exit path cannot resolve the missing craft; further ticks do not repair the dangling ownership reference.

**Player consequence:** following the offered recovery workflow prevents Save/export of current progress; a failed local write switches off autosave. Salvage also removes the hull the player still supposedly controls. The failed tow write preserved the previous valid journal, so this is loss of saveability/current progress, not evidence that the prior valid save was overwritten. The generic advice to export cannot rescue an invalid live state.

**Reproduction evidence:** `recovery-repro.mjs`, `recovery-result.json`, `salvage-result.json`, `recovery-console.log`; actual UI `browser-tow.json`, `browser-salvage.json`, `browser-tow-refusal.png`, `browser-salvage-refusal.png`, and accumulated `browser-final.json`. An initial same-file upload/hidden-panel salvage attempt did not execute and is excluded; the retained successful reproduction follows a fresh actual Import action, confirmed import and visible panel commands.

**Recommended correction:** reject occupied tow/salvage atomically with a clear safe-exit/local-collar instruction, or deliberately implement a coherent, physically safe occupant transition if occupied recovery is intended. Keep pressure/exit restrictions intact. Add regression coverage for immediate command save and every moving tow step, including occupied salvage and preservation of inventory/hull identity on refusal. **Do not loosen the validator.** The earlier negative-health fix is distinct and does not address this defect.

## M1-ASTRA-R1-02 — P2: distraction beyond the world boundary blocks saving

**Classification:** implementation defect; core blocker.

**Source:** `src/sim/step.ts:112`–`:117` creates the acoustic target 16 m ahead with no boundary check. `src/save/validation.ts:29`–`:34` and `:290` require it to be a world position; `src/sim/world.ts:7` sets maximum X to 188. `src/runtime/session.ts:295`–`:327` disables automatic retries after a rejected write.

**Reproduction:** use the unmodified earned preparation checkpoint and final production simulation rules. Turn north and sprint 250 fixed ticks off the ramp; turn east and sprint 2030 ticks. The complete bounded look/move command trace is in `distraction-result.json`. No position, inventory or threat state is injected. The resulting player position is approximately **`(176.002279912, -0.5075, -3.982959458)`**, and the state encodes successfully. Execute the ordinary `distraction` command facing east. It reports success and stores **`(192.002279912, -0.5075, -3.982959458)`**; immediate encoding now fails. After its 12-second expiry, encoding succeeds again.

**Player consequence:** an allowed defensive action near a reachable map edge makes Save/export unavailable for the active distraction. A manual/autosave attempt in that window disables subsequent autosaves until explicitly retried, even after the transient invalid position expires. The latter behavior follows the inspected session implementation; a fresh browser boundary route was not run.

**Evidence:** `reproduce.mjs`, `distraction-result.json`, `distraction-before.json`, and explicitly invalid derived `distraction-after-invalid.json`. This is independent executable command replay from an earned author checkpoint, not fresh browser play or seeded progression.

**Recommended correction:** choose a valid in-bounds target or reject the command atomically before changing threat state. Cover all world edges, immediate saves and active-distraction ticks. Preserve strict save validation; do not broaden accepted world coordinates just to admit this command's malformed result.

## M1-ASTRA-R1-03 — P2: cache visuals survive New/import without matching state

**Classification:** implementation defect; presentation lifecycle blocker.

**Source:** `src/render/expedition.ts:855`–`:878`. The cache map only visits IDs present in the incoming state. It never removes/disables absent IDs, unlike the vehicle cleanup at `:797`–`:801`. The renderer persists across session entry/import in `src/runtime/app.ts`.

**Reproduction:** the independent NullEngine probe creates a populated cache, presents a fresh `createGame()` state with no caches, then presents `null`. The old cache mesh remains enabled in both replacements; full scene disposal finally removes it. Production confirmation imports two labelled synthetic valid envelopes without reloading the page: populated `cache_review` at `(0,-3,3)`, then an otherwise matching empty-cache session. Both use the same camera route. The journal after import contains **`recovery:{operation:null,caches:[],losses:[]}`**, and the inspect prompt disappears, but the old lime cache stem and ochre box remain rendered in front of the player. Actual camera settles to ramp support identically in both captures.

**Player consequence:** New/import can show cargo markers belonging to a previous expedition, with no corresponding interactable cache or contents. Repeated session replacement retains obsolete geometry until renderer disposal, undermining trustworthy recovery navigation and lifecycle cleanup.

**Evidence:** detached `cache-repro.mjs` / `cache-result.json`; synthetic setup `cache-stage.mjs`, `cache-stage-populated.json`, `cache-stage-empty.json`; actual production `browser-cache-populated.png`, `browser-cache-empty-ghost.png`, `browser-cache-empty.json`, `browser-final.json`. No earned-loss claim is based on the synthetic setup.

**Recommended correction:** dispose/remove absent cache IDs whenever state changes, including null/New/import, while preserving ownership of shared materials. Add a lifecycle regression that replaces a populated-cache session with a fresh/empty one and repeats the transition.

## Remaining assessment and explicit proof limits

The overall registry, protected maintenance separation, shared simulation authority, strict schema2/content `expedition.2` validation and explicit foundation migration are substantive improvements. The final health saturation is present at the three relevant damage sites; the new recovery failures above are not a claim that the negative-health correction failed. Focus/transfer feedback, actual aperture construction, optical air volumes and semantic hull/camera orientation received code/artifact scrutiny; no additional blocker was established in those areas. Early-order clues and observations/hypotheses were checked without requiring or revealing later-campaign knowledge. Local original audio settings/captions/activation and directional-versus-centred event handling were inspected and covered by passing tests; the host was muted.

The combined author expedition/recovery/carrier records provide substantial ordinary-input and seeded-fixture evidence with retained branch identities. Their claimed comparison counts are **author/coordinator results**, not fresh reviewer replays of the complete matrices. This review independently checked final build identity, inspected real images and reproduced the listed failures. It does not turn the disclosed non-exact boarding reconstruction into exact proof or count excluded partial clips/misnamed cuts as successful transitions.

Disclosed gaps do not need new M1 requirements invented around them:

- Actual ordinary geometric construction refusal was not isolated because the existing-hull guard ran first. Detached production-world/synthetic-solid conservation checks remain diagnostic. Likewise, thin throat blockers use labelled rule checks; actual craft obstruction and seeded rollback provide different evidence. These limits alone are not an additional batch blocker in this bounded review, but must remain visible in integrated verification.
- Healthy battery exhaustion was not awaited for hours. Zero-power diagnostics and consumption evidence do not become a natural full-duration exhaustion run.
- Carrier work is seeded physical feasibility, not campaign acquisition or registration of a mobile refuge. Deep/all-fleet recovery, designated mobile-refuge fallback, M2–M4, six fleet roles and the intended ten-hour campaign remain obligations. No requirement is silently removed or demanded prematurely here.
- SwiftShader, muted-host artifacts and scripted routes establish neither representative consumer-GPU performance nor audible mix, fresh-player learning, enjoyment or human duration. These remain later verification/playtest needs, not unreported proof.
- The large production-bundle warning and the disclosed low development-dependency advisory remain nonblocking technical follow-up. No speculative art-density or close-camera occlusion issue is promoted to a new defect.

No separate missing-required-proof blocker is asserted beyond the three demonstrated implementation defects. Neither batch can be accepted while its listed blocker remains; fixes and a fresh paired round are root-owned next steps.

## Evidence retention, hashes and owned-resource closure

All new temporary artifacts are under **`/tmp/siltwake-m1-batch-r1-astra/`**. Reproduction scripts import the candidate's `.test-build` modules generated by `npm run check`; they write only this temporary directory. Original author artifacts/analyzers were not modified. `SHA256SUMS` covers every retained review payload; manifest SHA256 is **`e17d65854454178c98dc0283a7372a805f5011aa2d7dfbab37611136e36f7c42`**.

| Review evidence | SHA256 |
| --- | --- |
| `recovery-result.json` | `909298201a7277e977baaeb971bd24093d8f1ac50142d5bf02d8d9c4be01386e` |
| `salvage-result.json` | `e47d534831a4fb178ee03844fa444d9df6efdcb61838d24d7f228cfccdf1e9ee` |
| `distraction-result.json` | `2855ddf5ad1e2a185a75455d8978660c3a22c4f5dd88c8ad0900f8c00365c906` |
| `cache-result.json` | `179a3779fe4e6379b299236aa19163fa95a947ede3817620aa77e998c4bb5a13` |
| `browser-final.json` | `93149bef6f5eac8d5716fe12c3669fa2caad41ee8e25b4f68d73df286e109910` |
| `browser-cache-empty-ghost.png` | `0c01aa23daa51fd422731ebc8b3375294a587e05cc577d1d97a4b640734e4ac9` |
| `browser-tow-refusal.png` | `06f9a29b97a344e18adf72bee80f280a02c92d57620cfe0f8d8239c466e28620` |
| `browser-salvage-refusal.png` | `5e6d8cfe29cd2120d7f7ef9d921817d4b9a0ec90eb8d758fb88a4ec77d560625` |

Independently recomputed input archive hashes are retained in `input-hashes.txt`: combined expedition `a9f1c598f7dcf131a5133339439ad7c2d39b3c0605b42fd8707a755e341163f8`, combined recovery `af7503a802f1ba4159b25f6770cdef3c45f4363832b4786191e62685c2ac8abf`, combined carrier `40967b3044db4017d6a9715b911e3520692337cad4fa357ea3fd29e7235a0819`, render `81d8030fa27c801f2f35784b8abfae04e5ebf60a76f3bd9916bc9575179e6f4c`, final CR1 `335120dcea0818ed9000381c9602f32b3965886ac0acaadfd72516e2de49e2dd`. Paths are the corresponding supplied `/tmp/siltwake-m1-*-artifacts.tar.gz` archives, with carrier inside `/tmp/siltwake-m1-combined-carrier/`.

Both browser-rule files were read before browser work. Verified **factory-worker Linux** and actual Linux Chrome-headless-shell process 827911 under T3 serve 811435; shared browser host preserved. Used T3 preview status/open, one task-owned incognito tab, and port **5195 checked free before launch**. Final renderer was ANGLE Vulkan SwiftShader Subzero, Chromium 154, 1280×800 CSS, DPR2, Rich quality; no physical desktop cursor or pointer lock was used.

Owned tab **`tab_25_0430977b-1ed3-45f2-ac72-3683f9fe8942`** closed normally through `t3_preview_close` with no error. Owned preview session **9512** stopped with Ctrl-C (exit 130); `ss` confirmed **no listener on 5195**. No recordings or active controller remain. `closure.json` records the handoff. Historical tab14, user/peer/shared resources and parent checkout were untouched. No delegation, peer polling, push, PR or merge occurred.

Only this assigned report is authored and committed in the repository. Review work ends with this independent initial handoff; root coordinates disposition and any next round.
