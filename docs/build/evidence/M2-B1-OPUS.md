# M2-B1 — earned Creel, cargo-versus-cabin, forward mooring and mobile refuge (author report)

Author **Claude Opus 5.5 (`claude-opus-5-5`), effort high**, verified from the T3 thread configuration before work. Worktree `t3-b6aef8ec`, branch `t3/earned-creel-mobile-refuge-loop`, exact parent `7bd259c395542e2d58724417be66a1864c58c005` (production eb712f1, schema4 / expedition.5). Brief: [M2-B1-OPUS](../tasks/M2-B1-OPUS.md). Provisional continuation beside the SPACE-1 review (since accepted on d8a812e with no source corrections, per root). This is an author report, not acceptance; a fresh Sol 6.1/xhigh review is required.

Evidence: `/home/worker/.local/share/siltwake-evidence/m2-b1-opus/` (`MANIFEST.sha256` 59 files, SHA256 `615efa00…dcac`). Play ledger `play/raw/input-ledger.jsonl` (31,017 rows), exports `play/saves/`, inputs `play/inputs/`, frames `play/frames/`, checks `checks/`, memory incident `incident-20261019/`.

## Commits

| Commit | Content |
| --- | --- |
| `e84f96f` | Simulation/save layer: Creel, mounts, cabin refuge, frames, mooring, refits, schema 5, frozen schema4 validator |
| `96cafd3` | Creel/site art, HUD/controls, B1 tests, runtime economy; bounded render assertions after the memory incident |
| `0636ad3` | Hint ladder |
| `9358bd5` · `3d18ce4` · `950d7fc` · `e9df4b1` | Fixes found in ordinary play: submerged slip rails; board at the pilot compartment; Creel collider 4.5 → 3.9 m; reboard where you exit and cue the bow to a nearby host |
| `50e6a43` | B1 site recovery coverage test (VM-restart checkpoint) |
| `dca33f2` | Progression curve §5 and the schema 5 contract paragraph |
| this commit | This report |

## What the player gets

- **C05 pays off.** The dormitory rack's plans build a **Creel** in a new medium slip west of the workshop landing (10 A / 4 G / 4 M / 4 C / 2 R). No Dart needed. C03 stays workshop + Dart; C04 adds only the mooring restoration beside the trim and suit 350; C06 adds the Creel 350 refit; Dart 350 comes from a physical keel plate on the south terrace. No XP or waiting.
- **A workboat that plays differently.** Slower (cruise 5 / quiet 2.5 / boost 6.5 m/s against the Dart's 8 / 3 / 11), a bounded 1.1 rad/s turn, louder (0.62 at cruise), 100/700 % battery per second. A raised sealed pilot compartment with real panes and gauges (power, hull, hold fill). **Tool arms**: E on a Basin salvage host ahead of the bow loads it straight into the hold (6 s, 4 % power), with no diver exposure. The Dart stays the fast scout.
- **One major mount, a real choice.** Bare 64 CU · **cargo rack** 96 CU · **refuge cabin** 40 CU plus a 16 CU locker. Swaps happen at the pod, the workshop slip or the restored mooring. They keep item identity, stow the replaced package where the new one came from, and refuse atomically with exact numbers (e.g. "would need 50 CU but Refuge cabin leaves 40 CU. Store 10 CU first. Nothing changed."). A stocked cabin locker cannot be unfitted. A stale hold capacity fails validation.
- **A mobile home.** The fitted cabin is a fixed dry room on the aft mount: walkable, enterable from a stopped helm or the aft hatch. Bunk: deliberate registration. Galley: hot meal (+85 food and a fresh grace period). Locker: persistent storage. Powered = refuge air and healing; unpowered or disabled = a labelled, finite emergency-air countdown. The hatch refuses unsafe depth or an obstructed exit. Incapacity returns you to the registered cabin **only if it is safe now** (fitted, unberthed, not under tow, healthy, powered, within rating, no hunter within 30 m, hull and hatch clear). Otherwise you recover at the home pod, and the reason is shown in the recovery text and in advance in the Notebook.
- **Work worth returning for.** **Tagged frames**: 10 finite intact members, 10 CU each, stripped at the workshop to 8 alloy; not a ninth material. Hosts are the ridge (3, 171 m), the south terrace (3, 198 m, past the Dart's 180 m) and the fracture floor (4, 262 m, past the Creel's 240 m), on a new boundary-fracture terrace south of the old Basin edge. They feed the **outer-crown mooring** (Canopy east margin, 138 m deck; 1 frame + 2 G + 2 C): hull service, cell charging, a 48 CU locker and mount changes, but **no air**, so the lab pocket keeps its role. They also feed the **Creel 350** refit (2 frames + crust/resin/membrane) and the optional **Dart 350** (1 frame). Required B1 uses 3 frames, optional 1, leaving 6 (48 alloy) for the carrier.
- **Second membrane family.** Two finite margin ribbon nets on clear-water Canopy ribs (10 + 6 reserve each, ≤ 128 m). Neither renews; the SPACE-1 renewal rules are untouched.

## Ordinary-control play (production build, SwiftShader, isolated Linux headless browser, port 5191)

Recorded input/export observer and controlled frame clock; an in-page key helper presses keys and reads only the HUD's public dataset. Builds: `0636ad3` → `9358bd5` → `3d18ce4` → `950d7fc` → `e9df4b1` as play-found fixes landed (each session's `SOURCE-*` file names its build).

**Earned chain (ordinary input).** Imported root's retained earned C06 export (`earned-return-after-Continue.json`, SHA256 `45840e66…4e44`, schema 3). It migrated through schema 4 to 5 with no refuge, initial ratings, a dark mooring and the mooring marker. Gathering by hand: workshop alloy, east-ledge glass ×2, east-cove resin, lower reef ribbon catch, then a Dart sortie to the upper Canopy fins for crust (quiet final approach; the hunter warned, investigated, then disengaged). Three bench stores. **Creel built** from the Fabricate panel at tick 58,607 (frame `01`). Boarded at the slip (frame `02`), out of the slip and the outer return lane to the Basin ridge (ticks 59,447 → 66,959). **Tool arms**: 3 tagged frames at the ridge, then 4 bundles (16 alloy) at the northern salvage, for **62/64 CU in 7 arm actions**. Loaded return to the slip; one bench store (32 CU) plus one frame transfer, then 3 frame strips: **40 alloy delivered to the workshop locker**. F5 save, real page reload, ordinary **Continue**: complete-state SHA-256 identical at tick 84,005 (`322d6928…dc3e`).

| Sortie | Value |
| --- | --- |
| Creel power | 100 → 70.7 % (ridge, 3 frames) → 50.5 % (62 CU) → **30.6 % at the slip** (arms used 28 points) |
| Diver O₂ minimum | 96.8 % (one ridge exit); otherwise inside the hull |
| Hull | 100 → 58 %: a hunter bite on the climb back through its territory (the outbound outer lane only drew an investigation) |
| Transfers | 2 at home for the whole 62 CU load; no repeat hauling |
| Same load, staged Dart + buoy | 12 transfers and 4 alloy overflow, against 3 with the rack-fitted Creel |

**Play-found defects, all fixed in source.** The slip rails blocked surface swimming. The Creel's keel-centre board datum read "Move closer" against the hull. The fixture-era 4.5 m square Creel collider pinned the hull on the slip rail and reef-rib arcs 2.5 m outside the drawn hull. The side exit left the diver 4.35 m from the board datum, past the 4 m reach. Facing away from a host gave no cue why E did nothing. Two helper problems were not game defects: off-centre docking, and two overlapping in-page jobs (now cancelled by generation). One session was lost when a tab froze and one when the tab was closed during an agent pause; the re-import of the agent's own export is labelled B1-15/16 in the ledger.

**Labelled diagnostics** (staged from the earned post-Continue export with real craft/install/disable rules plus placed materials and poses; `make-diagnostics.mjs`). D1: hatch entry; walk to the bunk; **ordinary E registers**; galley cook succeeds only at the galley; the hatch refuses an exit onto the slip rail; the Cargo card reports the refuge "unavailable: obstructed" there (frame `03`, cabin interior). D2: registered, healthy cabin; the diver drowns on the reef with no input and **recovers in the cabin** (cabin air, healing). D3: the same with the cabin unpowered; the Notebook warned beforehand, recovery at the **home pod**, registration kept. D4: a rack-fitted Creel disabled on the ridge with 3 frames + 16 alloy. Bobbin deploys from the shallow surface operator via Cargo, reaches the collar (≈2,500 ticks under host load average ≈ 40), the tow is confirmed, and the hull is **moored at the rescue bench with its rack, frames, alloy, investment and charge**, then field-patched (frame `04`).

## Checks (serial, through `scripts/heavy-check.sh`, 6 GiB cap, zero swap)

`npm run check` at `dca33f2`: typecheck, **587/587 tests** (567 inherited, all still passing with literal updates for the new schema/plans; +20 new), production build; cgroup peak 2.79 GiB. Economies (`checks/*.log`): progression curve, M1, design, M2-A fresh, M2-A `--earned`, and the new `scripts/check-m2-b1-economy.mjs`: Creel-first (15 crafts) and Dart-first (18) complete required plus optional purchases on finite exposed stock with zero renewal credited (simulated steps < one regrowth interval). Both then lose the refitted Creel in the fracture and rebuild it purely from the 76 CU salvage canister (6 diver trips).

New tests: `m2-b1-creel` (17: acquisition and clearance, handling, mount swaps and refusals, frame lift and arms, mooring, cabin, refuge safe/unsafe matrix, tow and canister salvage, refits, keel plate, validator laundering, reboard at any heading, bow cue, **all 7 new loss-capable sites tow fully from the shallow staging**) and `m2-b1-migration` (retained earned schema3 export, a schema4 export against the frozen validator plus laundering refusals, schema2 trap export). The real retained earned and SPACE-1 schema4 exports are copied as test fixtures.

## Compatibility and migration

Schema 5 / expedition.6 (contract paragraph in [CONTRACTS](../CONTRACTS.md)). Schema4 records must satisfy a frozen copy of the exact `7bd259c` validator and domain (`src/save/expedition5/`, generated from that build) before `migrateCreel` adds only the declared fields and first stock. Earlier schemas compose through it. IDs, stock, reserves, renewal progress, investments, poses, notes, losses and journals are unchanged. The existing Dart investment rule is now "paid build + paid refit". Fixture fleets still cannot launder into campaigns, and campaign fleets allow one Dart and one Creel. Per the coordinator's note no further migration machinery was added; the frozen-validator layering is the minimum B1 needs and could be simplified by the direction audit.

## Memory incident (2026-10-19) and fix

Two whole-suite runs exhausted the host (16 GiB + swap); root killed them. In isolation under a verified cgroup, `render-lifecycle` ran away to 5.8 GiB and a timeout. The cause was not geometry growth: a deliberately changed expectation (Creel now has its own cockpit child) made `assert.equal(meshOrNull, null)` fail, and **node:assert formatted a live cyclic Babylon mesh/scene graph**, consuming unbounded CPU and memory. Fix: render identity checks use `tests/render-assert.ts` `same()`, which reports names only (21 call sites), and the expectations were corrected without weakening them. The test now peaks at 349 MB in 0.6 s, matching baseline. `npm test` runs with `--test-concurrency=2`. All later heavy runs used the shared wrapper.

## Responsiveness (SwiftShader, not GPU evidence)

Observed (load average 3–40, so indicative only): import → first playable frame 668 ms (region activation 386 ms); Continue after reload 846 ms (activation 451 ms); Fabricate panel open 33 ms; Creel craft click → next frame 455 ms. Proposed budgets for root: first playable frame ≤ 1.5 s on this worker; panel open ≤ 50 ms. The accepted warm 50 ms region criterion is untouched (no region added; residency code unchanged; region tests pass). **Regression to note:** cold terrain-mesh generation in Node grew from 3.2 s to 4.6 s (184k → 201k triangles) for the fracture rows. Recommend splitting terrain per region before wider world growth. Not measured: retained-memory/eviction with several ordinary hulls (Dart + Creel only), quality changes, context loss. No dedicated-GPU claim is possible.

## Limits and recommendations

- Human feel, duration, route learning and enjoyment are unmeasured. The play driver is an agent, and the sortie took ~2 game-minutes each way.
- The world is still the bounded Canopy–Basin benchmark with one 60 m fracture terrace added; not the 2.0 × 1.8 km world.
- The Creel's arm-power cost (4 %) plus a loud hull made the loaded return marginal (30.6 %) and bite-prone. Consider 3 % per lift, or a quiet-cruise bonus with the rack, after human play.
- The slip is tight beside the reef ribs: approach from the east along z = −17. Consider a painted approach lane or moving the slip 4 m south.
- Next: the powered service head can reuse the major mount and the `arm` action path. Hearthline frame work has 6 frames reserved. The mooring is the Creel-route model for the Rift/Divide stops.
