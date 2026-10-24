# LS-1: lost sites (design plan, stage 0)

Opus 5.5 high, design authority for the stream. Branch `t3/ls-1-lost-sites` from root `a38b951e`. **Docs only: no code stage starts until the coordinator approves this plan.** Spoiler-safe. The lore owner's canon notes are in `docs/spoilers/LS-1-LORE.md` (writers and integration agents only).

**Player outcome.** Lost sites are real places you notice, approach and read. Each has a silhouette and a tell, an approach that uses what the region teaches, a story you can see before you decode anything, and records that open once decoded. Decoded maps lead to further sites, caves, stops and landmarks, so the decoder pulls you outward. No site is ever required.

## Design calls (taste decisions, argued from the evidence below)

1. **A site is a place, not a point.** Today every lost site is an invisible 10 m trigger with no geometry (see §1). That's the biggest gap, and it's more important than adding more sites. Every site gets an authored set, a readable plate and a tell. On-route sites can be seen from their route at 60–150 m (POI-1's rule). Off-route sites have a faint tell that only reads within about 60 m, so exploration finds them and decoded maps give the bearing.
2. **Rewards must be things the game doesn't already have.** Four proposed plans duplicate shipped systems, so I drop them:
   - `bp_chart_fix` duplicates SYS-1's `chart_live_position`;
   - `bp_decoder_cooling` duplicates SIG-1's decoder lattices;
   - `bp_outpost_thermal_tap` duplicates outpost location power at vents;
   - `bp_beacon_array` duplicates per-category beacon toggles.

   The kept plans are the locker extension, ping lens, air-line reel and lamp filter, plus the current turbine if its sandbox prototype is kept. There is one new plan, the heated grow bed (owner request; see §2). The other reward kinds are seeds, caches, notes and map reveals.
3. **Felt decode time stays about 3–10 minutes all game.** Base times stay at 3, 6, 10 and 15 min by size. Later sites carry bigger records, but the decoder lattices (×1.5, then ×2.25) arrive at the same time, so a late core takes about as long as an early log.
4. **Every decode opens something,** and at least one reveal per region leads to another lost site or decodable. That is GAME-DIRECTION's "decoded maps reveal more sites".
5. **Two purposeful-backtracking gates, spaced about 3 hours apart:**
   - the opening island's cold-store hatch, opened by a code from a Splitspine decode after the Dart;
   - the Basin ridge vault door, opened by a code in the pump-head field's records.

   **Coded doors use a keypad** (owner, 2026-10-24). You click the keypad and type the code on the keyboard. A decoded code is kept in the journal, so nothing has to be memorised. The same rule applies to every coded door. There is no lockout and no penalty for a wrong code, and a guessed code works: the gate is legibility, not a puzzle. Typing the code is the "aha".

   Both are seen before they can be opened and are legible in hindsight.
6. **The owner's mid-game overgrown plot becomes a main-path site:** the keeper's racks on the hub spur. Its planting card (the planter plan) is readable without decoding, which keeps the main-path rule. The first planter arrives about 2.5–4 h in (owner-confirmed, 2026-10-24).
7. **A notably better cultivation upgrade past 4 h** (owner, 2026-10-24): the **heated grow bed**, from the Rift borehole hut (see §2 and *Cultivation progression*).
8. **Seeing is not capturing.** The Dart's range tagger and the Hush's listening array mark a site on the chart and in the journal. Capturing its data still means reaching the logger. Otherwise approach design is moot.
9. **No new materials.** Rewards use the eight shared materials, seeds, plans, caches and maps. Cave-only rewards stay optional.

## 1. Current state

**Framework (SYS-2, C4, SIG-1), working:**
- discovery within 10 m (`LOST_SITE_FIND_RANGE`);
- background decodes on powered socketed decoders, paused beyond 250 m without a relay;
- completion grants plans, beacons and readable records;
- journal Decodes tab, chart cells and HUD objective nudge;
- decoder lattice speed;
- range tagger and listening array hooks;
- the bot decodes the pump house on the Creel route (`scripts/playthrough/live.ts`);
- save validation of `found`, `decoded` and `decodes`.

**Per region** (proposal IDs from `src/content/proposals/*`; "placed" means in `WORLD_LOST_SITES`):

| Region | Site | Placed | Decode (size) | Grants today | Gap |
| --- | --- | --- | --- | --- | --- |
| Reef | Old intake pump house | yes | log 6 | `bp_small_fabricator` (stand-in) | No geometry. Its proposed plan (locker extension) has no rules. CB-2's note isn't wired. Its reveals are dropped. OP-1's island shelf ends about 15 m short of it, so its floor must be rechecked, and the bot's pump-house leg runs through the island's future centre. |
| Isles | Strain gauge line | yes | log 6 | nothing | No geometry; ping lens has no rules; note and reveals unwired. |
| Isles | Yard tide store | no | fragment 3 | — | Inside the Isles cave biome (not built; BIO-2/3/4). |
| Canopy | Fallen tether basket | yes | log 6 | `bp_outpost_standard` (early copy) | No geometry; the basket bins cache is unwired; reveals unwired. |
| Canopy | Root specimen store | no | archive 10 | — | Inside the rootways (BIO-1). One of its two plans is redundant. |
| Hub | Beacon house | no | archive 10 | — | Was waiting for W2's crown, which has landed. It conflicts with HUB-2's lit mast; its plan is redundant. |
| Basin | Pump-head field | yes | log 6 | nothing | No geometry; its plan is redundant; reveals unwired (one targets the Rift station). |
| Basin | Sealed instrument vault | no | archive 10 | — | Inside the vault complex (BIO-x). |
| Rift | Core borehole rig | yes | log 6 | nothing | No geometry; its plan is redundant. |
| Divide | Mixing-line station | yes | log 6 | nothing | No geometry; its plan waits on the turbine prototype. |
| Meridian | Terrace allotments | yes | log 6 | nothing | No geometry; logs only. |

**Cross-cutting gaps:**
- **Found notes are unwired.** CB-2's 15 notes (10 behind decodes) exist only in proposals; nothing in the game imports them.
- **Reveals carry no target.** `RevealDefinition` is a position only, so `knownSites()` returns reveal IDs rather than site IDs. A decoded map can't make another lost site "known".
- **The main-path guarantee is tested on demo data.** `mainPathPlanProblems` runs on `DEMO_MAIN_PATH`, and three `demo_*` rows (one marked `story: true`) live in the production table. The runtime proof is the bot's `no-optional` scenario, and its verify step doesn't assert that it never decoded.
- **The range tagger captures data from a distance** (`signatures.ts` calls `discoverSite`).
- **No caves hold decodable fragments**, although GAME-DIRECTION asks for them, and **no cave find or cache is wired at all.** Already authored but inert: the dive-school locker, blowhole stash, cove float tin, arch float, fin crate, salvage bench, dock frame, alcove cache and housing cache. No stream owns wiring them.
- **The owner's mid-game overgrown plot has no home and no owner.** `bp_cultivation` still comes from the workshop sheet in the first hour.
- **The opening island's cold-store hatch** (OP-1) needs a decode that unlocks it, and none exists yet.

## 2. Sites per region

Columns per site:
- **Read:** silhouette and tell;
- **Approach:** how you get there;
- **Story:** what's visible before decoding;
- **Decoded:** what the decode opens;
- **Rewards;**
- **Path:**
  - *main:* the intended route passes it, and anything the route needs from it is readable without decoding;
  - *near:* on or beside the route; the decode is optional;
  - *off:* found by exploration or decoded maps.

Every decode is optional. Decoder plans are guaranteed on the main path by the workshop's signal rack, which needs no decode (OP-1 moves the rack with the workshop; see §4).

### Hearth Reef

**Old intake pump house** `reef.pumphouse_site` (−380, −23.5, −20): log 6, *near*, the first decode.
- **Read:** a squat block house on a limestone shoulder. A vent stack rises about 10 m with fans streaming off it like pennants, and the intake's black mouth below is choked with fan growth. It can be seen from the opening island's west shelf and the Colonnade.
- **Approach:** the old intake pipe, cut and capped, still lies on the floor from the ribs' intake (the main-path C02 site) west to the pump house. You can follow it, which makes it a landmark-led lead. A gentle inflow leans the fans toward the mouth: the reef's current-facing growth lesson.
- **Story:** a cheerful painted "Intake 1" sign, scrapers racked by the hanging door, a sealed log cabinet grown over with fans.
- **Decoded:** three intake logs, plus the Reef season log note (grazer moults, nursery roe).
- **Rewards:** `bp_small_fabricator`, kept here because the first decode should pay something you use soon, on outposts. Reveals the Lantern grotto (cave) and the spur crown bearing (hint).

**Dive-school route slates** (new, three cave fragments, 3 min each, *off*). The expedition's cave-diving school left three route tags in the reef's small and medium caves. It's a short optional chain that teaches the cave-plus-decode loop early, using dressing CA-1 already authored.
- **Route 1, `reef_archlet`:** the existing bolted slate, with its depth marks and a painted "ROUTE 1", plus a data tag. Decoded: exit first, the lamp-off check, and "the mats lean to moving water". Reveals the Bell hole.
- **Route 2, `reef_bellhole`:** the existing dive-school locker (reserve cells and the cave-signals card) plus a "ROUTE 2" tag. Reveals the Wrack hollow and the Lantern grotto.
- **Route 3, `reef_lantern_grotto`:** a "ROUTE 3" tag in the glimmer hall. Grants `bp_air_line_reel`, the diver line from 28 to 40 m, a cave tool earned in caves. Reveals the drop-cathedral shortcut toward the Basin west gate.

### Splitspine Isles

**Strain gauge line** `isles.strain_gauges` (345, −45.4, 70): log 6, *near*.
- **Read:** the slump scar is the read. It's a raw, pale bite in the stack's grown-over west flank, with six gauge posts across its edge and the last two bent downslope. It's visible on the Dart's first approach to the stack.
- **Approach:** down the scar's bare scree, where nothing grows. The first clappers sit on the fresh basalt in the scar crawl next door.
- **Story:** numbered posts, "RECAL" chalked on post 4, and a logger housing whose cable runs upslope toward a torn mast stump.
- **Decoded:** strain readings, the recalibration notes, a last request for a review, and the Tide and spawning sheet note. One line names the opening island station's cold store and its door code.
- **Rewards:** `bp_ping_lens` (handheld ping 35 → 60 m; it outlines cave mouths it touches). Reveals the Storm arch (cave) and the Root stair (hint). **Its code opens the cold-store hatch's keypad** (gate 1); the decoded code stays in the journal.

**Yard tide store** `isles.tide_store`, inside the Isles cave biome: fragment 3, *main-path biome, optional site*.
- **Read:** a stencilled "TIDE STORE" door off the yard sump.
- **Story:** dry lockers, and loads strapped on pallets as if for a departure.
- **Decoded:** the manifests and a shift note, plus the trap tally note.
- **Rewards:** `bp_locker_extension` (+50% for one pod, stop or outpost locker). A store room is the natural home for storage. Reveals the gauge line (lost site) and the west sea cave.
- **Placed by:** the Isles biome stream; LS-1 ships the row.

**Opening island cold-store hatch** (OP-1's place). LS-1 supplies the keypad and the code. `island.cold_store_hatch` opens when its code is typed on the keypad; the gauge logger's decoded record shows the code, and the journal keeps it with the door's name. You see the hatch in the first 20–40 minutes and open it after the Dart. Its contents (records and the Under-Stair sump) are OP-1's.

### Lantern Canopy

**Fallen tether basket** `canopy.basket_site` (760, −108.6, −100): log 6, *near*.
- **Read:** a cage basket lying crooked on a crown's shoulder. Its snapped tether still rises 30 m to a buoyant float, a vertical line with a float on top that reads across the crowns.
- **Approach:** the basket lies in the singer's home crowns. Go while it's out east feeding (the laboratory card's window), or run silent.
- **Story:** the "TETHER CREW" stencil, inspection tags clipped crown by crown, latched bins (the cache opens without decoding: 6 resin and 4 crust), and a dark log unit.
- **Decoded:** the tether logs and the Tether crew aside (weaver resin on the east crowns).
- **Rewards:** `bp_outpost_standard` (early copy) and the bins. Reveals the Lantern hall (cave), and the Rootways front mouth once BIO-1 places it.

**Root specimen store** `canopy.root_specimen_store`, inside the rootways (BIO-1): archive 10, *off* (an optional biome).
- **Read:** a sealed locker bolted to a root beyond the knot warren, behind a pressure sticker.
- **Story:** fogged jar labels.
- **Decoded:** the root-colony catalogue, and where rootglow grows inside.
- **Rewards:** `bp_lamp_filter` (a common-pool lamp fitting that halves the light animals read), a rootways exclusive. Reveals the escarpment gallery and the root arch.

### Hub spur

**Keeper's racks** `hub.keepers_racks` (new; spur second step, about (175, −40, −462), floor check in stage 1): planting card readable, decode log 6, **main**. This is the owner's mid-game overgrown plot.
- **Read:** three tiers of grow racks bolted up the step's sunward face, gone wild. Cups and fans spill over the trays in a green cascade against grey rock, under a dead grow-lamp pole. It reads from the spur route between the first step and the crown.
- **Story:** rack labels in one hand, a stool wedged on a ledge, a pan hung on the lamp pole.
- **Readable without decoding:** the laminated planting card. It grants `bp_cultivation`, moved here from the workshop sheet (with OP-1). Cuttings of staple cup, ribbon fan and salve frond can be taken from the racks.
- **Decoded** (the keeper's garden tag): growing notes, with casts and fall bone as feed and which crops took where. Reveals the lumen bulb cluster (Canopy) and the pale spore mat (Basin) as hints: the other seeds. One line says the Rift core crew "swear by vent heat for their tubers": a lead to the borehole hut and the grow bed.

**Keeper's chart room** `hub.beacon_house` (335, −48, −565, recast): archive 10, *near* (on the main path's hub).
- **Read:** a small round hut on the crown summit under the station's lit mast, its windows dark. The lit mast is the keeper's own lamp, so there's no contradiction with HUB-2.
- **Approach:** the crown; mind the rays' circling pass.
- **Story:** a wall chart with unlabelled pins, a bunk and a logbook shelf.
- **Decoded:** the beacon plan, the beacon failure list, and the Beacon keeper's log note.
- **Rewards:** no plan. **It's the map room:** five landmark beacons (dish field, lantern crowns, split chimney, gateworks, signal spire), plus bearings to two deep lost sites, the borehole rig and the mixing-line station.

### Pale Basin

**Pump-head field** `basin.pump_heads_site` (240, −260.2, −760): log 6, *near* (Basin → Rift leg).
- **Read:** rows of squat pump heads on pale sediment, each with a dead status lamp, and a taller central head with a cabinet. The west row is tilted and half buried where the sediment slumped.
- **Story:** numbered rows, and a quota board whose chalk tallies climb. You can read that much before decoding.
- **Decoded:** the extraction logs, calibration requests filed to the ridge vault, and the Pump crew survey note (two carcass falls).
- **Rewards:** 2 reserve cells (pump spares). Reveals the west rim cut (cave) and the materials station (Rift stop). **It holds the ridge vault's door code** (gate 2), kept in the journal.

**Sealed instrument vault** `basin.instrument_vault`, inside the vault complex (BIO-x): door tag fragment 3, then archive 10, *main-path biome, optional site*.
- **Read:** a sealed door in the ridge vaults with a tag light still blinking. Seen early in the biome.
- **Opening it:** a keypad, like every coded door. The code is in the door tag's own decode and in the pump-head record, whichever you decode first, and the journal keeps it. In hindsight, the pump crew's requests explain the door.
- **Inside:** instrument racks and two ceramic liners. These are the bible's tastes, below any transition's need.
- **Decoded** (the archive): calibration records and profiles filed without comment, plus the Specimen tray note.
- **Rewards:** `bp_outpost_advanced` (early copy). Reveals the cool flank mooring (stop) and the inactive shoulder.

### Ember Rift

**Core borehole rig** `rift.borehole_site` (−420, −251.4, −900): log 6, *off* (beside the cool-flank route). Two leads point to it, because its reward matters: the keeper's racks note and the chart room's bearing.
- **Read:** a lattice drill tower over the borehole and a field hut whose vent pipe shimmers with heat haze, with a warm glow at the hut's porthole.
- **Approach:** along the cool flank's ledges from the materials station. Don't touch the haze: the heat lesson, applied.
- **Story:** core samples racked by depth, a sleeping bench, and a vent-warmed planter box overgrown with **kiln tubers**. They're collectable before you know their use (GAME-DIRECTION).
- **Decoded:** core and heat logs, the sketch of a tube "all the way to the cold", and the Drill crew notes note.
- **Rewards:** **`bp_heated_grow_bed`**, the notably better cultivation upgrade (see *Cultivation progression*). Its prototype is the hut's own vent-warmed box, which you see before decoding. Also `seed_kiln_tuber`, the exterior source of the bible's Rift seed (three meals; it grows in a heated bed or on a thermal host). Reveals the West tube (cave) and the seam's Rift mouth (once the seam is placed).

### Mirror Divide

**Mixing-line station** `divide.mixing_site` (880, −379.2, −1150): archive 10, *near* (by the carrier's lee mooring).
- **Read:** a sensor house at the foot of a vertical buoy chain of red-banded floats rising toward the mirror. It's kept distinct from POI-1's cyan float line.
- **Approach:** across the lee shelf where the sails cross their lanes; time the slack.
- **Story:** a pile of replaced sensors by the door, each tagged "FAULTY", and a flag board.
- **Decoded:** brine profiles with spikes flagged, the replacement tickets, the sails' lane change, and the Sensor crew aside note.
- **Rewards:** two chart hints over the dense-water lanes (navigation through the Divide's hazard) and 2 reserve cells. It also gets the current turbine plan if the sandbox prototype is kept (GAME-DIRECTION; not LS-1's to build). Reveals the brine cistern (cave) and the seam's Divide mouth.

**Seam drainage panel** `rift_divide_seam.cold_junction` (new, inside the seam, BIO-4): core 15, *off*.
- **Read:** a panel at the cold junction with a schematic.
- **Decoded:** a drainage schematic. It reveals an approach once the story structure places the deep structure it points to; until then the row stays deferred.

### Meridian

**Terrace allotments** `meridian.allotments_site` (1150, −600, −1250): log 6, *near* (by the staging shelf).
- **Read:** stepped troughs on a terrace edge, soft with a pale crop gone wild, under dead lamp poles. It's a green terrace in a grey district.
- **Approach:** down from the staging shelf, past the bells (take their rest window).
- **Story:** a rota board with initials, a watering can, and the last crop marked "ready" in chalk.
- **Readable without decoding:** one harvest of the wild crop (4 meals).
- **Decoded:** the rota logs and the Rota margin note (casts for the troughs).
- **Rewards:** reveals the escarpment culvert and the terrace window gallery.

### Caches made live (stage 2, one runtime with sites)

These are authored but inert today. LS-1 wires them as inspectable finds through the same runtime as lost sites: the dive-school locker, blowhole stash, cove float tin, arch float, basket bins, housing cache, salvage bench, fin crate, dock frame and service alcove. They keep the bible's contents. They are finite, optional and counted against the tier rule's taste limit.

### Lead chain (decoded maps → what they reveal)

| Decode | Leads to |
| --- | --- |
| Pump house | Lantern grotto · spur crown |
| Route 1 → 2 → 3 | Bell hole → Wrack hollow and Lantern grotto → drop-cathedral shortcut |
| Gauge line | Storm arch · Root stair · **cold-store hatch** |
| Tide store | **Gauge line** · west sea cave |
| Basket | Lantern hall · Rootways mouth |
| Keeper's racks | Lumen bulbs · pale spores · **borehole hut** (a note) |
| Chart room | 5 landmarks · **borehole rig** · **mixing station** |
| Root store | Escarpment gallery · root arch |
| Pump heads | West rim cut · materials station · **vault door** |
| Vault | Cool flank mooring · inactive shoulder |
| Borehole | West tube · seam Rift mouth · **heated grow bed** |
| Mixing line | Cistern · seam Divide mouth · 2 brine lanes |
| Allotments | Culvert · window gallery |

**Bold** marks a further lost site or gate. A reveal whose target isn't placed yet is withheld until it is, and the test enforces that.

**Count:**
- 9 exterior sites (7 placed today, plus the racks and the recast chart room);
- 3 reef cave fragments;
- 4 in-biome sites;
- 17 decodables;
- 10 caches made live.

Every site earns its place by its set, approach and reward. None exists to fill time.

### Cultivation progression (owner, 2026-10-24)

| When (est.) | Step | Source |
| --- | --- | --- |
| 0–75 min | Carry seeds before you can plant them | The opening island's hidden garden |
| 2.5–4 h | **First planter** (`bp_cultivation`) and cuttings | The keeper's racks: card readable, main path |
| any time after | Feed: +40% of a young crop's growth, once (existing `FERTILISER`) | Casts, shells and fall bone, as the notes hint |
| about 5–6.5 h | **Heated grow bed** (`bp_heated_grow_bed`) | The borehole hut decode, led by the racks note and the chart room bearing |

**What the heated grow bed is.** It's a module upgrade fitted to one planter in place, a "higher-tier planter". It travels with the module when an outpost is packed. It reuses SYS-1's module-upgrade scope, extended to `planter` (the locker extension is the same extension), so there's no second mechanism.
- **Growth twice as fast.**
- **+1 produce per harvest for food, medicine and material crops:** staple cups 2 → 3 meals, salve 1 → 2, ribbon fan 3 → 4, pale crust 2 → 3. Power crops get the speed only: a lumen bulb stays 1 cell per harvest, so the grow bed doesn't become a perpetual generator (GAME-DIRECTION).
- **Kiln tubers grow in it anywhere,** not only on a thermal host.
- **It needs host power.** Unpowered, the bed grows at the base rate (never slower), so the trade-off is a powered socket, not a broken crop.

Together, a grow bed yields about 2.5–3× the meals, salve or membrane per active hour of a plain planter. That's notably better, and it frees food runs late in the game.

**Checked against the SYS-1 economy:**
- **Not a duplicate.** No planter upgrade exists. Feed is a one-off consumable boost that stacks with the bed. The Hearthline system bay adds planter *count* (sockets 2 → 4), while the bed improves *each* planter. The decoder lattices are the precedent for a module tier upgraded in place.
- **Cost (proposal):** 1 thermal core, 2 glass, 2 crust and 1 membrane, at reach tier 2 (`decoder_lattice_1`'s tier and shape). Its frontier material, thermal core, has exterior first-access sources at the Rift lower ledges (350 m), so `upgrade-economy.mjs` holds it to "payable at its tier, nothing cave-only".
- **Stage 1b** adds it to that script's coverage, plus a power-balance check: bio-cell supply per active hour on a powered bed must stay below a reference craft's drain.
- **Optional, by design** (lost-site rewards never gate). Its plan is led by two independent leads. If the coordinator wants it guaranteed, the fallback is a main-path copy at the Rift materials station once restored. I recommend against it, because that halves the hut's reason to exist.

## 3. Pacing

**Timeline.** Bot times are the Creel route's milestones in the save library at `ac734b0d`; the carrier route runs about 1.3–1.8× longer from the Rift on. Human windows are **uncalibrated estimates**: they combine the bible's main-path minutes (525 min against the bot's 202, about ×2.6) with OP-1's 45–75 min opening. The owner's playtest calibrates them.

| Human window (est.) | Bot (Creel) | Reach | Sites met | Beats |
| --- | --- | --- | --- | --- |
| 0–75 min | 0–10 | starter | (cold-store hatch seen) | OP-1's opening |
| 45–120 | 10–26 (`systems` 26) | starter → early | Pump house (first decode); route slates (optional) | Arrival, decode, grotto lead; slate chain |
| 90–180 | after the Dart | early | Gauge line → **return home: the hatch opens** | Gate 1 |
| 120–220 | 14–35 (`canopy` 14) | early → reinforced | Basket | Bins, standard kit, rootways lead |
| 150–260 | 20–41 (`creel` 21, `refits` 41) | reinforced | **Keeper's racks (main: first planter)**; chart room | Planter, then the map room's beacons |
| 200–320 | — | reinforced | Root store (optional biome) | Lamp filter |
| 220–340 | 35–58 | reinforced → service | Pump heads; ridge vault (**gate 2**) | Vault opens, advanced kit |
| 300–400 | 58–79 (`rift` 58) | service | Borehole hut | **Heated grow bed** (cultivation tier 2, past 4 h) and kiln tubers |
| 380–480 | 79–100 (`divide` 79) | deep | Mixing line; seam panel (BIO-4) | Brine lanes |
| 470–570 | 131–180 (`meridian` 131) | deep | Allotments | Wild crop, last reveals |

**Reading the table:**
- On the main path a lost-site beat (an arrival, a decode payoff or the lead it opens) falls about every 40–80 human minutes. The optional slates, root store and caches fill in between.
- Lost sites are one source of GAME-DIRECTION's 15–20 minute "something new". They don't carry that cadence alone, and they must not cluster.
- **Structural check:** in the playthrough timeline (SIM-1b), no two site beats on the main path fall within about 10 bot-minutes of each other, and no decode is ever the only thing running (see §5).
- The two gates sit about 3 hours apart, as the owner asked ("a few, spaced out").

**Decode times.** Base times are fragment 3, log 6, archive 10 and core 15 min of active play (`DECODE_MINUTES`, unchanged). The lattices are SIG-1's: ×1.5 from the Rift tier (thermal core) and ×2.25 from the deep tier (lattice).

| Stage | Records | Base | Felt (likely lattice) |
| --- | --- | --- | --- |
| Early | slates, tide store, vault door tag | 3 | 3 |
| Early–mid | pump house, gauge line, basket, racks, pump heads, allotments, borehole | 6 | 6 (borehole 4 with lattice 1; allotments 2.7 with lattice 2) |
| Mid | chart room, root store, vault archive | 10 | 10. Each is decoded while the player restores the crown or explores a biome for longer than that. |
| Late | mixing line (archive 10), seam panel (core 15) | 10–15 | 4.4–6.7 |

**Rules:**
- **Decodes run in the background, on power.** Out of range, a decode shows *Paused: out of range, needs a relay* and never ticks silently. The relay plan is on the workshop rack, which is on the main path.
- **Idle waiting never counts as pacing.** The bot's current "wait at the bench" for the pump house becomes "start, do the next leg, collect". The timeline must show no idle segment caused by a decode on either route.
- **The first decode is reachable in range.** OP-1's workshop cove is about 234 m from the pump house, inside the 250 m local range. OP-1 keeps the rack within range, or the brief notes the relay.

## 4. Dependencies, ownership and stages

**Who owns what:**

| Stream | What LS-1 needs or gives | Rule until it lands |
| --- | --- | --- |
| **CW-1** (in review) | It owns the cave files (`content/regions/caves/*`, `caves.ts`, `rescue.ts`), `sim/step.ts`, `sim/world.ts`, `sim/fittings.ts`, `render/renderer.ts`, `farLayer.ts`, `runtime/app.ts` and `tests/content-proposals.test.ts`. | No LS-1 stage touches these before CW-1 merges. Stage 2 reads cave data only after the merge. |
| **OP-1** | The island, the workshop records (`SYS2_TECH_RECORDS`), the opening playthrough legs. Contract: (a) the hatch reads `gateOpen("island.cold_store_hatch")`; (b) `bp_cultivation` leaves the workshop sheet in the same root merge that lands the racks' card, done by whichever stream merges second, so no build lacks a planter source; (c) the pump-house bot leg (`PUMPHOUSE_RUN` passes the island's centre) and the pump house floor are rechecked against the new shelf; (d) the rack stays within decoder range of the pump house; (e) a courtesy item: the capped intake pipe crosses the island's north shelf. | LS-1 stage 1 owns none of OP-1's files. |
| **COL-1 stage B** | The unified collider for every built set (compromise verdict: "lost sites… geometry waits for COL-1 B"). | Stage 3 waits for it. |
| **WK-1** | Stage 3 sets bake through its bake pipeline, never built at runtime. | Stage 3 uses whatever bake is on root. |
| **BIO-1** (rootways), **BIO-2/3/4** (Isles, Basin vaults, seam) | Each places LS-1's in-biome row (tide store, root store, vault door and archive, seam panel) inside its biome, builds the set, and flips the row from deferred to placed. LS-1 owns the records, rewards and reveals. | Rows ship deferred with `blockedBy`; the test keeps them out of `WORLD_LOST_SITES`. |
| **Chart and beacons** (SYS-2, `navigation.ts`) | Reveals gain a typed `target` (lost site, cave, stop, landmark, hint); `knownSites()` returns site IDs. Categories are unchanged. | Stage 1. |
| **SIG-1** (merged) | The range tagger marks without capturing (`signatures.ts`). The listening array points at sites with a sound tell (`fittings.ts`, after CW-1). | Stage 1 and stage 2 respectively. |
| **Save schema** | **One additive field.** New decodable IDs are additive. Caches are finite world sources through the composed source table (as `c4Sources.ts` does). Read notes go in `knowledge.journals`. Coded doors need `systems.opened` (door IDs), because a typed or guessed code opens a door independently of decodes. The coordinator composes it at integration, as a schema bump or folded into the next planned one. Grow beds reuse the module upgrade record (`moduleUpgrades`), so they need no field. | Proposed here; the coordinator composes `src/save/*`. |

**Opened doors at integration (approved 2026-10-24).** One additive field, composed by the coordinator in one schema change. If another stream's bump lands near it, the two fold into one.
1. **Shape:** `systems.opened: DoorId[]`. `DoorId` comes from LS-1's coded-door table (`island.cold_store_hatch` and `basin.vault_door` so far). Door IDs are stable facts: a row is never deleted or renamed. A door whose site isn't placed yet keeps its row and is simply withheld, so no save ever references a vanished ID. A door, once opened, stays open, so the list only grows.
2. **Validation** (`validSystems`, strict, current schema):
   - `opened` joins the exact key list;
   - it must be an array of known door IDs with no duplicates.

   There's no cross-check against `decoded`, because a typed or guessed code legitimately opens a door before any decode.
3. **Migration: schema 7 → 8,** following the `bridge6.ts` pattern:
   - a new `bridge7.ts` adds `opened: []` in New Game's key order;
   - a schema 7 save that already holds `systems.opened` is refused as corruption, since no schema 7 build writes it;
   - the empty list is exact, because no coded door exists in any schema 7 build;
   - per DIRECTION, only the immediately previous schema is supported, so `bridge6.ts` retires and schema 6 joins `OLDER_BUILD_SCHEMAS`.
4. **Tests and evidence:**
   - validation refuses an unknown door ID, a duplicate, a non-array, and a schema 7 save carrying the field;
   - a SAVE-1 library schema 7 save bridges and then validates strictly;
   - after a code is typed, save → reload keeps the door open (this is stage 1b's adverse case);
   - the playthrough's milestone reloads match;
   - named fixtures (the reef-rib trap regression included) are converted once and their originals archived;
   - `scripts/saves-export.sh` re-exports the library after the root merge.
5. **Not in this field:** cache stock already persists through `world.resources` (`addNewContent` fills new roster rows), read notes through `knowledge.journals`, and grow beds through `moduleUpgrades`.

**Stages** (each a reviewable outcome; file sets are disjoint from CW-1's until it lands):

| Stage | Outcome | Files it owns | Needs |
| --- | --- | --- | --- |
| **1a: records** | Notes readable in the journal. Decoded maps lead to sites. Each decoded code shows in the journal with its door. The main-path guarantee is proved on real content. Demo rows are gone. Seeing is separated from capturing. | `content/systems/lostSites.ts` (rewritten: plates, tells, path, reveal targets, deferred rows), `content/systems/decodes.ts`, new `content/systems/notes.ts` (CB-2 notes lifted out of proposals), `sim/systems/decoder.ts`, `sim/systems/journal.ts`, `sim/systemsLink.ts`, `sim/signatures.ts`, new `tests/lost-sites.test.ts`, `tests/systems-decoder.test.ts` with its demo fixtures moved to `tests/support/`, and the `no-optional` scenario's verify step. A proposed `src/save/validation.ts` delta goes to the coordinator. | Approval |
| **1b: rewards and keypad** | The locker extension, ping lens (range half), air-line reel and **heated grow bed** work. Kiln tuber grows in a grow bed or on a thermal host. **The keypad works:** one implementation for every coded door, with a typed-outcome `enter-code` command and a UI panel that captures the keyboard while open, suspending movement keys. Each decoded code is listed in the journal with its door. OP-1's hatch and the vault door call it. The racks' card and cuttings, the bins and pump spares, and the allotments' harvest are all live. | Rows in the existing upgrade registry (`content/upgrades/hosts.ts`, `sim/upgrades/hosts.ts`; no new mechanism), `sim/systems/survey.ts`, `sim/power/airline.ts`, `sim/systems/hosts.ts` (locker capacity), `content/systems/cultivation.ts` and `sim/systems/cultivation.ts` (rate, yield and the kiln rule), new `ui/keypad.ts` (registration by the coordinator), the keypad command in `sim/systemsLink.ts`, LS-1 source rows composed through the source table, and a new `scripts/playthrough/lostSites.ts` hooked by one line | 1a; the OP-1 handshake for `bp_cultivation` |
| **2: caves** | The three route slates, the ten caches live through one find runtime, ping-lens cave-mouth outlines, and the listening array on sound tells | New `content/systems/caveFinds.ts` (references cave and room IDs; edits no cave file), `sim/fittings.ts` (listening array), and tests | CW-1 merged |
| **3: presence** | Every exterior site is a place: an authored set on the unified collider, plate, tell and lights; on-route sites join the far layer; the racks and chart room sit beside HUB-2's station. | New `content/lostSites/sets.ts`, new `render/lostSites/`, `render/farLayer.ts` entries, REC-1 views tagged `lost-sites`, and one-line registrations (coordinator, or LS-1 with approval) | COL-1 B; CW-1 merged |
| **4: in-biome rows** | The tide store, root store with the lamp filter, vault door and archive, and seam panel are placed | LS-1: the records, plus the lamp filter row in `content/upgrades/catalogue.ts`. BIO streams: geometry and placement. | Each BIO stream; the story structure for the seam panel's target |

1a and 1b can run as one builder in sequence. Stage 3 is the largest and the one the player feels most. If the coordinator wants presence sooner, stage 3 can split by region (Reef and Isles first).

## 5. Tests and evidence per stage

Each stage hands off one short page: SHA, `npm run gate` (fast, build, the six economy scripts, the playthrough queued `--machine any`), at most 3 questions, one adverse case and known limits. Images follow DIRECTION's tiers.

| Stage | Questions (≤3) | Checks | Images | Adverse case |
| --- | --- | --- | --- | --- |
| 1a | 1. Does every reveal, gate and gated note resolve to something real, or stay withheld until it exists? 2. Is the decoder and kit-plan guarantee proved on the real main path, with `no-optional` finishing both routes without a single decode? 3. Is all LS-1 player text dated before the disaster and free of the lint list? | `tests/lost-sites.test.ts`: reference resolution, chain reachability (every *off* site is reachable by exploration or by at least one reveal), floor within 4 m for placed sites, notes before the disaster, the lint read from the appendix. Decoder tests on fixtures. Gate. | 0 | A save with a decode running at a host that becomes unpowered and then out of range: it shows paused, resumes, and nothing is lost on reload. |
| 1b | 1. Is every new plan, the grow bed included, payable at its tier from exterior sources (`upgrade-economy.mjs`), nothing cave-only, with grown bio-cells below a craft's drain? 2. Do the caches stay under the tier rule's taste limit, and does the campaign ledger stay unchanged without them? 3. Can a player open a coded door by ordinary keyboard input from the journal's code, and do both routes decode in the background with no idle decode wait? | Gate; `check-progression-curve.mjs` with `bp_cultivation` moved; a timeline report on both routes; the ordinary-control browser run types a code at a keypad | 1–3 (the keypad with the journal's code, the notebook, a grow bed's crop view) | A wrong code then the right one, then a reload: the door stays open and no movement key leaked while typing. The planter plan's move lands with OP-1 in either merge order, and no build lacks a planter source. |
| 2 | 1. Is every fragment and cache inside its cave's water and reachable on the cave's diver route? 2. Does the slate chain read without markers? 3. Do ping outlines touch only real mouths? | Gate; cave tests in the heavy tier (one queued job) | 2–4 (a slate under the lamp, the outline) | A cache taken, then the game reloaded inside the cave: it stays taken, with no duplicate. |
| 3 | 1. Is each on-route site's tell visible from its route at the stated range? 2. Does collision match the art (COL-1 B oracle) without blocking a route, tether or carrier lane? 3. Is the densest site within the frame budget? | Gate; REC-1 fixed views tagged `lost-sites` compared with the baseline; one ordinary-control browser run that visits two sites and decodes one; a 3090 `--class exclusive` frame check at the densest site and a 4070 check (this touches rendering) | 2–4 per region batch; ≤10 at the stage exit | A Dart at full speed past a site: no streaming hitch over 33 ms, and the tell is present in the far layer. |
| 4 | (In each BIO stream's handoff) Does the row resolve, the chain close and the gate open? | LS-1's resolution tests flip with placement | Per BIO stream | The biome isn't placed: the row stays withheld and its reveals stay hidden. |

## 6. Spoilers

The lore owner's rulings, dates, canon ties and the player-text lint list are in `docs/spoilers/LS-1-LORE.md`. This page stays at the owner-facing bible's level.

## 7. Owner decisions (answered 2026-10-24) and open questions

1. **Coded doors use a keypad:** click it and type the code; the journal keeps every decoded code. This applies to the cold-store hatch and the ridge vault (§2, design call 5, stage 1b).
2. **The first planter at 2.5–4 h is right,** plus a notably better cultivation upgrade past 4 h: the heated grow bed (§2, *Cultivation progression*).

No owner questions are open. The Sol review's findings will be settled with the coordinator before stage 1a.

## Known limits and compromises

- **Until stage 3, sites stay invisible points.** That's today's state, not a new compromise. The root fix is stage 3 on COL-1 B, at the cost of one large stage.
- **Four in-biome sites wait for their biomes,** and the seam panel also waits for the story structure's placement. Their rows ship deferred and withheld.
- **The current turbine** depends on GAME-DIRECTION's sandbox prototype. The mixing line's rewards stand without it.
- **The human windows are estimates** until the owner's playtest calibrates the bot-to-human factor.
