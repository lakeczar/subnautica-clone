# One-shot build prompt: Siltwake

Paste this entire document into a fresh GPT-6 Astra coding session in this repository. It is self-contained. One shot means one initial instruction followed by autonomous implementation, integration, testing, and revision. It does not mean one model call or a guarantee of a finished game within an unspecified budget.

---

You are the **GPT-6 Astra coordinator and game director**. Build **Siltwake**, an original, polished, single-player underwater survival-exploration game that a player can start, understand, finish, save, and replay. Delegate bounded implementation tasks to **GPT-6 Astra subagents** while you retain the entire design, dependency graph, integration state, and release checklist. Deliver working software; continue through implementation and playtesting rather than ending at a plan.

## 1. Product contract

The player fantasy is a vulnerable expedition into an unfamiliar living ocean: see something intriguing, prepare, venture farther, discover something useful, and return changed. Preserve the appeal of Subnautica's exploration and preparation loop through original expression. Create our own world, writing, creatures, geometry, interface, sound, and identity.

**Setting:** a geothermal observatory beneath the ice of an alien moon has gone silent. You are a maintenance diver dispatched from a small refuge, **the Bell**. Restore two remote acoustic relays, learn why the observatory failed, and use the restored network to cross a dangerous migration current and reactivate its ascent beacon. The relays create new oxygen refuges and shorten return routes. The world changes visibly and audibly as you repair it.

**Format:** a complete compact campaign targeting **30–45 minutes for a first-time player**, across three connected, deliberately composed regions. This is a pacing target to measure and tune, not permission to pad travel or grind. Use authored critical paths with seeded environmental dressing. A practiced verification run can be shorter; report which kind was measured.

**Critical path:** start in the Bell → learn swimming, scanning, gathering and fabrication on a safe local expedition → craft a range upgrade and repair relay one → enter the deeper observatory sector, learn a readable fauna hazard, obtain a traversal/protection upgrade and repair relay two → use the network and equipment to cross the migration current → reactivate the ascent beacon → show a proper ending, expedition results, and Continue/New Expedition choices.

Keep this dependency graph acyclic. Critical resources must be reachable before the upgrade they unlock. Write the recipe/resource/route graph before filling the map. Optional exploration rewards curiosity without blocking the ending.

### Required content and mechanics

- Three visually and mechanically distinct regions: a bright refuge shelf, a dark suspended-garden/observatory region, and a hot rift crossed by migration currents. Each has a memorable silhouette landmark, a readable route back to safety, a discovery, and a distinct hazard or traversal decision.
- Full 3D first-person swimming with inertia and drag, ascend/descend, comfortable pitch/yaw, tool targeting, solid cave/wreck/door collisions, and tuned acceleration. Camera-relative movement and diagonal movement must behave consistently. Provide mouse sensitivity, invert-Y, adjustable field of view, and restrained optional camera motion.
- Oxygen, health, and a clear depth/pressure or thermal limit. Oxygen refills in named safe volumes; pressure/heat transitions communicate danger before causing unavoidable damage. Deliberately omit hunger and thirst for this campaign.
- A readable inventory, resource gathering, scanning/discovery journal, crafting at the Bell and restored relays, and clear recipe/unlock feedback. Use at least six resource types and six useful recipes. Avoid redundant currencies and cosmetic-only recipes.
- Four meaningful equipment improvements covering oxygen range, environmental protection, traversal, and information or threat management. Basic gathering and the initial discovery tool are available at the start. These upgrades must change a reachable route, survival margin, or tactical decision.
- Two restored relay refuges with fabrication/oxygen services, a persistent beacon, a clear repaired state, and a tangible effect on the critical path. Construction is limited to these authored relay sockets; full freeform bases are outside the release scope.
- At least six distinct original fauna types: small schools, ribbon filter-feeders, deposit scavengers, stinging drifters, a territorial predator, and large passive migrators that feature in the finale. Give the two hazards different readable behaviors and counterplay. A combat system is optional. Animation, silhouette, sound, and behavior should convey ecology, not random collision damage.
- At least three optional discoveries that reward a detour and develop the observatory mystery; an in-world journal and short readable messages suffice. End the central mystery and expedition in this release.
- Death and recovery, pause, settings, New Game, Continue, versioned saves, export/import, and a completed ending. A player must be able to restart without developer intervention.

### Recovery and progression invariants

Critical discoveries, equipment upgrades, and repaired relays survive death. Respawn at the last safe refuge with a viable starter kit and oxygen; ordinary carried resources may drop in a recoverable buoy, but loss cannot remove the ability to recover. Guarantee enough accessible or renewable materials for mandatory upgrades, even after failed expeditions or optional crafts. Quest-critical items use protected storage or persistent flags. Full inventories, repeated interactions, saving during a transition, and loading an old position must not strand the player. Resume a loaded campaign paused at its last safe refuge; preserve progression and explain the relocation. Provide an explicit return-to-refuge recovery action for collision entrapment, with the same protected-progress rules. Explain recovery rules in the game.

## 2. Platform and architecture

Use **strict TypeScript + Vite + Babylon.js**, a required **WebGL 2** path, and a self-contained static desktop-browser build. Pin dependencies and commit the lockfile. Use a supported Node LTS version verified in the environment. Bundle required assets; playing must not depend on a backend, account, paid service, asset CDN, or WebGPU. Use ordinary DOM/CSS UI alongside the canvas unless another approach solves a demonstrated need.

Start with Babylon's collision facilities and a custom swimmer against simple collision geometry. Add a physics dependency only after identifying a concrete need. Collision must handle walls, ceilings, caves, doors, and high-speed motion; height clamping alone is insufficient. Use a fixed simulation step, bounded catch-up, and render interpolation. Pause on focus loss and clear held inputs on pause/control transitions.

Keep progression, inventory, crafting, survival, and save validation independent of Babylon and the DOM. A composition root owns lifecycle and integration. Agree these typed contracts in a committed baseline before parallel implementation:

- `GameState`: stable content IDs, seed, player, inventory, discoveries, objectives, relay/world mutations, and schema version.
- Commands and events: validated atomic state transitions for interaction, crafting, upgrades, damage, death, and victory; renderer/UI consume the same authoritative rules.
- `WorldQuery`: collision/movement queries, interaction targets, safe volumes, hazards, and region sampling.
- Input actions: named actions independent of physical keys; bindings displayed by the UI.
- Content registry: items, recipes, creatures, regions, discoveries, and objective prerequisites with stable IDs.
- Save, rendering, and audio adapters with explicit initialization, update, and disposal.

Choose the smallest useful modules; an elaborate framework is unnecessary. Store snapshots and world mutations, not engine objects. Use IndexedDB transactions, validated versioned save data, a last-good recovery path, and export/import JSON. Treat browser storage as local and potentially evictable. Invalid saves produce a helpful recovery choice without crashing. Autosave at safe progression transitions and confirm success in the UI.

Build and document `npm ci`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`, and a production-build preview command. Add CI for reproducible installation, typechecking, meaningful tests, and production build. Configure asset paths for the actual hosting subpath and verify the production output over HTTP.

## 3. Astra team and source control

Inspect the repository, applicable instructions, available tools, and live model catalog before dispatch. In T3 use `orchestrator_capabilities`; select the actual provider instance advertising **`gpt-6-astra`**. Keep one Astra coordinator and at most three active Astra workers, within actual runtime limits. If the coordinator or workers cannot use the requested model, report the exact limitation instead of silently substituting. Use the session's configured reasoning/budget; do not invent spending limits or recurring jobs.

Prefer native child-agent tools when they support the selected model and shared-checkout work. Shared-checkout workers leave branch switching and commits to the coordinator and never commit mixed workspace changes. Use T3 `delegate_task` with `isolation: "worktree"` for workers needing independent branches/PRs, or when native tools cannot select that model. Worktrees start at the parent's **committed local HEAD**; uncommitted work is not copied. Verify each worker's starting commit. Use child tasks, not ordinary top-level threads, and retain every task ID. Give each T3 task a distinct `clientRequestId`, reused only for retries of that same task. Consult live tool schemas rather than guessing arguments.

For T3 asynchronous work, consume completion notifications; use bounded `task_status` reads when needed for integration. A completed turn with unfinished nested work is not a completed task. Do not duplicate active tasks after a timeout. Start each new T3 review round with a fresh delegated task and include the original brief, previous findings, responses, and remaining objections. Native child follow-ups may use the native follow-up mechanism. Workers do not spawn their own teams.

The coordinator owns shared contracts, entry points, dependencies/lockfile, build configuration, CI, integration, and final acceptance. After the baseline is committed, assign exclusive ownership such as:

| Worker | Scope | Example owned paths |
| --- | --- | --- |
| Astra A | Survival, inventory/crafting, objectives, recovery, saves; rule tests | `src/simulation/`, `src/persistence/`, `tests/simulation/` |
| Astra B | Regions, collision meshes, fauna, interactions, environmental art | `src/world/`, `src/content/`, `public/world/`, world-specific tests |
| Astra C | HUD/menus/journal, input presentation, audio, accessibility and feedback | `src/ui/`, `src/audio/`, `public/audio/`, UI-specific tests |

The coordinator implements or explicitly assigns swimming and the render adapters before workers depend on them. Required edits outside ownership become explicit contract requests. Coordinate consumer and producer changes; the worker touching a contract does not silently leave everyone else broken. Reserve a worker slot for independent QA/review after feature work winds down.

Every delegated task must include: the game brief and relevant constraints; exact baseline and branch; owned paths; contract versions/examples; dependencies; expected player-visible behavior; required checks; browser rules; and a completion report containing commit SHA, touched paths, commands/results, evidence, limitations, and integration instructions. A worker's "done" is a proposal for coordinator verification.

Use the existing public repository, **https://github.com/lakeczar/subnautica-clone**. If a new clone is needed, inspect branches/PRs and start from the planning branch if this brief is not merged. Preserve unrelated work. Create a feature integration branch, commit the foundation, and create worker branches from that committed foundation. Workers can push their feature branches and open draft PRs against the integration branch; the coordinator can integrate reviewed commits into the feature integration branch. Open a release PR from integration into `main`, with dependent PR relationships made explicit. For a very small task a single PR is enough; PR count is not a success metric.

The owner retains merging to `main`, default-branch pushes after repository bootstrap, public deployment, and release publication. Build and preview the game on the worker, prepare artifacts and deployment instructions, and leave reviewed PRs ready for the owner's final action. Do not interpret the permission to build as permission for paid infrastructure. Register every worked-on PR through T3 `link_pull_request` when available, including stack layers, and verify the thread's linked PR list before handoff. Use T3's PR watcher when monitoring instead of a custom polling loop; unwatch when handing the PR back.

## 4. Execute through playable milestones

Maintain `docs/STATE.md` as a concise durable ledger: current milestone, design decisions, task IDs/branches/commits, contract changes, known defects, measured acceptance results, and the next action. Maintain `docs/ACCEPTANCE.md` with each release criterion marked pending/pass/fail and links to evidence. These are implementation records to create, not assumed existing files. Update at integrations and before context handoffs, not on every tool call.

1. **Foundation and feel.** Verify the toolchain and actual preview environment; commit the contracts, composition root, scripts, and first scene. Prove Start → swim → collide → interact → return to oxygen → pause/resume using real input. Test entry/exit of pointer lock and the fallback. Finish when this small route is controllable and readable in the production build.
2. **Complete rough campaign.** Integrate gathering, crafting, upgrades, both relays, hazard progression, death/recovery, saving, and an ending. Simple provisional art is acceptable at this gate. Complete the entire route through ordinary inputs before expanding content. Finish when both the progression tests and an input-driven start-to-ending run pass.
3. **World and identity.** Complete the three regions, equipment, fauna, discoveries, environmental storytelling, original art and sound, and useful UI feedback. Every feature must strengthen the already-working campaign. Integrate frequently and replay affected routes; finish when the required content is reachable, distinctive, and functional.
4. **Polish and release.** Test onboarding, pacing, readability, controls, audio, collision edge cases, save/resume, performance, and the ending in the built game. Have a separate Astra worker review and playtest after implementation slots free up. Fix reproducible defects and replay the impacted route. Finish only when the release criteria below have evidence or are explicitly recorded as blocked/unverified.

At each gate, retain a runnable integrated commit. Prioritize a complete, enjoyable route over adding disconnected systems. Optional stretch work—vehicles, freeform habitats, extra regions, elaborate combat, procedural world expansion, mobile/gamepad support, voice acting—begins only after the required release gate passes and only if it fits the user's execution budget. Cut stretch work first. Changing a required feature is an explicit scope proposal, not a silent downgrade.

## 5. Presentation and player experience

Give Siltwake a coherent art direction: cold ice-blue refuges, warm industrial work lights, dark silhouettes, restrained biological luminescence, and hot mineral color in the rift. Use composed geometry, original animated fauna, fog/color absorption, suspended matter, and inexpensive caustics/light shafts. Profile effects before multiplying them. Distinguish the three regions by shape, palette, motion, sound, and navigation decisions. A collection of uncomposed primitives does not pass as finished art.

Show goals and interaction prompts at the moment they help. Establish the first action within roughly a minute and a rewarding excursion within five. Use spatial landmarks and discovered beacons rather than constantly hiding navigation in menus. Crafting must show costs, missing resources, effect, and the next reachable lead. Distinguish scenery, resources, threats, and interactables without relying on color alone.

Provide breathing and danger cues, equipment feedback, directional ambience, fauna sounds, and restrained music with separate volume controls. Start audio from a user gesture. Caption essential audio information. Supply visible oxygen/health warnings, readable text at 1280×720, clear focus states, keyboard-operable menus, reduced motion, and an optional relaxed survival preset; normal mode remains the primary tested campaign.

Start/Resume explicitly acquires controls; Escape releases pointer lock and pauses. Inventory/settings must not leave swimming keys stuck. Provide a usable drag-to-look fallback if the embedded preview cannot lock the pointer and explain it in the UI. Keep the normal desktop control path intact. Unsupported WebGL 2 or a failed asset load produces a helpful screen, not a blank canvas.

Keep an asset/license manifest for bundled third-party assets and record original/generated assets accurately. Choose a consistent original fallback if external tooling is unavailable. No required sound, font, model, or texture may depend on a temporary URL or undocumented manual download.

## 6. Browser rules and verification

Before any browser, HTML preview, screenshot, recording, or browser test, read `/work/repos/fleet/BROWSER_RULES.md` when available and repository `docs/BROWSER_RULES.md`. Include the rules in every delegated browser task. If this prompt is used outside the repository, the minimum requirements are: prefer HTTP/APIs when sufficient; unattended browsers must run on verified isolated Linux; a remote thread alone does not prove the browser is remote; prefer T3 previews; preserve shared sessions and the user's Windows desktop; use real pointer lock only on the isolated host; close only task-owned resources. If isolation cannot be verified, continue non-browser work and report the blocked checks.

Discover T3 preview tools and call `preview_status` first. If no capable tab exists, call `preview_open` before declaring it unavailable. Verify the browser host, read ownership, and operate only your own or unclaimed tab. Follow current tool-specific rules on retries and fallbacks. Use an isolated test profile/storage; never clear unrelated browsing data. Screenshots alone do not prove interaction or playability.

Required evidence on the final integration commit:

- Clean install, strict typecheck, meaningful rule tests, and production build. Rules cover oxygen/refill/death, crafting atomicity and inventory capacity, objective prerequisites, recovery, critical-resource reachability, and save validation/round trips. Test player outcomes, not mocks that repeat the implementation.
- Automated browser smoke coverage for Start, input/control transitions, interaction, crafting, pause/settings, save/reload, and an ending path. Deterministic seeds and a read-only diagnostic API can aid assertions. Test fixtures can isolate edge cases but do not substitute for the normal campaign run.
- A fresh start-to-ending playthrough using ordinary input, default survival difficulty, normal recipes and resource costs, and no teleportation, injected inventory, forced quest flags, or disabled hazards. Record actions, elapsed time, build SHA, outcomes, and a recording or useful checkpoints. If normal-input completion is blocked, fix it or report the exact failure; do not label a debug-assisted run a pass.
- Separate death/recovery and save/reload runs before and after relay restoration, with no lost critical progress. Test a full inventory, repeated crafting input, an invalid save, focus loss, Escape, and returning from menus. Verify collision in a cave ceiling, narrow doorway, wall corner, and the fastest reachable swim state.
- Production build served over HTTP at the intended path, checked for missing assets, blocking console errors, controls, persistence, and the ending. Document browser support actually tested; do not infer all-browser support from one Chromium run.
- Performance route with browser/OS, CPU/GPU and renderer, resolution, DPR, quality preset, p50/p95 frame times, visible stalls, and resource growth over repeated traversal. Targets are 60 fps at 1080p medium on the documented representative desktop and a usable 30 fps low preset; target an initial compressed transfer below 30 MB. Measure before claiming success. Headless/software-rendered data must be labeled and cannot establish consumer GPU performance. If representative hardware is unavailable, mark that target unverified while reporting available measurements.
- A separate Astra review of the final integrated diff and game, prioritized findings, actual fixes/rechecks, and unresolved limitations. Tie review evidence to the final commit; recheck affected behavior after subsequent edits.

## 7. Finish honestly

Deliver the complete source, bundled assets and manifest, production build, reproducible run/test instructions, in-app playable preview or clearly identified local launch URL, linked PRs, and an evidence index under `docs/`. Prepare public hosting instructions; publish only when authorized.

Before final acceptance, fully read and account for every delegated result: T3 tasks must have `workState: "result_available"` or an explicitly accounted failure/cancellation, with no pending child or later runs; apply equivalent terminal-result checks to native tasks. Stop or finish your own leftover workers before handoff, preserving their work and leaving unrelated sessions alone.

Report which release criteria passed, failed, or remain unverified and why. A build that compiles, an attractive opening scene, a headless simulation win, or a worker's summary alone is insufficient. Do not invent test results, performance, play duration, or an unbuilt feature. If budget/tool/environment limits stop the work, preserve the best playable commit and give the precise next action; say "incomplete" instead of calling a demo polished.

Begin by inspecting this repository and environment, writing the short milestone/ownership plan, committing the shared foundation, and launching the first bounded Astra tasks. Continue until the campaign and release gate are complete or a concrete external blocker prevents further progress.
