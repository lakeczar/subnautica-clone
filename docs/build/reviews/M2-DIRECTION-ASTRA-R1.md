# M2 direction — independent Astra review R1

2026-10-18. **ACCEPT all seven criteria for the bounded planning deliverable.** No direction-level defect or required correction found; finding IDs: **none**. This accepts the proposed direction, not any unbuilt feature, implementation contract, playable milestone or stage1 closure. OS2-01 remains a separate blocker. The pending Opus consultation was neither awaited nor treated as an established algorithm.

## Identity, revision and ownership

- Requested selection: **gpt-6-astra / xhigh**, fresh non-author reviewer. I did not author the proposal and did not contact peers, read the independent Sol report or create children. The coordinator's support in [root inspection](M2-DIRECTION-ROOT.md) is context, not this verdict.
- Actual runtime: the injected T3 runtime reports **gpt-6-astra / xhigh**. Independently read the matching session's `turn_context`: `model: "gpt-6-astra"`, `effort: "xhigh"`, cwd `/home/worker/.t3/worktrees/subnautica-clone/t3-edc133ff`. Receipt: `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T15-57-06-01a150cd-caa5-7170-8190-609e563b40d0.jsonl`; session `01a150cd-caa5-7170-8190-609e563b40d0`.
- Live `orchestrator_capabilities` returned inherited provider `codex`, model `gpt-6-astra`, and availability of `xhigh`. Catalog defaults are not evidence of this turn's effective effort; the turn context is. Task key visible in the returned parent-thread binding: `siltwake-m2-direction-astra-r1-30c6bf9`.
- Clean exact dispatch parent: **30c6bf9abef81c73acba3470a7104c05cdb32c1a**, branch `t3/review-m2-direction`. Proposal commit **4478b806b4ce2d409daab18c74aa3666137c6f6f**, direct parent/diff base **89e271bb8f98bef413afa9c77d8ceabff67e9790**. Both candidate documents are byte-unchanged between proposal commit and dispatch parent.
- Production identity: the entire non-`docs/` diff from **d9aaf6356cb320f283887922abf97ed8bdc54f59** to dispatch parent is empty. The proposal commit changes only its two assigned documents; later dispatch-parent changes are build/review records.
- Sole tracked ownership: this report, `docs/build/reviews/M2-DIRECTION-ASTRA-R1.md`. No production/test/config/shared-record edits, browser/server, new captures, push, PR or merge.

## Independent assessment

Read AGENTS and STATUS, then PLAN/CONTRACTS, the [revised input](../../../prompts/BUILD_GAME_REVISED.md), its specification pointers, settled decision map, glossary and historical tracker. Reviewed the [original assignment](../tasks/M2-PREPARATION.md), [candidate](../design/M2-DIRECTION-PROPOSAL.md), its labelled narrative companion, labelled canon, root objections, [Opus stage1 R2](OPUS-STAGE1-R2.md) and [disposition](OPUS-STAGE1-R2-DISPOSITION.md), [M1 carrier disposition](../evidence/M1-CARRIER-INTEGRATION.md), [economy proposal](../design/ECONOMY_CANDIDATE.md), adopted [M1 delta](../design/M1-PLAY-ECONOMY.json) and relevant production source. Protected narrative details are intentionally absent from this report; no spoiler-sensitive contradiction requires an appendix.

### 1. Current production versus proposal — ACCEPT

The gap table is accurate at the frozen parent. Static registry inspection independently counts **seven region IDs, six hull IDs, nine recipes and 20 sources: 16 material plus four food**. Only alloy, glass, membrane, crust and resin are placed. `src/sim/world.ts:7` establishes **264 × 250 m** bounds, and `terrainHeight` constructs one split-peaked island form while source coordinates modify its heightfield. Named regions are not implemented regions.

`src/save/validation.ts:608` rejects campaign docking, non-Dart vessels and multiple campaign hulls. `src/sim/progression.ts:344` supplies only 60/150 m personal limits; survival uses initial hull ratings. Recovery is Dart-specific and its approach guide moves directly while towing uses physical sweeps. The proposal correctly distinguishes these mechanics from full rescue topology, authored fleet missions, regional scene disposal and campaign machinery. Current carrier feasibility is not presented as earned construction or registered-home recovery.

Historical POLISH-1C geometry/NullEngine numbers match their source report. Opus's approximately 3/13.7 fps Rich/Light measurements retain SwiftShader provenance. Proposed density, draw-call and timing budgets are explicitly trials; none is advertised as measured target-GPU performance.

### 2. Complete scope and causal expeditions — ACCEPT

Sections 1–2 and 8 retain seven habitats, three walkable islands, all six useful piloted hulls, Bobbin, food without thirst, evade/deter encounters and repeated recoverable loss. The matrix gives each hull a reason to be preferred: fast compact reconnaissance, bulk/service work, quiet observation, surface supply transport, protected deep work or relocated habitation. Materials belong to recognizable source conditions, and returns yield knowledge, equipment or useful infrastructure.

The independent Creel/service-stop route and carrier/Mantle route remain viable targets. The proposal explicitly requires a Creel-first completion without Dart; the first benchmark's Dart run is therefore a bounded verification choice, not a permanent campaign prerequisite. Hush, Spindle, every module and personal journals remain optional for completion. Hearthline uses early materials and complementary investigations with several substantive outings remaining. Its acquisition timing and convenience still require measurement. Cooking/crops, module choices, transferable early investment and furnished home services remain due; neither empty travel nor repeated shopping substitutes for missing content.

### 3. Canopy–Basin benchmark and OS2-04/06 — ACCEPT

Section 3 provides a usable first-batch exit: earned preparation, two Canopy approaches, a 160–175 m Basin ridge, investigation/salvage, alternate return, storage, actual reload and recovery. A suit350 precedes the deep exit; Dart180 already reaches that first shelf. Ordinary failure/return evidence is additional to matched diagnostic views.

I inspected retained Opus frames **44 and 48** directly from disk. Frame44 supports the near-floor wash concern; frame48 shows the 53.2 m Canopy view dominated by uniform teal water and the pale console. These stills do not prove motion, response timing or camera penetration. The proposed checks correctly separate geometry intersection from missing visual relief and call for inspection of actual float32 terrain triangles, actor support, camera near plane and interaction LOS. Root approval is required for view-origin/physics changes; no render-only camera displacement is assumed harmless.

`CANOPY_COVER` currently tops at Y−73, below the historical 53 m approach. The proposal identifies that concrete mismatch and requires reachable visible retreat/cover or a reconciled encounter approach. It preserves copied call origins and expiry, real-animal occlusion and accessible acoustic information. Matched approach/depletion/contact/cockpit scenes, warning telemetry, viewport/source/save attribution, a visible region edge and quality-preserved navigation make OS2-04/06 reviewable before breadth. Neither a horizon in every downward view nor unavailable GPU results are prerequisites for accepting this direction.

### 4. Modules, ownership and dependency sequence — ACCEPT

Sections 4–5 start with existing APIs and propose limited extensions: plain route descriptors, a capability query, explicit refuge resolution, small authored facility transitions and region-owned render handles. They reject a general quest/ECS framework and keep persistent state outside rendering. Pinning live encounters, recovery and transfers avoids silently completing or resetting them on art disposal.

The order fits four total slots: root plus A1; after root commits its inspected interfaces, root plus independent A2/A3 consumers; after composition, root plus two non-author reviewers. A2 and A3 have disjoint paths, start from committed A1 and cannot consume unfinished peer exports. They return independently. The later composition pass receives fresh explicit ownership, including any justified legacy-test amendments. The entire A1–A3 result receives one full-batch gate, with a separate integrated-M2 gate later.

A1 is broad in path count but bounded in outcome. Root inspection explicitly reserves a smaller contract-first slice if necessary. Actual exports, schema tags, camera/collision changes and final path grants are root decisions before dispatch. The proposal repeatedly says these are proposed briefs, not current ownership. Requiring those decisions now would confuse this advisory review with implementation-contract approval. No conflicting active owner or worker waiting chain is created.

### 5. Compatibility, economy and recovery — ACCEPT

Section 6 identifies the important migration trap: the current validator checks all source IDs, exactly four facilities, capacities, evidence provenance and Dart-only campaign ownership. Appending content before validating an old save against its old domain would reject valid progress. The proposed sequence freezes historical domains, validates old data, migrates once and strictly validates new state. It retains foundation/expedition versions and fixtures without converting fixtures into earned campaigns; preserves source stock, paid receipts, knowledge, charge, bound repairs, module IDs and transaction phases; and keeps atomic journals/writer exclusion. Schema3 remains a proposal, subject to stage1's eventual accepted changes.

The legacy trim exception is correctly explicit: `src/sim/modules.ts` retains the installed item in its hold, using **2 CU** and one socket. The older economy's zero-CU fitted rule cannot erase this investment or change a loaded save silently. Horizontal and vertical bounds, source-generated terrain, parked assemblies and the 1 MiB limit are named dependencies rather than hidden migration assumptions.

The tier sequence is coherent: Canopy≤150 supplies suit350; ceramic250–285/core280–320 precede 450; lattice360–390 precedes 800. First stock requires neither its own thermal nor chemical protection. Section 7 includes blueprint/bench/exit/return access, optional spending, changed M1 recipes, thin draft stock margins, carrier hauling, final repair payload, suit/seal/power costs and pre-refill minima. It labels both ECO arithmetic and the runtime M1 checker's staged positions correctly. Neither establishes ordinary-route solvency.

Recovery is required before each loss-capable route activates: shallow-built reusable kit, reachable staging, full tether path, exterior access, complete tow or physical salvage/canister outcome. Occupants, attached craft, cargo, advanced frames and modules remain conserved; repeated failures and reloads are explicit cases. Direct collar work preserves recovery without operating the remote where personally safe. Registered-home safety and fallback are new campaign obligations, matching the M1 disposition rather than laundering its seeded drills into acceptance.

### 6. M2 ending, M3 authorship and M4 critique — ACCEPT

Both strategies must reach the same functional canonical resolution in M2, with essential corroboration, legal consequential actions and a resolution scene. The labelled companion preserves causal ordering, local procedural information, out-of-order discoveries and irreversible paid state across interruption/unload/reload. Its machinery predicates depend on actual readiness, not optional journal playback or a compulsory carrier. I found no contradiction with the labelled canon.

M3 retains all C01–C15 authored placements, independent foreshadowing, voices/perspectives, fuller scenes, ecological treatment and meaningful finished hull missions. That is maturation of a functional M2 chain, not permission to defer its ending. M4 explicitly reserves the post-M3 dedicated Astra design critique, Sol corrections and focused re-review before final acceptance. Rough M2 presentation is bounded; no required final content is waived.

### 7. Review, playable checks and evidence exceptions — ACCEPT

Section 8 retains author checks, root artifact inspection, separate non-author Astra xhigh/Sol6.1 max full-batch reviews, correction rounds and separate integrated milestone review. Art/lore leaves are included. Four slots can hold root, the pair and Opus at stage exit without requiring extra concurrent authors. Opus5.5/high stage reviews, detailed advice, Sol corrections, applicable paired review and fresh Opus verification remain required; the dedicated post-M3 Astra critic remains additional.

The future evidence list covers both ordinary New Game→ending strategies, actual carrier habitation/registration and berth transitions, optional hull mission smokes, legacy saves, second sessions, food/recovery, deep loss, early/missed evidence and region lifecycle. Seeded mechanics remain diagnostic. Human ten-hour enjoyment/learning/comprehension, physical-mouse comfort, audible mix and representative-GPU performance remain unverified until genuinely observed. Functional omissions, missing rescue routes and blockers are explicitly excluded from evidence exceptions.

## Root objections and implementation boundary

All seven numbered root objections remain compatible with acceptance of this document. Stage1 must close before implementation; broad paths do not authorize edits; schema and minimal exports need root reconciliation; budgets need measurement; the benchmark cannot impose Dart on the Creel-first campaign; art disposal cannot reset persistent authority; and functional ending/recovery precede M3 density. These are retained implementation obligations, not newly discovered direction defects. No additional proposal correction is required.

## Commands and retained evidence

Actual read-only work, in addition to `cat`, `sed`, `nl`, `rg` and `rg --files` over the paths discussed above:

```sh
pwd
git status --short
git rev-parse HEAD
git branch --show-current
git diff --name-status 89e271bb8f98bef413afa9c77d8ceabff67e9790..HEAD
git diff-tree --no-commit-id --name-only -r 4478b806b4ce2d409daab18c74aa3666137c6f6f
git show -s --format='%H%n%P%n%s' 4478b806b4ce2d409daab18c74aa3666137c6f6f
git diff --exit-code d9aaf6356cb320f283887922abf97ed8bdc54f59 HEAD -- . ':!docs/**'
git diff --exit-code 4478b806b4ce2d409daab18c74aa3666137c6f6f HEAD -- docs/build/design/M2-DIRECTION-PROPOSAL.md docs/build/design/spoilers/M2-NARRATIVE-GATES.md
```

Both `--exit-code` comparisons exited **0** with no diff before this report was written. Inline `python3` scripts independently counted registry definitions, checked all **35 local candidate-document links** (zero missing paths), read the matching session's model/effort metadata and verified the retained Opus manifest. The initial `python` invocation failed because that executable is absent; the corrected `python3` metadata inspection succeeded. These are source/document/artifact checks, not game tests.

The manifest audit checked **220 payloads / 51,606,345 bytes**, with zero missing, length or hash mismatches. Manifest SHA256: `724610ba6d957768e39bfd565d98b96f1e2f7de65dbb1165f955cf67243aeb45`. Two existing files were visually inspected with `view_image`:

- `/tmp/siltwake-opus-stage1-r2/frames/44-browser-screenshot-127-0-0-1-mve9w6b2-7e766f81.png`
- `/tmp/siltwake-opus-stage1-r2/frames/48-browser-screenshot-127-0-0-1-mvea0xno-3f2da0b6.png`

These retain the original Opus source/build, synthetic-input, SwiftShader and muted-audio limits. I did not watch complete clips, re-run author diagnostics, execute a game test/build/economy suite, open a browser or obtain new playable evidence. No unbuilt M2 system is accepted by these checks.

**Disposition:** ACCEPT, criteria 1–7. No finding IDs or required corrections. Only this report is delivered; its path is released on commit/return. No owned browser, server, recording, background process or child task remains.
