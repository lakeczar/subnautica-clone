# CA-1: Hearth Reef and Splitspine Isles caves (handoff)

Owner: Opus 5.5 high. Branch `t3/siltwake-ca1-reef-isles-caves` from `feat/siltwake-first-expedition`, merged up to `b9246bc` (C3 and the accepted content bible `ac40de9`). Built on the W1 kit ([W1-PRE](W1-PRE.md)).

## Outcome
Every small and medium cave the bible lists for the Reef and the Isles is authored with the kit: 18 caves, 14 small and 4 medium. Each has one source for its rock and shell, plus rooms, portals, swept routes, staging and typed contents. The caves are data and are not wired into the game; see *Wiring after C3*.

- **Reef caves** are pale banded limestone with warm rims. Vault-glimmer mats on their ceilings are unlit, and their streaks lean toward the nearest mouth.
- **Isles caves** are black-green wave-cut basalt with polished ceilings, pale wet floors and bands of tide-clappers. They have tidal undercuts at the waterline.
- **Footprints** lie outside the legacy preserve, never overlap, and are whole metres wide.
- **Small caves:** 10 to 25 m of their own water, diver-only.
- **Medium caves:** 30 to 80 m, each with a real cycle, at least two exits, and a main hall that admits a small craft and has a turning bay.

Files: `src/content/regions/caves/{author,reef,isles,contents,networks}.ts`, `tools/cave-lab.ts`, and `tests/caves-reef*` (fast suite plus four heavy files: shell, loaded, retreat and adverse).

## Caves
Each picture shows daylight with the lamp on (left) and the lamp off (right). The lamp-off view always shows the nearest opening glowing.

Column key:
- **Footprint:** X × Z, in metres.
- **Depth:** metres below the surface.
- **Water:** extent of the cave's own water, X × Z × Y.
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
| [Storm arch](ca-1/isles_storm_arch.jpg) | medium | 37 × 103 | 3–30 | 18.5 × 73.5 × 26.5 | 7 | 3 | 2,303 | 0.89 |
| [West sea cave](ca-1/isles_headland_west.jpg) | medium | 25 × 35 | 0–11 | 21.5 × 32.5 × 13 | 6 | 2 | 817 | 1.00 |

Totals across the 18 caves:
- 19,771 rock boxes;
- 354k fine and 91k coarse shell vertices;
- 0.7 to 8 s to build each cave, rock, shells and neighbour pads included (about 50 s for all 18 on one core).

Rooms and water extents include a cave's own half of any crawl it shares with a neighbour.

**Networks** (`networks.ts`) record which caves connect and how:
- **Colonnade:** Archlet, Bellhole and Wrackhollow, joined by two crawl links. A sinkhole halfway along the 40 m crawl provides daylight and a way up.
- **Fanvault:** Fan crawl and Shelf lip, joined by a crawl link. The Fan crawl has an apron mouth facing the accepted Fanvault's south mouth across 4 m of open water.
- **Cove:** Cove undercut, Cove crawl and Headland root stair, joined by two crawl links.
- **Gully:** Drop Cathedral and Gully window; the bible's crawl between them is omitted.
- **Scar:** Scar crawl, with a pending join to the Undercroft.

Each crawl link has its rock split at the shared edge, a swept link route, and rescue routes. `MEDIUM_CAVE_GRAPHS` maps each medium cave's chambers, exits and closing passage to the bible's passage edges.

## Numbers
- **Fast tier:** `npm test` passes 1,096 of 1,096 (130 s), and `npm run typecheck` is clean.
- **Heavy tier**, four files, each run through `scripts/heavy-check.sh`. Each passes on its own and stays under the 1 GiB heap.
  - **Shell:** every shell point of every cave agrees with the rock.
  - **Loaded world**, with all 19 caves (including the Fanvault), the exterior structures and the vistas:
    - **Boxes:** 21,275 cave rock + 126,492 collar columns + 5,325 exterior = **153,092**.
    - **Build time:** 2.9 s with the 8 m index, 2.9 s with the 32 m composite.
    - **Per diver step** (a 0.25 m move plus a support query, over 7,010 steps along every diver route, median of 3): **35.3 µs with the 8 m index, 83.6 µs with the 32 m composite**. Both give identical answers. An earlier run on a busier machine measured 97.8 µs and 149.7 µs.
    - **Peak heap:** shell 603 MiB, loaded 515 MiB, retreat 1,006 MiB, adverse 824 MiB.
  - **Lamp-off retreat:** from 1,515 starts (every metre of every route, plus every room), each start reaches open water or air in 3,924 hops. Every cave's own exits are used, and the negative control fails as it should once the openings are plugged.
  - **Adverse case:** see below.

### Adverse case: deepest small-cave network, lamp off, 20% air
The deepest small-cave network is the **Fanvault network**, which reaches the Shelf lip at 44 m. The diver has 20% of 180 s of air, which is 36 s at 3.4 m/s, or 122 m. Every room's swept, lamp-off route out is well inside that:

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

The slowest way out of any small-cave room, in any network, takes **7.1 s** against 36 s of air. The longest route out of this network is 19 m, from the Fanvault pocket.

## Bible changes and why
- **Footprints were fitted to the floor that was actually built.** Most changes are under 10 m. The larger ones:
  - **Surf cave:** its mouth stays on the east slope, and the cave now runs west under the island instead of into open water. It also keeps clear of `isles_stack_glass_east`.
  - **Blowhole:** built as a basalt sea stack at the foot of the cliff (1062..1084 × 124..146), with its chimney rising through the stack to a dry ledge at +0. It does not claim the cliff face.
  - **Storm arch:** built as a spur of three blocks (1147..1184 × 55..158). The bible's single wide outline sprawled under the kit's batter.
  - **West sea cave:** built under a knoll at the inlet head (930..955 × −9..26).
  - **East ledge cave:** given 1 m of separation from the Storm arch.
- **The West sea cave's dry shelf became a shingle bank** 1.5 m down, lit through the beach mouth. A dry shelf there would need a waterline walk that the sim does not validate. A drip room and a drip arch close its loop, as the bible's `ac40de9` loop requires.
- **The Fanvault is joined by an apron, not a shared mouth.** The Fan crawl's mouth faces the Fanvault's south mouth across 4 m of open water, so the accepted Fanvault is not rebuilt.
- **The crawl from the Cathedral to the Gully window is omitted.** It would climb about 30 m under the gully floor and cross the Basin route corridor. The open gully already joins the two mouths, 25 m apart.
- **Vents and cracks were added where the lamp-off retreat needed daylight:**
  - the Archlet's sinkhole;
  - the Cathedral's chimney vent;
  - the Storm arch's floor crack.
- **Content points moved into reachable rooms**, by 0.6 to 24.5 m. The moves over 10 m:
  - Wrackhollow membrane, 20 m: moved to the catch.
  - Surf-cave glass, 21 m: moved with the cave.
  - Arch glass, 15 m: moved to the gallery wall.
  - Arch float, 22 m: moved under the skylight crack.
  - Blowhole stash, 25 m: moved to the dry ledge, matching the bible's "dry".
  - Grotto glass, 14 m: moved to the gallery.

  Each content item names its bible proposal. Every required material in a cave also has registry sources outside caves.

## Kit additions (all additive; for C4)
- **`caves.ts`:**
  - `CAVE_SOURCES` now holds the Fanvault, `REEF_CAVES` and `ISLES_CAVES`.
  - `caveDef` passes neighbours that share an edge to `buildCave`.
  - Optional `CaveSource.style` (`CaveStyle`), and a `"link"` route role.
- **`caveGeometry.ts`:**
  - Linked caves: `sharesEdge`, `sharedSpans`, `caveNeighbours`, and an optional `neighbours` argument on `caveSampler` and `buildCave`. A neighbour's rock pad is sampled with that neighbour's own opening. Seam vertices are frozen in relax and coarsening, and the collar distance skips shared spans. This makes two shells on a seam meet exactly, with no skirt.
  - Regional palettes: `STYLE_PALETTES` and `styledColors`.
  - Without neighbours or style, the Fanvault output is unchanged.
- **`caveWorld.ts`:**
  - `cellSize` option, with `CAVE_INDEX_CELL = 8` as the default.
  - Queries are local to the index and give answers identical to the 32 m composite; fast and heavy tests check this.
  - `stats` (`CaveWorldStats`).
- **`lightField.ts` bug fix:** Float32 → Float64 path distances. With float32, a rounded-down copy made a texel's own heap entry look stale, so the texel never expanded and daylight stopped short. On the Fanvault, 9,821 of 32,845 water texels change, 121 of them by more than 10%. Its existing tests pass unchanged.
- **`tests/content-proposals.test.ts`** (CB-owned): a minimal `kitOnlyCaves` patch. The proposal-ID collision, overlap and density checks no longer count a proposal that CA-1 authored under its own ID twice.
- **`tools/cave-lab.ts`:**
  - `?cave=<id>`, or `[` and `]`, picks a cave and loads its network within 40 m.
  - Views are generated and validated for collision.
  - Each cave has its own light field.
  - Contents and route overlays; `?shots=` captures a scripted queue.
  - The lamp (`L`), LOD (`K`) and collision (`C`) toggles are unchanged, and `view=vault` still works for `cave-gpu-check`.

## Wiring after C3
1. **Collision:** give `createCaveWorldQueries` every `CAVE_SOURCES` cave, using the default 8 m index.
2. **Terrain:** bake a hole per footprint. Linked caves share their seams exactly, so a network needs no skirt between its caves.
3. **Lighting:** `CaveLighting` activates one cave at a time. Switch to the nearest cave, and at a seam hand over to the cave that owns the diver's position. The lab's `lightNearest` shows this.
4. **Spawns:** `CAVE_CONTENTS` gives resource pockets, resident spawns and finds, each with its room and surface.
5. **Rescue:** `CAVE_NETWORKS` gives rescue routes and link routes.
6. **Craft staging:** each cave's `staging` lists the craft spots and the hall's turning bay.
7. **Pending joins:** `isles_undercroft.scar_mouth` and `canopy_rootways.back_stair` wait for those cave biomes.

## Known limits
- Air at the waterline is untested:
  - the Blowhole's dry ledge and the West sea cave's waterline hall reach air, but the sim's breathable rule (feet + 0.85 ≥ 0) is the only check;
  - walking on the waterline was not tried.
- The light field is 1 m with 26-connectivity, so daylight can leak through diagonal rock thinner than about 2 m. Crawls are kept at least 2.5 m from open water for that reason, and a future cave needs the same margin.
- The lamp-off retreat file peaks at 1,006 MiB against the 1,024 MiB heavy budget, so adding caves to it means splitting it again.
- The collar step reaches 1.30 m on the steep Headland root slope, within the test's 2 m bound.
- No GPU frame-time numbers were taken. The screenshots come from the lab in a preview tab.
