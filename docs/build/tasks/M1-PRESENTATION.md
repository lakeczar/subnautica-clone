# M1-PRESENTATION — story, UI and audio in the expedition

Sol 6.1 max, presentation specialist. Read AGENTS/STATUS/PLAN/CONTRACTS, revised input, [M1-PARALLEL](M1-PARALLEL.md), STORY_DESIGN and the spoiler canon for consistency, applicable integration/world/fleet/graphics rules and A0 sound-origin contract. Preserve the owner's chance to discover the reveal; no major spoilers in ordinary handoff/PR summaries. This is early C01–C04 presentation, not later campaign writing.

## Exclusive paths and interfaces

Only `src/ui/view.ts`, `src/style.css`, `src/audio/sound.ts`, `tests/sound-origin.test.ts`, new `tests/presentation.test.ts` if needed for meaningful behavior, and `docs/build/evidence/M1-PRESENTATION.md`. Shared test support, registry, state/simulation/save/runtime/renderer/canon and other documents are read-only. No dependency/config changes.

Keep `UiActions/PanelKind`, command/state/event and audio/view lifecycle interfaces unchanged. UI sends existing validated commands and does not mutate state. Use existing source/recipe/clue authority instead of duplicating a registry. Saved provenance text validates exactly; send needed registry prose or event changes as precise proposals to root/main. `GameEvent` sound `origin?: Vec3` is an unsaved detached world position: only events with explicit spatial origin pan, body/equipment warnings remain centred.

## Concrete work

- Preparation/crafting: show useful known source habitats, actual prerequisites, accessible inventory destinations and needed quantities. Make refusal actionable without exposing engine/schema details or undiscovered coordinates. Clarify suit-versus-hull exit exposure, reserve cells and one packed/deployed buoy identity.
- Notebook/story: readable observations, provenance, labelled hypotheses and regional leads in either early order; optional personal record stays optional. Improve opening action/caption feedback and useful next questions without prematurely revealing the truth or adding arbitrary clue locks. Do not claim simulated ecological behavior the current game lacks.
- Return/recovery: make known refuge/storage/service options clear; identify visited loss/cargo information, reachable local staging and existing repair/tow/salvage choices. Preserve knowledge and loss-cost meaning. Do not invent functioning recovery behavior through UI text.
- Audio/HUD: integrate locally generated sanctuary/underwater ambience, action feedback and threat warnings with readable visual/caption equivalents. Preserve transient spatial origins. Check alarm priority, repetition and overlap, browser activation, mute/volume/subtitles and pause/disposal. Do not equate inspected gain nodes on a muted host with a listening pass.
- Menus/settings: ordinary keyboard/mouse usability, readable text/contrast, unclipped content at offered settings, clear open/close feedback and no movement leakage while blocking panels are open. Main retains app-boundary state/pause authority; report exact required core edits.

## Verification and handoff

Use production UI and controls in both early clue orders, missing optional log, preparation/crafting refusal, inventory transfer/buoy, known recovery information, suit/hull warning, captions and settings. Targeted unmodified earned saves and labelled carrier fixture are available; state injection does not establish an earned route. Core owns the complete normal expedition; keep this task focused on presentation interactions rather than duplicating that full run.

Use meaningful tests only for changed behavior; no tests for cosmetic wording. Run relevant check/build and actual UI/AudioContext control observations. Retain source/bundle, test/console results, visual/interaction captures, save provenance and clear listening/hardware limits. Return exact proposed registry/core changes separately, asset/audio provenance and remaining gaps in `M1-PRESENTATION.md`.

Follow M1-PARALLEL and both browser rule files before any browser operation; use own port5192/incognito storage, preserve other tasks/human tabs and close only owned resources. No push, PR, parent merge, children or acceptance claim. Return coherent commits; final combined play and fresh non-author Astra/Sol review follow assembly.
