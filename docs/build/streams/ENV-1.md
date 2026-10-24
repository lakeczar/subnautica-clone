# ENV-1: explorable interiors with environmental storytelling (design plan, stage 0)

Opus 5.5 high, design authority for the stream. Branch `t3/env-1-interiors` from root `484332d9`. **Docs only: no code stage starts until the coordinator approves this plan.** Spoiler-safe. The lore notes (hindsight meanings, canon ties, rulings and the player-text rules) are in `docs/spoilers/ENV-1-LORE.md`, for writers and integration agents only.

**Player outcome.** A handful of abandoned buildings you can go inside, each dense with detail and each with something wrong that you notice before you read anything. The early ones feel like someone just stepped out. Later ones are orderly in a way that unsettles. The logs explain what you've already seen, and the story's turn changes what it meant. Fear comes from implication, never gore.

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
5. **No bodies, no remains, no blood.** Absence does the work: empty hooks, pale rectangles where pictures hung, a chair turned towards a door. This also keeps the canon's exact casualty count (lore appendix).
6. **One interior model, the cave vocabulary.** An interior is rooms, portals, routes and staging, the same shapes W1/CW-1 caves use (`CavePortal`, `CaveRoute`, `CaveStaging`), built from an architectural kit rather than voxel rock. There is no second model for "a room you can enter". The cave light field, lamp visibility, portal culling, residency arbiter, route checks and rescue staging all apply as they do in caves.
7. **The bake is the asset boundary.** Kit modules and props are templates whose source is either a procedural recipe today or an imported mesh later. Either way the bake turns them into the same Babylon-free buffers, so collision, emissive lights and the cel material can't tell them apart. The runtime never loads glTF.
8. **No new economy and no new saved state.** Rewards come only through LS-1's caches, plans and reveals, or the story's existing grants. An interior's states (dark or restored, collapsed bay or rebuilt) are derived from facts the save already holds.
9. **Fix the root that blocks good interiors: one air-room authority.** Today the dry rooms are special-cased by literal coordinates in five places (§3.5). A dry station room needs one table that every consumer reads.

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
- **The gate hall, service window and inner hall:** the story resolves here, and the works' machinery state graph runs these rooms. Dressing them in full is owner question 3. Until then they stay the story's compact sets, and ENV-1 doesn't touch them.
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

**Navigation.** The door and the roof hatch are two exits. The room is about 8 × 6 × 4 m. A Dart parks beside the door, and every point is within 15 m of the craft (air line). Diver only.

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
- **Air:** no point is more than 20 m from the parked craft (air line).
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
- **Air:** after restoration, the air room is the stop's rest point and bunk; `REST_BASES.rift_station.wake` moves into it. Before restoration, every point is within 25 m of the mooring.
- **Fit:** craft at the existing mooring.
- **Depends on** the air-room authority (§3.5) and owner question 1. Without both, the rest point stays at today's work pose, and the drained room is filed as debt.

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
- **Air:** every point is within 25 m of a craft parked above the deck.
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
- **Transfer hall:** the facade door and the far roof breach make a loop. The hall is about 30 m deep, so a second staging point outside the breach keeps every point within 25 m of a parked craft. The silted stair is plainly impassable scenery (a collapse you can see into), never a door that looks like a puzzle.
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
| Rift station | the stop (C3/HUB-2 tables) | The interior and its two states | The restoration recipe, stop services, the ledger text, PACE-1's cradle fixture data |
| Mirror wreck | POI-1 / PACE-1 stage 3 (`content/poi/*`) | The interior definition, referenced from the POI set by ID | The POI set, its leg, its beacon |
| District halls | the story's district sites | The three interiors and the upper hall's two states | The records, works faces and works logic |

### 3.2 How it composes with other streams

| Stream | Relationship | Rule |
| --- | --- | --- |
| **LS-1** | The pump house is an LS-1 site whose stage 3 set includes ENV-1's interior. Every LS-1 set may use the kit, the validator and the dressing rules. ENV-1 offers one optional cache (the wreck). | ENV-1 writes no lost-site record, reveal or reward. LS-1's lint and caption rules apply to every ENV-1 player string (lore appendix). If LS-1 stage 3 reaches the pump house before ENV-1 stage 2, LS-1 builds it from the kit and ENV-1's definition. |
| **PACE-1** | The Rift station hosts F4's core cradles. The district halls hold PACE-1's works beats. The wreck's POI files are PACE-1 stage 3's. | PACE-1 owns the fixture's data and scan line; ENV-1 owns its position in the bay, moved only through the story-placement test. ENV-1's wreck stage edits `content/poi/sets.ts` only after PACE-1 stage 3 (one-line reference to the interior). |
| **OP-1** | The field station and cold store sit on OP-1's island. | OP-1 places them by interior ID and owns everything outside. If OP-1 runs before ENV-1 stage 2, OP-1 builds the two huts from ENV-1 stage 1's kit and definitions. The huts are axis-aligned on the 90° grid, so their walls collide exactly as boxes on COL-1 A's static collider; non-box props are visual-only under the small-prop rule (§3.4). |
| **CW-1, caves** | Interiors reuse the cave vocabulary, light field, lamp walk, arbiter and portal visibility. The cold store's sump is a portal shared with the Under-Stair. | No ENV-1 stage edits a CW-1 file before CW-1 merges. The light-field generalisation (§3.3) lands after. |
| **COL-1 stage B** | Every interior collides through COL-1's collider built from the art (`artMembers`, `meshShapes`), registered with stage B's single composer. | Prerequisite for stages 2–5. No new box-set adapter. |
| **WK-1** | Interiors bake offline: meshes, collider, light field. | Prerequisite for stages 2–5. The stage brief names the accepted bake on root when it starts (WK-1's bake v2 if landed). There is no synchronous runtime fallback beyond CW-1's counted dev fallback, and no second mesh builder. |
| **REC-1 / REC-2** | Fixed views tagged `interiors`, three per interior (entry, tell, turn). Entering an interior counts as a new thing on its first arrival. | Uses the recorder's existing `new` event, keyed by interior ID. |
| **Atmosphere and UI** | Sound tells are events with captions. | Audio consumes events. Caption labelling belongs to the UI stream (LS-1's rule). |
| **Asset pipeline study** | Imported meshes enter as templates through the bake (§3.3). | ENV-1 adopts the study's recommendation for templates without changing interior data. |

### 3.3 Interiors as data, kits as templates

**The interior definition** (`content/interiors/types.ts`, Babylon-free) has these fields:

| Field | What it holds |
| --- | --- |
| `id`, `region`, `site` | Identity, and the S2 site or story place it belongs to |
| `anchor`, `yaw` | Placement; yaw on the 90° grid wherever possible, so architecture stays box-exact |
| `rooms` | Box volumes with a role, a daylight `falloff` (as `CaveRoomSource`) and an optional `air` flag |
| `portals` | `CavePortal`s with an interior kind (door, window, hatch, breach, skylight, lock) and `admits` |
| `routes` | `CaveRoute` loops and exits per profile |
| `staging` | `CaveStaging`, where craft park |
| `shell` | Kit modules on a 0.5 m grid (the cave voxel) |
| `dressing` | Prop placements: template, pose, tone variant, collision class, detail tier |
| `lights` | Emissive tags with colour |
| `sounds` | Sound tells, each with its caption |
| `hosts` | References to existing story or LS-1 host IDs, never copies |
| `states` | Optional: a dressing variant keyed by a read-only derived fact (`restored:rift_station`, `works:hall`) |

The cave types are imported, not copied.

**The kit:**
- **Modules** (`render/interiors/kit.ts`): floor, wall, ceiling, door frame, window, column, stair, hatch, bulkhead, lock. Each has damaged variants: cracked, bent, missing panel, breach. Each is a Babylon-free `RecipeBuilder` recipe, the one builder (CORE-HELPERS), with fine and coarse LODs.
- **Props** (`render/interiors/props.ts`): templates such as bunk, locker, desk, chair, crate, rack, cot, couch, trolley, lectern, bag, tag, board, mug, jar and kettle. They are placed by instancing: one draw per template.

**Template sources:**
- `{ kind: "recipe" }` today;
- `{ kind: "mesh", pack, name }` once the asset study lands. The bake converts an imported mesh into the same packed buffers (positions, normals, palette vertex colours, emissive alpha, indices).

Collision (`meshShapes` on those buffers), emissive light clustering (`clusterEmissive`) and the cel material see identical inputs. A template can switch source without its interiors changing. Textures wait for the study's recommendation (for example KTX2) and the owner's answer to question 2.

**The bake** (WK-1), per interior: fine and coarse meshes, the COL-1 collider and the light field. It is content-addressed and bound to the build. Only transferable typed arrays cross the worker boundary.

### 3.4 Collision, navigation and the validator

- **Collision:** architecture blocks stay boxes in the collider (exact). Bent and broken pieces and large props are mesh shapes built from the same art.
- **The small-prop rule:** a prop under 0.35 m in every dimension, or flagged `visual`, never collides. The validator proves that no `visual` prop stands in a route's swept hull or a portal's clear rectangle.
- **The validator** (`content/interiors/validate.ts`, fast tier, pure data) checks:
  - every portal's clear rectangle is free of shell and colliding props;
  - every route sweeps clear for its profile;
  - **no traps:** every navigable 0.5 m cell reaches an exit portal for the diver, and every cell is within 25 m path distance of a staging point or inside an air room (the basic air line is 27 m);
  - every interior has two exits, or one exit visible from every room;
  - every host and work face rests on a floor within 4 m and has a collision-checked view;
  - every sound tell has a caption;
  - nothing is heaped: no dressing template tagged `belonging` intersects another `belonging` beyond a contact tolerance, and racks, hooks and bundles are the only belonging stacks allowed.
- **Collision acceptance** (stages 2–5): COL-1 B's oracle probes the art against the collider for each interior. The route sweeps run on the composed world. Save and reload at every room keeps the diver valid (depenetration on the composed world).

### 3.5 Light, air, occlusion and streaming

- **Daylight through openings:** `caveLightField` takes a `CaveDef` today. Stage 2 generalises its input to a *light volume*: rooms, portals and the collision occupancy grid, which both a cave and an interior provide. That keeps one light-field authority and one shader path (`caveLight.ts`). Windows, doors, breaches and skylights admit daylight exactly as cave mouths and skylights do; `lampVisible`'s walk is unchanged. Dry rooms (the field station) take the sun through the same field.
- **Emissive props:** lamps, status lights and glowing growth become local lights through `clusterEmissive`, sharing `MAX_LIGHTS` (12) under the existing bounded `selectLights`. An interior declares at most 6 emissive clusters.
- **One air-room authority (root fix):**
  - **Today:** the Canopy lab's dry box is written as literal coordinates in `sim/inventory.ts` (`inCanopyAir`), `sim/survival.ts`, `sim/step.ts` (two uses), `render/camera.ts`, `render/renderer.ts` and the shader's `waterPath` in `render/materials.ts`. The workshop has its own literal box.
  - **Fix:** one `AIR_ROOMS` table in content, queried through `WorldQueries` (`airRoomAt(p)`), used by survival, step, camera and renderer.
  - **The shader** receives the nearest ≤ 4 air boxes, chosen by bounded selection, in place of the literal lab box. The carrier cabin stays its own moving volume.
  - **Retirement:** the literal copies go in the same merge. The fix touches CW-1-owned roots, so it lands after CW-1 merges, composed by the coordinator or by ENV-1 with approval. It changes no saved data.
- **Occlusion:** room-and-portal visibility on the interior's own graph:
  - from outside, the shell and the rooms seen through open portals;
  - from inside, the current room, the rooms visible through portals, and the exterior through exterior portals.
  - Hidden rooms are disabled, not disposed. Selection is deterministic and allocation-free per frame (DIRECTION convention 1).
- **Streaming:**
  - **Always resident:** an interior's coarse shell is part of its region's exterior art. Landmark interiors (the Rift station, district halls) also join the far layer.
  - **Prefetch:** the fine interior (dressing, collider, light field) is a residency owner admitted through the **existing cave arbiter** as a cave-class owner, with no second arbiter. Prefetch starts 300–400 m out by proximity and heading (GAME-DIRECTION).
  - **Concealment:** loading is hidden by the lock (station), a bent vestibule (dormitory, halls) or simply small size (pump house, wreck). The arbiter's hold stays a safety net that ordinary play never reaches.
  - **Upload:** sliced at 2 ms or less a frame. Every synchronous finish is counted and logged.

### 3.6 Performance budgets

Per fine interior while resident. The figures are derived from about 40 bytes per vertex for the cel layout plus indices, and they are parameters, not constants, so a low preset can drop them.

| Item | Budget | Basis |
| --- | --- | --- |
| Fine triangles | ≤ 120 k (district hall: ≤ 160 k) | About 70 k vertices, ≈ 2.8 MB, plus ≈ 0.7 MB of indices |
| Fine GPU geometry | ≤ 6 MiB (halls ≤ 8 MiB) | About 2–3% of `WORLD_BUDGET`'s 256 MiB |
| Coarse shell | ≤ 0.4 MiB, always resident | Part of the region pack |
| Draw calls | ≤ 10 visible: shell merged per room group on the one cel material, plus one instanced draw per visible prop template | Instancing keeps clutter off the draw count |
| Emissive clusters | ≤ 6 | Shares the global 12 |
| Collider | ≤ 1.5 MiB | COL-1's compact format |
| Light field | ≤ 128 KiB | 1 m texels over the rooms |
| Fine interiors resident | 1 normally, 2 at a seam (the transfer hall and annex are 280 m apart) | The arbiter enforces it |

- **Detail tiers:** `structure`, `dressing` and `clutter`. A low preset drops clutter and swaps dressing to coarse, keeping exits, signs, tells and lamp reach readable (DIRECTION's integrated-graphics rule).
- **Frame:** the 3090 holds 60 fps with `--class exclusive` at the densest interior, plus a 4070 check, because this stream touches rendering.
- **Caches:** every cache is owned, byte-bounded, evicted by rule and registered in the ledger.

### 3.7 Saves

No new saved field:
- dressing states derive from restored facilities and works flags;
- coded doors inside interiors are LS-1's (`systems.opened`);
- caches are LS-1's containers;
- moving the Rift wake point is a content change to an existing base row.

## 4. Stages

Each stage is one reviewable outcome with a one-page handoff: SHA, `npm run gate`, at most three questions, one adverse case, compromises filed with their root fix, and images per DIRECTION's tiers.

| Stage | Player outcome | Files ENV-1 owns | Needs |
| --- | --- | --- | --- |
| **1: kit, model and validator** | Enabling work, nothing in the world yet: OP-1 and LS-1 can author interiors with the kit, and the dormitory's definition passes the validator. It is kept small; the coordinator may fold it into stage 2. | New `content/interiors/types.ts`, `validate.ts`, `basinDormitory.ts`, `fieldStation.ts`, `pumpHouse.ts`; new `render/interiors/kit.ts`, `props.ts` (Babylon-free recipes); new `tests/interiors.test.ts` | Approval |
| **2: the dormitory, for real** | The first dressed interior in the world: you enter it, read the tell and the turn by lamp, and leave by the other door. The light-field generalisation, air-room authority, room-portal visibility and interior residency all land here. `BASIN_GEOMETRY`'s dormitory boxes and their legacy drawing are retired. | New `render/interiors/view.ts`, new `content/airRooms.ts`; `render/caves/lightField.ts` (input generalised); bake registration (WK-1's manifest). Composed by the coordinator (or ENV-1 with approval): `sim/inventory.ts`, `sim/survival.ts`, `sim/step.ts`, `render/camera.ts`, `render/renderer.ts`, `render/materials.ts`, `content/routes.ts`, `render/legacyWorld.ts`, the COL-1 B composer registration and the residency owner. | CW-1 merged; COL-1 B; WK-1 (or the named accepted bake) |
| **3: the Rift station** | The stopped press hall, the loading bay with PACE-1's cradles, the lock, and restoration that lights the station and drains its air room. | New `content/interiors/riftStation.ts`; the wake row in `content/bases.ts`; the cradle position in `content/story/placements.ts` (coordinated with PACE-1) | Stage 2; PACE-1 stage 2; owner question 1 |
| **4: the district halls** | The transfer hall and annex dressed around C08 and C10, and the upper hall's two states following the works | New `content/interiors/meridianHalls.ts`; the gallery and archive shells in `content/regions/structures.ts` replaced by interior shells (proposed to the S2 owner and coordinator); host positions within their sites (coordinator) | Stage 2; PACE-1 stage 2 (works beats) |
| **5: the wreck on the mirror** | The brine line, the preserved hold behind the soft brine gate, and (if LS-1 agrees) its cache | New `content/interiors/mirrorWreck.ts`; a one-line reference in `content/poi/sets.ts` | Stage 2; PACE-1 stage 3 done with the POI files |
| **With OP-1 / LS-1 stage 3** | The field station and cold store; the pump house | ENV-1's definitions from stage 1, updated if needed; OP-1 and LS-1 own placement | Their streams |

The stages' file sets are disjoint from one another. Stages 3–5 can run in parallel once stage 2 is accepted.

### Tests and evidence per stage

| Stage | Questions (≤ 3) | Checks | Images | Adverse case |
| --- | --- | --- | --- | --- |
| 1 | 1. Does the validator catch a trap cell, a blocked portal, a heaped belonging and a missing caption, each with an injected fixture? 2. Do the three definitions pass? 3. Do kit recipes give the same buffers on repeat (determinism) with fine and coarse silhouettes matching? | Fast tier; gate | 0 | A definition whose far room is 26 m from staging fails, naming the cell. |
| 2 | 1. Does the dormitory read before its record: tell, turn and keepsake visible by lamp in the views? 2. Does collision match the art (oracle) with every route clear, and do air rooms answer identically in sim, camera and shader (the lab included, now through the table)? 3. Is the interior admitted before the vestibule with no streaming frame over 33 ms on a Dart approach? | Gate; COL-1 B oracle on the interior; the validator on the composed world; REC-1 views tagged `interiors` against the baseline; **an ordinary-input browser run**: swim in from the craft by keyboard, lamp on and off, read C05, leave by the other exit, save, reload inside, leave again; a 3090 exclusive frame check inside and a 4070 check | 3–4 (entry, tell, turn, lamp off) | Reload inside the dormitory on a starved budget: admission finishes in the load screen, the diver is valid, and there's no hold in ordinary play. |
| 3 | 1. Do both states read (dark and crusted; lit and dry) and does restoration visibly change the station? 2. Do the PACE-1 cradles stay scannable at their place with their story-placement test? 3. Do rest and wake in the air room work, and does air stop in the room's water? | Gate (the six economy scripts unchanged); air-room tests; REC-1 views; ordinary-input run through the lock; frame checks as stage 2 | 3–4 | Wake after incapacity with the station restored: in the air room, dry, with no fall or clip. |
| 4 | 1. Is every belonging hung, folded or racked, with nothing heaped (validator plus coordinator inspection)? 2. Does the upper hall switch states from the works flags alone, through save and reload? 3. Do the halls stay within the 8 MiB / 10-draw budget with two resident at the seam? | Gate; REC-1 views; ordinary-input run hall → annex → upper hall; frame checks | 4–6 (the stage exit allows up to 10) | A save made between restoring the hall frame and the food bay reloads with exactly the hall restored. |
| 5 | 1. Does the brine line read as a line on every wall, with nothing living below it? 2. Does the hold keep to S4's brine rule, with its exit straight up and visible? 3. Does the wreck stay ambiguous (no record, lint clean)? | Gate; REC-1 views; ordinary-input run with and without brine protection; frame checks | 2–4 | Unprotected descent into the hold: S4's exposure applies, and the way out is the hatch overhead. |

## 5. Pacing

- **New things:** each interior's first arrival is a new thing. With LS-1's sites and the story's beats, it adds to the 15–20 minute cadence rather than carrying it.
- **No padding:**
  - no interior is required except where the main path already goes (the dormitory, the station, the halls);
  - none adds travel;
  - none adds a wait;
  - no locked door gates progress.
- **The two gates stay LS-1's** (the cold store and the ridge vault). ENV-1 adds no backtracking gate, and no door that looks openable but isn't.
- **Time inside** is about 35–55 min across the six on a first playthrough. That's content, not a target, and the owner's playtest judges it.

## 6. Open questions for the owner (spoiler-safe)

1. **Dry rooms inside restored stations.** Should a restored deep station have a room you surface into and stand in, out of the water (like a moonpool), with the water draining when you restore it? **Recommended: yes, for restored stops only.** It makes restoration visible and gives deep stops a feeling of shelter. Without it, stops stay flooded, with air at the work pose as today.
2. **How detailed interiors look next to the outside world.** **Recommended: the same flat cel style as everything else,** with denser shapes and larger legible signs, and textures only if the asset study shows they keep the look. The alternative is visibly richer, textured interiors that stand out from the exteriors.
3. **The deepest district rooms,** where the story's last discoveries are. Should they also become fully dressed interiors in a later ENV-1 stage, or stay the compact sets they are? **Recommended: yes, as a later stage after the halls,** built around the existing machinery and records without changing them.

## Known limits and compromises

- **Stages 2–5 wait for COL-1 B and WK-1.** That's the root-fix order (DIRECTION), not a compromise. Stage 1 is the only work possible before them.
- **The air-room authority touches CW-1-owned roots,** so it waits for CW-1's merge. Until then the Rift station's drained room can't land. If question 1 is answered no, the authority still retires the literal copies when an interior first needs it.
- **Human times are estimates** until the owner's playtest calibrates them.
- **Imported assets are unproven here.** The template seam is designed for them, but nothing is tested until the asset study recommends a path.
