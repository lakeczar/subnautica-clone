# Shared implementation direction

Status: coordinator constraints for FND-01; concrete exported types and paths must be proposed by Sol and reconciled before dependent implementation. [EXPEDITION_INTEGRATION.md](../EXPEDITION_INTEGRATION.md) remains authoritative for cross-system content and progression.

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

Main Sol builder implements production contracts, root config and composition under exclusive assignment. Coordinator directs and approves interface changes and owns `docs/build/{STATUS,PLAN,CONTRACTS,PLAYTEST,CONTENT_MANIFEST,TASKS}.md`, review records and planning handoff. Worker evidence belongs in `docs/build/evidence/<batch>.md`. Once a candidate is frozen, functional/contract edits wait for a correction assignment and a new dual review revision.

Browser tasks must read the current fleet and repository browser rules before any launch; use verified isolated Linux, prefer T3 preview, preserve user/shared tabs and close only owned resources. Browser evidence must identify actual rendering hardware and ordinary inputs versus diagnostic state changes.
