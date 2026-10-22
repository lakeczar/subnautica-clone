# CR-1: natural threat windows and creatures as resources

Opus 5.5 high. Branch `t3/natural-threat-windows`, on root `c649b11` (C4, CA-3 and CB-2 integrated). Code `__CODE__`. Story-neutral; `docs/spoilers/*` not read.

## Outcome
**A. A natural way past every threat.** Each threat has its own creature cycle. While a threat is busy it perceives nothing and never escalates; if it was engaged, it breaks off with a caption and is spent through S4's refractory. Afterwards ENC-1's full warning ladder applies.

| Threat | Window (cycle ID) | Seen as | Busy / worst wait |
| --- | --- | --- | --- |
| Sound hunter | `cycle.canopy.hunter_feeding`: it swims 55 m east and circles the lantern shoal | it leaves, the shoal bunches and flashes, then scatters as it returns | 56 s / 61 s |
| Glare stalkers | `cycle.rift.stalker_feeding`: both rise into the venting plume and linger 15 s on what settles | lights ripple fast and warm up in the shimmer; the mites leave first | 36 s / 39 s |
| Layer skates | `cycle.divide.skate_rest`: they sink 14 m into the brine in crest slack | the mirror stills; the crest ribbons stand upright | 34 s / 56 s |
| Layer skates | `cycle.divide.skate_laying`: a rare visit to lay on the lee shelf egg cases, above the brine (CB-2) | laying skates circle the egg cases | 90 s / 270 s |
| Hollow choir | `cycle.meridian.choir_rest`: the bells fold shut and rest | the rims dim and the bells close | 26 s / 52 s |

- **First sight** of each window shows one short caption, and the journal's cycles tab starts timing it, using CY's observer.
- **Bait:** M releases a caught small fish 8 m ahead, where it sinks and struggles.
  - The stalkers and skates turn to feed on it, as they do for a lure.
  - The choir closes on it.
  - A resident hunter takes it as a 20 s distraction. A hunter already away feeding ignores it.
- The existing deterrents and ENC-1's rules are unchanged. Helper animals are now allowed, but none were needed: the schools at grounds, the hunter's shoal and the mites already read naturally.

**B. Creatures as resources.** None of the new items is a material; the bible's eight stay eight.

| ID | What |
| --- | --- |
| `small_fish` | Caught by hand (E: one) or with a carried `hand_net` (two; membrane and resin at the pod). Cooked, released as bait, or trapped. |
| `roe_cluster` | Rich food from spawning grounds. One cooks into two meals. |
| `planter_feed` | One feed on a young crop (under 40% grown) grows it 40% at once. A crop takes feed once. |
| `mod_fish_trap` | A SYS-2 module (`trap`, no power). One fish per 240 s near a fish ground or CB-2 trap spot, half that rate elsewhere. Holds at most 4, then waits. Dry hosts (the workshop) refuse it. Its catch travels with the module. Emptied in one press. |

- **Cooking** is one interaction with portions (Cargo → Catch: "Cook 1 portion" or "Cook all"). It works at the pod and workshop galleys (the refuges that already issue meals), the Creel cabin cooker and the Hearthline galley. Roe is used first, then fish in pairs. Meals keep.
- **Grounds** are ordinary `SOURCES`, with every ID, item and datum as CB-2's `src/content/proposals/fauna.ts`. Each regrows one unit to a cap, never as a timed wait:
  - fish: `reef_fish_ribs`, `isles_fish_split`, `basin_fish_ridge`, `hub_fish_crown`;
  - roe: `reef_roe_nursery`, `isles_roe_cove`, `canopy_roe_crowns` (in the hunter's home crowns: take it while the hunter feeds);
  - shed: `reef_shed_moults`, `isles_shed_shells`, `canopy_weaver_resin`, `rift_mite_grit`, `basin_scavenger_casts`, `rift_crawler_moults` (in CA-3's kiln tube), `divide_picker_moults`, `meridian_scavenger_casts`.
- **Carcass falls** (`fall_basin_west`, `fall_basin_east`, `fall_divide_lee`) are static ribcages with scavengers at CB-2's raised datums, at least 30 m off every route. Their salvage (hide, bone, crust) is finite.
- **Protected:** `divide_skate_eggcases` and `hub_ray_eggcases` are scan-only (HUD "Look · protected"). Threats, rare residents and story animals are never sources.

## What changed (contracts)
- **New, CR-1-owned:**
  - `src/content/fauna/{items,grounds,windows}.ts`;
  - `src/sim/fauna/{windows,catch,trap,link}.ts`;
  - `src/render/creatures/fauna.ts` (schools by stock, roe, shed piles, egg cases, falls, the hunter's shoal, laying skates);
  - `src/ui/faunaPanels.ts`;
  - `tests/cr-1-creatures.test.ts` (23 tests);
  - `docs/build/streams/cr1/{derive,play}.mjs`.
- **Ecology and threats (owned):**
  - `agents.ts`: a busy branch, and break-off sets spent; engagement counts are never refreshed by a window.
  - `ecology.ts`: bait sinks; `EcologyView.threats[].busy`.
  - Deterrent `bait` added in `species.ts`, `persist.ts` and `equipment.ts`.
  - `hunter.ts` and `hunterEncounter.ts`: the round's target and speed; no interest gain while feeding; break-off.
  - `choir.ts`, `stalker.ts` and `skate.ts` show the busy postures; `cues.ts` draws bait; `layer.ts` composes the fauna group.
- **Minimal, additive edits in shared roots (please review):**
  - `content/registry.ts`: `FAUNA_ITEMS`, `FAUNA_RECIPES`, `FAUNA_SOURCES` and `FAUNA_RENEWAL` spreads; `SourceDefinition.item` adds `FaunaItemKind`.
  - `content/currents/cycles.ts`: five creature cycles appended to `WORLD_CYCLES` and `CYCLES`, beside CY's warden candidate.
  - `content/systems/{items,hosts}.ts`: the `mod_fish_trap` row and recipe (`bp_field_outpost`) and `MODULES.trap`. `stackable` includes fish, roe and feed.
  - `sim/systems/state.ts`: **`SystemsState.traps`** (`{moduleId, progress, held}`), strictly validated; `instances.ts` cross-checks it.
  - `save/content.ts`: an absent `systems.traps` is New Game's `[]`.
  - `sim/step.ts`: one `faunaCommand` hook before `systemsCommand`, and one `stepFauna` call after `stepSystems`.
  - `sim/types.ts`: commands `cook-catch`, `release-bait`, `feed-planter` and `empty-trap`.
  - `sim/progression.ts`: the net bonus and empty-ground text in `collectWithOutcome`.
  - `sim/inventory.ts`: stacking.
  - `ui/panels.ts` registers the Catch section; `ui/systemsPanels.ts` adds one line for socket actions; `ui/hud.ts` adds one line for verbs.
  - `runtime/app.ts`: `KeyM` releases bait.
  - `render/renderer.ts` passes `state` to the creature layer.
  - `render/{expedition,environment}.ts` skip creature grounds in the legacy source art.
- **Saves:** no schema bump. New sources and renewal rows load as New Game's (additive content); `systems.traps` is filled as `[]`. `earned-c06.json` and `reef-rib-trap.json` were re-canonicalised by decode → encode; only rows were added.
- **Test pins updated for additive content.** Each comment says why:
  - roster and renewal pins: `resource-renewal`, `renewal-save`, `additive-content`, `campaign-economy`, `progression-curve`, `c4-world`, `persistence-support`;
  - normal views: `targeting-support`;
  - window observation is ignored in knowledge and notice equality: `expedition`, `recovery-occupancy`, `c4b-fixes`;
  - `presentation` lets another host's "Move closer" show;
  - `regions-world`;
  - `content-proposals` lets a declared in-cave ground sit in its cave;
  - `creature-lore`: a protected spawn may be a scan-only source.
  - Scripts: `check-m1-economy` names the hand net; the playthrough adds a `creatures` phase (catch, cook, craft and socket a trap at the pod) and empties the trap at the refits payoff, with fail-closed effect rules.

## Checks
__CHECKS__

## 3090 ordinary-key play
__PLAY__

## Adverse case
S4's real-world adverse case: a diver who lingers lit and loud in the stalkers' passage, then climbs out dark. When I first added windows, the busy branch reset the animal's strike count, so every feeding bout gave the stalkers a fresh engagement. The diver lost **229 HP** against S4's 60 HP bound. Fix: a window never refreshes an encounter, and an animal that breaks off to feed is spent through its refractory, as a lure spends the choir. The bound holds again (`ecology-world`, `ecology-adverse` and `ecology-agents` pass unchanged).

## Known limits and notes
- **Laying visit:** the two roster skates sink away north under the mirror while two laying skates appear at the lee shelf. They are the "same" animals, 340 m apart, never in one view. The sim can't path a skate across the crest out of its brine habitat.
- **Bible conflict:** `meridian.choir_rest` was listed as "existing refractory, don't add a cycle". The owner's 2026-10-22 rule (every threat has a natural window) supersedes it; flagged for CB.
- **Moved from CR-1's draft for CB-2:** none. All datums match CB-2. `rift_crawler_moults` sits on the kiln tube's floor (CA-3).
- **Not built:** a trap model in the world (the module lives in the Base panel), breeding tanks, light jars. Creature log text belongs to CB-2.
- **Tuning hypotheses for the owner's playtests:**
  - fish regather 1 per 240–300 s (cap 3–4);
  - roe 1 per 15 min (cap 2);
  - a trap at most 7.5 meals an hour;
  - no source feeds more than 8 meals an hour.

  Food was already non-scarce (the reef cups can always be tended), so these add options, not a required path.
