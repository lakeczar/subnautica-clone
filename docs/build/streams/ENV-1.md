# ENV-1: explorable interiors with environmental storytelling (design plan, stage 0, revision 2)

Opus 5.5 high, design authority for the stream. Branch `t3/env-1-interiors`, with root `e136beb6` merged. **Docs only: no code stage starts until the coordinator approves this plan.** Spoiler-safe. The lore notes (hindsight meanings, canon ties, rulings and the player-text rules) are in `docs/spoilers/ENV-1-LORE.md`, for writers and integration agents only.

This revision answers Sol's R1 (`review/env-1-r1`, `b2f5de12`), the coordinator's two owner points, and Sol's R2 (`review/env-1-r2`, `a77c186d`). The dispositions are in *Review responses* at the end.

**Player outcome.** A handful of abandoned buildings you can go inside, each dense with detail and each with something wrong that you notice before you read anything. The early ones feel like someone just stepped out. Later ones are orderly in a way that unsettles. The logs explain what you've already seen. Fear comes from implication, never gore.

**Owner direction this plan serves** (GAME-DIRECTION, 2026-10-24): the tone of abandoned places depends on the place. Early places lean towards wonder and curiosity, later ones become somewhat eerie and unsettling. Environmental storytelling is atmosphere priority 5. Built interiors may use two-door seals and airlocks, which double as atmosphere and as load buffers. Late-game needs are inferred from evidence.

## Design calls (taste decisions, argued from the evidence below)

1. **The room tells you before the log does, in three beats:**
   - **The tell:** one wrongness you can read within about ten seconds of entering, by eye alone. A log never carries it.
   - **The turn:** a second room or detail that changes how you read the first.
   - **The keepsake:** one personal object that makes the people real.

   Logs and records explain the tell and the turn. They never introduce them. If a design only works once you've read the log, it isn't an ENV-1 interior.
2. **Six interiors, few and dense, not many and thin.** Each earns its place with a tell, a turn and a keepsake. Six across 10+ hours is about one every 1.5 hours, spaced between LS-1's lost-site beats so the two don't cluster.
3. **Tone is graded mostly with light and sound, not props:**
   - **Early:** daylight through windows, warm and lived-in. Things are left mid-task.
   - **Middle:** your lamp, silt in the beam, and things left in a hurry with care.
   - **Late:** the light that's left is machine light, still running. Rooms are tidy, labelled and empty.

   The same kit reads very differently under each.
4. **Nothing is heaped.** Abandoned belongings are always folded, bagged, tagged, hung or racked, never piled. That's what makes the late rooms unsettling, and it rules out any image that quotes a real-world atrocity. It's a hard dressing rule with a review check.
5. **No bodies, no remains, no blood.** Absence does the work: empty hooks, pale rectangles where pictures hung, a chair turned towards a door. The lore appendix holds the story constraints behind this rule.
6. **One interior model, the cave vocabulary.** An interior is rooms, portals, routes and staging, the same shapes W1/CW-1 caves use (`CavePortal`, `CaveRoute`, `CaveStaging`), built from an architectural kit rather than voxel rock. There is no second model for "a room you can enter". What exists is reused: the light field (stage 2 adapts its input and its thin-wall handling, §3.5), lamp visibility, the residency arbiter, route sweeps and rescue staging. What is new work is named as new: architectural portal kinds (an explicit extension of `CavePortalKind`), the all-cell interior validator (§3.4) and room-portal visibility culling (large-cave portal adjacency drives residency today, not visibility).
7. **The bake is the asset boundary, and the plan is kit-agnostic** (owner point, 2026-10-24: the interior look waits for the asset-pipeline debate). Interiors name templates, not geometry. A template's source is a procedural recipe today or an imported mesh later, and the bake turns either into the same Babylon-free buffers, so collision, emissive lights and the cel material can't tell them apart. The runtime never loads glTF. ENV-1 reuses the existing `MeshRecipe`, `TemplateRecipe` and `TemplateLibrary`, and pre-builds no importer, no generic material system and no full procedural prop library that a proof asset would replace (§3.3).
8. **No new economy and no new saved state.** Rewards come only through LS-1's caches, plans and reveals, or the story's existing grants. An interior's states (dark or restored, collapsed bay or rebuilt) are derived from facts the save already holds.
9. **Fix the root that blocks good interiors: one air-room authority** (§3.6). Today the Canopy lab's dry box is literal coordinates in `inCanopyAir` and again in the shader's water interval, and the Rift station's "air" is a 4 m sphere at its work pose that also decides rest. A drained station room needs one descriptor, activated by its restoration, that exposure, movement, optics, rest and wake all read.
10. **Air is proved from a real expedition, not from where craft could park** (§3.4). An interior is safe when the craft the player actually has on that route, parked in one place, plus the rooms that are actually dry, cover it or allow a timed return with reserve.

## 1. Current state

- **Shells and markers, no interiors.** `content/regions/structures.ts` draws:
  - the Meridian gate hall, which is open-fronted with three walls and a roof;
  - the gallery facades: 36 m of axis-aligned blocks with a 4 m door and nothing behind;
  - the archive, staging office, Rift station and crown station, each a single solid box;
  - the Divide lintel and dock platform, the split chimney, the Isles pier and the headland shelter hut (a four-wall shell);
  - dishes, girders and posts.
- **The Basin dormitory (C05) is five collision boxes:** a floor, a back wall, two bed blocks and a bundle block (`content/routes.ts` `BASIN_GEOMETRY`), drawn by the legacy world. The boundary station beside it is three boxes.
- **The one dressed room is the Canopy laboratory:** an open pressure hood with a window and cladding (`render/expedition.ts`). Its dry air is a literal box.
- **Story hosts are points:** `content/story/placements.ts` `PLACED_HOSTS` positions each record. The tests hold every host to the composed floor, with a collision-checked view.
- **POI-1's mirror wreck** is a vista set of ribs, beams and a mast (`content/poi/sets.ts`). It has no inside.
- **Lost sites:** LS-1 1a is on root. Its sites are still find points; stage 3 gives them sets.
- **There are no glTF assets and no loader.** Everything is procedural TypeScript geometry through the kit's `RecipeBuilder`. A separate asset-pipeline study is starting.

## 2. The six interiors

Times are uncalibrated human estimates on LS-1's timeline (`LS-1.md` §3), to be calibrated by the owner's playtest. **Path** uses LS-1's terms: *main* (the intended route passes it), *near*, *off*. Hindsight meanings are only in the lore appendix.

| # | Interior | Region, depth | When (est.) | Path | Tone | Owner of the place |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Field station and cold store | Opening island, +28 m (dry) / +24 m | 20–75 min (cold store: 90–180 min) | main (Scientist thread) | wonder | OP-1's island; ENV-1's interiors |
| 2 | Old intake pump house | Hearth Reef, −23 m | 45–120 min | near (LS-1's first decode) | cheerful wonder | LS-1 site; ENV-1's interior |
| 3 | Basin dormitory | Pale Basin first shelf, −166 m | 150–260 min | main (C05) | curiosity turning uneasy | ENV-1 |
| 4 | Ember Rift materials station | Rift cool flank, −262 m | 300–400 min | main (restored stop) | industrial, first eeriness | ENV-1 |
| 5 | Wreck on the mirror | Mirror Divide brine pool, about −380 m | 380–480 min | near (POI-1's service-ledge leg) | eerie | ENV-1 (POI-1's set) |
| 6 | District halls: transfer hall, medical annex, and the upper hall's turn | Meridian, −599 / −680 / −600 m | 470–600 min | main (C08, C10, works) | unsettling, ending in warmth | ENV-1 |

**Not chosen, and why:**
- **The reef wreck** (OP-1's survival manual): it's a swim-through. OP-1 dresses it with the kit.
- **The crown station:** a working hub, not an abandoned place to read. HUB-2 can adopt the kit.
- **The gate hall, service window and inner hall:** the story resolves here, and the works' machinery state graph runs these rooms. The owner has approved dressing them in full as a later stage (stage 6). Until then they stay the story's compact sets, and ENV-1 doesn't touch them.
- **Lost-site sets other than the pump house:** the chart room, borehole hut, sensor house, tide store and ridge vault are LS-1's (stage 3) and the BIO streams' (in-biome rows). They use ENV-1's kit and rules, but they are not ENV-1's six.

### 2.1 Field station and cold store (OP-1's island)

**Progression and pacing.** The Scientist thread's start (OP-1): reached from the lookout, the spring path or the tide-bench ladder, 20–75 min in, with about 6–10 min inside. The cold store under it is LS-1's gate 1: seen in the first hour and opened after the Dart with the gauge logger's code. It's the first purposeful return home.

**Before any log** (wonder, daylight):
- **The tell:** two whitewashed huts left mid-day. A kettle hangs on its hook, a mug sits on the rail, and a deckchair faces west. A hand-lettered note is pinned inside the door (wording in the lore appendix). It reads as someone expecting to be back by evening.
- **The turn:** the windward hut. Its window is blown in and a tongue of dried sand and leaves runs across the floor. Papers on that side are swollen and stuck together, and the vane lies broken outside. A storm came, and nobody came back to sweep up.
- **The keepsake:** a shell paperweight on the journal, from the reef below. Its living twin is something you can scan on your swim.
- **Supporting detail:**
  - a pinned island chart with three hand-drawn question marks (OP-1's leads);
  - a shelf of stoppered jars of spring and shaft water, labelled by depth, each a slightly different tint. The deepest is cloudy.

**Cold store** (first dark room, lamp):
- **The tell:** cold air at the seams and frost-dry crates. Racks of spare strain gauges are numbered like the posts you'll find on the Splitspine slump scar, and survey sheets are rolled in tubes.
- **The turn:** the back of the store drops into a flooded sump with a float on a line, breathing cold, slow water. It's the Under-Stair's top (OP-1, large-cave technology), and the sump is a shared portal between the interior and the cave.

**Records and logs.** OP-1's: the scientist's journal and the cold store's records. ENV-1 adds dressing labels only. LS-1's gauge log names the store and its code. The physical gauges here make that line land, so neither duplicates the other.

**Dressing list:**
- **Props:** desk, journal, paperweight, kettle and hook, mug, deckchair, chart, depth jars, rain-gauge log board, a bunk with a folded blanket, oilskins, a crate of spare vane parts (for OP-1's mast repair).
- **Damage:** the blown-in window, the sand tongue, swollen papers, the fallen vane.
- **Belongings:** the deckchair's cushion, a sun hat, a paperback face-down.
- **Light:** low sun through the west windows, a dusty beam. The store is dark except for the door's light wedge; it's the lamp's first job inside a building.
- **Sound tells:** the vane's loose shutter knocking in the wind. In the store, the sump's slow breath. Each has a caption (LS-1's caption rule).

**Navigation.**
- **Station:** dry land with two doors per hut. The ladder shortcut down to the tide bench opens from inside (OP-1's "door opens behind you").
- **Store:** one keypad door and a short dry passage. The sump is an optional way on, never the only way out.
- **Air:** the dry store has none to manage. The sump is OP-1's cave with its own rules.
- **Fit:** diver only. Craft stay at the cove.

**Rewards.** OP-1's (the thread's outputs, the cold store's records and sump). ENV-1 adds none.

### 2.2 Old intake pump house (LS-1 site, Reef)

**Progression and pacing.** LS-1's first decode, *near*, 45–120 min. It's the first underwater building you can enter: 3–5 min, safe and shallow. It teaches entering through a door, reading light through windows, and that buildings have two ways out.

**Before any log:**
- **The tell:** a cheerful, cared-for workplace. A painted INTAKE 1 sign hangs inside, scrapers are racked, and a lunch tin sits on the bench. Painted on the wall is the crew's tally of how far the fans had grown into the intake: dated lines climbing a ruler, with jokes beside them.
- **The turn:** the pump pit. The grate is choked solid with fans that have grown through and up into the room, swaying in a gentle inflow. Stencilled arrows on the wall read MOVED TO THE RIBS and point at the capped pipe outside, LS-1's physical lead.
- **The keepsake:** a crew mug with a painted fan on it.

**Records and logs.** LS-1's three intake logs and the season note, decoded. ENV-1 adds the tally wall, the arrows and the pit, which show before decoding what the logs then explain.

**Dressing list:**
- **Props:** sign, scraper rack, bench, lunch tin, mug, tally wall, pump housing, valve wheels, the sealed log cabinet (LS-1's logger).
- **Damage:** the grate, the fans through the floor.
- **Light:** sunbeams through a roof hatch, green from the fans.
- **Sound tell:** the inflow's soft hiss at the pit, captioned.

**Navigation.** The door and the roof hatch are two exits. The room is about 8 × 6 × 4 m. A craft parks beside the door; the layout is sized so the air proof (§3.4) passes by coverage from that one craft on both routes. Diver only.

**Rewards.** LS-1's (`bp_small_fabricator`, its reveals). ENV-1 adds none.

### 2.3 Basin dormitory (C05)

**Progression and pacing.** The main path's first Basin shelf, beside the service rack and the boundary station (C06), at 150–260 min. About 5–8 min inside. It's the first place where the mood turns.

**Before any log** (lamp, silt):
- **The tell:** a long, low dormitory with every bunk stripped to the frame. Above each bunk are pale rectangles on the wall where pictures were hung and taken down.
- **The turn:** the belongings. They are tied in neat bundles, each tagged, and stacked against the inner wall, away from the open-water landing. The landing doors are shut and lashed from the inside. People took their pictures and left their things packed and waiting.
- **The keepsake:** a small stringed instrument tied carefully to the top of one bundle.
- **Supporting detail:**
  - the common room facing the landing has a board game left mid-play and mugs on the table;
  - a slow fan of silt has come in through a broken landing window and runs across the floor.

**Records and logs.** The story's C05: the transfer tags and the separate witness note. The tags *are* the bundles' tags, so the evidence is physically the thing you're already looking at. ENV-1 writes no record. It places C05's existing host on one tagged bundle and the witness note on one particular bunk (lore appendix).

**Dressing list:**
- **Props:** about 12 bunk frames, lockers with doors open and empty, bundles and tags, the lashing rope, the common room table, game pieces, mugs, a duty board, a washroom with a cracked mirror.
- **Damage:** the broken landing window, the silt fan, one collapsed ceiling panel letting a shaft of dim light in.
- **Belongings:** the instrument, a knitted scarf through a bundle's tie, the pale picture rectangles.
- **Light:** only your lamp and the dim shaft. Silt hangs in the beam.
- **Sound tells:** the lashed door's slow creak as the water moves, captioned.

**Navigation.**
- **Entry:** the broken landing window and an end door both open onto the existing parking at (178, −160, −208). A rear service door gives a loop.
- **Air:** sized so the air proof (§3.4) passes by coverage from the one parked craft on each route's first-access scenario, with the hull present at the existing parking.
- **Fit:** diver only inside. The existing parking and extraction routes stay valid; the stage replaces `BASIN_GEOMETRY`'s dormitory boxes with the interior's collider.

**Rewards.** The story's existing C05 grants (Creel service and the carrier's Basin half). ENV-1 adds none.

### 2.4 Ember Rift materials station (restored stop)

**Progression and pacing.**
- **When:** the Creel route's third restored stop, and on the carrier route's way, at 300–400 min.
- **Time:** about 6–10 min the first time.
- **Restoring it changes it:** you pay the restoration (the existing `restore_rift_station`), and the station's lights come on hall by hall while its air room drains. Restoration becomes something you see.

**Before any log** (industrial, the first eeriness):
- **The tell:** the press hall stopped mid-shift. A ceramic batch is fused to its kiln trays, and the press dies are worn to the bright metal. Camp cots are pushed between the machines, with a boot under one.
- **The turn:** the loading bay. Crates are stencilled for the Divide upper dock, strapped and never loaded. Beside them are the works' core cradles, two of them empty and tagged: PACE-1's F4 evidence, which tells you what the works will need from the Rift.
- **The keepsake:** a hand-drawn calendar on a locker with days crossed off towards a circled date, a crew member's leave.
- **Before restoration:** dark, with vent glow through the windows and mineral crust on every machine. The hull ticks as the vent pulses warm and cool it.

**Records and logs.**
- **The story's ledger:** the production ledger with its margin note sits in the station office, where it is today.
- **Read before you reach it:** the cots, the worn dies and the crates show the quota pressure before the ledger explains it.
- **No duplication with LS-1:** LS-1's pump-head field already has the climbing quota board, so the station shows the cost on the crews, not a second board.
- **PACE-1's cradle fixture** keeps its data and scan line; ENV-1 gives it its place in the bay.

**Dressing list:**
- **Props:** a kiln line, presses, die bins, conveyors, crates and straps, core cradles (PACE-1), cots, lockers, the calendar, an office desk with the ledger, a shift board, the entry lock's two doors and wheel.
- **Damage:** heat-warped shelving, crust over the machines, one blown light fitting.
- **Belongings:** boots, a thermos, the calendar.
- **Light:** before restoration, vent glow and your lamp. After, warm work lights come on room by room. That's the stop's reward made visible.
- **Sound tells:** the hull's thermal ticking before restoration, the hum after it. Both captioned.

**Navigation.**
- **Entry:** a two-door lock, a short animation (GAME-DIRECTION welcomes it) that is also the interior's load buffer.
- **Second exit:** the loading door, jammed half-open before restoration (diver-wide) and fully open after.
- **Air:**
  - **after restoration**, the drained room is the stop's only air, rest point and wake point, through the air-room descriptor (§3.6). The old 4 m air sphere at the work pose is retired; service, locker and fabrication access stay at the work pose as today;
  - **before restoration**, the room is flooded and inactive, so the air proof (§3.4) must hold on each route's first-access scenario from the one parked craft alone, or as a timed return with reserve.
- **Fit:** craft at the existing mooring, checked with the hull present (approach, parking, exit and boarding).
- **Replaces the solid hull:** stage 3 removes `rift.materials_station.hull` from collision, exterior art and scatter, and the interior's coarse shell and far silhouette take its place in the same merge (§3.7).
- **Depends on** owner question 1, which is still pending. If the owner says no, the station keeps today's work-pose air, the interior is flooded throughout, and no air room is built.

**Rewards.** The existing restoration (air, rest, service, charge, locker). ENV-1 adds none.

### 2.5 Wreck on the mirror (POI-1's set)

**Progression and pacing.** Beside the service-ledge leg on the Divide, *near*, at 380–480 min, with about 4–8 min inside. It's optional and **the one interior with no log at all**. It stays ambiguous, as POI-1 wants.

**Before any log** (eerie, by contrast):
- **The tell:** a work barge settled across the surface of the brine pool. Inside, above the brine line, it's like any wreck, with growth, glimmers and silt. One sharp horizontal line crosses every wall where the brine begins.
- **The turn:** below the line, nothing has aged. A jacket hangs on its hook looking new, a chart is pinned and legible, paint is bright, and a small fish hangs motionless at the line itself. Nothing lives below it, and nothing has decayed.
- **The keepsake:** a mug of pens on the chart table, perfectly kept, below the line.
- **The crew got off:** the raft cradle on deck is empty and its davit swung out. A careful player can see it.

**Records and logs.** None, deliberately. That keeps POI-1's "ambiguous wreckage, not plot". What it means is in the lore appendix.

**Dressing list:**
- **Props:** a wheelhouse, chart table, hooks and jacket, bunks, a galley, hold racks, the raft cradle and davit.
- **Damage:** a broken back, a hull breach, growth above the line only.
- **Light:** your lamp. The brine surface below reads as a dark mirror that reflects the lamp, and below it the colours are unnaturally vivid.
- **Sound tell:** the hull groaning where it rests on the brine, captioned.

**Navigation.**
- **Entry:** the deck hatch and the hull breach both open above the brine.
- **The preserved hold** is straight down through one hatch below the line. It uses S4's existing brine exposure rule, so brine protection is a soft gate. The only way out is back up through the same hatch, in plain view: one straight vertical, never a maze.
- **Air:** the air proof (§3.4) holds from one craft parked above the deck: coverage above the brine, and the hold within coverage or a timed return with reserve.
- **Fit:** diver only.

**Rewards.** None by default: the view is the reward. ENV-1 offers LS-1 one optional cache in the preserved hold, a sealed locker with bio-cells and glass, through LS-1's cache mechanism and counted against its taste limit. LS-1 decides; if it says no, there is no cache.

### 2.6 District halls (Meridian)

**Progression and pacing.**
- **When:** the last expedition (PACE-1's self-contained district), at 470–600 min.
- **Where:** the transfer hall (C08) and the medical annex (C10) are on the main path. The upper hall is where the works restore the hall frame and the food bay.
- **Time:** about 10–15 min across the three, interleaved with PACE-1's works beats.
- **The arc:** the unsettling ending softens to warmth as you restore the upper hall. The game's last interior turns from absence to a place people can come back to.

**Transfer hall: before any log** (machine light, order):
- **The tell:** a long hall with painted floor lanes and numbered rope stanchions, all leading to one door. It stands open onto a stair down that is choked with silt: people went through, and nobody can now. Rows of benches face a board. It's swept, orderly and silent.
- **The turn:**
  - a wall of identical bags on numbered hooks, each labelled, none taken;
  - folded blankets on the benches, squared off.
  - Beside the door, the actuator's status lamps still glow: the only live light in the hall. A chain of cable-tender animals clings to its feed line (the content bible's live-lines cue).
- **The keepsake:** a chalk doodle on a pillar of the opening island's lookout and its survey pillar. A player who has stood there recognises it: the island was somewhere these people knew.

**Medical annex: before any log:**
- **The tell:** a rehearsal frozen in place. A row of examination couches is made up identically, and trolleys are laid out with the same instruments in the same order, as for a drill.
- **The turn:** a whiteboard of arithmetic in one hand, crossed out and redone in the same hand, the new figures smaller. Then the cold room: racks of numbered drawers, all open, all empty. Everything prepared was taken.
- **The keepsake:** a reading lamp clipped to one couch, with a bookmark in a closed book.

**Upper hall: the turn back.** Before the works, it's dark, with a collapsed frame and a dead food bay. As the works restore the hall frame and the food bay (the existing `works:hall` and `works:food` faces), its dressing changes state:
- lights come on along the long table;
- the bay's planters glow;
- the table is laid.

It reads as a place ready for people. The state is derived from the works flags, with no new saved field.

**Records and logs.** The story's: C08 (the transfer board and the actuator seal), C10 (the annex protocol and consent ledger) and the personal note beside the ledger, at their existing hosts. ENV-1 builds each room around its record and writes nothing new.

**Dressing list:**
- **Props:** lanes and stanchions, benches, the board and actuator (story hosts), bags on numbered hooks, blankets, a stamping counter with tag stock, couches, trolleys, the whiteboard, a lectern (C10's host), cold-room drawers, the upper hall's table, frame and food bay in two states.
- **Damage:** a roof breach at the transfer hall's far end, silt drifts in the annex corridor, the upper hall's collapsed frame (before the works).
- **Belongings:** the bags, the clipped lamp and book, a coat left on one bench, the chalk drawing.
- **Light:**
  - transfer hall: the actuator's live lamps, otherwise dark;
  - annex: the cold room's faint indicator strip;
  - upper hall: dark, then warm.
- **Sound tells:** the actuator's relay clicking at intervals; in the annex, a drip; the upper hall's hum on restoration. All captioned.

**Navigation.**
- **Transfer hall:** the facade door and the far roof breach make a loop. The hall is about 30 m deep, so a second parking place alone doesn't make it safe: the player has one craft. The air proof (§3.4) must pass with the route's craft at either parking place, by coverage or a timed return with reserve, or the hall's layout changes until it does. The silted stair is plainly impassable scenery (a collapse you can see into), never a door that looks like a puzzle.
- **Annex:** the terrace door and a back corridor down to the lower terrace.
- **Upper hall:** the existing works faces, plus the facade door and a side door.
- **Fit:** diver only, with the 800 m suit. Craft stage outside.

**Rewards.** The story's existing grants. ENV-1 adds none.

## 3. Reuse, ownership and the technical approach

### 3.1 Which interiors are whose

| Interior | Whose place | What ENV-1 owns | What the other stream owns |
| --- | --- | --- | --- |
| Field station and cold store | OP-1 | The two interior definitions (rooms, portals, dressing, light, sound) on OP-1's footprints | The island, terrain, hut placement, the journal, the store's records, the sump cave |
| Pump house | LS-1 | The interior definition | The site row, plate, tell, exterior set (stage 3), logs, rewards |
| Dormitory | the story's C05 site | The whole interior, retiring `BASIN_GEOMETRY`'s dormitory boxes | C05's text and grants |
| Rift station | the stop (C3/HUB-2 tables) | The interior, its two states, its air-room row, and the proposed replacement of the solid hull (composed by the coordinator) | The restoration recipe, stop services, the ledger text, PACE-1's cradle fixture data |
| Mirror wreck | POI-1 / PACE-1 stage 3 (`content/poi/*`) | The interior definition, referenced from the POI set by ID | The POI set, its leg, its beacon |
| District halls | the story's district sites | The three interiors, the upper hall's two states and its air-room row. Replacing the gallery and archive shells is **conditional on the coordinator's agreement before stage 4 is dispatched**; until then the existing facades stay the one shell authority, and no second shell is drawn beside them. | The records, works faces and works logic |

### 3.2 How it composes with other streams

| Stream | Relationship | Rule |
| --- | --- | --- |
| **LS-1** | The pump house is an LS-1 site whose stage 3 set includes ENV-1's interior. Every LS-1 set may use the kit, the validator and the dressing rules. ENV-1 offers one optional cache (the wreck). | ENV-1 writes no lost-site record, reveal or reward. LS-1's lint and caption rules apply to every ENV-1 player string (lore appendix). If LS-1 stage 3 reaches the pump house before ENV-1 stage 2, LS-1 builds it from the kit and ENV-1's definition. |
| **PACE-1** | The Rift station hosts F4's core cradles. The district halls hold PACE-1's works beats. The wreck's POI files are PACE-1 stage 3's. | PACE-1 owns the fixture's data and scan line; ENV-1 owns its position in the bay, moved only through the story-placement test. ENV-1's wreck stage edits `content/poi/sets.ts` only after PACE-1 stage 3 (one-line reference to the interior). |
| **OP-1** | The field station and cold store sit on OP-1's island. | OP-1 places them by interior ID and owns everything outside. If OP-1 runs before ENV-1 stage 2, OP-1 builds the two huts from ENV-1 stage 1's kit and definitions. The huts are axis-aligned on the 90° grid, so their walls collide exactly as boxes on COL-1 A's static collider; non-box props are visual-only under the small-prop rule (§3.4). **What OP-1 and LS-1 can consume before ENV-1 stage 2 is geometry only**, through their existing set pipelines. The interior's runtime lighting, room culling and residency come with stage 2, and the field station and pump house get them then, not through a copy. The cold store's keypad door depends on LS-1 1b's `systems.opened` and keypad, which are planned and not yet on root. OP-1 owns the ladder shortcut's persistence. |
| **CW-1, caves** | Interiors reuse the cave vocabulary, light field, lamp walk, arbiter and portal visibility. The cold store's sump is a portal shared with the Under-Stair. | No ENV-1 stage edits a CW-1 file before CW-1 merges. The light-field generalisation (§3.3) lands after. |
| **COL-1 stage B** | Every interior collides through COL-1's collider built from the art (`artMembers`, `meshShapes`), registered with stage B's single composer. | Prerequisite for stages 2–7. No new box-set adapter. |
| **WK-1** | Interiors bake offline: meshes, collider, light field. | Prerequisite for stages 2–7. The stage brief names the accepted bake on root when it starts (WK-1's bake v2 if landed). There is no synchronous runtime fallback beyond CW-1's counted dev fallback, and no second mesh builder. |
| **REC-1 / REC-2** | Fixed views tagged `interiors`, three per interior (entry, tell, turn). Entering an interior counts as a new thing on its first arrival. | Uses the recorder's existing `new` event, keyed by interior ID. |
| **Atmosphere and UI** | Sound tells are events with captions. | Audio consumes events. Caption labelling belongs to the UI stream (LS-1's rule). |
| **Asset pipeline study** | Imported meshes enter as templates through the bake (§3.3). | ENV-1 adopts the study's recommendation for templates without changing interior data. |


### 3.3 Interiors as data, kits as templates

**The interior definition** (`content/interiors/types.ts`, Babylon-free) has these fields:

| Field | What it holds |
| --- | --- |
| `id`, `region`, `site` | Identity, and the S2 site or story place it belongs to |
| `anchor`, `yaw` | Placement; yaw on the 90° grid wherever possible, so architecture stays box-exact |
| `rooms` | Box volumes with a role and a daylight `falloff` (as `CaveRoomSource`) |
| `portals` | `CavePortal`s, with `CavePortalKind` explicitly extended by the interior kinds (door, window, hatch, breach, lock) and `admits` |
| `routes` | `CaveRoute` loops and exits per profile |
| `staging` | `CaveStaging`, where craft park |
| `scenarios` | The air proof's first-access scenarios (§3.4) |
| `shell` | Kit modules on a 0.5 m grid (the cave voxel), at least 0.25 m thick (§3.5) |
| `dressing` | Prop placements: template ID, pose, tone variant, collision class, detail tier |
| `lights` | Emissive tags with colour and their room |
| `sounds` | Sound tells, each with its caption |
| `hosts` | References to existing story or LS-1 host IDs, never copies |
| `states` | Optional: a dressing variant keyed by a read-only derived fact (`restored:rift_station`, `works:hall`) |
| `replaces` | Structure IDs this interior takes over (§3.7) |

Air rooms are not a room flag. They are rows in the one air-room table (§3.6), which names its interior and room.

Cave types are imported **type-only**, and `content/interiors` refers to templates by ID, never value-importing a render recipe, so the content layer stays guard-clean and stage 1 touches no CW-1 file.

**The kit:**
- **Modules** (`render/interiors/kit.ts`): floor, wall, ceiling, door frame, window, column, stair, hatch, bulkhead, lock, with damaged variants (cracked, bent, missing panel, breach). They are Babylon-free `RecipeBuilder` recipes, the one builder (CORE-HELPERS), with fine and coarse LODs, registered through the existing `TemplateRecipe` / `TemplateLibrary`.
- **Props** (`render/interiors/props.ts`): only the templates the next stage's interior needs, as `TemplateRecipe`s. No full procedural prop library is built ahead of need, because the asset pipeline's proof asset may replace part of it.

**Template sources** (kit-agnostic; owner point, 2026-10-24):
- a procedural recipe today;
- an imported mesh once the asset-pipeline debate is settled. The proposal on `research/asset-pipeline` (a rigid GLB converted to a recipe in WK-1's bake) fits this seam, but it is not an accepted decision.

Collision (`meshShapes`), emissive clustering (`clusterEmissive`) and the cel material see the same buffers either way, so a template can change source without its interiors changing. ENV-1 builds no importer, no generic material system and no texture path. Textures, UVs, materials and articulated doors are that pipeline's decisions.

**The bake** (WK-1), per interior: fine and coarse meshes, the COL-1 collider, the light field, the occupancy with its brick level, and the machine-light reach masks (§3.5). It is content-addressed and bound to the build. Only transferable typed arrays cross the worker boundary. The stage-2 brief names WK-1's accepted manifest and registration before work starts.

### 3.4 Collision, navigation and the air proof

**Collision.**
- Architecture blocks stay boxes in the collider (exact). Bent and broken pieces and large props are mesh shapes built from the same art.
- **The small-prop rule:** a prop under 0.35 m in every dimension, or flagged `visual`, never collides. The validator proves that no `visual` prop stands in a swept configuration, a portal's clear rectangle or a parked hull's clearance.

**Navigation in configuration space, not empty cells.** The validator (`content/interiors/validate.ts`) builds a graph of capsule poses on a 0.5 m lattice:
- **swimming nodes** use the diver capsule (`CRAFT_PROFILES.diver`, 0.34 m radius, 0.95 m high);
- **walking nodes**, only inside an active air room and above its waterline, use the walking capsule (0.34 m, 1.75 m) with floor support;
- an **edge** exists only where the collider's own capsule move from one pose ends at the next. That's the composed world's `moveCapsule`, or, before stage 2, COL-1 A's `createStaticCollider` on the interior's own art over a fixture floor;
- **swim ↔ walk edges** follow the sim's surfacing rule at the room's waterline.

Edges are directed, because slides are not symmetric. The validator then requires:
- every node reachable from an entry can return to an exit portal (no one-way traps);
- every interior has two exits, or one exit visible from every room.

**The air proof, from real expeditions.** Each interior declares first-access **scenarios**: one per supported fleet route that brings the player here (Creel and carrier; the no-optional variants where their fleets differ). Each scenario is derived from the route's SAVE-1 milestone save before first access, and fixes:
- **the one available craft:** the hull that route has there, confirmed present in the save;
- **one parking place;**
- **the suit tier** from the save;
- **the active air rooms**, from the save's facts through the air-room table (§3.6), so an unrestored station has none.

Every declared staging must pass on its own with that one craft. A staging that can't is removed; it doesn't count as a second craft.

For each scenario, every swimming node must be either:
- **covered:** the real `airLineSupply` returns a supply for the craft at its actual keel pose. That's the basic line only, its charge held at the 25% reserve, with no reel and no Mantle hull line assumed. An active air room also covers a node;
- **or a timed return:** the round trip along graph paths, from the nearest covered node out to it and back, at ordinary swim speed, uses no more than 75% of the scenario suit's oxygen at that depth, through the sim's own drain, not a copy. That keeps EXPEDITION_INTEGRATION's 25% reserve.

A node that is neither fails the validator, which names the scenario and the node.

**The parked hull is present.** In each scenario, the craft's hull is added to the world at its keel. Then:
- the craft's approach from open water to the keel sweeps clear;
- the diver's exit and boarding poses (the sim's existing exit and board rules) succeed;
- the interior's routes are swept again with the hull as an obstacle.

**Other validator checks:**
- every portal's clear rectangle is free of shell and colliding props;
- every host and work face rests on a floor within 4 m and has a collision-checked view;
- every sound tell has a caption;
- nothing is heaped: no `belonging` template intersects another beyond a contact tolerance. Racks, hooks and bundles are the only belonging stacks allowed.

**Fixtures that must fail:**
1. **Two parking places, one craft:** a 30 m hall with staging at both ends. With the craft at the near end, the far end is beyond the line and beyond a timed return, so it's rejected.
2. **An unrestored station:** a back room covered only by its air room passes after restoration and fails before it.
3. **Walking headroom:** a dry room with 1.5 m headroom admits the swim capsule but not the walking capsule, so it's flagged.
4. **A one-way drop:** reachable from the entry, with no edge back.
5. **A hull that blocks:** a parked hull covering the exit door.

**Where the checks run:**
- stage 1 runs them on fixtures in the fast tier, on COL-1 A's collider;
- from stage 2, the composed-world version is one heavy job (queued, `--machine any`), plus COL-1 B's oracle on the art against the collider;
- save and reload at every room keeps the diver valid (depenetration on the composed world).

### 3.5 Light, occlusion and streaming

**Daylight through openings.** `caveLightField` takes a `CaveDef` today. Stage 2 adapts its input to a **light volume**: rooms, portals, the occupancy grid and a small header that both a cave and an interior provide. That keeps one light-field authority and one shader path (`caveLight.ts`). Windows, doors, breaches and skylights admit daylight the way cave mouths and skylights do. Dry rooms (the field station) take the sun through the same field.

**Thin walls (stage 2, part of the same adaptation).** Today's lamp occlusion depends on cave rock being at least 2 m thick:
- `LAMP_SKIN` skips the first 0.45 m of every ray (`lightField.ts`);
- the shader starts the ray 0.3 m off the surface (`caveLight.ts`).

A 0.25 m interior wall would be skipped entirely, so a lamp could light a prop through it. **The walls are not thickened.** Instead:
- **Occupancy resolution comes from the geometry.** The bake chooses the occupancy voxel so the thinnest solid in the volume spans at least two voxels. Kit architecture is at least 0.25 m, so interiors use 0.125 m voxels, stored as bits (§3.8). Caves keep their 0.5 m grid.
- **Skin and origin offset come from the geometry.** The bake computes both from the volume's own thinnest solid and voxel: the offset is half a voxel plus epsilon, and the skin is at most the thinnest solid less one voxel, so every wall keeps at least one voxel in the walk. Both are stored in the volume header. `lampVisible` and the shader read the same header values (the shader as uniforms), so the CPU and GPU paths can't drift.
- **Caves are unchanged.** For caves the derivation yields today's 0.45 m and 0.3 m, and a test pins them, so cave lighting doesn't move.

**The walk must reach as far as the lamp (R2-1).** Today both walks stop after `LAMP_WALK_STEPS` (200) voxel steps, and a walk that runs out reports "blocked". On the 0.125 m grid that cuts clear rays off at about 23–26 m, short of the 32 m lamp. A plain walk at that resolution would need about 450 steps in the worst direction. **My call: a two-level walk with a bound derived so that it can't run out.**
- **A coarse brick level.** The bake stores, with the bit occupancy, one "any solid" bit per 1 m brick (8 × 8 × 8 fine voxels). The walk steps brick by brick through empty space, and descends to the fine voxels only inside bricks that contain solid, returning to the brick level when it leaves one.
- **The bound is derived, not tuned.** A ray of length R crosses at most `⌈√3·R / B⌉ + 3` bricks (B the brick size), and at most `3·B / v` fine voxels inside each (v the voxel size). The header stores `walkBound = bricks × (1 + 3·B/v)`, computed from the volume's own voxel, brick and lamp reach:
  - for interiors (R 32 m, B 1 m, v 0.125 m), 59 × 25 = 1,475 iterations in the pathological worst case of every brick on the ray containing solid;
  - typically far fewer, about 32 brick steps plus a few fine descents near walls.

  Since the bound covers every possible ray, "ran out of steps" can no longer be mistaken for "blocked". A test counts steps on random rays and fails if any walk reaches the bound.
- **One walk, one shader routine.** Caves use the same function with B equal to their voxel (a single level), and keep `walkBound` = 200. That is above their derived requirement (√3 × 32 / 0.5 + 3 ≈ 114), so a test pins cave visibility and reach as they are today.
- **GPU cost is a stage-2 measurement,** not a claim: the lamp walk's frame-time cost in the densest interior, lamp on, at 1080p, `--class exclusive` on the 3090, plus a 4070 check. If it doesn't fit the frame, the cheaper evaluation chosen (for example, the walk shared across a pixel quad) is filed as a compromise with its root fix. The bound is never cut back.

**Room-confined machine lights: a baked reach mask per light (R2-2).** Local point lights have no wall test today. A room-ID multiplier can't separate the doorway's spill from a receiver behind the wall beside it, because both are in the same room. Interior machine lights are static, so their visibility is baked:
- **The mask.** For each interior emissive cluster, the bake walks the same occupancy from the light to every texel of a mask covering the light's reach box, clipped to where its attenuation is non-zero (exterior parts included, so spill out through an exterior portal works too). It stores one bit per 0.25 m texel: visible or not. A texel's bit counts only its free-space sub-samples, never sub-samples inside solid, so a texel straddling a wall takes the visibility of its open side.
- **Sampling.** The receiver samples its light's mask at its position, offset half a mask texel along its surface normal into its own space, with nearest filtering. The hard step at the doorway's shadow line suits the banded cel lighting, and the offset keeps a receiver pressed against a wall from reading the far side.
- **The same light path and authority.** A tagged light's entry carries its mask slot. The existing local-light term multiplies by the mask bit, using the same bit-packed 3D addressing routine as occupancy. Untagged lights (exterior emissives, creatures) have no slot and are unaffected. `selectLights` (bounded top-k) is unchanged, and no second lighting system exists.
- **Lifecycle.** Masks bake offline (WK-1), are resident and evicted with their fine interior, and are registered in the ledger. A light that changes with a state (dark before restoration, lit after) changes intensity only; its mask stays valid.
- **Cost:** at most 6 masks × 32 KiB per interior (a 16 m reach cube at 0.25 m is 64³ bits), and one integer 3D fetch plus a bit test per tagged light per fragment (§3.8).

The per-texel room-ID texture from revision 1 is dropped: the masks replace it.

**Lighting fixtures** (CPU in the heavy tier, GPU as REC-1 fixture views in the stage-2 browser run):
1. **The near-wall prop:** a prop face at X = −0.05 facing +X, a wall at X ∈ [0, 0.5], and a lamp beyond the wall. The prop stays dark on both paths, for the lamp and for a masked machine light.
2. **Full lamp reach:** a clear 32 m axial ray and a clear 32 m diagonal ray on the 0.125 m grid read visible, and a 0.25 m wall 0.5 m short of the lamp reads blocked. No walk reaches its bound.
3. **Doorway confinement, Sol's counterexample.** A partition at X ∈ [0, 0.25] with a doorway at Z ∈ [−0.5, 0.5], and a machine light at (−2, 1, 0). The receiver at (2, 1, 0), through the doorway, is lit. The receiver at (1.2, 1, 2.4), the same distance away in the same room but behind the wall, is dark. Receivers either side of the doorway's shadow line are classified correctly within one mask texel.
4. **A dark room beside a lit room:** through a solid wall it stays dark.
5. **Cave regression:** a cave's derived skin, offset and walk bound equal today's values, and its sampled field and lamp visibility are unchanged.

**Occlusion is new work in stage 2:** room-and-portal visibility on the interior's own graph.
- From outside: the shell and the rooms seen through open portals.
- From inside: the current room, rooms visible through portals, and the exterior through exterior portals.
- Hidden rooms are disabled, not disposed. Selection is deterministic and allocation-free per frame (DIRECTION convention 1).

**Streaming:**
- **Always resident:** the coarse shell is the interior's exterior art. Landmark interiors (the Rift station, the district halls) also have a far-layer silhouette. Both are registered once (§3.7), and their overlap with caves and prefetch candidates is accounted once.
- **Prefetch:** the fine interior (dressing, collider, light volume) is a residency owner admitted through the **existing cave arbiter**, with no second arbiter. CW-1 supplies the prefetch, admission and sliced light uploads, which is why its merge is a prerequisite. Prefetch starts 300–400 m out by proximity and heading.
- **The residency policy is ENV-1's:** one fine interior resident normally, two at a seam. The arbiter accounts bytes, not counts, so ENV-1's owner enforces this with a bounded nearest-two selection.
- **Concealment:** loading is hidden by the lock, a bent vestibule or simply small size. The hold stays a safety net that ordinary play never reaches.
- **Frame work:** uploads share the existing bounded-work allowance with all other upload and build work (DIRECTION's ~2 ms convention). It is not an extra slice, and the 4 ms residency default doesn't waive it. Every synchronous finish is counted and logged.

### 3.6 The air-room contract (F2)

**Why.**
- **The Canopy lab:** its dry box is literal coordinates in `inCanopyAir` (`sim/inventory.ts`) and again in the shader's water interval and lab material masks (`render/materials.ts`). `sim/survival.ts`, `sim/step.ts` (twice), `render/camera.ts` and `render/renderer.ts` call `inCanopyAir`.
- **The workshop:** centralised in `nearWorkshop`, and OP-1 owns its move.
- **The Rift station:** its "air" is `atAirStop`, a 4 m sphere at the work pose (`stops.ts`, `inventory.ts`). That sphere grants air, healing and the `refuge` exposure flag in open water, and `restBaseHere` registers rest through the same sphere.
- **Recovery:** it picks swimming for any wake below y = 0 (`recovery.ts`).

A drained room can't be expressed in any of these.

**The descriptor** (`content/airRooms.ts`, one table):
```ts
interface AirRoom {
  id: AirRoomId;
  interior: InteriorId; room: string;          // whose room it is
  bounds: readonly Aabb[];                     // the room's air boxes, world space
  waterline: number;                           // world Y of the local air/water surface
  activeWhen: { facility: StopFacilityId } | { works: WorksFlag } | "always";
  restBase?: RestBaseId;                       // the bunk this room registers
  wake?: Vec3;                                 // feet on the dry floor; required with restBase
}
```

**Which rows exist.** The restoration rows are exactly the coordinator's set, the bigger restored stops:

| Row | Activated by | Rest base |
| --- | --- | --- |
| Rift materials station | facility `rift_station` | `rift_station` |
| Crown station | facility `crown_power` | `crown_station` |
| Divide upper service dock | facility `divide_dock` | `divide_dock` |
| District upper hall | works flag `works:hall` | none (the staging office stays the district's rest base) |

- **Small posts, player outposts, the pod and the workshop never get a row.** A content test refuses a row on any other stop or host.
- **The crown and Divide dock rows** wait for their interiors (stage 7).
- **The lab** migrates as the one `always` row, so the sim and shader read one table. It is pre-existing, not a restoration room.
- **All of it waits** for the owner's answer to question 1; the coordinator will relay it.

**Activation is derived, never saved.** `airRoomActive(s, room)` reads the restoration fact (`facility(s, id)` or the works flag) and nothing else. There is no new persisted field, because restoration is the sole authority.

**One query, every consumer.** `WorldQueries` gains `airRoomsInBox(box, out)` over the static table (indexed, allocation-free), and `airRoomAt(s, world, p)` filters it by activation. All of these read it:

| Consumer | Rule |
| --- | --- |
| **Exposure** (`survival.ts`) | Inside an active room with the airway above its waterline: `breathable` and `refuge` (healing and pressure protection, as at today's stops) and no water contact. Below the waterline it's ordinary water, and you can surface into the room. |
| **Movement** (`step.ts`) | The surface the sim tests becomes `surfaceY(s, world, p)`: 0 outside, the room's waterline inside. So surfacing, walking with the 1.75 m capsule and stepping back into the water work at the local surface. |
| **Optics** (`camera.ts`, `renderer.ts`, `materials.ts`) | The interior and air checks call `airRoomAt`. The shader's `waterPath` receives the nearest ≤ 4 active rooms (each box clipped to above its waterline) by bounded selection, replacing the literal lab interval. The carrier cabin stays its own moving volume. |
| **Rest** (`restBaseHere`) | An active room with a `restBase` registers that bunk. |
| **Wake** (`recovery.ts`, `bases.ts`) | `REST_BASES[...].wake` for a roomed base is read from its row, not copied. Recovery chooses walking or swimming from `airRoomAt(wake)`, not from `wake.y >= 0`. |
| **Stops** (`stops.ts`, `inventory.ts`) | `WorkingStop.air` becomes `boolean \| { room: AirRoomId }`. With a room, `atAirStop` reports the stop only while the diver is in its active room, so **the Rift's 4 m air and rest sphere is retired**. `nearStop` (the work pose) keeps service, locker and fabrication access exactly as today, and moorings keep `serviceRadius`. |

**Presentation settles deterministically.**
- The sim switches state on the restoration command's tick.
- The drain is a short presentation ease of the visual water plane, never saved. A diver standing in the room at that moment is placed by the ordinary movement rule against the new waterline.
- A reload shows the derived end state: lock idle, room drained if restored.

**Scope** (shared roots, composed serially through the coordinator): new `content/airRooms.ts`; `content/stops.ts`, `content/bases.ts`; `sim/inventory.ts`, `sim/survival.ts`, `sim/recovery.ts`, `sim/step.ts`; `world/queries.ts`; `render/camera.ts`, `render/renderer.ts`, `render/materials.ts`. It lands as **stage 3a**, the named prerequisite of the first dry underwater interior.

**Checks:**
1. **Before and after restoration, above and below the local surface:** the exposure fields, movement mode and optics are as the table says. Before restoration the room is inert: no air, no rest and no wake there.
2. **The old sphere:** after the change, the work pose grants no air or rest at the Rift, while service, locker and fabrication still work there.
3. **Rest → incapacity → wake:** you wake in the room, walking and dry, with recovery's vitals.
4. **Reload** inside the room before and after restoration, and in the water below it.
5. **The lab** answers identically in every consumer (a regression).
6. **Sim and shader agree** on sampled points through the CPU mirror.
7. **The adverse case:** restoring while the diver floats where the floor will be. They settle onto it deterministically, with no clip, on a replay and on a reload.

### 3.7 Shell replacement and registration (F4)

**Proposed interfaces, the coordinator's to own or amend:**
1. **Registry:** `INTERIORS` (`content/interiors/index.ts`) is composed into the content registry by the coordinator.
2. **Replacement:** `InteriorDef.replaces: readonly StructureId[]` is the only replacement interface. The coordinator adds one filter where `STRUCTURES` is composed (`content/regions/structures.ts`). A replaced structure then leaves `STRUCTURES`, and with it `STRUCTURE_SOLIDS` (sim collision and the spatial index), the exterior art in `render/biomes/structures.ts` and the scatter keeps, all together. The interior's own keep boxes take over scatter exclusion.
3. **Exterior representation:** the interior's coarse shell is registered as exterior structure art (an `interior_shell` kind drawn by the existing structure renderer), and its silhouette as a `farLayer` entry. The fine owner is registered with the cave arbiter.
4. **Tests:**
   - no structure ID is both present and replaced;
   - a replaced structure's solids are absent from `STRUCTURE_SOLIDS`;
   - each shell has exactly one draw source;
   - the stop's work pose, mooring and service radius are unchanged;
   - `PLACED_HOSTS` checks still pass.

**Stage 3 is atomic.** One merge removes `rift.materials_station.hull` (the solid 14 × 8 × 10 m block) from fine art and collision, and adds the interior with its coarse and far shell. There's never a build with both, and never one with neither.

**Stage 4's district shells** (the gallery facades and the archive hull) use the same interface only if the coordinator agrees before dispatch. Until then the existing structures stay the one shell authority.

**Disjointness, qualified.**
- **In parallel:** the content definitions, one `content/interiors/<x>.ts` per interior, plus their recipes and validator rows.
- **Serially, through the coordinator, in merge order:** shared-root changes. Those are the structure composition, story placements, stops and bases, the sim consumers, renderer and materials, the far layer, the registry and the bake manifest.

### 3.8 Performance budgets

These are per fine interior while resident: targets to prove in the named dedicated-GPU checks, not measurements. They are parameters, so a low preset can lower them.

| Item | Budget | Basis |
| --- | --- | --- |
| Fine triangles | ≤ 120 k (district hall ≤ 160 k) | About 70 k vertices at 40 B is ≈ 2.8 MB. 120 k triangles with **32-bit indices** is ≈ 1.44 MB. Together ≈ 4.3 MB. |
| Fine GPU geometry | ≤ 6 MiB (halls ≤ 8 MiB) | Inside the 256 MiB GPU world-art budget, which is accounted art, not whole-tab VRAM |
| CPU reservation | ≤ 10 MiB (halls ≤ 13 MiB) | Retained arrays, templates, instance matrices, collider, light volume and occupancy, plus preparation and upload overlap, reserved against the 256 MiB CPU world-art budget |
| Coarse shell | ≤ 0.4 MiB, always resident | Registered once (§3.7) |
| Draw calls | ≤ 10 visible | See batching below |
| Emissive clusters | ≤ 6 candidates | They compete for the global 12 through `selectLights`; they are not reserved slots |
| Collider | ≤ 1.5 MiB | COL-1's compact format |
| Light field | ≤ 128 KiB | 1 m texels over the rooms (≈ 16 KiB for the example hall) |
| Occupancy, with its brick level | ≤ 384 KiB on CPU and GPU, padding included | 0.125 m voxels as bits: a 30 × 14 × 8 m hall is ≈ 210 KiB unpadded; 32 × 16 × 10 m padded bounds are 320 KiB. The 1 m brick bits add under 1 KiB. |
| Machine-light reach masks | ≤ 192 KiB on CPU and GPU (≤ 6 × 32 KiB) | One bit per 0.25 m texel over each light's reach box (a 16 m cube is 64³ bits) |
| Lighting work per fragment | Lamp: one two-level walk, bounded by `walkBound` (§3.5). Each tagged machine light: one integer 3D fetch and a bit test. | The lamp walk's GPU cost is measured in stage 2, not assumed |
| Fine interiors resident | 1, or 2 at a seam | ENV-1's owner policy (§3.5) |

**Bit layouts are bit layouts all the way through,** not only in the file. Today's runtime keeps one R8 texel per voxel, and CW-1's LCF1 codec (`lightField.ts`) and texture port (`caveMaterial.ts`) assume that layout. The packed occupancy, brick bits and masks go through all of these in their packed form, behind a layout flag in the one codec:
- the bake and the codec;
- the CPU lookup and the GPU addressing (an integer 3D texture, eight voxels per texel along X, with one shared addressing routine);
- the sliced uploads;
- retention on restore;
- the ledger entries.

Caves keep their R8 layout unless a later stream chooses to migrate them.

**Batching strategy.**
- Per room group, one merged static mesh holds the shell plus every prop that isn't repeated, so culling stays room-granular.
- Instanced draws are used only for templates repeated at least four times in view (bunks, hooks, couches).
- Splitting a mesh for upload doesn't add a draw; it reassembles into the room mesh.
- **Accounting:** draws and bytes are computed on the stage-1 recipes and measured in the stage-2 composed view. If the art goes over, the batching changes. The art is never cut to fit a batching scheme.

**Detail tiers:** `structure`, `dressing` and `clutter`. A low preset drops clutter and swaps dressing to coarse, keeping exits, signs, tells and lamp reach readable.

**Frame:** the 3090 holds 60 fps with `--class exclusive` at the densest interior, plus a 4070 check. **Caches:** each is owned, byte-bounded, evicted by rule and registered in the ledger.

### 3.9 Saves

No new saved field:
- dressing states and air rooms derive from restored facilities and works flags;
- coded doors are LS-1's `systems.opened` (planned in LS-1 1b, not yet on root);
- caches are LS-1's containers;
- lock and drain animations are presentation, and reload shows the derived end state;
- the Rift wake point is read from its air-room row.

## 4. Stages

Each stage is one reviewable outcome with a one-page handoff: SHA, `npm run gate`, at most three questions, one adverse case, compromises filed with their root fix, and images per DIRECTION's tiers. Content definitions can run in parallel. Shared-root changes compose serially through the coordinator (§3.7).

| Stage | Player outcome | Files ENV-1 owns (shared roots composed by the coordinator, or ENV-1 with approval) | Needs |
| --- | --- | --- | --- |
| **1: kit, model and validator** | Enabling work, nothing in the world yet. OP-1 and LS-1 can take geometry from the kit, and the dormitory's, field station's and pump house's definitions pass the validator, the air proof included. Kept small; the coordinator may fold it into stage 2. | New `content/interiors/types.ts`, `index.ts`, `validate.ts`, `basinDormitory.ts`, `fieldStation.ts`, `pumpHouse.ts`; new `render/interiors/kit.ts`, `props.ts` (Babylon-free); new `tests/interiors.test.ts` with its fixtures | Approval |
| **2: the dormitory, for real** | The first dressed interior in the world: you enter, read the tell and the turn by lamp, and leave by the other door. The light-volume adaptation with thin-wall handling and room-confined lights, room-portal visibility and interior residency land here. `BASIN_GEOMETRY`'s dormitory boxes and their legacy drawing are retired. | New `render/interiors/view.ts`. Shared: `render/caves/lightField.ts`, `render/caves/caveLight.ts`, `render/lighting/localLights.ts`, `content/routes.ts`, `render/legacyWorld.ts`, the COL-1 B composer registration, the arbiter owner, WK-1's bake manifest | CW-1 merged; COL-1 B; WK-1 (or the named accepted bake) |
| **3a: one air-room authority** | Nothing visible changes yet: the lab and every stop behave as today, through one table (§3.6). | New `content/airRooms.ts`. Shared: the §3.6 scope list | Stage 2; owner question 1 = yes |
| **3: the Rift station** | The stopped press hall, the loading bay with PACE-1's cradles, the lock, and restoration that lights the station and drains its air room. The solid hull is replaced atomically. | New `content/interiors/riftStation.ts`; the Rift air-room row. Shared: `content/regions/structures.ts` (the `replaces` filter), the far layer, `content/story/placements.ts` (the cradle position, with PACE-1) | Stage 3a (or flooded throughout if question 1 is no); PACE-1 stage 2 |
| **4: the district halls** | The transfer hall and annex dressed around C08 and C10, and the upper hall's two states following the works, with its air row | New `content/interiors/meridianHalls.ts`; the upper hall's air-room row. Shared, **only with the coordinator's agreement:** the gallery and archive shell replacement. Host positions within their sites. | Stage 2 (and 3a for the air row); PACE-1 stage 2 |
| **5: the wreck on the mirror** | The brine line, the preserved hold behind the soft brine gate, and (if LS-1 agrees) its cache | New `content/interiors/mirrorWreck.ts`; a one-line reference in `content/poi/sets.ts` | Stage 2; PACE-1 stage 3 done with the POI files |
| **6: the deepest district rooms** (owner-approved, 2026-10-24) | The gate hall, service window and inner hall become fully dressed interiors, built around the story's machinery state graph and existing records, which are never moved or reworded | New `content/interiors/meridianDeep.ts`. Shared: their structure rows through `replaces` (with the coordinator's agreement), host positions | Stage 4; lore-appendix rows written before it starts |
| **7: crown and Divide dock dry rooms** (only if the owner says yes to question 1) | Their restoration drains a dry room you rest in | Their interior definitions and air-room rows; the crown's with HUB-2's owner | Stage 3a; the coordinator's dispatch |
| **With OP-1 / LS-1 stage 3** | The field station and cold store; the pump house | ENV-1's stage 1 definitions; OP-1 and LS-1 own placement. Lighting, culling and residency arrive with stage 2. | Their streams; LS-1 1b's keypad for the cold store |

### Tests and evidence per stage

| Stage | Questions (≤ 3) | Checks | Images | Adverse case |
| --- | --- | --- | --- | --- |
| 1 | 1. Do the five air-proof fixtures (two parking places and one craft, the unrestored station, walking headroom, a one-way drop, a blocking hull) fail, naming scenario and node, while the three definitions pass on every scenario? 2. Does the validator catch a blocked portal, a heaped belonging and a missing caption? 3. Do the kit recipes give identical buffers on repeat, with fine and coarse silhouettes matching and draws and bytes within budget? | Fast tier; gate | 0 | The two-parking hall passes only when its far room is within the line or a timed return of the one craft's parking place. |
| 2 | 1. Does the dormitory read before its record: tell, turn and keepsake by lamp in the views? 2. Do collision (oracle), configuration-space routes and the air proof pass on the composed world for both routes' scenarios, with the hull present? 3. Do the five lighting fixtures (near-wall prop, full lamp reach, doorway confinement, dark room beside a lit room, cave regression) pass on the CPU and GPU paths, with no walk reaching its bound, and what does the lamp walk cost on the GPU? | Gate; COL-1 B oracle; composed validator (one heavy job, `--machine any`); REC-1 views tagged `interiors` and the lighting fixture views; **an ordinary-input browser run**: swim in from the craft by keyboard, lamp on and off, read C05, leave by the other exit, save, reload inside, leave again; streaming on a Dart approach; a 3090 exclusive frame check inside, the lamp walk's cost measured with the lamp on, and a 4070 check | 3–4 (entry, tell, turn, lamp off), plus the fixture views | Reload inside the dormitory on a starved budget: admission finishes in the load screen, the diver is valid, and there's no hold in ordinary play. |
| 3a | 1. Do exposure, movement and optics follow §3.6 above and below the waterline, before and after activation (exercised on a fixture row)? 2. Does the lab answer identically everywhere, and does every stop's air, rest and service behave as before? 3. Do the sim and shader agree on sampled points? | Gate (playthroughs included: the bases' rest and wake unchanged); air-room tests | 0 | Reload while standing in an active fixture room, then while swimming below it. |
| 3 | 1. Do both states read, and does restoration visibly change the station, with the hull replaced (no old solid, one draw source)? 2. Rest → incapacity → wake in the drained room, and the old sphere granting no air or rest while service still works? 3. Does the air proof pass before restoration from each route's one parked craft? | Gate (economy scripts unchanged); §3.6 checks 1–4 and 7; §3.7 tests; REC-1 views; ordinary-input run through the lock; frame checks | 3–4 | Restoring while floating where the floor will be: a deterministic settle, the same on reload. |
| 4 | 1. Is every belonging hung, folded or racked, with nothing heaped (validator plus coordinator inspection)? 2. Does the upper hall switch states, and its air row activate, from the works flags alone through save and reload? 3. Do the halls stay within their budget with two resident at the seam? | Gate; REC-1 views; ordinary-input run hall → annex → upper hall; the air proof for the transfer hall with the one craft at either parking place; frame checks | 4–6 (stage exit ≤ 10) | A save made between restoring the hall frame and the food bay reloads with exactly the hall restored. |
| 5 | 1. Does the brine line read on every wall, with nothing living below it? 2. Does the hold keep to S4's brine rule, with its exit straight up and visible? 3. Does the wreck stay ambiguous (no record, lint clean)? | Gate; REC-1 views; ordinary-input run with and without brine protection; frame checks | 2–4 | Unprotected descent into the hold: S4's exposure applies, and the way out is the hatch overhead. |
| 6 | Set in its brief, from the lore appendix's rows: the records and machinery untouched, and the boundary rules held | As stage 4 | 4–6 | Set in its brief |
| 7 | As stage 3, per stop | As stage 3 | 2–4 per stop | As stage 3 |

## 5. Pacing

- **New things:** each interior's first arrival is a new thing. With LS-1's sites and the story's beats, it adds to the 15–20 minute cadence rather than carrying it.
- **No padding:**
  - no interior is required except where the main path already goes (the dormitory, the station, the halls);
  - none adds travel;
  - none adds a wait;
  - no locked door gates progress.
- **The two gates stay LS-1's** (the cold store and the ridge vault). ENV-1 adds no backtracking gate, and no door that looks openable but isn't.
- **Time inside** is about 35–55 min across the six on a first playthrough. That's content, not a target, and the owner's playtest judges it.

## 6. Owner decisions and the open question

**Decided (owner, 2026-10-24, relayed by the coordinator):**
- **The interior look waits for the asset-pipeline debate.** The plan stays kit-agnostic: procedural templates now, imported assets later (design call 7, §3.3).
- **The deepest district rooms become full interiors** in a later stage: stage 6.

**Open, pending with the owner:**
1. **Dry rooms inside restored stations.** Should a restored deep station have a room you surface into and stand in, out of the water, with the water draining when you restore it? The coordinator recommended it only at the bigger restored stops (crown station, Rift materials station, Divide dock, district halls), not small posts or player outposts, and §3.6 is written for exactly that set. If the answer is no, stages 3a and 7 drop, the Rift station stays flooded throughout with today's work-pose air, and the upper hall gets no air row.

## Known limits and compromises

- **Stages 2–6 wait for CW-1, COL-1 B and WK-1.** That's the root-fix order (DIRECTION), not a compromise. Stage 1 is the only work possible before them.
- **The air-room authority touches shared roots,** so it composes serially as stage 3a after stage 2.
- **Air proofs depend on SAVE-1 milestone saves.** When a route's saves change (PACE-1's stages), the scenarios are re-derived after the library re-export, never hand-edited.
- **Human times are estimates** until the owner's playtest calibrates them.
- **Imported assets are unproven here.** The template seam fits the pipeline proposal, but nothing is tested until that debate is settled.

## Review responses

**R1** (Sol 6.1 xhigh, `review/env-1-r1` `b2f5de12`), adopted as the coordinator directed:

| Finding | Disposition | Where |
| --- | --- | --- |
| **F1 [P2]** air coverage from real expeditions | **Fixed.** Per-route first-access scenarios from SAVE-1 milestone saves, each with one available craft at one parking place, the save's suit tier and its active air rooms. Coverage uses the real `airLineSupply` on the basic line (no reel, no Mantle line), or a timed return that keeps the 25% reserve. The graph is in configuration space, with directed collider moves and both capsules (0.95 m swim, 1.75 m walk). The parked hull is present for approach, exit, boarding and route sweeps. The fixtures include two parking places with one craft, and an unrestored station. | Design call 10; §3.4; §2.4 and §2.6 navigation; stage 1 and 2 tests |
| **F2 [P2]** drained-room air contract | **Fixed.** One `AirRoom` descriptor: activation derived from the restoration fact, a local waterline and the rest-base identity. Exposure, movement (`surfaceY`), optics, rest and wake read it. The Rift's 4 m sphere is retired while service access stays. The scope covers `stops.ts`, `bases.ts`, the rest and recovery consumers, and the `WorldQueries` extension. The checks cover before and after, above and below, rest → incapacity → wake, and reload. No persisted field. The rows are exactly the coordinator's set. | Design call 9; §3.6; §2.4; stage 3a |
| **F3 [P2]** thin-wall lighting | **Fixed** in stage 2's light-volume adaptation. Occupancy resolution, skin and origin offset are derived from the volume's own geometry and read from one header by the CPU and shader paths. Caves keep today's values. Machine-light confinement was revised in R2 (baked reach masks; see below). Fixtures: the near-wall prop, a dark room beside a lit room, cave regression. Walls are not thickened. | §3.5; stage 2 |
| **F4 [P2]** the Rift hull and shared replacements | **Fixed.** Stage 3 atomically replaces `rift.materials_station.hull` (collision, fine art and scatter out; coarse and far shell in) through the proposed `replaces` interface at the single `STRUCTURES` composition, with registry, far-layer and arbiter registration named for the coordinator. Disjointness is qualified: content in parallel, shared roots serially. The district shell replacement is conditional on the coordinator's agreement. | §3.7; §2.4; §3.1; stages 3, 4 and 6 |
| **F5 [P3]** story-mechanics commentary | **Fixed.** The two rationales are removed here and kept in the lore appendix. | Player outcome; design call 5 |
| Checks notes: the dry-coordinate count corrected; portal kinds, the validator and room visibility named as new work; arbiter counts enforced by ENV-1; 32-bit index arithmetic; CPU reservations; the shared ~2 ms frame allowance; light clusters as candidates, not reserved slots; a batching strategy with draw and byte accounting; `systems.opened` named as LS-1 1b's; an explicit lock and drain reload policy; reuse of `MeshRecipe`/`TemplateRecipe`/`TemplateLibrary`, with no importer, material system or full prop library ahead of the proof asset | **Adopted.** | Design calls 6, 7 and 9; §3.2–§3.9 |
| Owner points: the look waits for the asset debate; the deepest rooms approved; dry rooms pending, written for the bigger restored stops | **Adopted.** | §6; stages 6 and 7; §3.6 |

**R2** (Sol 6.1 xhigh, `review/env-1-r2` `a77c186d`): F1, F2, F4 and F5 resolved; F3's two remaining points fixed:

| Finding | Disposition | Where |
| --- | --- | --- |
| **R2-1 [P2]** the walk's step bound | **Fixed.** A two-level walk (1 m brick bits over the 0.125 m bit occupancy) with a derived bound, `walkBound = (⌈√3·R/B⌉ + 3) × (1 + 3·B/v)`, stored in the volume header. That is 1,475 in the interior worst case, so exhaustion can't occur, and a step-count test enforces it. Caves use the same routine as one level with their bound kept at 200 (above their derived ≈ 114), and visibility and reach are pinned. The GPU cost is an explicit stage-2 measurement; any cheaper evaluation is a filed compromise, never a shorter bound. Fixtures: clear 32 m axial and diagonal rays, and a wall near the ray's end, on the CPU and GPU. | §3.5; §3.8; stage 2 tests |
| **R2-2 [P2]** doorway confinement | **Fixed.** A baked one-bit reach mask per static machine light (0.25 m, free-space sub-samples only, sampled half a texel off the surface with nearest filtering), multiplied in the existing local-light term through a mask slot on the light's entry. `selectLights` and the lighting authority are unchanged, and the room-ID texture is dropped. Sol's counterexample is fixture 3: the doorway receiver lit, the wall-occluded one dark. Budget: ≤ 192 KiB of masks per interior and one fetch plus a bit test per tagged light per fragment. | §3.5; §3.8; stage 2 tests |
| Occupancy layout note | **Adopted.** The packed layout is carried through bake, codec, CPU lookup, GPU addressing, sliced uploads, restore retention and the ledger, behind one codec flag. Padding is counted in the budget. | §3.8 |

## Stage 1 handoff (kit, model, validator and the air-room table)

Code at **`b125ace3`** (branch `t3/env-1-interiors`, root `e136beb6` merged). Nothing in the world changes yet: no file CW-1 owns is touched, and no interior is composed. Spoiler-safe.

**What exists now:**
- **The air-room table** (`content/airRooms.ts`): one row, the Canopy lab, always dry. `inCanopyAir` and both of the shader's lab terms (the optical air interval and the lit-room mask, `render/airRoomsGlsl.ts`) read it, so the sim and shader share one source. Activation by facility or the works' hall is typed and evaluated (`sim/airRooms.ts`), and `airRoomProblems` limits restoration rows to the bigger restored stops. **No restoration row exists:** they wait for the owner's rest-station decision.
- **The interior model** (`content/interiors/`): `types.ts` speaks the cave vocabulary (portal kinds extended, staging with heading and approach), plus the template catalogue (sizes and collision classes), quarter-turn geometry, and wall and slab helpers with openings.
- **Four definitions:** the Basin dormitory (real terrain, S2's pad and parking), the field station and cold store (on OP-1's blockout anchors; OP-1 places them), and the pump house (on LS-1's site, the logger in front of its cabinet).
- **The kit** (`render/interiors/`, Babylon-free, the one `RecipeBuilder`): shell recipes drawn exactly as they collide, 37 prop recipes inside their catalogue sizes, and the draw and byte accounting under the batching rule. Recipes are built on demand and not cached here; stage 2 hands them to `TemplateLibrary`.
- **The validator** (`sim/interiors/validate.ts`, with `sim/interiors/world.ts` composing the interior over an exterior on COL-1 A's static collider):
  - static checks;
  - configuration space (directed capsule moves, the swim and walking capsules, jumps and drops between floors);
  - the air proof per first visit: the route's one craft parked with its authored hull present, the save's suit and its active air rooms; coverage by the basic line at the reserve charge, an air room or open air, else a round trip within 75% of the suit;
  - the craft's approach, exit and boarding, through the sim's own rules.

**Deviation from the plan's file list:** the validator lives in `sim/interiors/`, not `content/interiors/validate.ts`. It calls the sim's air line, exit, boarding, suit and oxygen rules, and content may not depend on sim.

**Checks** (factory-worker, the queue):

| Check | Ticket | Result |
| --- | --- | --- |
| Fast tier at `2a09ebd4` | `261025-020939-2048` | 175 of 176 files pass. The one failure was the FORK register regex rejecting a digit in the fork id, fixed by renaming it `interior-swim-speed`. |
| Fast tier at `b125ace3` (the architecture guard and the full typecheck included) | `261025-023043-b449` | **176/176 files pass** |
| Heavy: the air proof from real SAVE-1 saves (`interiors-scenarios.heavy.test.ts`) | `261025-020941-e94c` at `2a09ebd4` | **4/4 pass, 0 skipped.** Saves from the library at `e136beb6`: `creel@basin-survey` and `no-optional@basin-survey` (dormitory), `creel@opening` (station), `creel@isles` (store), `creel@reef` and `creel@systems` (pump house). |

**Questions:**
1. *Do the air-proof fixtures fail as specified, naming the scenario and pose, while the definitions pass?* Yes (`tests/interiors-air.test.ts`). Each failing fixture has a passing control:
   - two parking places with one craft (a 300 m tunnel fails from either end, though two craft would cover it);
   - an unrestored station (fails before, passes after restoration);
   - walking headroom;
   - a one-way drop into a 1.6 m pit;
   - a parked hull across the only door;
   - a missing craft;
   - a too-shallow suit.

   All four definitions pass, on stand-in states (`interiors-defs.test.ts`) and on the real saves (the heavy test).
2. *Does the validator catch a blocked portal, a heaped belonging and a missing caption?* Yes (`tests/interiors.test.ts`), along with unknown templates, too many lights, a door that admits nobody, unknown hosts, a mis-declared first visit and three heap cases (loose bundles touching, a floating one, one off the edge).
3. *Are the recipes deterministic, inside their sizes, and within budget?* Yes (`tests/interiors-kit.test.ts`): every vertex of the shell lies on its collision boxes; every prop is within its size and fills 95% of it; all four interiors are within 10 draws, 6 MiB fine and 0.4 MiB coarse. The dormitory instances its bunks, bundles and picture marks.

**The sim and shader are unchanged:** `inCanopyAir` matches the old literal box on a boundary grid, and the generated GLSL equals the old source character for character.

**Adverse case:** a 300 m tunnel with parking at both ends and one craft fails the air proof from each end. A union-of-parkings rule would have passed it.

**Compromises (each with its root fix):**
1. **`FORK(interior-swim-speed)`:** the step's swim speed (3.4 m/s) and jump height are constants in the validator, because `sim/step.ts` is CW-1's. A fast test measures the real step against both. Root fix: step exports its speeds; ENV-1 stage 2, after CW-1 merges. The row is in CORE-HELPERS.
2. **The pump house's terrain rises up to 0.29 m above its floor:** the floor is laid on the lowest terrain so LS-1's logger point stays on it. A test pins this at 0.3 m or less. Root fix: in stage 2, interior footprints replace terrain in the bake, as cave footprints do. The alternative, raising the floor and moving LS-1's site point, is LS-1's call in its stage 3.
3. **`box`-class props collide as their catalogue boxes**, a conservative cover over open frames such as bunks. Root fix: stage 2 bakes their shapes from the art (COL-1 B). The cover is checked to be no larger than the art's size.

**Known limits:**
- **The island interiors aren't proven on the island yet:** the field station and cold store are proved on flat stand-ins until OP-1 builds it.
- **The cold store's keypad door is assumed open:** LS-1 1b's keypad isn't on root yet.
- **The lattice is conservative:** it is 0.5 m with axis moves, so a gap needs about 1.2 m to be sure of a pose, and diagonal-only openings read as closed. The definitions keep doors at 1.2 m. Stairs and ramps get slope-aware edges when a definition first needs them.
- **The kit is kit-agnostic, as directed:** no importer, no material system, no textures.
- **No images:** this is a logic stage, per DIRECTION's tiers.

### Stage 1 R1 fixes (Sol, `review/env-1-s1-r1` `dad0f28f`)

Code at **`R1_SHA`**. All four findings are fixed as written, each with its rejection fixture and a passing control (`tests/interiors-air.test.ts`).

| Finding | Fix | Proof |
| --- | --- | --- |
| **F1 [P2]** outside the shell isn't an escape | Every first visit now has a proven return destination: boardable poses beside the craft, or a craftless visit's origin (or any checked rise to the surface). A pose reachable from the start, or from any doorway, inside the shell or outside it, that can't reach that destination by checked moves is a trap. The sampled exterior covers each origin and its stretch to the nearest way in. | A depression beyond the east door the walker drops into: trap, at poses outside the building. Shell-owned and terrain-owned pits: traps. The ordinary-ground hut: passes. |
| **F2 [P2]** exterior obstacles dropped from the sweep | **The exterior contract is explicit** (`sim/interiors/world.ts`): terrain (a floor function) and box solids. The solids go to `composeStaticWorld` as its roster, and the terrain becomes a conservative COL-1 A heightfield member of the same collider over everything the validator samples, approach columns included. A move, approach or rise near the interior meets all three in one continuous sweep. **Caves are refused, not ignored:** a sampled area meeting a cave footprint is an `exterior` problem until stage 2 composes the game's own world. | Moves blocked between two clear endpoints, by an exterior crossbar and by a terrain ridge. A rock across the craft's approach: `approach`. A rock over a craftless swimmer's water origin: `origin`. A barrier between the parking and the room (graph edges): `room`. |
| **F3 [P2]** exits without a crossing | A way out is now a directed capsule crossing: an inner pose's own capsule (walking or swimming) moves along the portal's normal until its whole shape is past the plane, touching nothing. Up-facing hatches are for swimmers. | 0.2 m-wide doors and 1.5 m lintels: both doors `exits`, and the room `room`. The 1.2 × 2.1 m control passes. The hull-across-the-door fixture is isolated: `exits`, with no `approach` problem. |
| **F4 [P2]** doorways seeded independently | Each scenario is a round trip: forward from the craft's real exit pose (joined to the lattice by a checked move) or the craftless origin, and back to boardable poses (the sim's `board` rule) or the origin. Every room must lie on it, and hosts are judged from it. The air and depth proofs run over the trip. The all-doorway trap analysis is kept. Craftless first visits must declare `origin`: the field station's and cold store's on the ground outside their doors, the pump house swimmer's in open water under a checked rise. | Sol's barrier fixture, parked 20 m out beyond an impassable wall: `room`, though the air line reaches through; unblocked control passes. A craftless visit without an origin: `origin`. |
| Graph fixes found while proving these | **Walking off an edge falls:** across one or two lattice steps at standing height, straight down, then joined to the floor it lands on by a checked move. Before, a drop only looked one column ahead, so a pocket beside a conservative rim cell had no way in. **The lowest lift that crosses:** a walker stepping off a bunk under a low ceiling crosses at the floor's crease, and a doorway crossing steps a 0.3 m threshold as walking does. | The outside-pocket fixture (needed the fall); the field station's real save (the bunk). |
| Fixture notes | **Low room:** now a low loft over the south side of a normal hut, leaving a walkway, giving `headroom` only, with no portal or roof clash. **Blocking hull:** stops 5 cm short of the wall, so its approach is clean. **Shallow suit:** reported as `depth` through the sim's own exit refusal (`exitBlock` code `depth`). | `interiors-air.test.ts` |

**The real definitions on the real exterior** (`realExterior`: `worldFloor` and `SOLIDS`, minus what the interior replaces). The dormitory's `replaces` now names S2's five placeholder boxes it takes over, which stage 2 retires. On real saves and on stand-ins:
- **the dormitory passes;**
- **the field station and cold store pass** on their flat island stand-ins;
- **the pump house is refused with exactly `exterior`.** CA-1's `reef_pumphouse_undercut` cave footprint starts 1.35 m east of the building, and the restricted contract can't represent caves. Everything else about it passes.

**New compromise (with its root fix):** the pump house's proof waits for stage 2's composed world, caves included through COL-1 B. That's also when LS-1 stage 3 places it. The validator refuses, rather than proving it without the cave beside it.

**Checks** (the queue, factory-worker):

| Check | Ticket | Result |
| --- | --- | --- |
| Fast tier at `R1_SHA` | R1_FAST_TICKET | R1_FAST_RESULT |
| Library-save air proof at `R1_SHA` | R1_HEAVY_TICKET | R1_HEAVY_RESULT |
