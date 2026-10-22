# CW-1: every authored cave in the game, streamed without pauses (handoff)

Opus 5.5 high. Branch `t3/enable-authored-cave-streaming`, from root `3650e6b`, root merged at `c649b11` (CA-3, CB-2, POI-1). Code: **TBD**.

## Outcome
All **55** authored small and medium caves are in the real game: the Fanvault and W2's four hub caves, CA-1's 18 Reef and Isles caves, CA-2's 12 Canopy and Basin groups, and CA-3's 20 Rift, Divide and Meridian sources. The browser never generates a cave: collision and light are baked, streamed ahead by proximity and heading, built in time slices and evicted behind and far first. A fast Dart traversal of all seven regions and every cave on the RTX 3090 never held and never built a cave synchronously (*Traversal*).

## What changed
- **Registration (`caves.ts`).** `CAVE_SOURCES` lists every cave. CA-2's groups build through `groupDef` (their edge-shelf floor, one memo) and draw in their own style (`caveShellOf`). CA-3's join through a data-only `caves/deepCaves.ts` (no simulation import, so no cycle). `caves/authored.ts` no longer imports values from `caves.ts` (the cycle would have put `EXTERIOR` in its dead zone); `assertDisjointFootprints` moved to `caveGeometry.ts` and is re-exported.
- **Region palettes.** The kit's `STYLE_PALETTES` gain lava glass (Rift), brine stone (Divide) and cut masonry (Meridian), applied by region when a source sets no style; Reef, Isles, hub and Canopy/Basin keep their looks.
- **Uphill edges (CA-2's kit change).** `buildCave(..., { edgeRock })`: a 2 m cube may lean on the exterior ground in the pad, so edge rock no longer sinks under the shell's snapped edge; boxes are clipped back to the footprint. On for CA-3, whose terrace and tube walls sank up to **16.9 m** (Meridian culvert north; 7.5 m terrace crack, 4.2 m escarp pocket, 3.5 m fissure window); after it every CA-3 edge is within 0.7 m. CA-2 keeps its tested edge-shelf floor; CA-1 and the hub sink at most 1.4 m and keep their accepted build (limit).
- **World queries (`sim/world.ts`).** Same W1 contract, composed per **cluster** (caves within two bands of each other; 55 caves make 44). A cluster's composite holds its rock, collar columns and the exterior solids round it, and is built on first use or ahead by the streamer, in slices (`buildSpatialIndex` is sliced too); eviction drops it, and a rebuild is identical, so the simulation never depends on streaming. Sight lines touching caves test every exterior solid, then each touched cluster.
  - **Vertical test (CA-2).** A shape over a footprint but wholly above the cave's `topY` is the exterior's: the carrier passes over caves. A fast test pins that every cave's ground and terraces sit at least 0.5 m under `topY`.
  - **Ground read (CA-1).** Outside every footprint `supportHeight` is the exterior's own; the collar's 0.5 m steps no longer stall a walker.
  - **Records.** `world/caves/kitCollision.ts`: rock boxes, collar columns (heights rounded outward to 1/1024 m) and 1 m inside-water bits per cave, built live (Node, the oracle) or decoded from the bake (browser, `setKitCaveRecords`).
- **Bake (`scripts/bake-terrain.mjs`).** One command bakes and verifies terrain and caves: `public/caves/collision.bin` (every record, **TBD** compressed) and one light field per cave. Terrain grows **15.4 → 38.9 MiB** compressed with every shell; the caves add **2.5 MiB**. `--verify`: **TBD**.
- **Streaming (`world/caves/kitStream.ts`, renderer).** Each frame, from the camera and its velocity: clusters within 360 m of the viewer or of where its heading puts it in 12 s are built in 2 ms slices; ready ones past 520 m behind (or 900 m anywhere, or over 220k boxes) are dropped. Light fields are fetched from 260 m and their textures made from 140 m, one per frame, three ahead (`CaveLighting` keeps four); terrain files are prefetched toward the heading. The cave whose footprint holds the camera is lit (light switches at a network seam).
- **Far layer (`render/farLayer.ts`).** The landmarks 20 m and taller (Rift chimney, spire, gate towers, works, stack yard, masts) as silhouettes with a lamp each, always resident, shown when their chunk is not drawn.
- **Admission (`world/caves/admission.ts`, `app.ts`).** Before each frame steps: a kit cluster in the actor's reach is built now if its records are decoded, else the frame **holds** (clock paused, "Loading cave…"). Cave biomes run LC's `CaveAdmission` (away, waiting, loading, rescue, admitted). **LC-07:** a hold that lasts 12 s without a rescue relocates to the last safe exterior pose (rechecked clear), else to the refuge base (`relocateForCave` in `step.ts`: the craft waits, inventory and vitals untouched). A save load admits during entry, before the first tick, and builds every legacy region owner into retention there too. One `CaveArbiter` now carries the world budget: regions and cave data reserve, the chunk residency is the opportunistic "world" owner (`externalFor`). No biome is placed yet; placing one registers a `BiomeRuntime`.
- **Currents and hazards (CA-3).** `flowHere` (`step.ts`): carved cave water is still; exterior flow is untouched. `sampleHazards` and SYS-1's `hazardsAt` sample `DEEP_CAVE_HAZARDS` by CA-3's rule (the only ecology edit: two additive loops in the samplers).
- **Content conflicts the registration exposed.** Three rescue tethers (`rescue.ts`) dove through cave rock in the composed world: Basin #4 (dish-lee vault), Divide #5 (fissure window), Meridian #4 (window gallery). Each has one bend moved clear; all 71 routes and tethers now sweep clear (medium hull) in the game world.
- **Stray costs fixed on the way.** The scene lights scanned a streamed mesh in one go (35 ms) and placed thousands of thin-instance lights at once (103 ms): both are sliced now.

## Traversal (RTX 3090, ANGLE GL-EGL, headless 1600×900)
TBD

## Checks
TBD

## Adverse cases
- **Resting in a sheltered cave (CA-3 R1).** A diver idle 15 s in the crest hollow shelter at cycle 40 s, and in the lintel galleries: moved under 0.6 m, health 100, brine 0. Unmasked control: carried over 2 m (`cw1-caves.heavy`).
- **A cave that cannot load.** Records missing: held, then admitted the frame they land. Never clearing: relocated to the remembered open water at 12 s, or the refuge if that is no longer clear. A biome reload below its budget: paused, rescued at 4 s; with no verified rescue, the refuge at 12 s (`cw1-streaming`).

## Known limits
TBD
