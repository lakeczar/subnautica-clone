# Shared implementation direction

Status: foundation source at `8d72dd2`, persistence correction at `417a7ec` (author `79423ec`), interruption/readiness correction at `2c25b8b` (author `1e2c581`). The async save/session and renderer lifecycle seams below are reconciled; both non-author reviewers accepted the frozen `50f5569` candidate; see [paired acceptance](reviews/FND-ECO-R3.md). Both non-author reviewers also accepted integrated M0 at `d415436`; see [M0 record](reviews/M0-R1.md). M1 extends these contracts under a new reviewed batch. [EXPEDITION_INTEGRATION.md](../EXPEDITION_INTEGRATION.md) remains authoritative for cross-system content and progression.

## Implemented foundation boundary

The [author evidence](evidence/FND-01.md#concrete-production-contracts) indexes the actual exports. `src/content/registry.ts` owns stable roster IDs and asset metadata; `src/sim/{types,state,world,step,clock}.ts` owns plain state, commands/events, terrain/colliders and fixed updates. `src/save/{codec,repository}.ts` owns schema validation and atomic local journals. `SiltwakeApp` composes input, renderer and UI adapters with create/update/present/dispose ownership.

Coordinates are right-handed metres, Y up, water Y=0, yaw zero toward -Z. Saved player position is the capsule base; presentation adds eye height. Simulation updates at 60 Hz, capped at eight steps/frame with interruption resets. A session with local saving enabled autosaves every 30 active simulation seconds; failed saves disable automatic retries until an explicit successful save.

Schema 1 / content `foundation.1` contains only actual foundation state; future inventory, knowledge, world, fleet and recovery collections are explicitly empty/null. Later gameplay needs an explicit reviewed migration, not silently added unvalidated data. The correction leaves schema/content/journal format and key unchanged. One localStorage journal commits current plus previous valid generation atomically and preserves unreadable records during explicit repair. Future/corrupt imports cannot replace progress. New/import replacement requires confirmation. Details and limitations remain in the evidence reports.

## Corrected persistence and session contracts

The [correction evidence](evidence/FND-01-R1-FIX.md#exact-interfaces-for-coordinator-reconciliation) indexes exact exports. `SaveRepository` now takes `(storage, writerLock)`, and `commit(save, replaceProtected?, signal?)` returns an awaited `Promise<CommitResult>` with typed failure codes. It serializes a detached snapshot before waiting; observed-record comparison, previous/raw preservation and journal replacement run inside one exclusive per-origin Web Lock named `siltwake.save.journal.v1.writer`. `writer-lock.ts` supplies the injected port and native adapter. There is no uncoordinated write fallback. All writing tabs must use the compatible protocol; an old build ignoring it cannot be made cooperative.

`ExpeditionSession` in `src/runtime/session.ts` owns the active plain state, one pending operation/confirmation, cancellation/disposal and autosave timing. It has no DOM/renderer dependency. `SiltwakeApp` remains the lifecycle/composition owner, advances session state through the fixed simulation, and wires session events to presentation. Pending autosaves deduplicate; queued writes and slow file reads cannot replace a later session after cancellation/disposal. Export returns a detached snapshot.

After eligible storage/exclusion failures, New Game or a validated import offers an explicit exportable session without local saving. Until that choice, the old active session and local record remain unchanged. Accepting disables autosave and keeps a visible export reminder. Validation/conflict/protection/size errors retain separate refusal semantics. Missing safe exclusion permits read/export and explicit unsaved play, never racing writes. Web Locks require a secure context: HTTPS hosting or localhost HTTP. Unit and actual quota/native-lock diagnostics are recorded separately from ordinary gameplay evidence.

## Interruption and renderer readiness

The [interruption correction evidence](evidence/FND-01-R2-FIX.md) records the actual app-boundary behavior. `SiltwakeApp` owns automatic-entry permission for an accepted New/import/Continue request. Session preparation pauses preserve it; external interruption or deliberate player pause revokes it for that request, including across later recovery. Completion consumes it and may install the selected session paused. Busy/blocked Resume cannot queue permission. A fresh deliberate request after an earlier settled interruption is independent. Session/save exports remain unchanged.

`createRenderer(canvas, availabilityChanged)` now requires an availability callback. It sends `false` on engine context loss, and `true` only after Babylon's restored observable and scene readiness. The early native canvas event is not reconstruction completion. Availability requests a paused redraw, never simulation resume; presentation is gated while unavailable. Observers/readiness callbacks are removed or invalidated on disposal. `GameRenderer`'s present/quality/resize/dispose methods remain unchanged. Diagnostic dataset values are observations, not proof of visible recovery; actual captures accompany the check.

Foundation art is original procedural Sol geometry and shaders. Declared hull/material/region IDs are a roster, not implemented gameplay. The economy files under `design/` are a provisional proposal/checker and must not become a competing runtime registry.

## Boundaries

- Keep plain simulation/content/save data separate from Babylon scene objects and DOM. Commands validate world preconditions; events describe committed outcomes. Runtime adapters own input, persistence, rendering and audio.
- One composition root owns lifecycle: create, fixed-step update, present and dispose. Pause, lost focus and blocking menus stop simulation drains and clear held controls; cap accumulated elapsed time after interruption.
- Use metres, seconds, right-handed semantic world coordinates with Y up and water at Y=0; choose the Babylon handedness explicitly and document it. Depth is `max(0, -worldY)`. Player, vehicle and interior-local poses must state their coordinate frame.
- Content IDs are stable saved references, never translated labels or mesh names. Registry relationships link habitat, sources, recipes, blueprint knowledge, capabilities, ecology and evidence. The current foundation seeds IDs/contracts; it does not invent full recipe balance ahead of the source budget.
- Render handles have explicit disposal and collider/interaction ownership. Resource visuals, colliders and saved depletion refer to the same node ID. Declarative asset metadata includes dimensions, pivot, material slots, role, source and region.

## State and persistence

Define a versioned envelope containing gameplay state plus content/schema version and save metadata. Include explicit extension boundaries for player/vitals, inventory/containers, knowledge, world resources/facilities, vehicles/modules/cargo, recovery caches and docking transactions. Avoid speculative full systems: instantiate only meaningful foundation state and make later additions reviewable.

Validate data on entry and cap unreasonable values/collections. An unsupported future schema or corrupt import returns a readable error and preserves current progress. Atomic local replacement retains a known-good previous generation. New Game must not silently destroy an existing save. Exported saves are user data, not executable content. Record the v1 compatibility/migration policy before dependent features.

## Movement, interactions and carrier seam

Simulation uses world-query interfaces for solids, terrain/water and proximity. Movement must eventually use swept collision for high-speed travel. Rendering mesh bounds alone are not an interaction authority. Physical position, movement mode and current vehicle/interior are one coherent state, not separate UI flags.

Station keeping precedes helm exit and launch. Berth capture/launch is transactional with one vehicle identity, local pose while attached, independent cargo/charge/damage, isolated dry storage and a separate launch lock. These are M1 feasibility/M2 gameplay obligations; do not claim them from a foundation type declaration.

## Ownership and changes

### Provisional M1 interface checkpoint

The M1 source at `5fd6338`, preserved on feature merge `7da897f`, is **unaccepted**. This records its working interfaces for the bounded [A0 correction](tasks/M1-A0.md); it does not supersede accepted M0 until the new gate passes. Full author export/migration notes are in [M1-01 evidence](evidence/M1-01.md#exact-contracts-and-migration-proposals). Root inspected the production definitions and [reproduced two immediate command/save inconsistencies](evidence/M1-STAGING.md).

- Schema 2 / content `expedition.2` extends plain state with identified items/containers, knowledge/provenance/blueprints, facilities/depletion, fleet/cargo, loss/recovery, berth transactions and route metrics. `scenario` distinguishes earned expedition from seeded carrier fixture. Existing atomic journal and exclusive writer/session cancellation semantics remain. Schema1 migration validates the actual foundation shape, initializes new content once, preserves valid pose/vitals, and gives explicit feedback if revised geometry requires relocation.
- `executeCommand(state, command, world)` and `stepGame(state, commands, world)` return `{state, events}`. Menu commands can run while ticks are paused, so each successful command must immediately satisfy save invariants. A0 must fix helm pose and repair/tow coherence without weakening the validator.
- Registry remains the sole authority for source positions, recipe/blueprint IDs, evidence/provenance and hull shapes. UI may not copy or independently alter these data. Source positions also shape terrain; persistent provenance currently validates against exact registry text.
- `WorldQueries.clearance`, `hullFloor`, `hullClearance`, `moveHull` and shared `FACILITY_SOLIDS` govern physical geometry. Player position is capsule base; personal pressure is base+0.4 m, airway base+0.85 m swimming/+1.55 m walking, hull pressure keel+0.5 m. World coordinates stay right-handed/Y-up/metres; berth poses are explicitly carrier-local.
- `createRenderer(canvas, availabilityChanged)` and its lifecycle remain unchanged. Art exports `createExpeditionArt(scene,cel).update(state)` and `createEcology(scene,cel): AnimatedLife`; UI sends `GameCommand` through `UiActions.command`; `PanelKind` contains inventory/craft/notebook/carrier. `Soundscape` owns activation/update/events/dispose; A0 establishes minimal transient sound-origin metadata before presentation ownership transfer.
- Carrier has explicit local/world transforms, station keeping, prepared/lock transactions and exactly-once identities. A0 must define and check the full physical berth/lock/exit corridor before final art ownership transfers. Current endpoint-only clearance is insufficient evidence. No moving interiors or campaign carrier acquisition is claimed.

Root will reconcile A0's concrete revised exports, dimensions and compatibility policy, then commit a new shared baseline before parallel worktrees. Existing render/UI seams suffice; no general extraction or duplicate registry is authorized.

### Assignment discipline

Main Sol builder implements production contracts, root config and composition under exclusive assignment. Coordinator directs and approves interface changes and owns `docs/build/{STATUS,PLAN,CONTRACTS,PLAYTEST,CONTENT_MANIFEST,TASKS}.md`, review records and planning handoff. Worker evidence belongs in `docs/build/evidence/<batch>.md`. Once a candidate is frozen, functional/contract edits wait for a correction assignment and a new dual review revision.

Browser tasks must read the current fleet and repository browser rules before any launch; use verified isolated Linux, prefer T3 preview, preserve user/shared tabs and close only owned resources. Browser evidence must identify actual rendering hardware and ordinary inputs versus diagnostic state changes.
