# World map and layout: decisions (owner, 2026-10-25)

This came from a live grill session between Alek (the owner) and an Opus 5.5 world and level designer. It's spoiler-free on purpose: late places are described only by what kind of place and challenge they are, never by story.

- **Inputs:**
  - `docs/build/GAME-DIRECTION.md`, `OPENING-DESIGN.md` and `design/REST-AND-AIR-DECISIONS.md`;
  - `docs/research/WORLD-LAYOUT-PROGRESSION.md` and `WORLD-EVOLUTION-PLAN.md`;
  - `src/content/regions/{layout,sites,terrain,passages,caves}.ts`, `src/content/stops.ts` and `src/content/ecology/species.ts`;
  - the LS-1, ENV-1 and PACE-1 stream plans on their branches.
- **Visuals,** all in this folder:
  - `world-today.html`: the current world from the real coordinates;
  - `expanded-v1.html`: the agreed shape;
  - `moorings-v1.html`: the agreed moorings.

  Shapes in the visuals are schematic. Coordinates in this file are the decided anchors.

## Where we started (code today)
- **Footprint:** 2048 × 1792 m, X −576…1472, Z −1632…160. The pod sits near the north-west corner, about (0, 0), so the start is at the edge of the world.
- **Layout:** the seven regions run clockwise like chapters: Reef and Isles across the north, Canopy in the north-east, Basin in the centre, Rift in the south-west, Divide in the south, Meridian in the south-east corner. The floor (`MACRO`) is one smooth bowl that only gets deeper to the south-east. Region footprints are axis-aligned rectangles.
- **Each region is built from one shape:** four parallel Canopy ribs, one diagonal Rift trench, one long Divide ridge, Meridian's concentric rings.
- **Straight lanes:** the stack→headland surface run (east), the Basin anchorage→wreck ridge (420 m east), the Divide→Meridian broad lane (520 m east), the Canopy margin (680 m), and the escarpment ledge (660 m north–south).
- **Long empty legs:** PACE-1 measured 3.1–3.5 km Creel hauls between the workshop and the district, and nine 2.1 km carrier crossings. About half is the bot's ordering; the rest is structural.
- **Moorings:** one per region. Three sit 50–130 m from a big stop: the Rift cool flank, the Basin anchorage and the Divide lee.

## Decisions

### Length and scope
1. **No hour target.** The game is finished when it's finished. The pacing rules stay as the guard against padding:
   - something new every 15–20 minutes;
   - about 90 s of empty travel between points of interest, as a spacing guide;
   - no decode-only waiting;
   - playtests never trim good content.

   GAME-DIRECTION's "Length" bullet and the "10+ hours" in "Done means" change.
2. **The map expands now** (this brings forward the old "Option B after the game is finished" decision).
   - **Envelope:** X −1280…1472, Z −1632…960. That's 2.75 × 2.6 km, about 1.9× today.
   - **The pod stays at (0, 0),** so no existing coordinate, save or placed thing moves. The pod ends up about 230 m north-west of the map's middle: "more centered … doesn't have to be directly centered".
   - **The playable sea is an irregular shape** whose edge drops into the abyss, so the corners aren't area that has to be filled. Life thins out and a warning plays at the edge. **No creature polices the edge.**

### How the map plays
3. **Stars are the places you return to:** the pod (early), the crown (mid), each restored big stop, and the carrier (a star you bring). Short winding spokes go out from each and back. Longer journeys run between stars, and each long one starts at a mooring.
4. **Everything else is mix and match, not radial.** Each sub-area or landmark uses a mix of shapes to keep things interesting:
   - loop;
   - string of pearls;
   - warren;
   - vertical stack;
   - set-piece path;
   - cul-de-sac with a payoff.
5. **Tells draw you out.** Every sub-area has at least one tell readable from its edge or from a passing route: a silhouette, a light, a cave mouth, a sound, odd creature behaviour, a wreckage trail, an out-of-place object.
   - **Spacing:** on any journey, the next tell appears before the last one fades.
   - **Area tells:** some tells point to an area ("somewhere in this field"), so searching an area is a kind of exploration.
6. **Entrances always reward you.** Any entrance in a sub-area (a cave, a hatch, an interior) leads to at least one rare reward: a rare material, a plan, a decode, a cache or a view. GAME-DIRECTION's guard stays: anything required also has a source outside.

### Biomes
7. **Regions are biome families that appear in a few patches.** The seven regions stay as the top-level identity: materials, depth tier, story structure. Each family can appear in several patches, each with its own local twist, and the HUD and journal show "family · place". A patch can be promoted to a full region later.
8. **Six new patches, and no more until a playtest asks for one.** Each earns its place with a resource and a real environment, "where it doesn't feel like every where is just open sand and water". Names are working names; positions are approximate anchors.

   | Patch | Family | Depth | Anchor (x, z) | Resource reason | Environment |
   | --- | --- | --- | --- | --- | --- |
   | **Glass Shoals**, with the storm banks as its outer edge | Isles | 20–90 m | (220, 500); banks along z ≈ 800 | The main field of **silica sand** (decision 21), plus fish, close to the pod | Humming glass pillars, surf banks, an exposed sightline |
   | **Canopy north tongue** | Canopy | 55–150 m | (−520, 420) | Early resin, membrane and seeds | A younger, shallower floater forest |
   | **Blue hole** | Rift | 40 → 300 m | (−150, 420) | Early: gathering around the rim. Late: a ceramic seam and a cave at the bottom | A vertical shaft with a warm glow far below |
   | **West canyon** | Basin | 180–320 m | from the Basin's west lobe (−330, −460), winding north-west through (−820, −40) to (−1000, 700) | Alloy wreck frames, crust | A second winding way south from home toward the west lobe and the Rift |
   | **North seep trench** | Divide | 300–450 m | (640, 380) → (1330, 520), behind the islands | Optional, richer lattice; cold-seep life | A dark, dangerous place right behind home |
   | **Ash apron** | Rift | 280–450 m | (−850, −900) | A second thermal core source | A cooled lava field linking the Rift and the west canyon in a loop |

   Plus one creature feature: a **giant grazer migration** along the northern edge (decision 25).
9. **The south half gets reshaped too.**
   - **Borders:** region rectangles become organic shapes.
   - **Straight lanes:** the five are bent.
   - **Canopy:** its four parallel ribs become uneven ribs with gaps and fallen floaters.
   - **Divide and Basin** push fingers into each other.
   - **Fixed points:** the crown, the stops and the existing sites stay where they are; the ground changes around them.
10. **The crown stays** at (330, −560).
11. **Where regions meet:** most borders blend over about 50–150 m, so you see the next place coming. A few are deliberately sharp for drama: a shelf wall into the dark, the brine mirror, the blue hole's lip.

### Depth, barriers and difficulty
12. **Depth rule:**
    - **General trend:** the floor gets deeper the further you are from the pod, in every direction.
    - **Deep fingers near home:** the blue hole, the seep trench, and the Rift's cold finger reaching under the Reef's west gully toward the Hearth drop foot.
    - **Shallow surprises far out:** for example, a seamount near the Divide that nearly breaks the surface, where you can come up for air.
    - **Early sight, later access:** you see each deep finger early and can work it later.
13. **Nothing straight.**
    - **Bends:** every route bends at least about every 250 m, and the land forces the bend: curvature of the land, a shelf wall, a Canopy wall, a current, a predator's territory. Never an arbitrary bend.
    - **Two ways:** every journey between stars has at least two ways through, a broad, slower lane and a narrow, faster or riskier one.
    - **Landmarks:** one you can steer by is visible at each bend.
14. **Pressure points** (the owner's difficulty levers placed on the map):
    - **Can't surface:**
      - the cave biomes and medium caves;
      - the west canyon's undercut walls;
      - the Canopy's root ceilings;
      - the blue hole's lower shaft;
      - the brine-capped Divide fissures;
      - in effect, anything below about 200 m.
    - **The craft can't fit, so you park and go on exposed:**
      - the Basin vault interiors;
      - the cave at the blue hole's bottom;
      - the seep trench's fissures;
      - the district's interiors.
    - **A craft at its depth limit:** the Rift's deep wall, the seep trench floor, the district's lowest terrace.
15. **Depth limits are soft gates.**
    - **With the upgrade:** a place at a craft's limit becomes comfortable once you have the next depth refit.
    - **Without it:** you can always push past early, at real risk to the hull.
    - **Tied to an upgrade:** each limit place is linked to the upgrade that opens it.
16. **Resources thin out further away.**
    - **Commons:** fewer sites, harder to find, often in search areas rather than plain sight.
    - **Frontier materials:** each frontier still holds the reliable supply of its own new material.
    - **Deep patches:** richer seams that are riskier to work.
    - This keeps PACE-1's "the frontier supplies the commons it uses", just sparsely.

### Moorings and rest
17. **What a mooring is.**
    - **The place:** a small, old service post anchored to the seabed, with a cradle you nose into and a dim beacon light. Its power source fits its surroundings: a heat tap at a vent, a current turbine in a channel, or a cable up to a surface float.
    - **What it gives:** charge and repair only. **No air, no rest, no locker.**
    - **Its light is a tell.** Once found, it goes on your chart and marks "the long part starts here".
18. **Switching one on.**
    - **The problem:** every mooring starts dead.
    - **The fix:** you park, swim into its diver-only housing (no air inside, so you're briefly exposed), and fix one visibly broken part. You can tell its material by looking, for example burnt crust contacts or a cracked glass housing, so you bring a small amount of a common material.
    - **The switch:** you throw it, the lights come up, and it **stays on for good**.
    - **Variety and cost:** the fix suits the power source, and the whole thing takes about 1–2 minutes.
19. **The mooring rule.**
    - **Distance:** at least about 300 m along the route from any big stop and from the homes.
    - **Placement:** only where a long, hard leg begins: a round trip using over about 40% of the normal craft's charge, or a descent past a depth tier.
    - **Count:** about five on the whole map.
    - **Rescue tows** end at the nearest home or restored big stop, never at a mooring.
20. **The five moorings** (`moorings-v1.html`):

    | Mooring | Anchor (x, z) | Starts | Nearest home or big stop |
    | --- | --- | --- | --- |
    | **M1, Dish south** (Basin) | (590, −790) | The descent to the Divide | crown 347 m |
    | **M2, Staging shelf** (district, kept) | (1080, −1160) | The final journey | district big stop about 398 m |
    | **M3, Seep head** (north-east edge of the shoals) | (640, 400) | The seep trench descent | pod 755 m |
    | **M4, Canyon head** (west) | (−720, 200) | The loop from the canyon to the ash apron | island 554 m |
    | **M5, Escarpment head** (east) | (1290, −300) | The deep escarpment ledge | crown 995 m |

    - **Removed:** the Basin anchorage, the Rift cool flank and the Divide lee.
    - **Moved:** the Canopy east bowl's mooring moves to M5.
    - **Carrier:** it can still anchor beside the crown; it just doesn't charge there until the crown is restored.
    - **Why five is enough:** at cruise on a full charge, the Creel covers about 3.5 km, the Mantle about 3.2 km, and the Dart and carrier about 7.2 km.
21. **Rest and wake.**
    - **Canopy lab:** becomes an early rest and wake point (it's already dry).
    - **Carrier:** becomes a wake point through a **bunk module**. It takes one of the carrier's system sockets, so it competes with the planters, decoder and fabricator. It's built and registered like the Creel cabin, and only the carrier can take one ("It's the biggest and greatest vehicle"). The cabin still heals you without it.
    - **Creel cabin:** a registered one **stays a wake point** (owner: "let's keep the creel"), as in the rest decisions.

### Places, caves and features
22. **Glass is crafted.** Divers gather **silica sand** (pale drifts and seams) and fabricate it into silica glass, 2 sand to 1 glass to start. The shoals hold the main fields, and the stack and headland keep small deposits. Recipes keep asking for glass.
23. **The district's big stop** sits deep, at the district's far end on a lower terrace (around (1330, −1470)), not by the staging shelf. The coordinator and lore owner pick the building. Owner-facing text stays general.
24. **Caves.**
    - **Cave biomes stay at four.**
    - **Small caves in every new patch:** glass grottos in the shoals, root hollows in the Canopy tongue, undercut caves in the west canyon, lava tubes in the ash apron.
    - **A medium cave at the blue hole's bottom,** as the dead end with a payoff.
    - **The quota stays:** 2–4 medium caves per region family.
25. **Shortcuts you earn later.** There are four, each seen before it's usable:
    1. **A deep tunnel** from the blue hole's bottom cave to the Rift's cold finger, below 300 m. It's a late, quick route from home to the Rift that skips no depth tier.
    2. **The stack cleft,** which already exists: small craft only.
    3. **A west canyon current** that slackens on a cycle, with a longer way round as the alternative. It's prototyped in the sandbox.
    4. **The Canopy root caves** through the east shelf, leading to the escarpment head.
26. **Lost sites.** Each of the six new patches gets one small lost site with a rare reward, written spoiler-free and fitting the canon. An existing LS-1 site may move into a new patch if it fits better.
27. **Steering landmarks.**

    | Star | Far landmark, visible from its neighbours |
    | --- | --- |
    | Pod | The island's lookout and its mist |
    | Crown | Its beacon |
    | Rift station | The split chimney's glow |
    | Divide dock | The gateworks silhouette |
    | District | The spire's lit crown |

    | New patch | Silhouette |
    | --- | --- |
    | Shoals | The humming glass pillars |
    | Blue hole | Its glow |
    | Canopy tongue | Its tall floaters |
    | West canyon | A great arch over the canyon |
    | Ash apron | A dead chimney field |
    | Seep trench | Pale seep chimneys |
28. **The giant grazer migration.** A gentle creature the size of a building drifts west → east along the north edge and back.
    - **Following it:** it's marked as a deliberate quiet stretch, of the "large natural formation" kind.
    - **Along the path:** scraps it sheds, and cleaner fish.
    - **Gating:** nothing required depends on it.
    - **Keeping it:** it's a natural cycle, so it's prototyped in the sandbox and kept only if fun.

### Creatures and mood
29. **Threats and helpers.**
    - **Early shallows stay threat-free** (Reef, Isles, the shoals, the Canopy tongue): the Safe Shallows rule, with only harmless and nuisance animals.
    - **A new mid-game threat** for the Basin family lives in the west canyon and the Basin's darker edges. It has a home you can read, warning cues, and a way past from its behaviour.
    - **A big creature** the size of a building lives in the north seep trench.
      - **Presence:** heard far more than seen.
      - **Territory:** the trench lip is its edge, so it never leaves, and you can glimpse it from the safe shoals.
      - **Way past:** from its behaviour, for example it rests on the floor between seep pulses.
      - **Choice:** the optional rich lattice sits in its trench, so going in is always your choice.
    - **Existing threats** (glare stalker, layer skate, hollow choir) stay in their homes. Each long journey routes around at most one territory you can see or hear before entering.
    - **Helper creatures** sit at a few junctions where natural: a school leaning toward exits, grazers gathering on silica sand. Never quest markers.
30. **Wonder versus dread.**
    - **The gradient:** wonder near home and on the shallow north edge, turning eerie further away and deeper.
    - **Exceptions:** one unsettling spot near home (the blue hole: a far-off sound, something that doesn't add up), and one place of pure wonder late in the game (a deep, beautiful place, or meeting the migration from below).
    - **Built places** follow "it depends on the place".

### Build order
31. **One terrain-and-world stream,** after the cave stream CW-1 merges (shared files).
    - **What it covers:** the new footprint, organic region borders, the reshaped south, the new patches as terrain, bent routes, the moved moorings and the rebuilt baked world data.
    - **OP-1 (the island)** goes ahead unchanged, since the pod and island don't move.
    - **LS-1 and ENV-1** keep working on existing coordinates.
    - **Caves, lost sites and creatures** for the new patches follow once their terrain exists.
32. **One grill session per area** before its content is built, to make each "detailed unique creative and just fun". Each produces a short design file builders work from. Order:
    1. the areas around the pod: Glass Shoals and storm banks, the Canopy north tongue, the blue hole;
    2. the mid-game: the west canyon, the Basin threat, the crown's surroundings;
    3. the late areas: ash apron, seep trench and its big creature, district. These stay spoiler-free.

## The owner's words (verbatim where it matters)
- "I want to start to not set the gameplay target to around 10 hours at this point, it's just when it's done."
- "I kind of what to go back to subnauticas map. Biomes are kind of intertwined and not just blocks next to each other. … it's pretty linear. I guess it's fine for a bit or player to choose a direction and go straight there but the problem is the exploration around that."
- "In the starting area your exploring around and coming back to the pod over and over, when you sketch from the top down it actually resembles at asterisk or the Claude symbol where it encourages you to get a lay of the land then coming back to base to consolidate resources, enact on the things found (read, use, make, etc.) make your next plan (getting resources, trying to build something, going somewhere, going back to places where you have a way to get past an obstacle,etc)."
- "With the vehicles or the major stops this changes that center to be either one of those exploring around it."
- "I think we have to expand the back side of the map around the starting area to make it more centered in the entire map ( doesn't have to be directly centered). You may have to add more places or areas."
- On sub-areas: "If there's not too many and they have useful resources or provide an actual environment where it doesn't feel like every where is just open sand and water, sounds good."
- On barriers: "Curvature of the land, shelf walls, yeah pretty much all of that."
- "not everything has to be radial exploration (let's say your in some subarea or landmark for example, not all of it would)"
- "it should be mix and match, generally probably not stars because what leads you to explore are indications of something to find like an object, a cave, looking for something in an area. So a mix and match of all of them to keep things interesting."
- On glass: "shouldn't … glass be something we craft?" Then "is it silica? We could do that?"
- "if there's an entrance to something in a sub area i assume there would be some rare reward/s in that place."
- "soft gates for the depth limit because of the upgrades we could get"
- On moorings: "maybe we choose it have some resource and you just have to go in and turn it on"
- On the carrier as a wake point: "maybe you need an upgrade for the carrier to respawn there" … "the carrier maybe the only place to have one. It's the biggest and greatest vehicle, right?" On the Creel cabin: "No let's keep the creel as able to you were right before."
- "at some point though, biomes or each sub area may need a grill session to be make them detailed unique creative and just fun."

## Still open
1. **Exact coordinates and outlines** of the six patches, the reshaped south and the bent lanes. The terrain-and-world stream proposes them inside these anchors; the per-area sessions refine them.
2. **The district big stop's building:** the coordinator and lore owner.
3. **Each mooring's broken part and its material,** one per power source: the per-area sessions or the terrain-and-world stream.
4. **Tuning:**
   - the 40% charge threshold for a "long leg";
   - the 2:1 silica ratio, owned by the economy owner;
   - whether the blue hole needs a sixth mooring (not adopted: it's 445 m from the pod).
5. **Sandbox keep-or-cut:** the grazer migration and the west canyon current.
6. **Performance at 1.9× the area.** The column count rises from 224 to about 460 at 128 m. The streaming, prefetch, far-layer and bake budgets need measuring early against the 60 fps and "no streaming hitch" gates.
7. **Labels:** `isles.headland_shelter` and `basin.dish_shelter` still carry `refuge` (from the rest decisions). Relabel them, so "refuge" means a real rest point.
8. **Names** in this file are working names.

## What changes, per stream

### GAME-DIRECTION (coordinator)
- **Length and done:**
  - "Length: … about 10 hours or more" becomes no hour target, "done when it's done", with the pacing rules kept;
  - "Done means: … full, atmospheric and unpadded at 10+ hours" drops the hours;
  - the first-timer time factor stays as a measurement, not a gate.
- **The bigger map:** "re-evaluated once the game is finished" becomes "decided 2026-10-25, this file".
- **New sections:**
  - the map shape (stars, mix-and-match places, tells, entrance rewards);
  - biome families in patches;
  - the depth rule and soft depth gates;
  - "nothing straight" as concrete rules;
  - the mooring definition and activation, and the five spots.
- **Waking up:** add the Canopy lab, and the carrier with its bunk module (a carrier-only socket). The registered Creel cabin stays.
- **Creatures:** early threat-free shallows; a Basin-family mid threat; the seep trench's big creature; no creature policing the edge.

### Terrain and world (new stream, after CW-1)
- **Envelope:** change `WORLD_ENVELOPE` and `TERRAIN_EXTENT`-adjacent bounds to X −1280…1472, Z −1632…960. Add an irregular abyss rim with a warning and life thinning out.
- **Floor:** rebuild `MACRO` around the depth rule: deeper away from the pod in every direction, deep fingers near home, shallow surprises far out.
- **Regions:**
  - replace the `FOOTPRINTS` rectangles with organic outlines, keeping the one-answer `regionAtPoint`;
  - add a patch or sub-area layer for "family · place".
- **Terrain features:**
  - the six patches;
  - the blue hole's shaft;
  - the west canyon;
  - the seep trench;
  - the ash apron;
  - uneven Canopy ribs;
  - Divide and Basin fingers;
  - the Divide seamount.
- **Routes:**
  - bend the five straight lanes;
  - give every journey between stars at least two ways;
  - put a landmark at each bend;
  - add the deep tunnel's exterior ends.
- **Fixed points:** keep the crown, stops and existing sites fixed, and move the ground around them.
- **Moorings:** apply decision 20.
- **Re-run:** the bake, chunk layout, streaming prefetch, far layer and the bot's routes (`passages.ts`, `access.ts`, `rescue.ts`). Measure performance early (open item 6).

### Caves (CW-1 now, the BIO streams later)
- Small caves in each new patch, in its own style.
- The blue hole's bottom medium cave.
- The deep tunnel from the blue hole to the Rift cold finger, below 300 m.
- The Canopy root caves to the escarpment head as a shortcut.
- The four cave biomes are unchanged.

### LS-1 (lost sites)
- Six new rows, one per new patch, each with a rare reward. The rows are deferred until their terrain exists.
- Consider moving an existing site into a new patch.
- **Entrance rule:** every entrance leads to a rare reward. Required items still have an outside source.

### ENV-1 (interiors)
- The district big stop moves deep, to the lower terrace. The staging office is service only.
- The air proof holds with no nearby mooring (unchanged from the rest decisions).
- The mooring housings are small diver-only sets, not interiors, and have no air.

### PACE-1 (late-game pacing)
- **No hour target:** the "about an hour shorter" acceptance stands, with no floor to defend.
- **Moorings:** use M1 and M2 in the late plan. Removing the Rift, Divide-lee and Basin moorings changes the bot's charging stops.
- **The carrier** relocates for groups of sorties, as already planned.
- **Commons** are sparse at the frontier (decision 16), consistent with design call 3.
- **Long legs** stay reported for judgement.

### BIO streams and creatures
- The Basin-family mid threat; the seep trench's big creature.
- The early shallows stay threat-free.
- Helper creatures at junctions.
- Sandbox prototypes for the grazer migration and the canyon current.
- One per-area grill session before each area is built (decision 32).

### Moorings and rescue tows (stops and survival code)
- **`SERVICE_MOORINGS` and `sites.ts`:**
  - remove `basin.anchorage`, `rift.cool_mooring` and `divide.lee_mooring`;
  - move `canopy.east_mooring` to M5;
  - add M1, M3 and M4;
  - keep `meridian.staging_shelf`.
- **Activation:** a mooring is dead until fixed and switched on, and the on state persists. That's one saved fact per mooring, through `src/save/*`.
- **Rescue tows** retarget to the nearest home or restored big stop (`access.ts` validators, recovery routes).
- **The carrier bunk module:** a system-socket module that makes the carrier a wake point.
- **The Canopy lab** joins `bases.ts` as a rest and wake point.

### Economy
- A new raw material, **silica sand**, and a fabricator recipe, 2 sand → 1 silica glass.
- Today's glass sources become sand sources. The shoals are the main field.
- Update the bot and all six economy scripts.
