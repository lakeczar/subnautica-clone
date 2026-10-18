# M1-PLAY-CORE — expedition rules and return refit

Coordinator assignment, 2026-10-17. First author step of the **M1-PLAY expedition-decisions batch**, followed by a separate presentation/ordinary-play step on its reconciled source. Both steps remain provisional until one fresh non-author Astra xhigh + Sol6.1 max pair accepts the assembled batch. Integrated M1 is a later gate. This is a bounded rules task, not the full campaign or the final UI/playthrough task.

## Authority, baseline and ownership

Use **codex / gpt-6.1-sol / reasoningEffort=max**, T3-owned isolated worktree from the exact clean parent supplied at dispatch. Report actual runtime model/effort. Only root delegates; no children, peer polling, pushes, PRs, merges or parent mutations. Commit source, then own evidence, and return terminal with a clean worktree. No browser is expected for this rules task.

Read AGENTS and STATUS first, PLAN/CONTRACTS, `prompts/BUILD_GAME_REVISED.md`, `.scratch/siltwake/map.md`, `docs/EXPEDITION_INTEGRATION.md`, relevant WORLD_PROGRESSION/FLEET_AND_SURVIVAL/DELIVERY_AND_ACCEPTANCE specifications, M1-PLAY-DIRECTION, Opus disposition, R4 paired record and Sol P3 finding. Accepted bounded checkpoint:5eb1be1 / production769f2ad; accepted integrated M0 remains a2cb19f. Preserve earlier source/evidence attribution. All earlier authors/reviewers are terminal.

Exclusive production paths:

- `src/content/registry.ts`: only content version, module/item/recipe definitions, approved early recipe costs and related type exports. **Do not edit EVIDENCE/OPENING/provenance/source geometry or stock.** Lore/copy outside the mechanics stays for the next step.
- `src/sim/{types,inventory,progression,vehicles,step,recovery}.ts`: additive commands/shared eligibility, refit identity/effects, pulse cost, local recharge and bulk transaction, minimum command feedback changes. No world/terrain/carrier geometry, movement algorithm, collision or recovery-route changes.
- Optional new `src/sim/modules.ts` for the narrow module rules if useful. Avoid circular inventory/vehicle/progression dependencies; use one shared service-site helper rather than duplicated coordinates.
- `src/save/{codec,validation}.ts`: explicit content compatibility, strict module relationships and exact notice correction. Repository/session/lock protocols are frozen.
- Relevant existing tests under `tests/` only as needed for affected expectations and meaningful new coverage; new `tests/expedition-decisions.test.ts` and `tests/modules.test.ts` permitted. No unrelated test refactoring.
- `scripts/check-m1-economy.mjs` plus new `docs/build/design/M1-PLAY-ECONOMY.json`: declared adopted M1 cost delta against the unchanged historical proposal, optional trim cost and reachability/capacity check. Do not modify historical `economy-candidate.json` or reinterpret its old acceptance.
- Sole report: `docs/build/evidence/M1-PLAY-CORE.md`; temp evidence `/tmp/siltwake-m1-play-core/`.

Root retains all other files, UI/render/audio/app/input, build records, specification and scene geometry. If another path or a material contract deviation is necessary, send root a concrete proposal while continuing independent work. Do not wait on peers or silently broaden scope.

## 1. Paid distraction and local cell recharge

Each successful existing12-second directional pulse consumes **25 charge points from one reserve cell**. Eligible cells are in the diver hold, then the currently controlled craft hold, with deterministic stable selection; require a single cell with at least25 points. Do not combine fractional residuals or use locker/remote craft/buoy cells for a field pulse. Keep service-tool prerequisite, existing bound-clipped ray and all active/boundary refusals. Determine all eligibility before mutation; refused commands spend nothing and create no target/timer. No new saved timer, cooldown field, negative timer or free repeated use.

Provide a read-only selection/refusal helper usable by later UI; command and UI must not diverge. Feedback states25-point cost and the selected cell's remaining charge. Quiet movement, cover and retreat remain viable without a cell. Existing sound cue origin semantics stay intact.

Add an explicit `recharge-cells` command at the restored pod fabricator or restored workshop bench. It recharges eligible local reserve cells through the same bench container set below, without requiring vessel ownership. It changes **only those item charges**, never vessel health/power/air, inventory identities, stock or time. Refuse away from the bench, before service restoration, with no cells or when all eligible cells are full. Existing local vessel service still works under its prior physical requirements. A healthy empty vessel battery must remain a separate recoverable state.

## 2. Shared local crafting and storage

Factor the existing pod-cradle/workshop-cradle support predicates into one side-effect-free helper. Keep the current physical radii/positions and restoration requirements. The helper must distinguish the actual site; proximity to the other cradle does not qualify. Exclude berthed craft and craft in a berth transaction. Disabled local hull cargo can be accessible without granting repair/charge.

At a bench, fabrication sources are diver + that site's locker + accessible deployed buoy + craft holds at **that site's supported cradle**. Checking/counting/spending all use this same set. No equipment, protected rescue stock, distant hull or second refuge pooling. The bench player must actually be at the site before craft eligibility is granted. Preserve ordinary controlled-craft/local-hold access outside benches; add bench-to-matching-cradle access centrally so explicit transfer/bulk operations and crafting agree.

Add `store-materials { from: string; to: string }`: explicit source and destination, both accessible, distinct and non-equipment. Move **whole public material stacks only**, using the eight MATERIALS IDs, with enough destination room for the entire displayed set. Preserve each stack ID, kind, quantity and provenance; no merging/recreation, partial debit, rescue spending or silent nearest-destination choice. Exclude meals, cells, tools, buoy, module items and anything fitted/installed. Refuse an empty eligible set or insufficient space atomically. Keep individual transfers; installed module references must block individual transfer with an actionable remove-first message. Export a shared read-only preview/refusal for the UI's contents and total CU. Report destination and actual material quantities after success.

## 3. Ingredient identity and guaranteed budget

Adopt early recipes after confirming reachable stock/capacity:

| Recipe | Alloy | Glass | Membrane |
| --- | ---: | ---: | ---: |
| Scanner/service tool | 1 | 3 | 1 |
| 150 m suit | 1 | 0 | 3 |
| Restore workshop | 3 | 1 | 0 |

Other existing costs, prerequisites, quantities and receipts remain unchanged, especially Dart frame6/3/2 and rescue-only allocation. Preserve old crafted receipts without refunds/rebilling. Account for existing bundle sizes/16 CU diver capacity, buoy24 and Dart32, reef-first and island-first preparation. Do not add stock or alter sources to hide a failure. Report a concrete issue to root if the specified costs cannot work. Keep runtime registry authoritative; the new economy record documents the explicit adopted delta and optional trim, not a parallel runtime registry. Verify all current M1 recipes against original proposal plus declared overrides; distinguish pre-Canopy starter spend from optional return spend. Unchanged future arithmetic is not newly validated by this task.

## 4. One removable Canopy reward: Dart acoustic trim

This contract is decided by root. A proposal-only module name is insufficient.

- Stable item and recipe ID **`dart_acoustic_trim`**; label **Dart acoustic trim**;2 CU, quantity1, public provenance, null charge. Recipe costs **2 conductive_crust + 2 buoyant_resin**, blueprint `bp_canopy_reinforcement` from C04, requires `dart_base`, site restored island workshop, once-only. Fabrication outputs one item to diver hold after a capacity check. First observed4+4 Canopy cargo covers it without another harvest trip. It is optional; no pressure/story gate depends on it.
- Representation: existing `VehicleState.modules: string[]` contains **installed item instance IDs**, not kinds. The module item stays in the owning vehicle's ordinary cargo container, `fitted:null`, and counts2 CU even when installed. This uses one of two small-craft sockets without a new container or saved object shape. M1 accepts this kind only on Dart and at most once; unknown kinds, duplicate/cross-owner/dangling references, wrong quantity/provenance/charge/container/hull, and reference reuse must fail strict validation. Old empty arrays remain valid. All generic fitted/equipment rules remain unchanged.
- `install-module { vehicleId, itemId }`: owned Dart, supported local cradle and accessible local item; require an empty socket, no identical installed kind, correct item and2 CU room when relocating from another container. No occupied hull, berth or active recovery/berth transaction. Atomically move the existing item into that hold and register its ID; no new item, materials, hull service or investment mutation. A module already in the hold needs no extra capacity. Inspect-before-mutate throughout.
- `remove-module { vehicleId, itemId }`: detach the reference, leaving the same item in the same hold with the same2 CU. Normal removal requires the same supported local access. Also allow **local disabled-Dart exterior-collar removal** with retained service tool + Bobbin kit, empty/unberthed hull, safe local access and no active recovery/berth transaction. This allows tow→remove→transfer→salvage with no powered duplicate vessel. No remote detachment or automatic salvage disappearance. Individual transfer then preserves the intact item ID. Frame salvage still requires an empty hold and no installed module; frame return/cost and bound-patch accounting stay unchanged.
- Effects only when validly installed on the controlled Dart: **quiet target speed3→4.2 m/s; boost11→9 m/s; normal8 unchanged**. Keep existing input precedence, acceleration, collision, depth, normal/quiet/boost loudness and per-second drain rules. Thus quiet travel is faster and costs less power per distance, while boost is slower; normal cruise is still audible. No generic noise immunity or reduction of threat thresholds. Hush retains its later passive-survey/coasting niche. Expose a small shared read-only performance description for truthful UI, not a new generic equipment framework.
- Module identity survives disable/repair/service/berth/save/reload. If carried by the diver on incapacity, retain this reusable module just as the buoy is retained; never remove/recreate it in the ordinary cargo cache. Once receipt implies exactly one live module item, whether installed, stored or carried; prevent duplication and silent deletion. Salvaging/rebuilding the Dart leaves the same reusable module ready to reinstall and never refunds module ingredients as frame investment.

## 5. Explicit content compatibility and P3 copy

Write **schema2 / content `expedition.3`** for the new executable item/module semantics. Read validated `foundation.1` schema1 and existing `expedition.2` schema2 explicitly. This is a content revision, not an excuse to relax structural/relational validation.

Before migrating expedition.2, enforce the prior domain: no module refs, no new item/recipe receipt or other new-domain ID. Apply all strict existing checks and existing checked carrier-pose migration. Convert the content tag without grants, costs, vital/stock/charge resets or ownership changes. Preserve metadata, item IDs, original input bytes and correct current/previous/preserved journal policy. Preserve old crafted receipts despite the three new prices; Dart frame investment stays exact. Unknown newer versions refuse safely. Current encode must still refuse an invalid current pose rather than hide it behind migration. Avoid copying the entire validator: a narrowly declared legacy-domain guard plus the shared strict validator is preferable, provided tests establish rejection of forged old-version new data.

Close **SOL-M1-R4-01**: new carrier/foundation migration messages must describe relocation/preservation without promising where an imported source is backed up. Normalize only the two exact known historical misleading notice strings on decode, plus feedback only when it exactly equals that notice; leave unrelated feedback/custom text untouched. This is the only approved old-state text normalization. Do not change repository/session storage selection or writer protocols. Test import over a different existing expedition, then reopen/Continue: previous remains the pre-import local save, original file unchanged, notice truthful. Cover both new and already persisted notices and normal local migration. Record precise migration field changes.

## Verification and return

Use meaningful transaction/behavior checks: paid pulse while carried and piloting; partial/no/remote charge and active/boundary atomic refusals; pre-vehicle recharge; shared local source eligibility and remote/berth refusal; full bulk success/overflow/empty sets/ID conservation; module install/effects/remove/loss/service/tow/salvage/rebuild/reinstall; strict invalid reference cases; old earned saves and schema1 migration; import/reopen copy and immediate saveability. Compare refused command effects against ordinary tick advance when using `step`, not against a frozen clock. Do not seed arbitrary invalid states and call them historical compatibility.

Run appropriate focused checks during development and one final `npm run check` plus M1 economy checker after changes settle. Re-run the narrow old carrier migration cases if the shared decoder changes; do not repeat the unchanged full geometry or browser matrix. Source-attributed current ordinary saves are available under `/tmp/siltwake-m1-combined-expedition/`; read evidence before selecting them. Do not run historical evidence scripts in place; inspect/copy/redirect outputs first.

Return source and evidence commits, changed-path inventory, final checks/build hash, exact new exports/commands/content guards, budget/capacity evidence, unresolved concerns and the minimum next UI needs. Include a concise manifest and reproducible targeted scripts/fixtures under your own temp directory; original evidence remains immutable. Evidence is rules/diagnostic proof only. **No ordinary-play, integrated-M1, ten-hour, consumer-GPU or enjoyment claim.** Root will reconcile then dispatch presentation/fresh-route work.

Browser exception: if a concrete unexpected need arises, first read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`; use T3 preview_status→preview_open on verified isolated factory-worker Linux, own incognito storage and port5190 after checking it is free. Never automate the owner's Windows desktop, take another task's storage, close historical tab14/shared tabs or kill shared hosts. Close only your own tab through T3 lifecycle, stop recordings/held input/pointer lock and owned preview/server before return. No open browser or server is necessary to satisfy this rules assignment.
