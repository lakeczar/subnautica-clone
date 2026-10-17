# Delivery choice and evidence gates

The owner selected a gaming PC or laptop with a dedicated GPU and allows richer scenes. The planning choice is **strict TypeScript, Vite and Babylon.js, delivered to a desktop browser through WebGL 2**, with keyboard/mouse controls and a self-contained static build. This follows the [platform investigation](research/01-platform.md) and the actual cel art study. It is an engineering choice under the owner's delegation, not a measured claim about the expanded game. Native packaging can be considered later if a documented delivery constraint warrants it; developing two engines in parallel is outside the baseline.

The target is 1080p/60 fps on a documented mainstream dedicated-GPU machine at a useful quality preset, plus an adjustable lower preset. Record the actual GPU, CPU, memory, OS, browser, resolution, device-pixel ratio and settings before claiming a pass. A minimum GPU specification cannot be established from the current software-rendered art evidence.

## What has and has not been demonstrated

The prototype at `20711d1` builds and renders original/refined voxel and cel studies. The refined cel study contains 49 meshes and 122,973 vertices. Twenty matched captures cover two styles, two revisions and five viewpoints. The environment was isolated Linux Chromium 154 with SwiftShader software WebGL 2. The package is a disposable art viewer, not production architecture.

Gameplay, full-world streaming, walking interiors, boarding/collision, save/load, deep recovery, consumer-GPU performance and a ten-hour campaign have not been demonstrated. This planning run defines the checks that must establish them during construction. It does not execute the game build.

## Early technical gates

Before producing the whole world, make a representative linked expedition with the selected cel assets, one island, waterline transitions, a small craft and a simplified carrier berth. It must cover swimming/walking/vehicle control, collisions including high-speed sweeps, food/air/power, collecting and crafting, boarding, save/reload and recovery. Use ordinary inputs for the acceptance run. Simulation shortcuts can diagnose failures but cannot count as the playable demonstration.

Test station-kept carrier interiors and docking before detailed furnishing. Attach docked craft in carrier-local coordinates, preserve independent state, use isolated dry berths and a launch lock, and handle interrupted docking atomically. Demonstrate blocked launch, player death inside the carrier and save/reload in each transition. Test underway walking separately; the accepted design baseline requires station keeping before leaving the helm. This gives a complete mobile-home experience while keeping moving interiors an explicitly gated extension.

Profile an integrated garden-to-basin expedition with flora, fauna, silt, distant landmarks and the carrier visible. Measure warm-route p50/p95 frame time, loading stalls and memory growth over repeated traversal. Use instancing/spatial batches, LOD, bounded active agents and chunk lifecycle before sacrificing interaction or landmark readability. Adjust quality settings to preserve the richer cel direction. If available hardware is software-only, finish functional checks and leave dedicated-GPU performance explicitly unverified.

If a gate fails, reduce the failing subsystem's complexity, fix it and repeat the relevant check. A platform change requires a documented specific failing constraint and a small runnable export/input/save comparison; it is not a speculative rewrite. Retain the six fleet roles, coherent mystery and complete gameplay loop. Record any unavoidable material scope change for owner review rather than silently deleting it.

## Milestones with playable exits

| Gate | Exit evidence |
| --- | --- |
| Foundation | Fresh checkout installs and launches; pinned versions, shared contracts, versioned save schema and reproducible checks exist |
| First expedition | New Game → opening → pod → reef/island investigation → habitat-specific gathering → craft/refit → return → save/reload; one readable wildlife encounter and a real failure/recovery path |
| Fleet and world skeleton | Carrier berth/interior tests pass; every region is reachable with intended capability progression; both main fleet strategies reach a placeholder-free functional ending through normal controls |
| Authored campaign | All six craft have a meaningful mission, C01–C15 are placed and handle early/missed evidence, food/recovery and both complete paths work; every required asset and interaction exists |
| Polish and release candidate | Refined cel visuals and audio/HUD/settings are coherent; normal-input start-to-ending, second-session, recovery and save-resilience checks pass; no blocking defects; performance evidence is qualified by actual hardware |

The skeleton gate may use rough art, but a functional ending must already resolve the mission. Later visual/story polish cannot serve as an excuse for disconnected systems. The five-act structure and roughly ten hours are targets; the build must not label an abbreviated demo as the full campaign.

## Independent review gate

The Astra `xhigh` coordinator remains responsible for the whole game, integration and self-review. Acceptance additionally requires **two independent subagent reviews: `gpt-6-astra` at `xhigh` and `gpt-6.1-sol` at `max`**. Verify both selections against the live catalog and record the actual model/effort; report an unavailable selection and leave this gate pending rather than silently replacing it.

1. Apply this gate to every completed feature or bounded delegated deliverable batch (including graphics and lore), and to each integrated milestone above. Name the batch and its acceptance criteria when assigning it. Small related edits can share a batch; every delivered piece must be covered. Code can be staged for integration checks before review, but remains provisional until the gate passes.
2. Complete author checks and coordinator inspection, then freeze the candidate commit. Give both reviewers the same SHA, diff base, applicable specification, acceptance criteria, affected contracts, validation artifacts and known gaps. Each reviews the full acceptance scope, with complementary emphasis on cross-system/player-experience risks for Astra and implementation/artifact/test risks for Sol. Neither reviewer may have authored the candidate changes; the coordinator and author do not count toward the pair. Obtain separate initial findings before sharing one review with the other.
3. Review dependencies as well as the isolated output: geography/resource access, fleet usefulness, save/recovery behavior, lore consistency, actual visual interaction and performance where affected. Inspect executable or rendered evidence when behavior requires it. Follow the repository browser rules for browser work. A static review cannot establish runtime behavior.
4. The coordinator reconciles findings with the specification and evidence, fixes substantiated issues, and records a reason/evidence for any rejected finding. Re-run affected checks. Send both reviewers the revised frozen SHA, changes, prior findings and dispositions, unresolved objections and updated evidence. For T3-managed reviews, start a fresh `delegate_task` each round with its own stable `clientRequestId`; retain returned task IDs. Resolve disagreements through evidence or a focused reproduction, leaving unresolved correctness/scope disputes open.
5. Pass only when both reviewers explicitly accept the same candidate revision, no unresolved blocking defect or scope violation remains, and the applicable playable checks pass. A review with missing evidence must state the limit. The documented human-playtest/dedicated-GPU exceptions permit a qualified release candidate with those criteria still open; two model reviews do not waive or prove them. Any subsequent functional, content or contract change invalidates affected acceptance and requires both reviews again.
6. Store a record under `docs/build/reviews/` containing batch/milestone ID, spec/base/candidate SHAs, reviewer task IDs, actual models/efforts, separate findings, fixes/dispositions, check results, remaining evidence gaps and both verdicts. Link it from build status and the relevant PR. Documentation-only evidence bookkeeping can cite the reviewed SHA without pretending its later commit was itself reviewed.

Respect the live concurrency cap: rotate authors out as their batches finish, run the pair in available slots, then resume implementation. Review milestone integration separately even when its component batches passed. The final integration PR must include both reviewers' assessment of the release candidate.

## Necessary verification

### Dedicated game-design critique

Owner addition, 2026-10-17: after the authored campaign is playable (M3), commission a **fresh, non-author `gpt-6-astra` reviewer at `xhigh`** for a dedicated game-design critique early in M4. Leave time for fixes and a focused re-review before release-candidate acceptance. This is an additional design pass; it does not replace either technical reviewer or coordinator self-review.

Use primary-source design research as a lens, then judge the actual frozen game and ordinary-control evidence. Cover flow/onboarding, exploration and resource geography, expedition variety and crafting workload, fleet/interior usefulness, ecology and survival tension, recovery, story/lore and out-of-order discovery, richer-cel assets, audio/UI readability and accessibility. Critique interactions between these aspects, not isolated feature counts. Research does not silently override the owner's game choices.

The [design-critic brief](build/tasks/DESIGN-CRITIC.md) owns the evidence protocol, report structure and correction loop. Give each finding a concrete scene/route, observed behavior, player consequence, severity/confidence, suggested change with tradeoffs and a way to check it. Separate observed failures, design inferences and human-test hypotheses. Keep spoiler-bearing analysis in a labelled appendix outside ordinary summaries. Track disposition of every substantive finding; unresolved blocking defects or scope violations prevent release acceptance. Model critique cannot establish fresh-player enjoyment, surprise, ten-hour duration or consumer-GPU performance.

### Playable and technical checks

- Rules/integration: transactional crafting and inventory conservation; depth, oxygen, food and power; source stock/progression reachability; optional spending; persistent knowledge; versioned saves; pause/focus; region activation/disposal; carrier parenting/docking; repeated all-advanced-hulls-disabled recovery.
- Ordinary-control play: first expedition and both fleet strategies to completion; optional vessels actually used; no exact-location markers for undiscovered evidence; early reveal discovery; missed optional log; final procedure available from facility state; food access from no inventory; blocked launches; recovery of advanced modules after a deep loss.
- Runtime: actual production build, asset/base paths, console/loading errors, shader compilation stalls, collision traps, input/pointer lock, pause/settings/subtitles and save export/import. Read the repository browser rules before every browser workflow and include them in worker briefs.
- Human experience: fresh-player duration, clues understood, chosen routes, hull choice, time spent on repeat harvesting/empty travel, reason for retreat and whether the reveal feels supported. Agent inspection and automated runs do not substitute for these observations.

Aim for an enjoyable main-story first playthrough near ten hours with optional exploration beyond. Report observed duration and participant context, not a fabricated estimate. If no fresh human playtest is available, deliver a playable release candidate with duration/enjoyment validation outstanding; do not claim that criterion is complete. Preserve the requested content scope rather than padding with travel or silently substituting a short demo.

## Delivery

Provide the production artifact, clean-install/run commands, controls, save migration/export instructions, content provenance and the final integration PR with exact-commit evidence. A localhost preview is local; a branch is source; neither is a public hosted game. Main merge and public deployment remain separate from the currently authorized repo/PR work. Required runtime content must be bundled so the game does not rely on remote asset services or live model APIs.
