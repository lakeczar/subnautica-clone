# SIG-1: every craft's signature identity, live, plus visible outposts

Branch `t3/sig-1-signatures`, from root `1662e5a0` (SIM-1a merged). **Accepted and merged:** stage 0 at `7df4c8ab`, stage 1 at `2901fed1` (R3, Sol `9a7c44dc`; `npm run gate` 10/10). Brief: the compromise verdict's plan row 9 (ART-09, UI-01, TST-11) and the steward verdict's F12, F17 and F05.

## Stage 0: one inventory authority (steward F12)

**Code `f2bdb984`, R1 fixes `cc7f55f7`, R2 fix `a4e1834e`.** Reported separately so it can be reviewed before anything builds on it.

### Outcome
`src/sim/inventory.ts` is the only inventory arithmetic. The temporary ledger fork (`src/sim/systems/ledger.ts`, `FORK(ledger)` in STEW-1's CORE-HELPERS) is deleted, and every one of its seven importers now calls the authority.

### Changed contracts
- **One spend path:** `planSpend(s, cost, containers, priority)` returns a detached plan (`lines`, `missing`), and `applySpend(s, lines)` applies it unchanged. `spend()` is gone.
- **Container priority is explicit** (`SpendPriority`), because the two old implementations really did differ:
  - **`listed`** (the default) draws container by container in the order the caller lists them. Systems, outposts, cultivation, navigation and fauna use it, as they did through the ledger.
  - **`oldest`** draws the oldest stack first across all the listed containers. The fabricator benches and story repairs use it, which keeps B1's accepted bench rule: which container empties first stays exactly as before.

  Unifying the two would be a design change (for example "a bench draws from storage before the diver's hold"), so I left them separate. That's a possible owner call, not part of this stage.
- **Sizes, labels and stacking** now come from the composed registry only:
  - `cuOf` and `labelOf`: an unknown kind weighs `Infinity`, so a room check fails closed;
  - `itemCu`, `freeCapacity` and `restoreInstance`, moved over from the ledger;
  - `addItem` stacks by `content/systems/items.ts` `stackable`, replacing its hardcoded list (the same set);
  - `removeQuantity` also replaces two inline copies, in `ecologyLink.ts` (lures and ink) and `fauna/catch.ts` (bait).
- **F05 for the previews this stage touches:** `craftingBlock` checks room after spending with `hasRoomAfter(s, plan, container, cu)`, which reads the spend plan. Before, it ran `structuredClone(s)` of the whole state twice per refusal query. A test proves the two agree across every container, cost and priority.
- **`journal.ts`** reads the composed `RECIPES` and no longer remerges raw `SYS2_RECIPES` over them.
- **`containerAccepts`** takes `kind: string`, as the ledger's `accepts` did.

### Checks
All bound to `f2bdb984` and run on the RTX 4070 Laptop (alickers), because of CW-1's 3090 window:
- **`npm test`:** typecheck plus **1,421/1,421** tests. That includes the new `tests/inventory-authority.test.ts`:
  - each priority's order;
  - fitted and maintenance stacks are excluded;
  - plan-based room checks equal a spent clone, in every container;
  - stacking comes from the registry.
- **Economy:** `check-campaign-economy`, `check-m1-economy`, `check-m2-a-economy`, `check-m2-b1-economy`, `upgrade-economy` and `check-progression-curve` all exit 0.
- **`npm run playthrough -- --jobs 3`:** all 8 scenarios complete, with every reload matching. The play minutes equal root's library exactly:
  - creel 201.7;
  - carrier 363;
  - creel-loss 209.7;
  - reverse 206.7;
  - no-optional 200.9;
  - low-air 5.3;
  - tour 129.9;
  - over-geared 83.9.
- **Unchanged means bit-identical.** Every one of the **122** saves the run made has a state hash that is in root's save library (`/work/tmp/siltwake-saves/b54bfd92…`, the same game code as `1662e5a0`), and all **73** library states are reproduced. Stage 0 changes no state on any route.

### R1 fixes (Sol `review/sig-1-stage0`, request changes; code `cc7f55f7`)
- **R2, an incomplete plan is not executable.** `applySpend(s, plan)` now takes the whole plan. It refuses with `SpendRefused` before writing anything when:
  - any `missing` is nonempty;
  - any line is stale: its stack is gone, has changed kind, container or spendability, or holds less than the lines on it ask.

  Every caller passes its plan, including the outpost pack and upgrade previews (`PackPreview.loss` and `UpgradePreview.cost` are now `SpendPlan`). A refusal there is a logic error: no current command plans a shortfall and then applies it.
- **R1, every removal and CU total goes through the authority.**
  - **`takeInstance(s, itemId)`** lifts one chosen item out whole, keeping its ID, charge and provenance. It now serves:
    - the bio-cell a hull is fed: the chosen cell, with its own charge;
    - socket installation (`systems/hosts.ts`);
    - outpost deployment and the modules refitted into its sockets (`systems/outposts.ts`).

    Socket and layout ownership stay in their domains.
  - **The duplicate CU sums** now read `usedCapacity`, `freeCapacity`, `itemCu` and `cuOf`:
    - `render/fleetArt.ts` `updateCreelArt`;
    - the playthrough `Driver.usedCu`/`freeCu`, its effects oracle and its cargo loads;
    - canister salvage, and the frame-salvage destination check;
    - the save loader's carrier hold split (over known items only, so a corrupt save is refused as before);
    - the Cargo panel's item sizes.
- **Checks (`cc7f55f7`, RTX 4070 Laptop on alickers):**
  - **`npm test`:** **1,424/1,424**. The new regressions cover an unpaid multi-material cost (refused, state unchanged), a stale plan and an over-asked stack (all or nothing), and the chosen bio-cell (its ID gone, the other cell kept, the feed from its charge).
  - **Economy:** all six scripts exit 0.
  - **Playthrough:** 8/8 complete with all 122 reloads equal and the minutes unchanged. All **122** save hashes are in root's library, and all **73** library states are reproduced: still bit-identical.

### R2 fix (Sol `review/sig-1-stage0-r2`, request changes; code `a4e1834e`)
- **Cooking room comes from the spend plan.** `cookPlan` summed freed *quantities* as freed CU, outside the authority. It now asks `hasRoomAfter(s, pay, container, cuOf("meal") * meals)`, keeping the destination order (the cooker's store, then the diver hold) and the acceptance checks. The refusal names the meals' CU from the same size.
- **No result changes:** fish, roe and meals are 1 CU each.
- **Regressions** (`tests/cr-1-creatures.test.ts`):
  - an exact fit from the locker cooks there;
  - raw from the diver beside a full locker cooks into the diver hold;
  - one CU short everywhere refuses with the meals' CU and changes nothing.
- **Checks (`a4e1834e`, RTX 4070 Laptop on alickers):**
  - `npm test`: **1,425/1,425**;
  - economy: all six scripts exit 0;
  - playthrough: 8/8 complete, with 122/122 reloads equal and the minutes unchanged. All **122** save hashes are in root's library, and all **73** library states are reproduced: still bit-identical.

### Follow-ups for the coordinator
- **CORE-HELPERS:** done. STEW-1 merged without the `ledger` row.
- **F05 beyond this stage:** the panels' clone dry runs (`carrierPanel.ts`, `panels.ts` reserve and recovery) stay as the steward accepted them. Previews SIG-1 touches later use plans.

## Stage 1: every signature live, visible outposts, a cargo filter

**Code `094e7820`**, on root `7df4c8ab` (stage 0 merged) and STEW-1's merge (`06442757`).

### Outcome
Every catalogue upgrade now has a recipe, and none is inert. Each is felt in play, through ordinary keys, in a real browser.
- **Dart:**
  - **wide-sweep sonar:** a loud, 2% sweep (8 s cooldown) finds cave openings within 180 m. Each opening flares through the murk as the sweep's front reaches it, and each becomes a chart landmark.
  - **range tagger:** holding the aim 1.5 s on a creature, material source or lost site files it in the journal from up to 60 m (a site's data is captured, as if visited). The aim drifting off loses it.
- **Creel:**
  - **cutting arm:** mineral hosts anywhere become arm work, in 4 s instead of 6, with half again the bundle (+2% charge).
  - **grapple:** a 30 m line to rock holds the hull at its length (free station-keeping in currents) and reels it in. Aimed at a frame host, it hooks the frame and reels it aboard. It releases when the line is crossed or runs out.
  - **cargo pod:** drops a 16 CU container to the floor at a work site; the diver loads it there, and the Creel collects it. Aboard, it opens like the hold.
- **Spindle:**
  - **deck crane:** from the surface, it lifts up to 10 CU of non-living material or a frame from 12 m or shallower, within 8 m, in 5 s (3% charge).
- **Mantle:**
  - **salvage clamp:** two frames, or a 20 CU wreck part, per 6 s grip (4% charge). Gripping a disabled hull holds it in tow behind the Mantle.
  - **scout drone:** flies on the pilot's input (the view is its camera) while the Mantle holds station. It scans sources, lost sites and cave openings within 12 m and marks its path on the chart. It comes home on recall, at its 60 m tether or after its 120 s battery.
- **Hearthline:**
  - **berth extension:** a mixed layout, with the service berth beside a compact berth, so the carrier carries a medium and a compact craft at once.
- **Host modules:** a decoder lattice (×1.5, ×2.25) or survey array (300, 500, 800 m) is fitted in place at the module's host, from the Base screen. It travels with the module.
- **In the water:** deployed outposts are built by tier and power, with every socketed module visible:
  - the planter crop by stage;
  - the decoder lit while it decodes;
  - the fish trap's cage and its catch.

  Modules in fixed hosts' sockets show on a small rack. The pod, the grapple line and claw, the drone and its tether, crane and clamp lines, and fitted signature hardware on each hull all show.
- **The craft action bar:** the number row runs the piloted craft's fitted actions in a fixed order per craft, shown with their state on the HUD (cooling, active, counts). Before, keys 1–6 were bound globally and never shown.
- **Cargo filter (UI-01):** a "Show" select (All, Materials, Food & living, Power, Gear) with counts filters every container's rows. It is panel-local and never saved.
- **HUB-2-01:** the crown stage-order test now funds the later stage and attempts it through Fabricate and `executeCommand`. It asserts the refusal names its prerequisite and that the state is unchanged, so it fails when the prerequisite is removed.

### Changed contracts
- **Saves: schema 7** (content stays `expedition.7`). `save/bridge6.ts` converts schema 6, purely additively:
  - per craft: `upgrades.sonar`, `tag`, `drone`, `lift` and `tow`, at New Game's value;
  - `systems.moduleUpgrades`, starting empty.

  A schema 6 save holding any schema 7 field is refused. Per DIRECTION (the immediately previous schema only), **schema 5 is now refused as an older build**, and `bridge5.ts` is deleted. The named fixtures were converted once (originals archived as `tests/fixtures/archive/*.schema6.json`). The save library's compatibility reads `BRIDGED_SCHEMA_VERSION`, so root's schema 6 library saves still load.
- **Validation:**
  - each signature runtime field only on its hull, and only with its upgrade fitted (fitting refuses removal while a tool is out);
  - tagged species in `knowledge.scans` (`species:<id>`);
  - pod containers (`<item>_pod`, 16 CU) exist exactly with their pod items;
  - host upgrades belong to an existing decoder or survey module;
  - the mixed layout needs the extension fitted.
- **Commands and events (F17):**
  - `upgrade` takes `sonar`, `tag`, `grapple`, `reel`, `pod`, `crane`, `clamp` and `drone` (`sim/signatures.ts`);
  - a new `upgrade-host-module` command (`sim/hostUpgrades.ts`).

  Both return typed outcomes and emit a typed `{ type: "signature", event }` beside the notice. Neither sets `GameState.feedback`. The older `upgrade` actions keep their feedback path, as F17 defers migration.
- **`step.ts` hooks:**
  - dispatching signature actions and host upgrades;
  - the drone taking look and move input;
  - a held line counting as an anchor in currents;
  - the sonar ping's loudness;
  - `stepSignatures` after movement.

  All of them are small and named.
- **The carrier:**
  - `BERTH_SLOT_SIZES` (SYS-1's fitting rules) is the one table of slot sizes;
  - `slotSize`, `berthLocal`, `freeBerth` and `nextBerthLayout` replace the inline `configuration === "medium"` checks in the carrier, the validator, the corridor view and the panel.
- **One way to do things:**
  - `fleet.fittedUpgradeKinds` is the one fitted-kinds helper (`fittings.fittedKinds` re-exports it);
  - the arm constants live in SYS-1's arm rule (`upgrades/tools.ts`);
  - `nearestInCone` and `inCone` are shared by the tagger and the grapple;
  - the hub's additive flare material is exported (`flareMaterial`, with a `tint` defaulting to white, so the hub is unchanged) and reused by the sonar flares.
- **Behaviour change:** a surfaced radio mast now adds a survey tier on top of the host's own array, as its catalogue text says. Before, it took the maximum of the two.

### Economy and progression (named changes)
- **Nine new recipes,** at SYS-1's catalogue costs; `upgrade-economy` checks every tier. On existing plans:
  - the range tagger: Canopy reinforcement, C04;
  - the cutting arm, grapple and cargo pod: Creel service, C05;
  - the wide sonar: the keel survey plate;
  - the deck crane: the Spindle tender plate;
  - the salvage clamp and drone bay: deep service, C07 and the Rift ledger;
  - the berth extension: carrier workshop, C03.

  The plan-set tests list the new rows.
- **Yields:**
  - the cutting arm's bulk (×1.5) and mineral access, frontier crust, core and lattice included;
  - the clamp's 20 CU grip (10 alloy, or 2 frames);
  - the crane's 10 CU lifts.

  These are the upgrades' intended pacing gains. The bot doesn't fit them, so route timings are unchanged.
- **Unchanged routes:** the playthrough plays identically to stage 0. For all eight scenarios, the following are equal:
  - outcomes and minutes;
  - ticks;
  - the gathered and spent ledgers;
  - discoveries, refusals and legs;
  - milestone ticks.

  All reloads match. Only the state hashes differ, from schema 7's added fields.

### Checks
- **`npm test`** (with STEW-1's architecture guard): **1,470/1,470**. New and updated tests:
  - `tests/sig-1-signatures.test.ts` (12): each signature through the real commands and the fixed step, with save round trips while tools are out;
  - `tests/inventory-authority.test.ts`;
  - `tests/field-kit.heavy.test.ts` (NullEngine): builds near the camera, rebuilds only on change, tools show and hide, disposes clean;
  - the schema 7 bridge tests;
  - the HUB-2-01 negative control;
  - the plan-set expectations.

  The guard passes with both import cycles exactly at their allowances; the new sim modules joined no cycle.
- **Economy:** all six scripts exit 0 (rerun at `9b260b75`).
- **`npm run test:heavy`** (`9b260b75`, queued and run on factory-worker because alickers was busy): **465/465**, 0 failures. heavy-check also reported "3 processes OOM-killed inside the job by a sub-limit". The log names no failed or retried file, so I can't attribute them; I'm listing them here rather than dropping them.
- **Playthrough** (`14a7234e`, RTX 4070 Laptop on alickers): 8/8 complete, equal to stage 0 as above.
- **3090 browser check, keys only** (`0267e513`; task-owned Chrome on ANGLE GL-EGL, RTX 3090; `docs/build/streams/sig1/play.mjs`; 0 page errors). Saves are derived from the shared library's earned carrier-route save (`carrier-deep`, b54bfd92, bridged), with the upgrades rule-staged as paid (`tests/sig-1-support.ts`; the Spindle is staged, since no route builds one):
  - **Dart:** the sonar flares the Fanvault openings at 120–180 m, and 8 chart beacons are marked; tagging the reef nursery files it at 40 m.
  - **Creel:** the cutting arm takes 3 crust in 4 s (hold 4 → 7 CU, 3.5% charge); the grapple reels a Basin frame aboard; the dropped pod shows in Cargo as a store destination for the diver.
  - **Spindle:** the boom and line show over the water; 2 glass come aboard for 3%.
  - **Mantle:** the drone flies (its own view) and is recalled; the clamp line runs from the hull to the frame stack, and 2 frames come aboard for 4%.
  - **Hearthline:** refit to the mixed layout from its console, then the Mantle and the Dart are recovered into the service and starboard berths.
  - **Outpost:** the standard outpost shows mast and lamp, solar, locker, charger, the lit decoder and the fish trap; the lattice is fitted from Base.
- **4070 browser check** (`094e7820`, `docs/build/streams/sig1/run-4070.sh`, RTX 4070 Laptop on alickers through ANGLE and D3D12, 0 page errors): all seven scenarios match the 3090 run, notice for notice, including the mixed berths holding the Mantle and the Dart. These are functional evidence only; frame numbers from a shared desktop host aren't judged.

### Adverse cases
- **Refusals change nothing:**
  - a sonar or tag without the upgrade;
  - a cooling sonar;
  - a stale or incomplete spend plan (stage 0);
  - removing a module whose tool is out (pod, line, drone, lift or tow);
  - a crown stage paid for out of order.
- **A drifting aim** loses its tag.
- **A crossed line** releases the grapple.
- **A drone** past its tether or battery comes home.
- **Saves:** a save taken with each tool out round-trips. A schema 6 save holding a schema 7 field is refused.

### Compromises, limits and missing evidence
- **`FORK(stream-drivers)` grows by one:** `docs/build/streams/sig1/play.mjs` is registered in the guard's allowlist. REC-1 hadn't merged (no `scripts/rec`), and the brief said to use the existing drivers until then. Root fix: REC-2's one driver library.
- **Tow and pod placement aren't solved against the composed world:** the towed hull rides behind on the ordinary hull sweep and releases if it snags. Root fix: NAV-1's solved paths.
- **The drone "maps caves"** as chart cells, cave openings and scans along its path. There is no interior cave map, because the chart has none.
- **The sonar has no visible wavefront,** only flares at the openings, timed to the front. A pulse sphere was tried and was invisible from the Dart, which sits at its centre.
- **Hot paths:**
  - the tagger, crane, clamp and grapple scan the static source roster only on a command (a click);
  - per step, the tag re-checks its own target;
  - the lift re-checks its one source;
  - the drone reads a static 50 m grid of points (built once).

  `armTarget` keeps B1's per-call scan of the source roster (now filtered by the fitted profile). Root fix: `WorldQueries.dataInBox` when CW-1's spatial index lands.
- **The field kit** builds a short key string per visible outpost each frame (bounded by the outpost limit), to decide rebuilds.
- **Missing evidence:**
  - the cutting arm's completion toast wasn't captured by the driver; the HUD's hold and charge show the result;
  - no frame or perf numbers: these were functional sessions on a shared host.

### R1 fixes (Sol `review/sig-1-stage1`, request changes)
- **R1, saveability:**
  - **Arm work:** saves validate arm work against the fitted arm's own rule, `armHost` and `armWork`. Cutting-arm minerals anywhere, and its 4 s, are now valid mid-action.
  - **Tag aims:** `settleSignatures` runs after every command, in play and in menu transactions alike. It ends a tag aim as soon as its pilot leaves the Dart or the tagger comes off.
  - **Regressions:** saving and reloading during mineral work; saving after each of tag, exit and unfit at the cradle; and a state that names a tag without its tagger is still refused.
- **R2, typed outcomes:**
  - The tool arms emit a typed `{ kind: "arm", phase: "start" | "done" | "stopped", sourceId, item, quantity, charge }`. Their notices and sound now come from that outcome, and the arm no longer writes `.feedback`. `updateAction` receives the step's events.
  - A berth refit emits `{ kind: "berths", configuration, slots }` with its notice and sound (`berthRefitOutcome`), and the carrier no longer writes `.feedback` for it.
  - Tests check the payloads, and that a cut fires exactly one completion notice and one sound. The bot never read either message, so its routes are unchanged.
- **R3, drone launch:** `droneLaunchPoint` sweeps the drone's own capsule from the bay (under the hull's centre). It tries along the aim first, then straight down, then up, and takes the first path that is clear all the way and ends in clear water. If none is, the launch is refused before any charge is spent.
  - **Regressions:** a clear-water launch; a block at the bow, where it launches below, clear of it; and full enclosure, refused with the state unchanged.
- **R4, roster scans:**
  - A running crane or clamp lift re-checks its own host with `rowById` (`sim/rows.ts`), as does the hooked frame on a grapple line. The source search (sorting the static source table) runs only on the command.
  - **Regression:** a clamp lift runs to completion after the roster is replaced with new row objects whose `find` throws.
- **R5, the field-kit line cache:**
  - Lines come from a bounded pool per kind (grapple, tether, lift, tow; 4 slots each, at most 16 meshes, about 16 KiB), filled per frame. Slots not drawn that frame are disposed, so replaced or unloaded hulls keep nothing.
  - Built art (outposts, racks, hardware) is marked seen each frame, and anything not seen is disposed.
  - **Per-frame scratch:** the frame counter replaces the per-frame `Set` and key arrays, two scratch points replace the line endpoints, and rebuild closures are made only when a key changes. Hull hardware is recomputed only when its fitted modules change.
  - **Remaining per-frame allocation:** one short key string per visible outpost, rack with modules, and fitted hull. That is bounded by the outpost limit, the 6 fixed hosts and the fleet.
  - **Regressions:** 40 successive replacement Creels with lines stay within the bound and leave 0 lines; an unloaded state (`update(null)`) leaves 0 lines.
- **Checks** (RTX 4070 Laptop on alickers, because the 3090 lane was draining for exclusives):
  - **`npm run gate -- --only fast,build,economy:*` at `a3e716f3`:** a partial gate that passed fast (**1,475/1,475**, with the guard and headless typecheck), build (which runs the terrain bake itself) and all six economy steps.
  - **Not run:** the gate's queued `bake` step.
  - **The gate's playthrough step**, as its own 4070 job at `a3e716f3`: 8/8 complete, all reloads equal, and identical to stage 1 in outcomes, minutes, ticks, the gathered and spent ledgers, discoveries, refusals, legs and milestone ticks.
  - **Field-kit NullEngine test:** passes.
- **Browser, only the changed visuals** (`aa47e24f`, RTX 4070 Laptop through ANGLE and D3D12, the `creel-arm` and `mantle` scenarios, 0 page errors). Two images, `/work/tmp/261024-051825-df56/sig1-4070/`:
  - **Does a cut report its result?** `03-creel-arm-cut-aboard.jpg`: the toast "Cutting arm · +3 Conductive crust", with the hold at 4 → 7 CU and the charge at 96%.
  - **Does the drone start in clear water?** `05-mantle-drone-view.jpg`: the drone's camera opens in open water at the Basin frame stack, and its first scan is reported.

### R2 fixes (Sol `review/sig-1-stage1-r2`, request changes; code `fb8a5d59`)
- **R2-1:** hull hardware art is keyed by its fitting's contents (each module's item ID and kind, in fitting order), not by item IDs alone, which repeat across saves. Loading another valid save with a different fitting rebuilds the art. There's no per-frame profile and no new index.
- **R2-2:** hardware builds within 240 m and is released only past 260 m, so a hull at the edge doesn't churn.
- **Regressions** (`tests/field-kit.heavy.test.ts`):
  - two consecutive saves with the same hull and item IDs but different fittings rebuild the art and dispose the old;
  - a hull moved through 239, 241, 250, 255 and 241 m keeps the same art, which is released at 265 m.
- **Checks** (`fb8a5d59`, RTX 4070 Laptop): `npm test` **1,475/1,475**; the field-kit NullEngine test passes.

## Open items (after the merge at `2901fed1`)
- **Tow and pod paths:** a towed hull and a dropped pod are placed on the ordinary hull sweep, not on solved paths; a snagged tow releases. Root fix in NAV-1.
- **No sonar wavefront:** the sweep shows only flares at each opening, timed to its front. Owed to the atmosphere pass or a later visual stream.
- **`armTarget`'s roster scan:** the Creel's tool arms scan the source roster per call, B1's existing rule. Root fix when CW-1's `WorldQueries.dataInBox` lands.
- **`FORK(stream-drivers)`:** `docs/build/streams/sig1/play.mjs`, with `run-4070.sh`, `derive.mjs` and `check.sh`, stays on the guard's driver allowlist until REC-2's one driver library retires it.
