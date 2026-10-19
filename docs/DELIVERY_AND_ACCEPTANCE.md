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

**Owner revision, 2026-10-19:** [MODEL_POLICY](build/MODEL_POLICY.md) selects Opus5.5/high for implementation and **one fresh non-author Sol6.1/xhigh reviewer** for acceptance, alongside coordinator inspection. This replaces the earlier automatic Astra/xhigh plus Sol/max pair. Historical reviews retain their actual attribution.

1. Apply the gate to each completed feature or coherent delegated batch, including graphics/lore, and each integrated milestone. Related edits may share a batch. Name the player-facing acceptance criteria; provisional integration is allowed before acceptance.
2. Inspect author checks and actual combined behavior, then freeze a candidate SHA. Give the reviewer the full scope, baseline/specification, known findings/dispositions, contracts, source-attributed evidence and remaining gaps. Verify the requested model/effort against the live catalog. The reviewer must not have authored the candidate.
3. Review connected progression, resource geography, fleet usefulness, recovery/persistence, lore and actual visuals/gameplay where affected. Static source inspection cannot establish runtime behavior. Follow the repository browser rules for browser work.
4. Reconcile findings against requirements and evidence. Opus fixes substantiated defects; record reasons for disputed or deferred findings. Run affected checks, then start a fresh Sol/xhigh review task with the original scope, revised candidate, prior findings, responses and unresolved objections. Use a distinct stable task request ID for each round. A focused reproduction resolves disagreements; no automatic Astra tie-breaker is required.
5. Accept only with explicit reviewer ACCEPT on the frozen candidate, coordinator concurrence, applicable playable checks and no unresolved blocking defect or scope violation. Keep unavailable human/dedicated-GPU criteria explicitly open under the documented qualified-release exceptions. Subsequent functional/content/contract changes require affected review.
6. Record the candidate/base, reviewer task/model/effort, findings/dispositions, checks and limits under `docs/build/reviews/`; link it from STATUS and the relevant PR. Later documentation-only commits may cite the reviewed source without claiming a new review.

Use completion notifications and rotate roles within the concurrency limit. The final integration candidate receives this same independent gate. Keep validation proportional to the actual risk and change.

## Owner-required Opus experience loop

The owner explicitly resumed construction after the second Opus audit and requires a thorough **Claude Opus 5.5 / high** experience review at the end of each remaining stage:

1. Current M1 controls, interaction and flow polish.
2. M2 fleet/world skeleton.
3. M3 authored campaign.
4. M4 final polish/release candidate.

These reviews supplement the Sol6.1/xhigh acceptance gate and the separately requested post-M3 design critique, now assigned to Sol6.1/xhigh. Each stage reviewer must be a fresh non-author Opus agent, separate from the Opus builder. The earlier OPUS-DESIGN-R2 audit precedes implementation; it does not count as the end-of-stage1 review. Use the current live model catalog and record selected/effective settings honestly.

Give each stage reviewer the complete stage scope, frozen source, executable/playable artifact, actual ordinary-control evidence, relevant earlier findings and their dispositions, and explicit remaining limits. Review gameplay loop, motion and controls, menu/UI flow and text density, timing, visual/audio coherence, discovery/lore and the composed player experience. Inspect actual visuals and relevant motion/interaction evidence; code and screenshots alone do not prove feel. Keep major spoilers in protected appendices.

For substantive findings, ask the critic for a detailed implementation approach: concrete player behavior, affected modules/contracts, dependencies, algorithms/trial values, concise UI copy, compatibility and verification. A same-thread consultation may retain the completed critic's context; it is implementation advice, not a fresh independent review round. Track its own returned task ID. Root reconciles proposals and delegates implementation to **Opus5.5/high**, including art, under the current model policy. The independent critic and builder are separate agents. Record reasons/evidence for any disputed or deferred finding rather than silently ignoring it. Resolve blocking findings before completing the stage.

After corrections, run affected checks and the applicable Sol6.1/xhigh gate on the new frozen candidate. Use a fresh delegated Opus review to verify affected experience findings, supplying the original scope, findings, responses and new evidence. Do not continue an independent review round through a child-thread message. Root then advances to the next stage without requesting routine permission. Main merge/public deployment remain separate owner actions. [Execution protocol](build/tasks/OPUS-STAGE-REVIEWS.md) owns the stage ledger and follow-up procedure.

## Menu and interface writing

Owner priority: **avoid subtitle, subheading and helper-copy overuse in menus and routine UI throughout the game**. Lead with clear action labels, items, current state and costs. Add explanatory text only when it helps the immediate decision; use optional contextual help for deeper rules. Do not repeat the same instructions across cards/panels or surround every heading with decorative eyebrow/subtitle text. Group related information instead of giving each sentence its own heading. Show a result/refusal in the appropriate place without simultaneous repetitive banners.

This does not remove useful dialogue captions, accessibility equivalents, critical hazard information, unsaved-session warnings or persistence/graphics errors. Notebook evidence may need narrative depth; routine controls should not require reading a manual. Use player-facing names, not internal object IDs. Check menus during ordinary preparation/return workflows, including keyboard focus and narrow desktop layouts, for scroll burden, repeated text and whether the next useful action is easy to find.

## Necessary verification

### Dedicated game-design critique

Owner addition, 2026-10-17: after the authored campaign is playable (M3), commission a **fresh, non-author `gpt-6.1-sol` reviewer at `xhigh`** for a dedicated game-design critique early in M4. Leave time for fixes and a focused re-review before release-candidate acceptance. This is an additional design pass; it does not replace the acceptance reviewer or coordinator inspection.

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
