# CA-1: Hearth Reef and Splitspine Isles caves (handoff)

Owner: Opus 5.5 high. Branch `t3/siltwake-ca1-reef-isles-caves`, rebased onto `feat/siltwake-first-expedition` with C4 stage A and ATM-1 integrated. Built on the W1 kit ([W1-PRE](W1-PRE.md)). The pre-rebase history is kept on `backup/ca1-pre-rebase`.

## Outcome
Every small and medium cave the bible lists for the Reef and the Isles is authored with the kit: 18 caves, 14 small and 4 medium. Each has one source for its rock and shell, plus rooms, portals, swept routes, staging and typed contents.

- **Reef caves** are pale banded limestone with warm rims. Vault-glimmer mats on their ceilings are unlit, and their streaks lean toward the nearest mouth.
- **Isles caves** are black-green wave-cut basalt with polished ceilings, pale wet floors and bands of tide-clappers. They have tidal undercuts at the waterline.
- **Footprints** lie outside the legacy preserve, inside the world with their collar band, and never overlap. Every footprint edge is on a whole metre.
- **Small caves** have 10 to 25 m of their own water and are diver-only.
- **Medium caves** are 30 to 80 m long. Each has a real cycle, at least two exits, and a main hall that admits a small craft and has a turning bay.

**Not in the game yet.** `CAVE_SOURCES`, the list C4 wires into the game, still holds only the Fanvault. The 18 caves are listed in `AUTHORED_CAVE_SOURCES`. Every cave test already runs them through the game's own world composition and `stepGame`. *Registering the caves* lists what C4 needs to switch them on, including one bake fix that must land first.

**Files:**
- `src/content/regions/caves/{author,reef,isles,contents,networks}.ts`;
- `tools/cave-lab.ts`;
- `tests/caves-reef*` and `tests/caves-isles*`: a fast suite per region plus four heavy files (game, shell, retreat and adverse).

## Caves
Each picture shows daylight with the lamp on (left) and the lamp off (right). With the lamp off, the nearest opening glows.

Column key:
- **Footprint:** X × Z, in metres.
- **Depth:** metres below the surface.
- **Water:** extent of the cave's own water, X × Z × Y. Rooms and water include the cave's half of any crawl it shares with a neighbour.
- **Exits:** mouths plus skylights.
- **Collar step:** the largest step between the cave edge and the seabed.

| Cave | Size | Footprint (m) | Depth (m) | Water (m) | Rooms | Exits | Rock boxes | Collar step (m) |
|---|---|---|---|---|---|---|---|---|
| [Archlet](ca-1/reef_archlet.jpg) | small | 49 × 40 | 16–27 | 42.5 × 29.5 × 11 | 4 | 3 | 830 | 0.52 |
| [Bellhole](ca-1/reef_bellhole.jpg) | small | 32 × 40 | 15–27 | 18 × 28 × 12 | 3 | 1 | 882 | 0.95 |
| [Wrackhollow](ca-1/reef_wrackhollow.jpg) | small | 35 × 34 | 17–27 | 27 × 13 × 9.5 | 3 | 1 | 601 | 0.42 |
| [Pump house undercut](ca-1/reef_pumphouse_undercut.jpg) | small | 28 × 24 | 20–24 | 16.5 × 12 × 4 | 3 | 2 | 151 | 0.27 |
| [Fan crawl](ca-1/reef_fan_crawl.jpg) | small | 36 × 31 | 26–38 | 27.5 × 23.5 × 12 | 4 | 2 | 683 | 0.71 |
| [Shelf lip](ca-1/reef_shelf_lip.jpg) | small | 38 × 45 | 36–44 | 25 × 15.5 × 8.5 | 3 | 1 | 737 | 0.74 |
| [Gully window](ca-1/reef_gully_window.jpg) | small | 32 × 30 | 54–63 | 19.5 × 15.5 × 9 | 3 | 2 | 906 | 1.16 |
| [Lantern grotto](ca-1/reef_lantern_grotto.jpg) | medium | 70 × 64 | 30–55 | 38 × 49 × 25 | 5 | 2 | 3,346 | 0.65 |
| [Drop Cathedral](ca-1/reef_drop_cathedral.jpg) | medium | 51 × 81 | 47–95 | 46 × 62 × 48.5 | 6 | 3 | 4,589 | 1.08 |
| [Scar crawl](ca-1/isles_scar_crawl.jpg) | small | 28 × 31 | 20–29 | 9.5 × 19 × 9 | 3 | 2 | 619 | 0.63 |
| [Surf cave](ca-1/isles_surf_cave.jpg) | small | 30 × 24 | 6–13 | 15.5 × 8.5 × 6.5 | 2 | 1 | 489 | 0.97 |
| [Cove undercut](ca-1/isles_cove_undercut.jpg) | small | 30 × 20 | 11–17 | 19 × 11.5 × 6.5 | 3 | 1 | 610 | 0.80 |
| [Cove crawl](ca-1/isles_cove_crawl.jpg) | small | 24 × 30 | 15–27 | 24 × 11.5 × 12 | 3 | 1 | 366 | 0.48 |
| [Headland root stair](ca-1/isles_headland_root.jpg) | small | 26 × 24 | 24–35 | 25 × 8.5 × 11 | 2 | 1 | 513 | 1.30 |
| [East ledge cave](ca-1/isles_east_ledge_cave.jpg) | small | 32 × 26 | 18–23 | 20 × 9 × 4.5 | 2 | 1 | 926 | 0.67 |
| [Blowhole](ca-1/isles_blowhole.jpg) | small | 22 × 22 | 0–17 | 7 × 13 × 21.5 | 3 | 2 | 403 | 0.58 |
| [Storm arch](ca-1/isles_storm_arch.jpg) | medium | 37 × 95 | 3–30 | 21.5 × 60 × 26.5 | 7 | 3 | 2,311 | 0.81 |
| [West sea cave](ca-1/isles_headland_west.jpg) | medium | 25 × 35 | 0–11 | 21.5 × 32.5 × 13 | 6 | 2 | 817 | 1.00 |

Across the 18 caves: 19,779 rock boxes, and about 354k fine and 91k coarse shell vertices.

**Networks** (`networks.ts`):
- **Colonnade:** Archlet, Bellhole and Wrackhollow, joined by two crawl links. A sinkhole halfway along the 40 m crawl gives daylight and a way up.
- **Fanvault:** Fan crawl and Shelf lip, joined by a crawl link. The Fan crawl's apron mouth faces the accepted Fanvault's south mouth across 4 m of open water.
- **Cove:** Cove undercut, Cove crawl and Headland root stair, joined by two crawl links.
- **Gully:** Drop Cathedral and Gully window. The bible's crawl between them is omitted.
- **Scar:** Scar crawl, with a pending join to the Undercroft.

Each crawl link has its rock split at the shared edge, a swept link route, and rescue routes. `MEDIUM_CAVE_GRAPHS` maps each medium cave's chambers, exits and closing passage to the bible's passage edges.

## Numbers
- **Fast tier:** `npm test` passes 1,122 of 1,122, and `npm run typecheck` and all six lab typechecks are clean.
- **Heavy tier:** four files, each run through `scripts/heavy-check.sh` in one job of about 3 minutes. All pass; peak heap in brackets.
  - **Game path** (445 MiB). The caves are composed the way `gameWorld()` composes them: all `SOLIDS`, the shared floor and all 19 caves. The checks:
    - Every footprint drops the heightfield, and away from the caves the world answers exactly as the raw world.
    - No route, tether, site, source or place lies in a footprint or its 10 m collar band. The one exception is the headland crest walk; see below.
    - A keyboard swimmer swims all 42 diver routes through `stepGame`, 500 s of game time.
    - **Boxes:** 21,283 cave rock + 125,852 collar columns + 5,406 exterior solids = **152,541**.
    - **Diver step** (a 0.25 m move plus a support query, median of 3 over 6,972 steps): **43–62 µs**.
  - **Shell** (561 MiB). Every shell point of every cave agrees with the rock.
  - **Lamp-off retreat** (924 MiB). Every one of 1,494 starts reaches open water or air, in 3,876 hops (every metre of every route, plus every room). Every cave uses its own exits, and the plugged-openings control fails as it should.
  - **Adverse case** (841 MiB). See below.

### Adverse case: deepest small-cave network, lamp off, 20% air
The bible counts the accepted Fanvault with the small caves, so its network is the deepest: it reaches the Shelf lip at 44 m. 20% of 180 s of air is 36 s, or 122 m at the diver's 3.4 m/s. Every room has a swept, lamp-off route out well inside that:

| Room | Route out (m) | Time (s) | Exit |
|---|---|---|---|
| Fanvault north passage | 8.9 | 2.6 | north mouth |
| Fanvault vault | 10.2 | 3.0 | skylight |
| Fanvault skylight | 3.3 | 1.0 | skylight |
| Fanvault south passage | 10.2 | 3.0 | south mouth |
| Fanvault pocket | 19.0 | 5.6 | skylight |
| Fan crawl crawl | 9.7 | 2.9 | apron mouth |
| Fan crawl squeeze | 12.0 | 3.5 | edge mouth |
| Fan crawl edge | 5.6 | 1.6 | edge mouth |
| Fan crawl lip crawl | 10.5 | 3.1 | edge mouth |
| Shelf lip room | 9.7 | 2.8 | overhang mouth |
| Shelf lip overhang | 4.0 | 1.2 | overhang mouth |
| Shelf lip crawl | 18.3 | 5.4 | overhang mouth |

The slowest way out of any small-cave room, in any network, takes **7.1 s** against 36 s of air.

The same case was also played through the real game step. A keyboard diver started in the Shelf lip crawl with the lamp off and 20% air, swam out by the rescue route, and **surfaced in 23.4 s with 7.7% air left**. The diver was never incapacitated.

## Registering the caves (for C4)
The switch itself is one line in `caves.ts`, plus three fixes and some test updates. I checked all of this on a scratch copy with every cave in `CAVE_SOURCES`: the bake, pits, shells, scatter, chunk bounds and codec, and the full fast tier.

1. **The switch:** `CAVE_SOURCES = AUTHORED_CAVE_SOURCES`. Add a linked network whole, because one cave's shell stops at a shared seam where its neighbour's begins.
2. **Blocker: terrain chunk borders.** With the caves in, terrain chunks no longer share identical edges with their neighbours. The same failure shows on C4's own Fanvault chunk test. Cause: `tessellate.ts` turns every pit edge into a lattice line across the whole chunk. A line that is not on the 4 m border lattice adds vertices to a border its pit never reaches, and the chunk across that border lacks them. The Fanvault's edges are all multiples of 4 m, which is why it never showed. The bake fix (a `borderPits` option) adds every pit edge meeting a border, from either side, to that border's cuts: [`ca-1/border-cuts.patch`](ca-1/border-cuts.patch). Results are under *Border fix evidence*. The alternative is snapping every footprint edge to 4 m, which would mean re-authoring and re-verifying all 18 caves.
3. **Walking near a cave: support from exterior ground.** `walk.isles.headland_crest` passes 7.2 m from the West sea cave, inside its collar band. Today's adapter answers `supportHeight` from the composite anywhere in the band. There, the collar columns top each 0.5 m cell at its highest floor sample, which on this slope makes steps of 0.2 to 0.35 m, and a walker stalls on them. Cave rock exists only inside footprints, so outside them the exterior world's support is exact. With `supportHeight` reading the exterior outside every footprint, the walk takes 4.7 s, the same as without the cave. The game heavy test pins both the stall and the fix. Sweeps stay as they are.
4. **Test updates:**
   - `c4-world.test.ts`:
     - drop `CAVE_SOURCES.length === 1`;
     - allow `walk.isles.headland_crest` in the band check once fix 3 lands, or keep checking only footprints for walks.
   - `content-proposals.test.ts` (four tests): every CA-1 cave keeps its proposal ID, so registering them makes them look like duplicates and overlaps of themselves. The `kitOnlyCaves` patch fixes that: [`ca-1/content-proposals.patch`](ca-1/content-proposals.patch).
5. **Startup cost.** `gameWorld()` builds every cave on first use. With 19 caves that took 5.7 to 8.8 s of definitions and 3.2 to 5.1 s of composition on this VM, against a fraction of a second for the Fanvault alone. C4 should build caves lazily by distance, or bake their rock boxes, before shipping. `liveTerrain` also builds all of them through `caves(ctx.floor)`, but the baked path avoids that.
6. **Bake size**, 220 chunks: **15.43 → 22.31 MiB** compressed (24.9 → 36.2 MiB raw). Baking took 72.7 s for today's game against 104.5 s with every cave, back to back in one job. A later, quieter run with the fix took 83.6 s.
7. **Light:** `caveView` lights one cave at a time, the nearest within 60 m. Through a crawl, a linked neighbour is therefore drawn without its own field. If that reads badly in play, switch at the seam to the cave that owns the camera's column, which is what the lab's `lightNearest` does.
8. **Later wiring:**
   - `CAVE_CONTENTS` gives resource pockets, resident spawns and finds, each with its room and surface;
   - `CAVE_NETWORKS` gives rescue and link routes;
   - each cave's `staging` lists craft parking;
   - the pending joins `isles_undercroft.scar_mouth` and `canopy_rootways.back_stair` wait for those caves.

### Border fix evidence
Three runs on scratch copies, each through `heavy-check.sh`. The probe test is [`ca-1/ca1-bake-probe.heavy.test.ts`](ca-1/ca1-bake-probe.heavy.test.ts); C4 can adopt it when the caves are registered.
- **Today's game with the fix** (Fanvault only): `bake-terrain --verify` gives **220/220**. The fix is byte-neutral.
- **All caves with the fix:**
  - **Chunks:** in every chunk touching a CA-1 footprint (17 chunks), no heightfield remains inside a footprint, each shell stays inside its footprint and column, chunk Y bounds cover the cave, and the codec round-trips.
  - **Scatter:** none inside a footprint.
  - **Edges:** every border of those chunks matches its neighbour at all four LOD pairings, and C4's Fanvault edge test passes.
  - **One exclusion in the edge check:** where a footprint edge lies on a chunk border (the Shelf lip at Z −96), the chunk holding the pit has no terrain along that span. The chunk across meets the shell's collar there, with a skirt, as at any pit edge, so that span is left out of the comparison.
- **All caves without the fix** (control): edges differ on many borders. Examples are the Lantern grotto's X −510 line at Z −224, the Colonnade seam X −487 at Z 32, and the Pump house's Z −22 and −46 lines at X −448.

## Bible changes and why
- **Footprints were fitted to the floor that was actually built.** Most moves are under 10 m. The larger ones:
  - **Surf cave:** its mouth stays on the east slope, and the cave runs west under the island instead of into open water. It also keeps clear of `isles_stack_glass_east`.
  - **Blowhole:** built as a basalt sea stack at the foot of the cliff, with its chimney rising to a dry ledge at +0. It does not claim the cliff face.
  - **Storm arch:** built as a spur of three blocks, because the bible's single wide outline sprawled under the kit's batter. The world ends at Z 160, so the north hall now turns west to a cliff-foot mouth on the channel shelf. Its footprint is now Z 55..150.
  - **West sea cave:** built under a knoll at the inlet head.
  - **East ledge cave:** given 1 m of separation from the Storm arch.
- **The West sea cave's dry shelf became a shingle bank** 1.5 m down, lit through the beach mouth. A dry shelf would need waterline walking, which isn't validated. A drip room and drip arch close its loop, as the bible's `ac40de9` loop requires.
- **The Fanvault is joined by an apron, not a shared mouth,** so the accepted Fanvault is not rebuilt.
- **The Cathedral–Gully window crawl is omitted.** It would climb about 30 m under the gully floor and cross the Basin route corridor. The open gully already joins the two mouths, 25 m apart.
- **Daylight added for the lamp-off retreat:** the Archlet's sinkhole, the Cathedral's chimney vent and the Storm arch's floor crack.
- **Content points were moved into reachable rooms**, by 0.6 to 24.5 m. The moves over 10 m:
  - Wrackhollow membrane, to the catch;
  - Surf-cave glass, with the cave;
  - Arch glass, to the gallery wall;
  - Arch float, under the skylight crack;
  - Blowhole stash, to the dry ledge;
  - Grotto glass, to the gallery.

  Each content item names its bible proposal, and every required material in a cave also has sources outside caves.

## Kit additions (additive; C4 owns the integration points)
- **`caves.ts`:**
  - `AUTHORED_CAVE_SOURCES`, which `caveDef` resolves, with neighbours that share an edge;
  - optional `CaveSource.style` (`CaveStyle`);
  - a `"link"` route role.
  - `CAVE_SOURCES` itself is unchanged.
- **`caveGeometry.ts`:**
  - **Linked caves:** `sharesEdge`, `sharedSpans`, `caveNeighbours`, and an optional `neighbours` argument on `caveSampler` and `buildCave`. A neighbour's rock pad is sampled with that neighbour's own opening. Seam vertices are frozen, and the collar skips shared spans, so two shells meet exactly with no skirt.
  - **Regional palettes:** `STYLE_PALETTES` and `styledColors`.
  - Without neighbours or a style, the Fanvault's output is unchanged.
- **`lightField.ts` bug fix:** path distances are now Float64 instead of Float32. A rounded-down float32 copy made a texel's own heap entry look stale, so that texel never expanded. This changes 9,821 of the Fanvault's 32,845 water texels, 121 of them by more than 10%. Its tests pass unchanged.
- **The 8 m index is no longer CA-1's:** C4 moved the adapter into `sim/world.ts` with its own 8 m index, so CA-1's `caveWorld.ts` change was dropped in the rebase.
- **`tools/cave-lab.ts`:**
  - `?cave=<id>`, or `[` and `]`, picks a cave from the authored list and loads its network within 40 m. It swims them in `gameWorld()`'s composition.
  - Views are generated and validated for collision. Each cave has its own light field.
  - It has contents and route overlays, and `?shots=` captures a scripted queue.
  - The lamp (`L`), LOD (`K`) and collision (`C`) toggles are unchanged, and `view=vault` still serves `cave-gpu-check`.

## Known limits
- **Waterline air is only partly tested.** The Blowhole's chimney and ledge and the West sea cave's halls reach air. The route swim reaches those waypoints by surfacing beneath them, and the sim's breathable rule (feet + 0.85 ≥ 0) is the only other check. Climbing out onto a ledge was not tried.
- **Light leaks through thin diagonal rock.** The light field uses 1 m texels with 26-connectivity, so daylight can leak through rock thinner than about 2 m diagonally. Crawls keep at least 2.5 m from open water for that reason.
- **The retreat file is near its memory budget:** 924 MiB of 1,024. Adding caves means splitting it again.
- **No GPU frame-time numbers yet.** The screenshots are from the lab in a preview tab.
