# POLISH-1 experience S1 — source/evidence handoff

2026-10-18. **Provisional signal-only deliverable; no feature, batch or player-experience acceptance claim.** Root owns inspection/integration, dependent presentation assignments and the complete correction's independent Astra/Sol and fresh Opus gates.

## Identity and ownership

- Exact clean parent: **d98b0eb1331241d259905aca38e8e9212bfbdeb4**; initial porcelain status empty.
- Source/test commit: **ff3b013992211b2c0a76cf1d1c0ca59ab724aba3**, branch t3/experience-signals-s1. This report is a separate following evidence commit.
- Actual runtime: **gpt-6.1-sol / max**, verified from this session's actual turn_context, timestamp2026-10-18T14:35:32.895Z, ordinal7, session01a14f70-7563-7e51-87b4-ca5772d4da3a. Retained runtime.json contains the event, its model/effort and initial checkout proof; this is not selection-only evidence.
- Source tree **263d2bb328bc27ad8798006c9edce67eee1da89c**; tests tree **83c17e414ef7cde15fae02b36883d617c9ac67f9**. Node24.21.0, TypeScript5.9.3, Vite7.3.7. identity.json binds committed bytes, all40 diagnostic/test compiled source JS files,78 exact-parent exported source/config/test files, input copies and27 production-build files.
- Changed production paths: src/sim/{types,targeting,step,progression,vehicles,modules}.ts; only four OPENING.detail strings in src/content/registry.ts. Tests: new tests/experience-signals.test.ts; exact intended event expectations only in tests/{targeting,expedition}.test.ts. This report is the only documentation edit.

Read STATUS first, PLAN/CONTRACTS, S1/whole-batch directions, revised input and specification pointers, settled map/historical tracker, root disposition and complete Opus advice. The reconciled whole-batch direction governs the corrected contact threshold, untruncated refusals, metadata placement and panel-fallback rules. No children, peer messages/polling, browser/server, push, PR, merge or other checkout was used.

## Implemented contracts

NoticeOptions adds optional transient summary text. Notice events and compatible existing notification signatures inherit it. Full message/error/channel/context behavior and saved state/schema stay compatible. No display surface, lifetime, saved counter/history or UI policy is added.

~~~ts
interface NoticeOptions { channel?: NoticeChannel; context?: NoticeContext; summary?: string }
interface CollectionOutcome {
  refusal: string | null;
  pickup: { item: ItemKind; quantity: number; destination: string } | null;
}
collectWithOutcome(s: GameState, id: SourceId): CollectionOutcome
collect(s: GameState, id: SourceId): string | null
~~~

Collection has one mutation path; collect delegates to collectWithOutcome. Success summaries contain actual registry label, quantity, destination and resulting used/capacity in CU. Partial bundles and buoy fallback report executed facts. Tending starts have no pickup receipt. Identical consecutive successful pickups each emit one notice and one collect sound, even when saved full feedback is identical.

Successful transfer/store, board/exit, service/reserve, local cell recharge, module install/remove and Dart/trim fabrication construct explicit action notices at command success sites. Store CU and reserve power use actual transaction deltas. Each explicit receipt owns exactly one existing originless collect/craft sound. Refusals retain full text with no success summary or sound. Exit summary is “Clear exit · personal suit protection”.

Known evidence notebook, disabled-hull, cache and service panel openings emit their validated interaction-panel only. Both generic fallback guards recognize that event, preventing stale saved feedback and generic collect audio. Saved feedback is not erased to control presentation. First evidence, scan and personal-record narrative/validation remain intact.

~~~ts
const INTERACTION_REACH = 4;
const PREVIEW_REACH = 8;
interface ReachPreview {
  id: string; kind: Interaction["kind"]; host: InteractionHost; label: string | null;
}
aimedInteraction(s: GameState, world: WorldQueries): AimedTarget | null
reachPreview(s: GameState, world: WorldQueries): ReachPreview | null
~~~

aimedInteraction retains strict body-datum distance<4, ray/miss/angle, real LOS, exact own-host ignore and centered/fresh/near-tie ordering. Candidate generation and picking are shared. Preview is pure, separate and non-executable: any selected in-reach target or unavailable aim ray suppresses it; otherwise it picks among4≤datum distance<8, excluding empty hosts. Depleted sort-capable sources remain eligible. Unknown evidence and every personal record have null labels; other eligible hosts use player-facing names, including registry hull labels. Opening/pilot/interior gating and eye-inside-host LOS stay authoritative. E/Q still use only aimedInteraction; no renderer/input/API change.

~~~ts
serviceRefusal(s: GameState, id: string): string | null
serviceState(s: GameState, id: string): "ready" | "patch" | "unsupported" | "away"
serviceWouldRestore(s: GameState, v: VehicleState): boolean
type CraftingBlockCode = "opening" | "blueprint" | "completed" | "needs" | "site" |
  "restore" | "duplicate-hull" | "clearance" | "materials" | "rescue-low" | "space";
craftingBlock(s: GameState, id: RecipeId, world: WorldQueries):
  { code: CraftingBlockCode; message: string } | null
~~~

One pure checkService serves service queries and service(): missing/berthed/player distance>7→away; unsupported site→unsupported; disabled→patch; otherwise ready. Mutation is unchanged: hull charge/health100, emergency air120 and the same diver/selected-hull reserve cells100. No docking/occupancy/radius restriction is added. Fully serviced supported craft remain valid commands; serviceWouldRestore reports existing deficits only. craftingRefusal delegates to craftingBlock's message; craft stays guarded through it. All prior check ordering/messages/sites/recipes and the cloned output-capacity check remain. Dart stays once:false and paid fabrication→complete frame salvage→paid rebuild is tested.

The unsaved GameEvent addition is:

~~~ts
{ type: "thrust-sample"; actorId: string; requested: number; actual: number; solidLimited: number }
~~~

All fields measure horizontal metres this fixed step. At most one sample requires the controlled powered/enabled Dart after opening, raw forward input>0.5, raw abs(strafe)≤0.1, finite integrated horizontal requested travel>1e−5m and positive travel along hull forward. Requested is hypot(delta.x,delta.z) after unchanged velocity integration; actual is net horizontal travel from this movement attempt. Inside the existing ascent wrapper each real hitSolid sweep contributes max(0, sub-sweep requested horizontal distance−returned horizontal travel).

No extra query/sweep or physical arithmetic/order change. Floor rejection and surface clamps never become measured solid loss. Observed boundary-clamped sweeps suppress the sample, including the existing corner where a following floor rejection discards moveHull's aggregate boundary flag; original movement and boundary events stay unchanged. Reverse/strafe/vertical-only, passive coast/no intent, other hulls, disabled/zero/exhausted power, boundary travel, actor/mode replacement or incapacity suppress it. Exit/reboard of the same actor in one step resets it too. Ascent measurements remain unchanged. No timer, ratio gate, app accumulator or hint is implemented here.

## Enumerated copy changes

feedback-literals.json records these complete old/new feedback substitutions; parity normalizes only their exact values:

1. “Build Dart scout / 180 m complete. Dart is in the yellow launch cradle. Approach the canopy side and board deliberately.” → identical text with **cockpit side**.
2. “Dart acoustic trim complete. ” → “Acoustic trim made · fit it from Cargo at the pod or workshop cradle.”
3. “Installed Dart acoustic trim: quiet 4.2 m/s, cruise 8 m/s, boost 9 m/s; 1 of 2 sockets and 2 CU. Noise and power use per second stay the same.” → “Dart acoustic trim fitted.”
4. “Dart acoustic trim removed from its socket. The same 2 CU item remains in the Dart hold, ready to transfer or reinstall.” → “Dart acoustic trim removed · retained in the Dart hold.”

OPENING.detail: phase0 “E · release the amber restraint. Space · skip the opening.”→empty; phase1 “E · close the service latch. The air refuge remains protected.”→“The air refuge remains protected.”; phase2 “E · trigger the reserve purge.”→empty; phase3 “E · stand up. Your hands remember the work.”→“Your hands remember the work.” Captions/labels/actions, phase timing and content IDs remain unchanged.

## Checks, parity and build

- Fresh **npm run check:376/376 tests, typecheck and production build pass**. This adds17 meaningful tests to the parent's359. Exact-parent detached compilation and359/359 parent tests also pass. Both existing economy scripts pass: node scripts/check-m1-economy.mjs and node docs/build/design/check-economy.mjs. No recipe, stock, knowledge or save grants.
- Regressions cover actual/repeated/partial/buoy/full-hold/tending receipts, command refusals and exact sound counts/origin; panel fallback in both command paths; preview3.99/4/7.99/8, precedence/ties, privacy, depleted/dynamic hosts, gates and actual E/Q; exact service mutation/precedence; all11 crafting codes/capacity; paid salvage/rebuild; actual cradle and shared ascent/thrust behavior. Existing action/sound/state/focus checks were not weakened.
- **7,956 complete parent/current aimedInteraction results match**:6,804 static-host neighborhood/aim/knowledge/depletion cases plus1,152 dynamic hull/cache cases. The retained C02 probe also selects C02 in **180/180**, with byte-equivalent parent/current output.
- **11,217 complete-state comparisons** cover22 traces/6,389 operations and four explicitly retained diagnostic fixture transitions,120 collection cases,96 service cases and4,608 crafting cases. Every physical moveCapsule input/result and call count agrees in all traces. No state field is broadly excluded; only the four exact feedback substitutions above are normalized.
- Ordered events retain sound/ascent/impact/mode/threat and all other events. Normalization removes only new summary metadata, new thrust events and12 exact removed panel echo notices. The one explicitly asserted discrepancy is retained in intentionalRepeatDelivery: the parent's second identical stepped pickup emits []; current emits exactly its action receipt plus one originless collect sound. That sound is recorded, not stripped to manufacture parity.
- All three unchanged earned checkpoints decode identically, encode identically across parent/current and round-trip without grants/schema/content changes. Traces include900 idle steps plus720 movement/command steps from each original, actual paid Dart fabrication, return/refit and a labelled partial tow/repair branch. There are24 focused current codec round trips; the unchanged full save suite passes too.

Original bytes were checked again after reads:

| Earned checkpoint | SHA256 |
| --- | --- |
| Paid fabrication | b673cb90fc81b53cbdcbf0ee234582ae64141651e43319eceb3eae96caf0c50f |
| First return | edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91 |
| Before warning | 3df46ef510e589675a422ebfbc62aaafcb626ecf3c89276c42cd5c03c219d305 |

Thirty additional detached actual-step inspections retain initial/final states, commands and raw Dart sweeps. At off-centre x22/y−0.9, quiet/cruise/boost produce112/145/151 obstructed steps of180; settled requested/solid-limited travel is respectively **0.004458598726114649 /0.0118895966029724 /0.01634819532908705m**, actual0. At centred x20 all180 steps in every throttle mode have zero measured solid loss. Cruise/boost later reach separate shore-floor stops (40/72 zero-travel steps), still solidLimited0; these are explicitly not rail obstruction. Open water/tangent/surface/floor/boundary, release/coast/reverse/strafe, other hulls, power/disable/incapacity, replacement and simultaneous multi-sweep ascent are retained. No ordinary-play docking or continuous-width claim follows.

Production JS: production-build/assets/index-C7enAubZ.js, SHA256 **0ad4f49d5a67fcf21b90900f5f8bae5b6361d0866ab1f316444e39bf36e0eb04**. Unchanged CSS: index-Dz7JMFAC.css, SHA256 **49ea57b440d3f12ace7fb99f01e1a34880329c9ce9912066f4259f22040e074c**. The existing large-main-chunk warning remains; no hardware/performance claim.

## Evidence, limits and closure

All receipts/scripts/builds are under **/tmp/siltwake-polish-1-experience-s1/**. Start with README.md, identity.json, runtime.json, parity.json, signal-inspection.json and final check/economy logs. Trace files retain commands, exact fixture states, state hashes and both event sequences; scripts reproduce comparisons. Earlier intermediate logs are explicitly labelled in README and do not describe final-source results.

MANIFEST.sha256 verifies **444 regular payloads /16,160,755 bytes**, excludes itself and external dependency-symlink targets, and has SHA256 **1e1c748a296e83b890ff30022455226b01f8411f27a438c8203be62e30bf9778**. Prior artifacts and original saves were never written. Task input copies and exact-parent source export are read-only. This report stays outside the artifact manifest to avoid self-reference.

All owned check/diagnostic processes completed. No child, pending peer work, tab, server, recording, port or watcher was created or left running. This isolated T3 worktree was the only checkout; parent comparison used a read-only archive export and detached compilation. All assigned paths are released with this bounded handoff.

No new browser evidence, result-surface behavior, cue timing, composed layout or completed player-experience gate is claimed. This is simulation/data evidence. Root owns HUD/cargo composition, full correction paired acceptance and fresh Opus verification. Human mouse feel, audible mix, duration/enjoyment and representative-GPU performance remain unverified.
