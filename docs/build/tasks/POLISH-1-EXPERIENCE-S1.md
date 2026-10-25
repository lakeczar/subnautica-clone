# POLISH-1 experience S1 — shared presentation data and queries

Use **gpt-6.1-sol / max**, isolated T3 worktree from the exact committed parent in the dispatch. Read STATUS first, PLAN/CONTRACTS, `prompts/BUILD_GAME_REVISED.md` and its specification pointers, then [whole-batch direction](POLISH-1-EXPERIENCE.md), root disposition and Opus advice. The whole-batch direction overrides conflicting advice. Return source and evidence commits; no acceptance claim. This leaf supports the subsequent HUD and cargo owners and shares their final independent acceptance gate.

## Exclusive paths

- `src/sim/{types,targeting,step,progression,vehicles,modules}.ts`.
- `src/content/registry.ts`: only OPENING detail strings, never IDs, geometry, recipes, quantities or other registry data.
- New `tests/experience-signals.test.ts`; existing `tests/{targeting,simulation,expedition,modules,command-snapshot,hull-clearance,encounter-signals,preparation-panels,presentation}.test.ts` only targeted regressions or necessary exact-output expectations for the explicitly changed metadata/copy. Do not weaken action, sound, state or focus checks. Presentation/preparation tests are included solely because they import the changed feedback/copy and may assert exact prior strings; no production UI edits.
- `docs/build/evidence/POLISH-1-EXPERIENCE-S1.md`; temp `/tmp/siltwake-polish-1-experience-s1/`.

No world/collision/carrier/recovery/survival/save/session/input/app/UI/render/CSS/config/package edits. No children, peer messages/polling, push/PR/merge or parent mutation. No browser/server needed or authorized for this signal-only leaf. If another path is essential, send a concrete proposal and continue independent owned work; no waiting on another worker. Verify actual runtime/effort from session turn_context, not just requested selection.

## Frozen additions and behavior

### A. Typed action summaries without new state

Add `summary?: string` to `NoticeOptions`, inherited by notice events and existing compatible notification APIs. It is optional transient text for an action result; never added to GameState or save data. `message`, severity, channel/context and existing public signatures remain compatible. Later UI alone chooses summary versus message; this leaf does not implement the separate surface or new lifetimes.

Attach concise summaries at actual success sites for collection, transfer/store, board/exit, service/reserve, module install/remove and Dart/trim fabrication. Use exact facts from that executed operation. Neutral exit text must not say “On foot” after an underwater exit. Refusals retain the complete existing message with no success summary. Preserve discoveries/scan/journal narrative; don't truncate or classify by message text. Existing unlisted outcomes can fall back to the full message.

For collection, keep `collect(s,id): string|null` compatible with one mutation path. You may extract `collectWithOutcome(s,id)` returning `{ refusal: string|null; pickup: { item: ItemKind; quantity: number; destination: string }|null }` and wrap it with collect, or use an equally narrow internal receipt preserving the same exports. No duplicated reach/capacity/provenance logic. A food-tending start has no pickup receipt. Full feedback keeps habitat context; summary uses actual registry label, quantity, destination and resulting used/capacity. Successful identical consecutive pickups must each emit exactly one notice and the existing collect sound. Explicit event construction must preserve the appropriate action sound exactly once; preserve originless body/equipment semantics.

No saved counters/history/cache. Change full feedback only for the named copy improvements: Dart build “cockpit side”; trim made with Cargo fitting next step; trim installed/removed concise outcome without repeated performance facts. Other full messages/rules remain. Record any changed feedback literals explicitly so parity checks do not silently drop all feedback.

Remove companion action echo notices from validated `interaction-panel` openings (known notebook target, disabled craft, cache, service). **Update both generic fallback guards** so a panel event cannot produce stale `draft.feedback`/`s.feedback` or generic collect audio. Keep the panel event, target, first discovery/record content and command validation. No input/focus changes.

### B. Pure non-executable reach preview

Preserve `aimedInteraction(s,world): AimedTarget|null` exactly, including strict distance<4 from body datum, ray/host/LOS and tie behavior. Extract shared candidate/pick internals rather than a second truth. Export constants `INTERACTION_REACH=4`, `PREVIEW_REACH=8` and:

```ts
export interface ReachPreview {
  id: string;
  kind: Interaction["kind"];
  host: InteractionHost;
  label: string | null;
}
export function reachPreview(s: GameState, world: WorldQueries): ReachPreview | null;
```

Return null whenever any in-reach executable target exists or aimRay is unavailable. Otherwise choose using the existing rules among4≤datum distance<8, excluding `verb:"empty"`. Sort-capable depleted sources may preview. Unknown evidence and all personal records have null labels; known evidence/source/dynamic targets use player-facing names, including registry hull labels for vehicles, not IDs. Keep exact own-host ignore and real LOS; no sphere bypass, reveal, scan, action or state mutation. Preview types must not become input to E/Q execution. No renderer/API change in this leaf.

### C. One service check, typed crafting refusals

In vehicles.ts derive `serviceRefusal(s,id): string|null` and `serviceState(s,id): "ready"|"patch"|"unsupported"|"away"` from one shared pure check, with current order: missing/berth/player>7m → away; unsupported service site → unsupported; disabled → patch; otherwise ready. `service()` uses that same check and retains its exact mutation (including emergency air and the same cells). No extra docking/occupancy/radius restriction is introduced. `serviceWouldRestore(s,v): boolean` reports existing hull/power/emergency-air/cell deficits; it cannot change service validity. Export it for panel state only; HUD discovery must also work when fully serviced. No message-string classification.

In progression.ts export `craftingBlock(s,id,world): {code: CraftingBlockCode; message:string}|null`; `craftingRefusal()` delegates to its message. Use explicit codes `opening`, `blueprint`, `completed`, `needs`, `site`, `restore`, `duplicate-hull`, `clearance`, `materials`, `rescue-low`, `space`. Retain all current check ordering, messages, recipe/site conditions and mutation-free output-capacity check. `craft()` stays guarded by the same authority. `dart_base` remains once:false; no content/knowledge change. Later panels use current hull ownership directly rather than moving the duplicate-hull check ahead of earlier prerequisites.

### D. Observed Dart forward obstruction

Add the unsaved GameEvent:

```ts
{ type: "thrust-sample"; actorId: string;
  requested: number; actual: number; solidLimited: number }
```

All distances are horizontal metres for this fixed step. Emit at most once per step for the currently controlled powered, enabled Dart after opening, with positive forward input>0.5, abs(strafe)≤0.1, and positive horizontal attempted travel along the hull's forward direction. Do not emit for another hull, reverse/strafe-only/vertical-only input, passive inertia, no input, disabled/zero power, boundary-clamped travel or a same-step actor/mode replacement/incapacity. Absence resets the later app accumulator.

`requested` is hypot(delta.x,delta.z) from existing velocity integration; `actual` is net final horizontal travel from this movement attempt. Observe current `moveCapsule` results inside the existing measuredWorld wrapper (shared with ascent) exactly once: for each `hitSolid` sub-sweep accumulate max(0, hypot(d.x,d.z)−hypot(result.x−origin.x,result.z−origin.z)). This is measured solid limitation only. Do not count moveHull's separate terrain-floor rejection, boundary or surface clamp as a solid rail; no requery or changed arithmetic/order. Leave ascent measurements and every existing physical result unchanged. Do not gate sample emission at0.02m: actual contact settles below that, as root proved. Require only finite requested>1e−5m and appropriate input/direction. The later UI chooses0.5s persistence and loss ratios; this leaf has no timer or hint.

### E. Minimal opening copy

Remove redundant key-instruction prefixes in OPENING.detail, keeping narrative remainders/captions and skip/control actions. Empty details are allowed; later HUD owns hiding them. No content IDs, phase transitions, timing or lore changes.

## Required checks and return

- Fresh `npm run check` (parent359 tests) and both existing economy scripts. Meaningful regressions for actual summary facts, repeated identical pickups, partial bundle/buoy destination, full hold/no pickup, tending, command refusals, sound count/origin and stale panel fallback through executeCommand and stepGame.
- Preview boundary3.99/4/7.99/8; in-range precedence, tie selection, unrelated/own-host solids, unknown/known/depleted/dynamic hosts, opening/pilot/interior gating, no mutation and real E/Q still out of reach. Compare accepted target output over an appropriate bounded grid, including the retained180-case C02 probe.
- Service helpers agree with every command refusal and exact successful mutation, including distance7 boundary, support/restoration, berth, disabled, partial cells/emergency air and fully serviced valid command. Crafting code/message order and output capacity preserve all recipes; after real paid fabrication/salvage/rebuild the Dart recipe remains viable.
- Instrument actual stepGame cradle approach: quiet/cruise/boost off-centre produces nonzero measured limitation, centred cradle passage does not; open water, tangent slide, reverse/strafe, passive coast, surface/terrain/boundary, unpowered/disabled and actor replacement exclude false claims. Prove ascent still works with the shared wrapper. Do not mislabel later shore-floor stop as rail obstruction. Inputs are detached diagnostics, not ordinary browser play.
- Compare complete parent/current state through the three unchanged earned checkpoints and focused command/movement/refit/recovery traces. Preserve source/saves read-only. Strip only new summary/thrust events and explicitly removed panel echoes when comparing event sequences; keep sound/other events. State differences may include only enumerated intentional feedback-copy changes, never broad state exclusions. Existing saves decode and codec roundtrip unchanged. Retain enough receipts to reproduce discrepancies.
- Provide exact signatures/semantics, changed paths, source/evidence SHAs, actual model/effort proof, checks/build identity, inspected limits and owned-resource closure. Use a manifest excluding itself. No fresh browser evidence or completed player-experience claim. Root will inspect, integrate and assign dependent UI owners, then apply the full correction's paired and Opus gates.

Browser rules remain mandatory if root later authorizes a necessary browser amendment: read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` first; verify the actual Linux renderer process owner, use task-owned isolated T3 incognito/storage/port and normal cleanup, preserve shared/human resources, never automate the owner's Windows desktop. Existing artifacts suffice for this assignment.
