# SPACE-1 complete independent review — resumed R1

**Reviewer verdict: ACCEPT the entire bounded SPACE-1 renewal/progression batch on frozen candidate `d8a812ed3008d8950a0bdd3f9fe59caa6762e545`.** All seven criteria below receive ACCEPT. No blocking correctness, conservation, migration, presentation or scope defect was found. Coordinator concurrence remains a separate part of the acceptance gate.

This is a new full review, dated 2026-10-19, following worker recovery. The interrupted review on `2b1a252` produced no verdict and is not counted as acceptance. Its evidence and clean `t3-e1f5656e` checkout were preserved. This report does not accept the unfinished fleet/campaign, human experience or dedicated-GPU performance.

## Identity and scope

- Actual reviewer: **`gpt-6.1-sol`, `xhigh`**, verified from the original runtime `turn_context` before substantive review, alongside the live model catalog and T3 binding. The catalog's default effort is not evidence of this run's effective effort.
- T3 thread: `thread:delegated-task:command%3Amcp%3A2cbf186c-627f-4d86-933f-50a2dde43454%3Adelegate-task%3Asiltwake-space1-sol-xhigh-resume-r1-d8a812e`. Own receipt confirms a subagent relationship, model, branch and worktree. No children or peer messages were used.
- Initial checkout: clean `t3/space1-acceptance-review`, `/home/worker/.t3/worktrees/subnautica-clone/t3-10bb8614`, exact parent/candidate `d8a812ed3008d8950a0bdd3f9fe59caa6762e545`.
- Review base: `e2a9d04ae7a47657b7336b8a2ec8fc44af6128a2`; it is the merge-base. Reviewed the complete SPACE-1 source/test/progression change and its retained-region composition, not only the final six-file correction. Later recovery/infrastructure records do not change the game source and are not an infrastructure acceptance here.
- Production `eb712f1527439ec1f38f2c52ef61ac78989ba74c` remains identical to final author `e4062aeaaba1d44a139269bc8d752e74b0a82c5e` and this candidate's production inputs. All **27** independently rebuilt payloads match the author/root build. Main `index-t0ZyIhsg.js` SHA256: `b3f2d8020b4dbc5d6ffdf1b0de4c173902202989218fdeebcf6f1746086c817b`.
- Private evidence: `/home/worker/.local/share/siltwake-evidence/space1-sol-xhigh-resume-r1/`. `binding.json`, `runtime-and-release.json`, `build-comparison.json` and `source.diff` bind the work. `MANIFEST.sha256` seals the evidence payloads. Builds/compilation used disk-backed `/work/tmp/space1-sol-xhigh-resume-r1/`.

Read AGENTS, STATUS first, PLAN, CONTRACTS, MODEL_POLICY and the independent gate; revised build input and relevant integration/world/fleet/graphics/story specifications; both SPACE-1 briefs; original, staged, reconciliation, composition and root reports; progression matrix and research; worker recovery record; and M2-A review/disposition. The current single Sol/xhigh policy governs this review. The code-review skill's Standards and Spec axes were applied locally under the explicit no-children instruction.

## Criterion dispositions

| # | Criterion | Disposition | Evidence and practical limit |
| --- | --- | --- | --- |
| 1 | Bounded living renewal | **ACCEPT** | Four exact source IDs; reef yields 2 membrane/21,600 active steps per catch, Canopy 2 resin/36,000 per pocket, cap 12. Boundary, clipping, above-cap sorting, atomic cap settlement, finite-source, food and protected-allocation checks pass. |
| 2 | Correct clocks and persistence | **ACCEPT** | Only post-opening expedition steps advance renewal, independent of drawing. Pause/opening/menu/carrier/tick-gap/save/read/Continue tests, strict current-state refusals, journal no-write checks and complete boundary-crossing futures pass. New final-build browser receipts preserve stored progress through reload and replacement. |
| 3 | Historically strict migration | **ACCEPT** | Frozen original domain and helper inspection, 17 matching projections, identical validator body/saved types, 31,119 original-versus-frozen cases with zero mismatches, unchanged schema1/2 validators and meaningful old fixtures. Real earned export retains every old field and metadata, initializes four zero progresses and agrees through 600-step complete futures. |
| 4 | Truthful returning scenery | **ACCEPT** | Actual final WebGL imagery plus production regional-factory tests cover authoritative work faces, away renewal/retained return, Continue and same-page replacement. New final-build Canopy swim return and collection close the earlier source-version gap. New reef images cover in-view renewal/Continue/replacement; reef retained return remains production NullEngine evidence, not an ordinary browser route. |
| 5 | Earned progression and finite solvency | **ACCEPT** | Fresh/direct-command gates, all 120 clue permutations, both earned early orders and four economy invocations pass without renewal credit. Missing-C02 recovery hint is correct. Matrix distinguishes implemented/planned/unbuilt, exposes Basin reward drought and optional-spending membrane shortage, and gives concrete M2-B/C recommendations. |
| 6 | Concise, usable presentation | **ACCEPT** | One shared source legend, concise lifecycle/status labels, retained scan disclosures, truthful recovery hint and unchanged action/focus semantics. Final-build Notebook inspected; source/tests cover refused/empty states and focus/accessibility behavior. No early lore disclosure added. Human speech/readability/comfort remain unverified. |
| 7 | Integrated verification and honest scope | **ACCEPT** | Fresh clean compilation, 567/567 tests, typecheck, production build, economies, progression and independent migration probes all pass. Build identity and actual visual evidence are recorded. M2-A acceptance and its cold/menu/memory/human/GPU limits are preserved; no full-campaign or representative-GPU claim is made. |

## Standards

**No findings.** The change follows the documented state/registry/save boundaries and transactional behavior. Renewal is a small fixed-step module; rendering consumes authoritative stock and does not create it. The historical snapshot's deliberate duplication is necessary version isolation: replacing it with current registry/helper imports would weaken compatibility. No actionable additional smell was identified. Type/style issues enforced by tooling are covered by the successful checks.

## Spec

**No blocking or nonblocking implementation defect found in the bounded SPACE-1 change.** Research is attributed as background; it does not silently change the owner's resource rules or campaign. The findings below are explicit evidence limits and next-stage obligations, rather than claims that planned systems are implemented.

### Renewal, clock and transaction inspection

[`src/content/registry.ts:694`](../../../src/content/registry.ts#L694) contains only the two ribbon catches and two Canopy pockets. [`src/sim/renewal.ts:15`](../../../src/sim/renewal.ts#L15) settles progress when sorting reaches/exceeds the cap; line 23 advances by one active step, clips generation, discards progress at cap and preserves legitimate stock above it. [`src/sim/step.ts:335`](../../../src/sim/step.ts#L335) settles in the source transaction, and line 718 advances after action completion. Thus a sorting completion cannot bank progress behind a full source. Finite reserves, island drift resin, inorganic sources, tending and rescue-only stock keep their prior rules.

`tests/resource-renewal.test.ts` exercises exact boundaries, partial stock, reserve conservation, same-step sorting, active time while away, no catch-up from a large tick, paused/opening/menu/carrier exclusions, tending/rescue behavior and full future equality across a generation boundary. The runtime's pause/menu pathways remain separate from simulation steps. Current validation requires the exact ordered four-entry renewal domain, exact fields, integer interval bounds and zero progress when unopened, diagnostic or at/above cap ([validation:231](../../../src/save/validation.ts#L231), [validation:606](../../../src/save/validation.ts#L606)). Decode/encode rejection and journal atomicity tests pass without renewal normalization or storage writes on read.

### Historical validation and conservation

The schema3 path validates `expedition.4` with its own snapshot before adding zero progress ([codec:164](../../../src/save/codec.ts#L164)); [`migrateRenewal`:92](../../../src/save/codec.ts#L92) adds no stock, elapsed time or other capability. Historical schema1/2 validation and existing safety-relocation/notice behavior remain in place.

Independent inspection went beyond comparing the copied validator text:

1. Reconstructed **17** frozen domain exports from immutable original Git blobs at `dae17fcf38ae2e08cb778ebb4c0a04df92eeb072`. IDs, memberships, source quantities/provenance, recipe costs/prerequisites, item/module capacities, world bounds, carrier datums/berths and recovery attachments match. The validator body is identical after renaming its entry point; saved `Vec3` through `GameState` types match. Relevant original domain/helper files also match the accepted pre-renewal M2-A source. Schema1/2 legacy and foundation validators are unchanged.
2. Inspected copied helper semantics: inventory capacity, module item/installation checks, carrier support/distance and transforms, hull bounds/berths and recovery attachment rules. Frozen validation imports its own snapshot; it does not derive historical acceptance from the evolving current registry.
3. Transpiled all **52** original source files into an isolated original dependency graph. Compared its actual validator against the frozen validator on **23** unique valid seeds and **31,119** deterministic cases: unopened/opened/carrier/real-earned/retained affected-play exports, missing/extra fields, array completeness/duplicates, unknown identifiers and numeric/string/boolean mutations. **5,606 accepted, 25,513 rejected, zero mismatches or throws.** Accepted expedition variants also underwent add-only migration comparisons. This finite corpus supports the inspected semantics; it is not an exhaustive proof.
4. Reran migration of the unchanged earned schema3 export (SHA256 `45840e6659e9aed6a98d0c0eed67761f5af8dfaab8d9c32ea051f48d652b4e44`, tick 39,125). Every old field and metadata matches, including depleted sources, inventory, hulls, investment, poses, knowledge and clocks. Four zero progress records are added; encode/decode is idempotent and **600-step complete futures** agree.

Evidence: `frozen-domain-comparison.json`, `verify-frozen-domain.mjs`, `original-vs-accepted-domain.diff` (empty), `compile-original.mjs`, `differential-validator.{mjs,json,log}` and `earned-migration.{mjs,json}`. These are new/private runs; earlier artifacts were read/copied, never overwritten.

The three reconciliation literals are justified: `tests/carrier-migration.test.ts:76` now expects schema4/expedition.5, and `scripts/check-m1-economy.mjs:20` expects current expedition.5. Full-envelope conservation, relocation/refusal/idempotence assertions, historical expedition.3 adoption and historical proposal hash remain. Other fixture changes remove only asserted-pristine zero renewal when constructing genuine old-domain inputs, then compare the exact declared additions. They do not launder paid/depleted content or weaken meaningful historical assertions.

### Final production visuals and workflow attribution

Browser rules were read before browser work. T3's one owned **incognito** tab ran on verified **factory-worker Linux**, using the exact rebuilt `t0ZyIhsg` artifact at an initially free `127.0.0.1:5190`. The browser process was the local T3 chrome-headless-shell; actual WebGL renderer was **ANGLE/SwiftShader**, not the RTX 3090. No browser flags, shared hosts, human tabs or physical desktop input were changed. Drag look, file import, page-local keys and E collection used the production UI handlers; no app-state setter or RAF override was used.

The new routes begin from clearly labelled **accelerated diagnostics derived from the unchanged earned export**. `make-inputs.mjs` records the changed pose/mode/velocity, selected stock/progress and envelope metadata. The selected progress starts 120 active steps before a boundary. Subsequent swimming/collection uses ordinary controls, but this is not an ordinary fresh-start route or proof of the full six/ten-minute pacing. `browser-results.json` and `synthesize-evidence.py` pair raw stored journals with the inspected screenshots and assert their material states.

| Final-build observation | Authoritative receipt and actual inspected imagery |
| --- | --- |
| Canopy renews while retained, then returns | `canopy-away.json`: tick 40,090, upper pocket stock 2/reserve 8/progress 845, Canopy retained and undrawn. From input tick 39,125, 965 active steps equal the 120-step lead plus 845 remainder. Actual W swim returns to an active Canopy and the aimed collect prompt; `canopy-ready.json`, `canopy-return-aimed.png` show nodules in the host at tick 41,169. |
| Canopy reload/Continue and collection | Pre-reload and reloaded-menu raw journals are byte-identical. `canopy-continued.json` retains the saved state; `canopy-Continue.png` shows stock. E collection yields exactly **2 public resin in diver inventory**, source 2→0 with reserve 8 unchanged, over 16 saved active steps; `canopy-collected.json`, `canopy-collected-host.png` show the empty persistent cup. |
| Same-page Canopy replacements | Imported exact captured saves: `canopy-replacement-regrown-verified.{json,png}` has stock 2, and `canopy-replacement-empty-verified.{json,png}` has stock 0. Full captured stored states equal their respective input files. The cup/stains persist; collectable nodules disappear. Both captures are paused final-build states at the same view, not base-versus-feature images. |
| Reef in-view renewal, Continue and replacement | `reef-regrown.json`: tick 39,293, north stock 2/reserve 12/progress 48; 168 active steps equal lead 120 plus remainder 48. `reef-regrown.png` and `reef-Continue.png` show the work face; the stored journal is unchanged across this Continue capture. `reef-replacement-verified.{json,png}` equals the labelled same-pose empty diagnostic and hides the ribbons while the lee rails/host scenery remain. |
| Concise Notebook | `notebook.{json,png}`: one shared legend, 11 source rows with lifecycle distinctions, native optional Field scan disclosures and `panel-return` focus. This capture does not independently establish future-plan wording; source/tests and the attributed author plan capture do. |

[`tests/renewal-render.test.ts:53`](../../../tests/renewal-render.test.ts#L53), independently passed in the full suite, drives the **actual production regional factory** under NullEngine: empty start, away boundary/near-miss, retained mesh identity/reattachment for both materials, same-page depletion replacement, same/fresh-renderer Continue and no work face without stock. This is accelerated simulation/render evidence, not WebGL appearance or ordinary travel. Final WebGL images establish appearance; the production test establishes the missing reef retained-return behavior. Combined with source inspection, this is proportionate evidence for criterion 4. No ordinary browser reef retained-region return is claimed.

I also inspected the original final author images 09/10/11/12/14/16 and trace summary. Ordinary collection/pause/import there used pre-final `BuHXn-SG`; the prior Canopy retained-return/collection used pre-host `bc6AYNw6` and accelerated progress. Final `t0ZyIhsg` images show in-view renewal, pocket Continue and replacement. Images 09/10 are diagnostic empty/regrown states, the latter paused, not matching base/feature captures. `browser/trace.json` remains a summary rather than a continuous raw-input/export trace. The author's excluded suffocation interval stays excluded. Bounded route samples do not establish global inaccessibility.

Tool/setup incidents are retained in `incidents.json`. Initial `about:blank` preview opening was rejected and corrected. One 17.5-second page timer exceeded the evaluate tool's 15-second wait, but released the movement key and paused normally; later receipts confirm the outcome. Early replacement attempts cancelled pending import or did not retrigger same-file input, so their images/receipts are **excluded**. Corrected menu-picker→confirmation→settled-import sequencing produced the `verified` receipts above. ReadPixels software-renderer warnings are not hardware timing evidence. There was no game failure in the accepted new observations.

### Earned progression and useful future work

The fresh checklist ladder correctly exposes four current rows after opening; only pod repair is initially attemptable with its materials. Rich-material direct commands cannot bypass blueprint, predecessor/capability or bench gates. All **120** C02–C06 permutations converge; the two finite exposed-stock earned sequences fabricate all ten current recipes without sorting/renewal. C05/C06 plans remain research, with construction unavailable, and do not become fabricator rows. The Bobbin hint at [`src/ui/panels.ts:336`](../../../src/ui/panels.ts#L336) routes unknown plans to the reef intake and known plans to the pod.

Current required demand is **14 membrane / 6 resin** against **48 / 64** finite placed units. No required-solvency check credits renewal. The [progression matrix](../design/PROGRESSION-CURVE.md) separately covers personal tiers, all six hull roles, Bobbin, mobile homes and service conveniences, with implemented/planned/unbuilt status and useful missions. Planned carrier controls remain a diagnostic; this batch does not earn/build the whole fleet.

Actionable carry-forward items, already exposed by the design record, are not current SPACE-1 blockers:

| Priority / boundary | Location | Required follow-up and verification |
| --- | --- | --- |
| **P1 before M2-B/C finite-solvency acceptance** | `docs/build/design/PROGRESSION-CURVE.md:25`, `:114`; source roster `src/content/registry.ts` | Place the specified second finite membrane habitat or reconcile costs. Planned base strategies need 45/48 membrane; optional spending raises this to **53/59 against 48**. Recheck both earned strategies and optional purchases with zero renewal credit. Waiting must never repair the budget. |
| **P2 M2-B progression payoff** | `docs/build/design/PROGRESSION-CURVE.md:98`, `:100`, `:102` | Give Basin cargo an early earned Creel/service mission; reconcile unlock piles and the candidate's unrelated optional-buoy prerequisite before adopting future recipes. Verify a useful expedition/return between upgrades. These are recommendations for root reconciliation, not newly adopted campaign rules. |
| **P2 next ordinary-route/experience evidence** | `tests/renewal-render.test.ts:80`; browser evidence above | Add an ordinary browser reef away/return sample with source-bound inputs and raw exports before/after the boundary. Keep it distinct from accelerated setup; do not relabel current NullEngine or Canopy evidence. This improves the route evidence but is not additional blocking evidence for this bounded verdict. |
| **P1 before wider retained-world construction** | M2-A [disposition](M2-A-SOL-XHIGH-R1-DISPOSITION.md), especially its region-cost limits | Define first-entry/menu responsiveness budgets, measure retained memory/eviction and multi-hull lifetime, then reassess as regions grow. Preserve the unchanged 50 ms warm-path predicate and its accepted bounded population; this review creates no new timing population or universal guarantee. |

## Independent checks and retained limits

Fresh test compilation used an empty disk-backed output, serial Node execution and `NODE_OPTIONS='--max-old-space-size=960 --max-semi-space-size=16'`. `checks.json` records commands, exits and elapsed time; individual logs preserve output.

| Check | Result |
| --- | --- |
| Clean dependency installation; TypeScript typecheck and test compilation | PASS |
| Complete serial suite | **567 passed; 0 failed, cancelled or skipped** |
| Production build and author/root payload identity | PASS; **27/27** equal |
| M1 economy and design economy | PASS |
| M2 fresh and unchanged completed-earned input economies | PASS |
| Progression checker | PASS |
| Author evidence manifest | **55/55** payloads verified; manifest SHA256 `d5da2205b7183b0a33e3b1dae4f7b20c11daddd01820f19b66d76c895113779d` |
| Original/frozen migration comparisons and real-earned future equality | PASS as detailed above |
| Final production visual/workflow receipts | PASS for the attributed observations; stale attempts excluded |

M2-A remains accepted on `51c4dcd82755b53c4c3914dc2e4220ec0d701ff4`; its original first-entry/menu blocking, retained-memory/eviction, human/audio and representative-GPU limitations remain. This review checks affected composition without reopening its unchanged full gate. Current two-drawn/four-total-region retention is not proof of later-world scaling. The required planned **2.0×1.8 km world** is preserved; the compact benchmark is not rescaled by this feature.

Human pacing, route learning, input comfort, audio mix, screen-reader speech, enjoyment and duration remain unavailable. GPU passthrough has not occurred; SwiftShader captures cannot establish representative-GPU performance. No full-campaign, all-fleet, both-ending or ten-hour completion is claimed. These are explicit later-stage evidence requirements under the documented qualified-release rules, not silent passes.

## Handoff and resource release

Only this review report changes tracked repository content. No production edits, pushes, PRs, children, peer messages, shared-record edits or infrastructure changes were made. The one owned incognito tab was closed through T3's normal lifecycle; the owned Python 5190 server exited normally and the port refused a connection afterwards. The app browser host and other sessions were preserved. The temporary checkout compilation symlink was removed. Private evidence and inert disk-backed build output remain available for coordinator inspection; no owned server/test/browser task remains running.

**Standards: 0 findings. Spec: 0 implementation findings. Overall reviewer ACCEPT; four explicit next-stage/evidence follow-ups above.**
