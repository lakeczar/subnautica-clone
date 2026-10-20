# SYS-1 fleet upgrades and power: interface and handoff

Opus 5.5 high · branch `feat/sys-1-upgrades-power` from `feat/siltwake-first-expedition` at `3eae303` · new files only. These are rules, data and tests ready to compose. There is no UI and no wiring.

## What exists
| Area | Content (`src/content/upgrades/`) | Rules |
| --- | --- | --- |
| Craft upgrades | `catalogue.ts`: 45 upgrades in two layers; `HULL_SLOTS`; `REACH_TIERS`; `DOCK_SLOTS` | `sim/upgrades/fitting.ts`: `installPreview`, `removePreview`, `applyFit`, `refitPreview`, `fabricatePreview`, `berthLayouts` |
| Effects | `base.ts`: `HULL_BASE`, each hull's unfitted handling, emission and tolerance | `sim/upgrades/effects.ts`: `craftProfile`, `motion`, `emission`, `heatExposure`, `hullDamage`, `brineTolerated`, `driftScale` |
| Tools and contracts | in the catalogue | `sim/upgrades/tools.ts`: overdrive, flares, ballast, arms and cutting arm, grapple, crane, ramp, service head, drop pod, salvage clamp, mooring anchor, specimen bay; contracts for sonar, tagger, listening array, scout drone and radio mast |
| SYS-2 hooks | `hosts.ts`: 8 host upgrades (decoder, survey, outpost network, chart) | `sim/upgrades/hosts.ts`: `decoderSpeed`, `surveyTier`, `mastNearby`, `outpostLimitBonus`, `livePosition`, `specimenBayAvailable`, `moduleUpgradePreview`, `knowledgeUpgradeRefusal` |
| Power | — | `sim/power/charging.ts` (craft sources), `sim/power/hosts.ts` (SYS-2 host power and drain), `sim/power/airline.ts` (diver air line) |
| Economy | — | `sim/upgrades/economy.ts`; `scripts/upgrade-economy.mjs` |

## Rules in one breath
- **Slots** (`HULL_SLOTS`):
  - Dart and Hush: 2 sockets and 1 hull bay;
  - Creel: 2 sockets, 2 bays, a major mount and a tool hardpoint;
  - Spindle: 2 sockets, 1 bay, a deck (major) and a bow (tool);
  - Mantle: 2 sockets, 2 bays and a jaw;
  - Hearthline: 4 hull bays, 2 structural retrofits and 2 powered system sockets (4 with the system bay).
- **Choices.** Signatures compete with the common pool for the same slots; a test proves every hull has a contested slot.
- **Signatures** are exactly GAME-DIRECTION's table, and each fits one hull. The M1 Dart acoustic trim and the Creel rack and cabin are folded in with their registry costs.
- **Common pool:**
  - plating: alloy, then ceramic, which adds 50 m of pressure margin;
  - S4's `hull_heat_lining` and `hull_brine_seals`, with the same IDs and costs;
  - cell banks, drive tuning and floodlights, each in two tiers;
  - silent running, the flare launcher, emergency ballast and the thermal exchanger (tier 1);
  - depth refits: today's registry refits plus new `hush_350` and `hush_450`. Never the Spindle.
- **Previews.** Every install or remove preview lists gains (the benefit and each number that improves) and losses (the trade-off, each number that worsens, the module displaced and "uses the last free socket"). It also shows slot use and the hold before and after.
- **Changes in place.** A higher tier replaces the lower in place. A full single slot swaps its occupant; a full multi-slot needs `replace` to name the module that comes off.
- **Removal** always returns the module intact: sockets stay in the hold, and other slots move into it unless `elsewhere`.
- **Refusals** (all tested):
  - wrong hull, naming the signature's hull;
  - Spindle (surface-only);
  - no free slot;
  - no dock, or a dock that can't change that slot: outposts and the Creel service head change sockets only, and the carrier changes its own fittings only at a supported mooring or the yard;
  - hold overflow;
  - a lower tier over a higher one;
  - a refit as a module, or removing a refit;
  - a tool still in use (pod out, grapple attached, anchor down);
  - unpayable or unplanned fabrication;
  - refit from the wrong rating or away from the workshop or yard.
- **No currency per vessel.** Every cost is the shared materials plus intact tagged frames.

## Adverse case (tested)
In `tests/upgrades.test.ts`, "adverse: …":
- **The setup:** a 350 m Dart with ceramic plating is rated 400 m and moored at a service stop at 380 m.
- **Removing the plating** is refused: "leaves the Dart rated 350 m, but it is at 380 m. Climb above 350 m first. Nothing changed."
- **Swapping the only hull bay** for a heat lining is refused the same way.
- **At 340 m** the change is allowed.
- **In the carrier's dry berth** with the carrier at 390 m, the change is allowed with a warning: the Dart "cannot launch until the carrier rises above 350 m or the fitting is restored".
- **Heat and brine** follow the same rule: protection can't be removed inside the hazard.
- **Already overheated** (R1), a change is judged by survival's own load rate: tolerated heat gives a margin of spare tolerance, otherwise `−(effective − tolerance) × heatLoad`. Zero stays the safe/unsafe boundary.
  - A 450 m Creel at 300 m in 0.9 core heat cannot drop its lining. Its load would rise from 0.15 to 0.55; on C3's real `stepExposure` that is 3 → 11 points per second.
  - A Dart swapping its exchanger for a lining (0.36 → 0.20) is allowed.
- **Dry-berth warnings** (R1): a berthed change is checked against `berth.carrierDepth` and `berth.exterior`, the hazard sample at the launch lock. Since R2 the sample is **required**: with no safe-water default, an unknown exterior can't certify a launch. It gets one warning per hazard the new fit could not launch into: pressure, heat and brine, each tested separately. The change is still allowed.
- **Never stranded.** No change can make the hull less safe where it is. Emergency ballast is a powerless 40 m ascent.

## Effects interface (pure)
`craftProfile(hull, v.rating, fittedKinds)` → `CraftProfile`:
- rating, including the plating margin;
- speed and loudness for idle, quiet, cruise and boost;
- drain and its mode factors, capacity, and lamp output and drain;
- damage factor, heat, heat load, ambient-heat immunity, brine and current;
- hold delta, solar, thermal charging, air line kind, system sockets, mixed berths, tools and contracts.

The per-step readers:
- `motion(profile, mode, { lamp })` → speed, loudness, drain;
- `emission(profile, loudness, lamp, powered)` → ecology's `noise` and `light`;
- `heatExposure(profile, contributions, selfHeat)`: the shroud ignores `ambient` heat and never `core` or `burst`;
- `overdriveMotion`, `ballastStep`, `grappleStep`, `flareLight` and `flarePosition` are tick-based, so they resume exactly from a save.

## Power and air (each source has a catch)
| Source | Rule | Catch |
| --- | --- | --- |
| Restored stops | `stopCharge`: today's instant full `service` | fixed places |
| Carrier charging dock | `dockCharge`: berthed craft fill at once | paid from the carrier at 0.08 (compact) or 0.12 (medium) × capacity per percent; never below the carrier's 20% |
| Reserve cells | `cellTransfer`: 35% of a stock battery | finite, and less of a bigger bank |
| Solar | `trickleRates`: within 1.5 m of the surface, × daylight | a quarter while moving; Spindle 0.05 %/s, 0.1 with the array; a test proves moving on the surface always loses charge |
| Thermal exchanger | 0.6 × (heat − 0.2) %/s | only near vents, where warm water loads the hull |
| Bio-cells | the `bio_cell` item (SYS-2, charge 0–100) is consumed and feeds 50 × charge/100 stock percent over up to 100 s | one feed at a time; `rechargeable("bio_cell")` is false |
| Current turbine (stub) | 0.06 × current while stopped and held | sandbox prototype; not in the catalogue |

**Air line** (`airLineSupply`):
- **Basic:** unlimited air within 27 m of a parked (under 0.6 m/s), powered, unberthed, intact craft, at 0.01 %/s.
- **Mantle hull air line:** 60 m, and it bridges a power loss on the hull's emergency air.
- **Range** is the hose's straight-line distance, not line of sight.

## Fit with SYS-2's hooks (`c910fea`)
A throwaway adapter type-checked cleanly against SYS-2's tree.

| SYS-2 hook | SYS-1 answer | Note |
| --- | --- | --- |
| `HostPower` (power and drain) | `hostPowerState(input).powered`; `hostDrainStep` for drain | Matches SYS-2's `PowerSource`, plus `"carrier"`: SYS-2 marks the carrier `plant`, but SYS-1 powers it from its battery above 20%, and each powered occupant drains 0.004 %/s. Cells hosts drain 100/1800 points per powered module per second (one cell runs a decoder for 30 min), bio-cells first. Solar hosts need daylight. |
| `decoderSpeed(moduleId)` | `decoderSpeed(moduleUpgrades)` | ×1.5 / ×2.25 per decoder **module** item, so the upgrade travels with a packed outpost |
| survey `tier` | `surveyTier(moduleUpgrades, moduleId, mastNearby)` | Tier 1–3 per survey module. A surfaced Spindle radio mast within 100 m **adds one tier**, capped at 3, to fit SYS-2's tier API. That is not a uniform ×1.5: the steps are 150 → 300, 300 → 500 and 500 → 800 m, then nothing. Relay range is ×1.5 (`mastRangeFactor`). The catalogue text says the same. |
| `limitBonus` | `outpostLimitBonus(knowledge.crafted)` | +1 / +2; tiers do not stack |
| `chartView(…, { livePosition })` | `livePosition(knowledge.crafted)` | one tier-1 upgrade |
| `seedCollectable(seed, specimenBay)` | `specimenBayAvailable(pilotedProfile, held)` | a piloted Hush with the bay and fewer than 4 specimens |
| `bio_cell`, charge 100 | `startBioFeed(item.charge)`, `insertBioCellRefusal(feed, item.charge, disabled)` | SYS-2's chargers must skip it (`rechargeable`) |

## Economy results
Run with `node scripts/upgrade-economy.mjs` after `npm test`. It covers 53 upgrades: 45 craft and 8 host.
- **This branch:** PASS. Ceramic, core and lattice have no placed source here yet, so they use region-level fallbacks.
- **C3 probe** (S9 sources composed, `32c91c7`): PASS, with every material placed. S9's protected deposits are excluded.

**Tier ladder** (shallowest ordinary source):
| Tier | Reach | Opens |
| --- | --- | --- |
| 1 | 150 m | crust (90 m) |
| 2 | 350 m | tagged frames (171 m), ceramic (258 m), core (289 m) |
| 3 | 450 m | lattice (366 m) |

**Rules checked:**
- every upgrade is payable from ordinary (non-cave, unprotected) stock within its tier;
- no cost is cave-only;
- every depth refit uses its tier's frontier material;
- every SYS-1 tier line adds **strictly** more common base and a rare new material: plating, cells, drive tuning, lights, Hush refits, decoder, survey and network. Since R1, an equal common cost fails (`tierStep`, tested with 7 → 7).

**What it is not** (R1):
- **Not a reachability proof.** Reach is the tier's declared depth limit, not derived from earlier purchases, plans, transport, oxygen or power. P1's playthrough owns route proof.
- **No quantity bound on unplaced materials.** On this branch, ceramic, core and lattice have no placed source, so their quantities are unbounded; even 1,000,000 ceramic would pass with a region-level flag. The C3 probe has every source placed and does the finite arithmetic.
- **Rerun at composition.** The coordinator reruns the check once S9's sources are composed. Neither run proves combined campaign solvency after arbitrary purchases.

**Stress** (reported, not gated). Every SYS-1 upgrade bought once, across all six hulls and both host scopes, after C3's required and optional campaign spend and a failed rescue, with zero renewal:
- most materials fit with room;
- crust 74 vs 70–73 left;
- frames 5 vs 4–6;
- membrane 30 vs 18–19, but the reef catches regrow;
- no player builds every hull's full signature set.

**Advisory (S9-owned costs).** The Creel refit line loses common base: `creel_350` 8 → `creel_450` 4 → `creel_800` 2. Proposal:
- `creel_450`: ceramic 6, core 2, crust 4, membrane 2, resin 2;
- `creel_800`: ceramic 8, lattice 5, core 3, glass 2, crust 4, membrane 2.

That is +6 crust, +2 resin and +2 membrane on the independent route, within its leftovers. Re-run C3's campaign economy if adopted.

**New craft** (S9 recipes, reported): Creel, Hush, Spindle and Hearthline need crust (90 m). The Mantle needs lattice (366 m). The Dart is the first craft.

## Proposed save fields (one schema change)
- **Items:** every non-refit upgrade becomes an `ItemKind`, with `ITEMS` `{ label, cu }` from the catalogue. Fitted ones keep `VehicleState.modules` (item IDs):
  - socket modules keep today's contract: hold items, `fitted: null`;
  - every other slot uses `fitted: "mount"`, outside cargo, generalising the Creel mount.

  Validation: a fitted kind must fit that hull (`slotOf`), within `slotCapacity`.
- **`VehicleState.upgrades: UpgradeRuntime`:** `flares`, `ballastArmed`, `ascent`, `overdrive { activeUntil, readyAt }`, `grapple { anchor, length } | null`, `pod { position } | null`, `anchored`. Default `initialRuntime()`.
- **`VehicleState.bioFeed: { remaining } | null`.**
- **Pod container:** `${vehicleId}_pod`, 16 CU, a cache that persists while dropped.
- **`GameState.world.flares: FlareState[]`.**
- **`GameState.moduleUpgrades: Record<itemId, HostUpgradeId>`,** for SYS-2 decoder and survey modules. Knowledge upgrades live in `knowledge.crafted`.
- **`CarrierState.configuration`** gains `"mixed"`. The coordinator enforces SYS-1's 2 (4 with the system bay) powered system sockets against SYS-2's authored socket map at composition. System-socket occupants are SYS-2's (`carrierOccupants`). The carrier charging dock is SYS-2's charger module (`mod_charger`) in a Hearthline system socket, so there is no new item.

## How to compose
- **`registry.ts`:**
  - **Items:** add the upgrade items and the host upgrades to `ITEMS`.
  - **Recipes:** one `RECIPES` entry per upgrade: catalogue cost, `bp: plan`, `needs` = the hull's base recipe for signatures or `restore_workshop` for common items, `site: island_workshop` (plus restored stops, the yard and carrier fabrication). Add `hush_350` and `hush_450` to `REFIT_TIERS`.
  - **Modules:** derive `MODULES` from the catalogue, or retire it.
  - **Creel refits:** apply the cost proposal above if accepted. `tests/upgrades.test.ts` already asserts that registry-described entries equal `RECIPES`.
- **`modules.ts`:** build a `FitTarget` and keep today's local-access and cabin checks in front of `installPreview`/`removePreview`. The target is:
  - `v.rating` and the fitted kinds;
  - the dock: home pod, workshop, restored stop, `carrier_berth`, outpost, or `service_head` when another Creel with the head is within 8 m;
  - `hullDepth`; for a berthed craft, `berth: { carrierDepth, exterior }`, where `exterior` is the hazard sample at the carrier's launch lock. It is required; sample the hazards at the lock exit point;
  - the hazard sample (heat classified as `core` inside a cycled plume's shape, `burst` while its cycle is active, else `ambient`);
  - `usedCapacity` and `HULL_HOLD_CU`;
  - the carrier state and `inUse`.

  Apply `fittedAfter`, set the hold capacity to `HULL_HOLD_CU + profile.holdDeltaCu`, and clear `mobileRefuge` if the cabin leaves. The disabled-hull collar release stays and gets the same safety check. `dartPerformance` reads `craftProfile`.
- **`step.ts`:** compute the profile once per piloted step.
  - **Motion:** replace the speed, drain and loudness literals with `motion`, wrapped by `overdriveMotion`.
  - **Overrides:** apply `ballastStep` as an upward hull sweep (it works unpowered) and `grappleStep` as a position constraint, then re-sweep.
  - **Charging:** add `trickleRates` and `bioFeedStep` charge.
  - **Damage:** route impacts and bites through `hullDamage`.
  - **Ecology:** feed `emission(...).light` and active flares to the ecology stimulus.
  - **Command:** add `{ type: "upgrade", action: "overdrive" | "flare" | "ballast" | "grapple" | "reel" | "release" | "drop-pod" | "collect-pod" | "anchor" | "sonar" | "tag" | "patch" | "crane-lift" | "drone" | "rearm" | "bio-cell" }`, with an optional `replace` on `install-module`.
- **`survival.ts`:**
  - **Pressure:** hull pressure damage and the 0.85 warning use `profile.rating`.
  - **Air:** a swimming diver is `breathable` when `airLineSupply` returns a supply (`airSupply` kind `"line"`). Charge the craft `drain × DT`, or count down its emergency air while the Mantle line is bridging.
  - **Hazards:** S4's heat and brine exposure read `profile.heat`, `heatLoad` and `brine` through `heatExposure`, with harm × `profile.damage`.
  - **Also on the rating:** `mobileRefugeBlock` and exit messages use `profile.rating`.
- **Elsewhere:**
  - `vehicles.ts`: `reserve` uses `cellTransfer` and `service` calls `rearm`.
  - `carrier.ts`: `"mixed"` layout from `berthLayouts`; launch refused when `profile.rating` is below the carrier's depth (the dry-berth warning's promise); `dockCharge` for the charging dock, with `dockFitted` set when a SYS-2 charger module is socketed in the carrier.
  - ecology: `LAMP_OUTPUT` becomes `profile.lamp`.

## Stubbed
- **Contracts only:**
  - sonar, tagger and listening array: no chart, journal or UI output;
  - the scout drone: no drone simulation or controls;
  - radio mast relay range;
  - turbine (prototype first).
- **Mixed berth geometry:** no `CARRIER_LAYOUT` room set for the mixed layout yet. Carrier and S3 geometry is needed.
- **Unwired actions:** deck-crane, clamp, pod and specimen-bay actions have rules but no world objects.
- **Proposals:** base Mantle handling (today `step.ts` drives it with Dart constants) and the Spindle's own solar canopy.
- **No day cycle:** `daylight` defaults to 1.
- **Balance:** every number is a proposal.

## Checks
- **`npm test`:** 834/834 pass, with 53 SYS-1 tests in `tests/upgrades*.test.ts` and `tests/power.test.ts`. The fast tier's Babylon guard holds. At the R1 candidate `1bef219` it was 832/832.
- **Composed probe:** C3 `32c91c7` + SYS-2 `c910fea` + SYS-1, from the reviewer's tree. The 53 tests pass, and the economy check passes with every source placed.
- **Economy on this branch:** PASS, with region-level fallbacks.
- **Heavy tier:** not run. No SYS-1 file reaches Babylon or rendering.
- **Browser:** not run, as briefed.

## R1 fixes (Sol xhigh, changes-needed)
- **P2, heat while overheated.** `heatMargin` weights the excess by survival's load rate. Regressions cover removal while overheated and a safer swap. Rechecked against C3's real `stepExposure`: the 3 → 11 removal is refused.
- **P2, dry-berth warnings.** `FitTarget.berth.exterior` is documented, and `launchWarnings` warns separately for pressure, heat and brine. Each has its own test, plus a no-warning case.
- **P3, tier guard.** `tierStep` requires a strict increase, with a negative regression for 7 → 7.
- **Notes.** The economy check is not a reachability proof, and unplaced materials are unbounded on this branch. The mast wording is reconciled. The 2/4 system-socket limit is left to composition.

## R2 fix (Sol xhigh, changes-needed)
- **P2, unknown launch exterior.** `FitTarget.berth.exterior` is now required, and the safe-water fallback is gone. The no-warning tests pass an explicit benign sample, and a type-level `@ts-expect-error` test keeps an omitted exterior a compile error.
