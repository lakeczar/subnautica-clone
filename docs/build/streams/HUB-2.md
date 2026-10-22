# HUB-2: the crown station, composed (handoff)

Opus 5.5 high. Branch `t3/hub-2-crown-station`, from root `e91a69b` (C4 stage B and LC integrated). Commit: `8ae961c`. It replaces W2 phase 2's proposal and fixes Sol R1's W2-02, W2-03 and W2-04 ([R1](reviews/W2-SOL-XHIGH-R1.md)).

## Outcome
The crown station on W2's summit is a real restorable stop, built in three stages from a diver load each.
1. **Power and air** (needs the Creel). You get air, a bunk that heals three times faster than any other refuge, and a 48 CU locker. Resting there makes it where you wake.
2. **The dock and fabricator** (needs the 350 m suit).
   - **Dock:** charges and repairs small and medium craft within 14 m, through Cargo's ordinary Service button.
   - **Bench:** a full fabricator with the refit and upgrade bench, plus two more stores (144 CU in all).
3. **Sockets and the survey array** (needs the 450 m suit and Rift ceramic). Six module sockets, and a built-in 300 m survey over the Basin anchorage, the dish field, the Rift head and the Canopy edge, from Base.

The pod stays the fallback: if the crown has no power, you wake at the pod. The beacon is lit from New Game (coordinator call), and restoration does not change it.

On the **carrier route**, the playthrough now restores the first two stages on its way to the Rift. It then makes the 450 m suit at the crown's bench and services the Creel at its dock, instead of the long way home to the island workshop.

## The surface mast (owner, OPENING-DESIGN "Dependencies")
The starting island's lookout will stand about 765 m from the crown at bearing 134° (+Z north), near (−217, −32). The crown's summit is 47 m deep, so a light down there can never reach it above water. The mast carries one to the surface.
- **Mast:** `hub.crown_mast.mast` (`CROWN_MAST` in `content/hub/crownStation.ts`).
  - **Shape:** a slim banded tower, 1.8 m square, from the summit's south lee at (326, −571) to +8 m. Its lamp cage sits at +7 m, just above the waterline.
  - **Collision:** one structure record drives collision and art, like every S2 structure.
  - **Clearance:** 13 m from the crown mouth, clear of the beacon house, the station and its mast. No route, rescue tether, rescue approach or carrier lane sweeps through it (`tests/hub.test.ts`).
- **Lamp:** a slow lighthouse sweep (7 s period; dims to a quarter between passes) on the hub art's additive flare (`mastLampGlow` in `render/hubView.ts`).
  - **Through air:** it fades over 900 m per e-fold, against about 555 m for the cel haze.
  - **Underwater:** it fades like the summit beacon.
  - **At the lookout:** glow 0.17–0.68 at 765 m.
  - **Line of sight:** no land rises into it on today's terrain (the opening pass will rebuild the island; the test will catch a ridge in the way).
- **Far layer:**
  - **CW-1's layer** (`render/farLayer.ts` on `t3/enable-authored-cave-streaming`, not yet on root) registers every structure at least 20 m tall. The 55 m mast joins it automatically when CW-1 lands, as a silhouette plus lamp.
  - **The lookout's range:** that layer still draws inside the camera's 450 m far plane. The lamp's flare is hub art, created once and never streamed, and past the far plane it becomes an impostor on the line of sight. That is what shows at 765 m.

## How it composes (C4's interfaces)
- **Stop:** `content/stops.ts` gains a `crown_station` row with `facility: "crown_power"`. New optional `WorkingStop` fields support staged stops; stops without them work whole, as before.
  - `dock`: mooring service needs this facility as well.
  - `bench`: bench work other than the stop's own restorations needs this facility.
  - `stores`: extra lockers that open with `dock`.
- **Service (W2-03):** `inventory.stopServes` gates `supportedServiceSite` on the dock stage. That one gate covers every downstream use:
  - the service command and Cargo's button (`sim/serviceLink.ts` preview);
  - major-mount changes;
  - refit targets;
  - moored holds at the bench.

  C4's berth and docking-transaction exclusions come first, unchanged.
- **Restoration (W2-02):** `STOP_RESTORATIONS` includes the three stages (`isStopRestoration`).
  - `craftingBlock` lets a stop's own restorations through its "restore first" gate, and their `needs` keep them in order.
  - `craft` and `outputPlacement` handle every stop restoration generically, with no hard-coded outputs.
  - The stage recipes live in `content/hub/recipes.ts` (`HUB_RECIPES`), spread by the registry. They use plans the player already has (the Creel's, the 350 m suit's and the Rift's), not new campaign plans.
- **Bench (W2-04):** `progression.crownBenchRecipe` decides which recipes the crown's bench runs.
  - **Included:** every pod-fabricator recipe, and every workshop recipe except `restore_workshop`, `strip_frame` and hull builds.
  - **Excluded:** all of the yard's work, since the carrier cannot moor on the summit.
  - **How it joins:** `recipeSites` appends the crown, so payment runs through C4's `craftSite` and `fabricationContainers`: the diver, the crown's locker and stores, and craft moored at its dock (from the dock stage). Refits need the hull moored at the dock (`supportedServiceSite === "crown_station"`). Bench work waits for the dock stage, with "Restore the Crown station's dock and fabricator first".
- **Host:** `FIXED_HOSTS.crown_station` has 6 sockets on `crown_survey`, plus new optional `builtIn: ["survey"]` and `surveyTier` fields (`surveyTierAt` uses the tier, and Base gains a Survey button for a built-in array).
- **Rest base:** `REST_BASES.crown_station` uses `crown_power`. C4's last-rested-base wake rule then works unchanged, with the pod as fallback. `survival` takes its heal rate from `sim/hub/crownStation.bunkHealRate`.
- **Saves:** `crown_power`, `crown_dock` and `crown_survey` (unrestored), plus the crown's locker and two stores, are additive New Game content. Schema 6 loads them through `addNewContent` with no bump.
  - **Validation:** a stage is repaired exactly when its restoration is in `crafted`.
  - **Fixtures:** the three live named fixtures are re-canonicalised (additive entries only, as C4 did); the archived originals are unchanged.
- **UI:** the Fabricate status line names a working stop's bench, and the HUD's air source names an air stop. Both read "No bench here" and "Hearthline air" at every C3 stop before. The crown's stages fold into "Later" away from the crown, like S9's stops.

## Checks
- `npm test`: **1,230/1,230** (with the mast's test). `tests/crown-station.test.ts` (6), through `PanelProbe` and `executeCommand`:
  - **Stages:** each stage paid at the door through Fabricate. Exactly the cost leaves, it pays once, a short payment and an unpaid press change nothing, the order holds, and each save round-trips.
  - **Dock:** Cargo's Service is disabled and refused at stage 1, and charges 12% → 100% and repairs 20 → 100 from stage 2. Out of reach, no service. The stores open with the dock.
  - **Bench:** the recipe split holds for every recipe. A paid `glow_lures` comes from a crown store; a paid `creel_450` comes from the moored Creel's hold. The bench is refused at stage 1 and for a hull away from the dock.
  - **Sockets and survey:** six sockets and a 300 m survey through Base, from stage 3 only.
  - **Bunk and waking:** the bunk heals at 5.4/s; you wake at the crown after resting there, and at the pod without power.
  - **Saves:** an old save loads with the crown unrestored, and a forged stage is refused.
- **Pinned-list tests updated** (content legitimately added):
  - plan unlocks (`progression-curve`) and known rows (`preparation-panels`);
  - the bench text;
  - the composed-field helpers (`persistence-support`);
  - the stop-pose exemption (the crown's door and dock are its own);
  - the M1 reason matrix, which now excludes hub recipes.
- **Heavy** (`heavy-check.sh`): **29/29 files**, rerun with the mast (860 s). Build OK; `bake-terrain --verify` gives 220/220.
- `npm run build`: OK; the bake re-ran (220 chunks).
- `npm run playthrough -- --jobs 2 --child-timeout 5400`: **exit 0, 5/5 complete, no blockers**, every milestone reload matched.
  - **Play times:** creel 199.3 min, carrier 360.6, creel-loss 208.9, reverse 204.4, no-optional 198.5.
  - **Child timeout:** the default 1,800 s timeout killed one child on the loaded shared machine before any result (a wall-clock limit, not a game failure), so the run uses a longer one.
  - **Carrier with the crown:**
    - Root `e91a69b`'s carrier takes 322.1 min; with the crown it takes **+38.5 min (+12%)**.
    - Rift +10.6: gathering the stages' 31 CU and the climb.
    - Hearthline +8.1, carrier-deep +12.3, works +7.4: later phases re-gather, because the stages draw on the same finite base stock.
    - The return through the crown's bench and dock replaces the workshop trip.
  - **With the mast:** the carrier scenario reran unchanged, 360.6 min with all 16 reloads matched. The Creel routes never reach the summit.
  - **Coordinator note:** the bot uses only the crown's refit and dock, not its later benefits, so this is an upper bound on its cost. It's worth a look in the economy pass.
- **3090, ordinary keys and keyboard focus** ([play](hub2/play.mjs), [derive](hub2/derive.mjs), [record](hub2/play.json)). It ran in a task-owned headless Chrome on ANGLE GL-EGL ("NVIDIA GeForce RTX 3090"), through `heavy-check.sh`, closed at the end, with 0 errors.
  - **Save:** derived headlessly. Stage 1 was restored by the harness's commands; the dock stage's materials in the diver hold and the Creel's 30% charge are **staged**.
  - **Session:** K → Tab ×7 → Enter restores the dock; a 15 m swim to the Creel; Tab (Cargo) → Tab ×7 → Enter on Service brings the Creel to 100%.
  - **Frame rate:** 60 fps, p95 16.7 ms, worst 16.8 ms, both while swimming and while holding at the dock.

| | |
|---|---|
| ![](hub2/01-crown-door-stage-1.jpg) At the door, stage 1 | ![](hub2/02-fabricate-crown-dock-ready.jpg) Fabricate: the dock stage ready; bench rows wait for it |
| ![](hub2/03-crown-dock-restored.jpg) Restored | ![](hub2/05-cargo-serviced.jpg) Cargo: the Creel serviced at the dock |

## Adverse case
A Creel at 12% power and 20 hull, moored at the dock after only power and air are paid for, is refused service. The button is disabled, pressing it changes nothing, and `supportedServiceSite` is null. Its hold is not part of the bench either. Paying the dock stage enables the same button, and pressing it services the Creel in full. With the crown unpowered, a diver who rested there wakes at the pod.

## Known limits
- The beacon does not brighten with restoration (it's allowed, not required).
- The crown's chart beacon appears from stage 3, since C4's `beaconViews` shows a stop once its host's facility works.
- The 3090 check starts from a derived save with staged materials, not from earned play; the playthrough covers the earned path.
- The carrier route's play time rises because it gathers the two stages' materials (31 CU) on the way; see Checks for the root comparison.
- `step.ts`, world, bake and runtime files are not touched (CW-1 owns them).
