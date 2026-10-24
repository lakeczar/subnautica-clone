# LS-1: lost sites (design plan, stage 0)

Opus 5.5 high, design authority for the stream. Branch `t3/ls-1-lost-sites` from root `a38b951e`. **Docs only: no code stage starts until the coordinator approves this plan.** Revised for Sol plan reviews R1 (`review/ls-1-r1`, `4a9a56a6`) and R2 (`review/ls-1-r2`, `0a7b0bf5`); the dispositions are in *Review responses* at the end. Spoiler-safe. The lore owner's canon notes are in `docs/spoilers/LS-1-LORE.md` (writers and integration agents only).

**Player outcome.** Lost sites are real places you notice, approach and read. Each has a silhouette and a tell, an approach that uses what the region teaches, a story you can see before you decode anything, and records that open once decoded. Decoded maps lead to further sites, caves, stops and landmarks, so the decoder pulls you outward. No site is ever required.

## Design calls (taste decisions, argued from the evidence below)

1. **A site is a place, not a point.** Today every lost site is an invisible 10 m trigger with no geometry (see §1). That's the biggest gap, and it's more important than adding more sites. Every site gets an authored set, a readable plate and a tell. On-route sites can be seen from their route at 60–150 m (POI-1's rule). Off-route sites have a faint tell that only reads within about 60 m, so exploration finds them and decoded maps give the bearing.
2. **Rewards must be things the game doesn't already have.** Four proposed plans duplicate shipped systems, so I drop them:
   - `bp_chart_fix` duplicates SYS-1's `chart_live_position`;
   - `bp_decoder_cooling` duplicates SIG-1's decoder lattices;
   - `bp_outpost_thermal_tap` duplicates outpost location power at vents;
   - `bp_beacon_array` duplicates per-category beacon toggles.

   The kept plans are the locker extension, ping lens, air-line reel and lamp filter, plus the current turbine if its sandbox prototype is kept. There is one new plan, the heated grow bed (owner request; see §2). The other reward kinds are seeds, caches, notes and map reveals.
3. **Decodes take about 3–15 minutes of play** (GAME-DIRECTION's range): 3, 6, 10 and 15 min by size, unchanged. The *intent* is a steadier felt pace, because later sites carry bigger records while the decoder lattices (×1.5, then ×2.25) arrive. A player who fits a lattice sees most late decodes take 4–7 minutes. A player who doesn't still waits up to 15 minutes for a late archive or core, and some late logs drop to about 3 with lattice 2. That is a design aim, not a guarantee.
4. **Every decode opens something,** and at least one reveal per region leads to another lost site or decodable. That is GAME-DIRECTION's "decoded maps reveal more sites".
5. **Two purposeful-backtracking gates, each a real return:**
   - **the opening island's cold-store hatch:** seen in the opening, opened by a code from the Splitspine gauge-line decode after the Dart;
   - **the Basin ridge vault door:** seen when the main path crosses the vault complex in the Basin, opened by a code from the Mirror Divide's mixing-line decode, a later expedition two depth tiers on.

   There is no at-door unlock (R1 F5). Order and spacing are checked from route events, never from timers (§5).

   **Coded doors use a keypad** (owner, 2026-10-24). You click the keypad and type the code on the keyboard. A decoded code is kept in the journal, so nothing has to be memorised. The same rule applies to every coded door. There is no lockout and no penalty for a wrong code, and a guessed code works. Typing the code is the "aha".

   **Most coded doors ask for a little deduction** (owner, 2026-10-24). Either part of the code is in the environment at the door, or a log points at something you've seen.
   - **The first door teaches the mechanic with a straight code** (coordinator): the cold-store hatch's code is given whole by the gauge logger.
   - **The ridge vault door is a deduction door.** Its first two digits are stencilled on the door itself (`atDoor: "20··"`). The mixing-line return slip gives the rest ("…9-3, the rest's on the door").
   - **The journal keeps the record's part,** and says the rest is at the door. It never writes out a deduction door's full code.
   - **Nothing is memorised:** the door's part is in front of you at the keypad, and the record's part stays in the journal.
   - **The main path never needs a door,** so the main path stays solvable from logs alone.
   - **Every deduction door passes the keypad contract unchanged.**

   Both doors are seen before they can be opened and are legible in hindsight.
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
| Basin | Pump-head field | yes | log 6 | the materials-station beacon and its chart area (the one reveal live today) | No geometry; its proposed plan is redundant; its other reveal is unwired. **Keep the working reveal path** while adding typed targets. |
| Basin | Sealed instrument vault | no | archive 10 | — | Inside the vault complex (BIO-x). |
| Rift | Core borehole rig | yes | log 6 | nothing | No geometry; its plan is redundant. |
| Divide | Mixing-line station | yes | log 6 | nothing | No geometry; its plan waits on the turbine prototype. |
| Meridian | Terrace allotments | yes | log 6 | nothing | No geometry; logs only. |

**Cross-cutting gaps:**
- **Found notes are unwired.** CB-2's 15 notes (10 behind decodes) exist only in proposals; nothing in the game imports them.
- **Reveals carry no target.** `RevealDefinition` is a position only, so `knownSites()` returns reveal IDs rather than site IDs. A decoded map can't make another lost site "known".
- **The main-path guarantee is tested on demo data.** `mainPathPlanProblems` runs on `DEMO_MAIN_PATH`, and three `demo_*` rows (one marked `story: true`) live in the production table. Nor is there a decode-free run: every scenario plays the shared `systems` phase, which starts the pump-house decode, and `refits`, which requires it to finish. `no-optional` exists for the Creel only, and the carrier branches from a Creel save that has already decoded (R1 F3).
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
- **Route 2, `reef_bellhole`:** the existing dive-school locker (two glow lures and the cave-signals card) plus a "ROUTE 2" tag. Reveals the Wrack hollow and the Lantern grotto.
- **Route 3, `reef_lantern_grotto`:** a "ROUTE 3" tag in the glimmer hall. Grants `bp_air_line_reel`, which extends the basic diver line from 27 to 40 m: a cave tool earned in caves. The Mantle's 60 m hull line is unchanged. Reveals the drop-cathedral shortcut toward the Basin west gate.

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
- **Rewards:** `bp_locker_extension` (+50% for one locker module; see *Reward contracts*). A store room is the natural home for storage. Reveals the gauge line (lost site) and the west sea cave.
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
- **Decoded:** the extraction logs, the crew's calibration requests sent to "the ridge vault", and the Pump crew survey note (two carcass falls).
- **Rewards:** the pump spares: 3 alloy and 2 membrane gasket rolls. Reveals the west rim cut (cave), and keeps today's materials-station beacon and chart area. The vault requests are a *why* for the door, not its key.

**Sealed instrument vault** `basin.instrument_vault`, inside the vault complex (BIO-x): archive 10 inside, *main-path biome, optional site*. **Gate 2: a true backtrack.**
- **Seen:** the main path's crossing of the vault complex passes a sealed keypad door with a tag light still blinking. The route event is `door-seen` (line of sight within 20 m). Nothing at the door decodes it open.
- **Why, early:** if decoded, the pump-head field's requests to "the ridge vault" explain whose door it is.
- **Key, later:** the Mirror Divide's mixing-line log (two tiers on, about 2–3 h of play later by estimate). The sensor crew sent their replaced "faulty" sensors to the ridge vault for calibration, and the return slip carries the door code. The journal keeps it. The return to the Basin is natural, because the crown station and its carrier anchorage are one short leg away.
- **Worth the return:**
  - **the Basin array chart:** it reveals every Basin cave mouth, cache and site the player hasn't found yet (the Basin holds about 40 optional minutes);
  - **the calibration archive and the Specimen tray note:** after the pile of FAULTY tags at the mixing line, reading them pays off the thread;
  - **a spares cache:** 2 charged bio-cells from the staff's sealed specimen cells, and 2 ceramic liners (late, they're plentiful spares, not tastes).

  The early advanced-kit copy is dropped, since it would be useless this late; the main-path copy at the boundary station is unchanged.
- **Decoded** (the archive): calibration records for the whole array and profiles filed without comment. Reveals the cool flank mooring (stop) and the inactive shoulder.

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
- **Rewards:** **the ridge vault's door code** (gate 2's key; the journal keeps it), two chart hints over the dense-water lanes (navigation through the Divide's hazard), and a sensor-crew kit of 2 field salves and 2 glass. It also gets the current turbine plan if the sandbox prototype is kept (GAME-DIRECTION; not LS-1's to build). Reveals the brine cistern (cave) and the seam's Divide mouth.

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

These are authored but inert today. LS-1 wires them as inspectable finds through the same runtime as lost sites: the dive-school locker, blowhole stash, cove float tin, arch float, basket bins, housing cache, salvage bench, fin crate, dock frame and service alcove. They keep the bible's contents, **except that caches never hold reserve cells** (R2 N2). Strict validation keeps reserve cells to the crafted pair, and that rule stays simple with no exception. Where the bible put cells in a cache, the cache holds charged **bio-cells** instead (an existing, uncapped, charged spare), or materials or consumables that fit its story:
  - housing cache: 2 bio-cells and the crust case;
  - fin crate: 2 bio-cells and 2 glass;
  - arch float: 6 alloy and 1 bio-cell;
  - service alcove: 2 bio-cells and 3 glass. The bible's "spare air-line reel" goes, because the reel is an upgrade.

  They are finite, optional and counted against the tier rule's taste limit.

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
| Pump heads | West rim cut · materials station · why the vault door exists |
| Vault | Cool flank mooring · inactive shoulder · **every unfound Basin cave, cache and site** |
| Borehole | West tube · seam Rift mouth · **heated grow bed** |
| Mixing line | Cistern · seam Divide mouth · 2 brine lanes · **vault door code** (the return to the Basin) |
| Allotments | Culvert · window gallery |

**Bold** marks a further lost site or gate. A reveal whose target isn't placed yet is withheld until it is, and the test enforces that.

**Count:**
- 9 exterior sites (7 placed today, plus the racks and the recast chart room);
- 3 reef cave fragments;
- 4 in-biome sites;
- 16 decodables (one per site; the vault's at-door tag is gone);
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
- **Food, medicine and material crops grow twice as fast,** with **+1 produce per harvest:** staple cups 2 → 3 meals, salve 1 → 2, ribbon fan 3 → 4, pale crust 2 → 3.
- **Power crops get nothing from it, neither speed nor yield** (R2 N3). A lumen bulb (and rootglow later) in a bed grows exactly as in a plain planter. The crop view says so. It's the food, medicine and material upgrade the owner asked for, and it can't feed its own heater.
- **Kiln tubers grow in it anywhere,** not only on a thermal host.
- **Its heater draws host power through the shared drain authority.** A bed-fitted planter counts as a powered module: `poweredModules` becomes per item (`MODULES[module].needsPower`, or a planter carrying a grow bed), so the existing module drain bills it on every host (charged cells on an outpost, the carrier's battery, a stop's plant). On a host without power, or with no charged cell, the bed gives **no acceleration**; the crop grows at the base rate and never slower. Powered, it pays its draw.

Together, a grow bed yields about 2.5–3× the meals, salve or membrane per active hour of a plain planter. That's notably better, and it frees food runs late in the game.

**Checked against the SYS-1 economy:**
- **Not a duplicate.** No planter upgrade exists. Feed is a one-off consumable boost that stacks with the bed. The Hearthline system bay adds planter *count* (sockets 2 → 4), while the bed improves *each* planter. The decoder lattices are the precedent for a module tier upgraded in place.
- **Cost (proposal):** 1 thermal core, 2 glass, 2 crust and 1 membrane, at reach tier 2 (`decoder_lattice_1`'s tier and shape). Its frontier material, thermal core, has exterior first-access sources at the Rift lower ledges (350 m), so `upgrade-economy.mjs` holds it to "payable at its tier, nothing cave-only".
- **Stage 1b** adds it to that script's coverage. Two power checks run against the shared drain authority:
  - on a carrier with its permitted planter count and on a cell-powered outpost, at ordinary harvest and feed cadence, every bed's draw shows up in the host's drain;
  - a power crop's output per hour is identical with and without a bed.
- **Known, pre-existing, out of LS-1 scope:** a *plain* planter's lumen bulbs already supply about 300 power units an hour, against the carrier's roughly 150 an hour at cruise. The coordinator has logged it as a SYS and economy balance follow-up. LS-1 neither changes nor worsens it.
- **Optional, by design** (lost-site rewards never gate). Its plan is led by two independent leads. If the coordinator wants it guaranteed, the fallback is a main-path copy at the Rift materials station once restored. I recommend against it, because that halves the hut's reason to exist.

### Reward contracts (R1 F2)

The rule for every row: the payment goes through SYS-1's spending authority (`planSpend`/`applySpend`, behind the existing craft or host-upgrade command), and one capacity or effect helper is shared by the command, the validator and the HUD. There are no parallel rules.

| Reward | What it targets (scope, identity) | How it's bought and applied | How it's kept (capacity or effect authority) | Pack and reload |
| --- | --- | --- | --- | --- |
| **Locker extension** (`locker_extension_1`) | **Per locker, on locker modules only:** one `mod_locker` item, keyed by its item ID. The pod's, stops' and outposts' built-in lockers have no movable identity, so they aren't targets (decision). | The host-upgrade offer and command (`hostUpgradeOffer` → `upgradeHostModule`), with `moduleIn` widened from decoder/survey to locker/planter. The plan comes from the tide store. | `systems.moduleUpgrades[itemId]`, as the lattices do. **Capacity authority:** one helper, `lockerModuleCapacity(s, itemId)`, used by the container's creation (`sim/systems/hosts.ts`), the strict validator (the `mod_locker` line of the expected containers, `validation.ts:644`) and the HUD. The upgrade is permanent. | The item keeps its ID through packing, its `${itemId}_locker` container travels with it, carried or installed, and the capacity follows the item. On reload the validator recomputes the expected capacity from `moduleUpgrades`. **Tests:** only the chosen locker grows; it survives pack → redeploy → reload; another locker module is unchanged; validation refuses a stale capacity. |
| **Heated grow bed** (`grow_bed_1`) | Per planter: one `mod_planter` item ID | The same host-upgrade path. Plan: the borehole hut. | `moduleUpgrades[itemId]`. **Effect authority:** `growthRate(s, planter)` and `harvestQuantity(seed, upgraded)` in `sim/systems/cultivation.ts`, read by growth, harvest preview and the crop view; the bed applies only to non-power crops on a powered host. **Drain authority:** `poweredModules` per item (in `sim/systemsLink.ts`), which bills the bed's heater. | Crop progress is keyed by the module ID, so it travels with the item. Validation adds that an upgrade's `module` must match the item's module kind. **Tests:** rate and yield on a powered host; the base rate on an unpowered or uncharged host; a lumen bulb unchanged in a bed; the heater's draw in the host drain; it survives pack → reload. |
| **Ping lens** (`ping_lens_1`) | Global personal knowledge | Knowledge scope: a recipe through the existing `HOST_KNOWLEDGE_RECIPES` craft path. Plan: the gauge line. | `knowledge.crafted` (already validated). **Effect authority:** `pingRange(crafted)`, used by `handheldPing` (`sim/systems/survey.ts`) and the HUD; it goes from 35 to 60 m. The cave-mouth outline is stage 2. | Nothing to pack. Reload needs no new field. |
| **Air-line reel** (`air_line_reel_1`) | Global personal knowledge; it affects the **basic** line only | Knowledge scope, as above. Plan: dive-school Route 3, **stage 2**. | `knowledge.crafted`. **Effect authority:** `airLineSupply(diver, crafts, { basicRange })` in `sim/power/airline.ts` gains the parameter, defaulting to 27 m. The hookup is one argument in CW-1-owned `airLineFor` (`sim/fittings.ts`) and **lands after CW-1 merges**, with the stage that grants the plan. | Nothing to pack. **Tests:** basic 27 → 40 m with the reel; **the Mantle's hull line stays 60 m** with and without the reel; a berthed or moving craft still feeds nothing. |
| **Kiln tuber** (`seed_kiln_tuber`) | A seed (additive content) | Collected at the hut's box through the existing seed-source rows; planted with the existing `plant` command | `SEEDS` row. **Rule authority:** `plant` refuses a kiln tuber unless the planter has a grow bed or sits on a thermal-powered host, with a typed refusal. | Planter state is unchanged. |
| **Racks card and cuttings** | The tech record `hub_racks_card` grants `bp_cultivation`; the cuttings come from existing seed sources | The existing `read-record` command and gathering | `knowledge.scans`; the validator derives plans from scans (existing). It is added to `REAL_GRANTS` at its depth, so the kit and plan audit sees it. | — |
| **Caches** (bins, pump spares, allotment crop, vault spares, the ten stage 2 caches) | One **cache container** per cache, with authored contents (materials, bio-cells, meals, salves, lures, beacons; **never reserve cells**). This is one mechanism for every cache. **Found on first reach (stage 1b):** until the diver first comes within 4 m, a cache is only a place. No container or item exists for it, so every item in the inventory stays the player's: the opening rule, holdings counts and panels rely on that. | The existing container transfer (take). Nothing is spent. A site cache is **take-only**. | On first reach the systems step (`openSiteCaches`) adds the container and its authored items (fixed IDs, outside the sequence) and reports `cache-found` (a notice, and a `new` timeline event). The container then stays, emptied or not, so its presence is the "found" record and nothing refills. The validator lists each found cache container at its authored capacity and refuses contents beyond the authored kinds and amounts. A save from before a cache existed simply hasn't found it: no new-content rule is needed. | Taking means moving items out, so there's no separate flag. **Tests:** found once on reach, full; take-only; taken, reload, still taken, no duplicate; emptied, it stays found and doesn't refill; strict refusals for over-authored contents and a wrong capacity; a content test refuses any cache authored with a `reserve_cell`, so the crafted-pair invariant stays untouched. The taste limit is checked against these composed runtime contents (R1 stage note). |
| **Map reveals** | Typed `target` (lost site, cave, stop, landmark or hint) | Decode completion (existing) | `systems.beacons` (existing). Today's materials-station path keeps working. | Unchanged |
| **Door codes** | One row per coded door in LS-1's door table | Decode completion makes the code readable; the keypad's `enter-code` command opens the door | `systems.opened` (see *Opened doors*) | See *Opened doors* |

### Keypad contract (stage 1b; access research barrier #2, shared case 2)

From the access research (`research/access-onboarding` `45811fa5`, `ACCESS-ONBOARDING.md`). The keypad is a **game panel**, composed with the existing paused-panel/input ownership path (`App.openPanel` and pause). There is no separate keydown filter.
- **Opening it** (click the keypad, or interact) goes through `openPanel`, which already:
  - pauses;
  - clears held keys, R cruise, look and drag gestures;
  - releases pointer capture.

  The keypad adds:
  - **focus** moves to a labelled code field ("Door code, <door name>");
  - **Tab is contained** within the panel. Modal containment (`ui/view.ts`) gains the keypad beside the menu and game panel, one rule for all three.
- **Keys inside the panel:**

  | Key | Meaning |
  | --- | --- |
  | Characters, number row and numpad | Typed text, not physical movement codes |
  | Backspace | Edit |
  | Enter | Submit |
  | Escape | Cancel and close the keypad, never the menu behind it |

  **Shortcut precedence is explicit:**
  - while the keypad owns input, the panel's local keys win over the global Escape and F5 handlers (`app.ts:274–304`);
  - **F5 is locally consumed** (no save, no reload while typing). Saving waits until the panel closes, which is one rule and easy to state;
  - **E, Q, J, K and the craft digits never leak** (`app.ts:326–329`): no interaction, scan, panel switch or craft action;
  - neither the diver nor a piloted craft receives movement or look.
- **On close** (submit, cancel, or the door opening):
  - focus returns to a valid target (the canvas, or the panel that was open before);
  - held input isn't revived and capture isn't automatically re-taken. The player re-engages by clicking, as after any panel.
- **Losing the window or tab** while the keypad is open keeps the game paused, with the keypad still open and its text kept.
- **Unchanged:**
  - a guessed code works;
  - a wrong code gives readable feedback with no penalty or lockout;
  - codes are listed by door in the journal, and the journal stays easy to open and leave while the keypad waits, so nothing has to be memorised;
  - there is no auto-unlock.
- **Acceptance uses real keyboard and pointer events** in a browser, not the simulation driver alone (the research's shared case 2):
  - enter the keypad from held W and Space, arrow look, and active R cruise, in captured and drag look modes;
  - edit with characters, the number row and numpad, Backspace, Enter and Escape;
  - press E, Q, J, K, the craft digits and F5 during entry: nothing leaks and F5 is consumed;
  - close by submit, cancel, blur and tab-hide: no stale held state, gesture or recapture;
  - a wrong code, then the right one, then a reload: the door stays open.

  Logic checks extend the existing input and panel tests; there's no parallel harness. A shared browser driver is reused when one exists.

**Sound tells have a visible equivalent (access research barrier #4, shared case 5).** Any significant sound tell at a lost site (the tide store's ticking pump, the mixing line's clanking chain, the borehole's vent hiss, a logger's chirp) gets an equivalent perceivable cue through the caption path. The cue describes the sound and its relative direction, for example "A slow metallic clank, ahead and below". It never names the hidden site and never gives its solution or a waypoint. The listening array's sound-tell filter (stage 2) and the presence tells (stage 3) both use it. Caption labelling and priority themselves belong to the UI stream after CW-1, not LS-1.

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
| 220–340 | 35–58 | reinforced → service | Pump heads; the ridge vault door **seen** (gate 2) | The "why" of the door |
| 300–400 | 58–79 (`rift` 58) | service | Borehole hut | **Heated grow bed** (cultivation tier 2, past 4 h) and kiln tubers |
| 380–480 | 79–100 (`divide` 79) | deep | Mixing line (**vault code**); seam panel (BIO-4) | Brine lanes, then the **return to the Basin vault**: the array chart and the spares |
| 470–570 | 131–180 (`meridian` 131) | deep | Allotments | Wild crop, last reveals |

**Reading the table:**
- On the main path a lost-site beat (an arrival, a decode payoff or the lead it opens) falls about every 40–80 human minutes. The optional slates, root store and caches fill in between.
- Lost sites are one source of GAME-DIRECTION's 15–20 minute "something new". They don't carry that cadence alone, and they must not cluster.
- **The structural check is the pacing acceptance below.** Nearby payoffs are fine; empty stretches are not.
- **The two gates are spaced by route events, not minutes.** Gate 1 resolves in the early tier, gate 2 in the deep tier, with at least two depth-tier milestones between their openings and never back to back.
- **The 10-hour floor stays open.** It is judged by the owner's play, calibrated per leg. Nothing here stretches a route or timer to approach it, and passing economy scripts are no duration proof.

**Decode times.** Base times are fragment 3, log 6, archive 10 and core 15 min of active play (`DECODE_MINUTES`, unchanged). The lattices are SIG-1's: ×1.5 from the Rift tier (thermal core) and ×2.25 from the deep tier (lattice).

| Stage | Records | Base | With the lattice a player is likely to have (none, ×1.5, ×2.25) |
| --- | --- | --- | --- |
| Early | slates, tide store | 3 | 3 |
| Early–mid | pump house, gauge line, basket, racks, pump heads, allotments, borehole | 6 | 6 (borehole 4 with lattice 1; allotments 2.7 with lattice 2) |
| Mid | chart room, root store, vault archive | 10 | 10. Each is decoded while the player restores the crown or explores a biome for longer than that. |
| Late | mixing line (archive 10), seam panel (core 15) | 10–15 | 4.4–6.7 with a lattice; **10–15 without one** |

**Pacing acceptance (R1 F4, R2 N4 and N5).** This is a named check, not a report to read. There is **one analyzer**, `analyseTimeline` (`src/sim/timeline/report.ts`); the acceptance is a thin rule set over its output, and REC-2 later reuses or absorbs both.
- **Rules,** from `DEFAULT_THRESHOLDS`:
  - the longest gap between counted new-content beats is 20 min of play or less;
  - **no idle span has a decode as its recorded cause.**
  - **Empty travel over 90 s is reported for judgement, never failed** (owner, 2026-10-24). The 90 s rule is a spacing guide whose limit grows with progression and journey length. Long legs are listed in the output and in the debt record for PACE-1 and the playtests to judge.
  - **An audible predator counts as something happening** only while its warning cue plays (owner, 2026-10-24). The recorder doesn't tag threat cues yet, so this is noted for REC-2.

  Idle never counts as play time and never fills a gap.
- **Analyzer extensions** (no second model):
  - `TimelineAnalysis.idle` gains `byCause`, a complete summary per recorded cause (count, total seconds, longest). It covers every idle span, however short, not only the long ones.
  - New-content counting gains the dedupe rule below.
- **Wait cause, not presence** (N4). The harness records *why* the bot is idle. The driver's `waitFor(label, …, pred)` declares its cause (`decode:<id>`, `growth:<module>`, `travel-hold`, …), and the observer opens the idle span with that cause from the wait's first tick (the recorder's `idleAfterSeconds` doesn't apply to a declared wait), so a 20-second decode wait is still recorded. The cause comes only from that declaration, never from the mere existence of a running decode or a planter. The app keeps its presence tags for human timelines, where cause can't be known; acceptance runs on bot timelines only.
- **Counting new content** (N5), defined in the analyzer:
  - every `new` event is keyed by its accomplishment, `(what, id)`, and only its **first** occurrence counts, so repeated notices of the same site, plan or region never fill a gap;
  - a decode completion counts **at its own time** when it yields something not already held: a new plan, a reveal of an unknown target, a door code, or a readable record. The recorder's decode event gains an optional `yields` list of those keys, an additive timeline field validated like the others; if the format owner wants a version bump for it, that's their call. A decode that yields nothing new is presentation only;
  - an arrival and a genuine later payoff therefore both count, and nothing is merged by time.
- **How the normal gate runs it** (N4):
  - `scripts/playthrough/run.ts` attaches a timeline observer by default, through the driver's existing `driverHooks.attach`, using only the code under test, with no comparison build. Each scenario writes its `TimelineExport` beside its report.
  - **Shared branch history:** each milestone keeps the recorder's export with its save, and a branched scenario (carrier from `creel@refits`, `no-optional-carrier` from `no-optional@refits`) resumes the recorder from the parent's milestone export (`resumeRecorder`), so its timeline is the parent's history plus its own.
  - The run exits non-zero, naming the scenario and the rule broken, when any of the four acceptance runs fails: both strategies, each with and without optional rewards. Caches are never taken in the without-optional runs.
- **Fixtures** (fast tier, through the real analyzer):

  | Case | Expected |
  | --- | --- |
  | A 30-minute empty leg | fail |
  | A 20 s decode wait | fail |
  | A decode wait beside an unrelated ripe or packed planter | fail (the cause is the decode) |
  | A background decode running while the bot keeps playing | pass |
  | Arrival at 0, a decode yielding a new plan at 15, the next discovery at 30 | pass (gap 15) |
  | Arrival at 0, a duplicate notice of the same accomplishment at 15, the next discovery at 30 | fail (gap 30) |
- **What a pass means:** bot timelines are a lower bound on gaps for a human. A pass is structural evidence only.

**Rules:**
- **Decodes run in the background, on power.** Out of range, a decode shows *Paused: out of range, needs a relay* and never ticks silently. The relay plan is on the workshop rack, which is on the main path.
- **Idle waiting never counts as pacing.** The bot's current "wait at the bench" for the pump house becomes "start, do the next leg, collect". The timeline must show no idle segment caused by a decode on either route.
- **The first decode is reachable in range.** OP-1's workshop cove is about 234 m from the pump house, inside the 250 m local range. OP-1 keeps the rack within range, or the brief notes the relay.

## 4. Dependencies, ownership and stages

**Who owns what:**

| Stream | What LS-1 needs or gives | Rule until it lands |
| --- | --- | --- |
| **CW-1** (in review) | It owns the cave files (`content/regions/caves/*`, `caves.ts`, `rescue.ts`), `sim/step.ts`, `sim/world.ts`, `sim/fittings.ts`, `render/renderer.ts`, `farLayer.ts`, `runtime/app.ts` and `tests/content-proposals.test.ts`. | No LS-1 stage touches these before CW-1 merges. Stage 2 reads cave data only after the merge. |
| **OP-1** (not started) | The island and the workshop records (`SYS2_TECH_RECORDS`). **LS-1 owns `scripts/playthrough/live.ts` and `scenarios.ts` from stage 1a** (the phase/options refactor, F3), and OP-1 inherits them with the refactor in place. Contract: (a) the hatch is a coded door in LS-1's door table, opened through the shared keypad; (b) `bp_cultivation` leaves the workshop sheet in the same root merge that lands the racks' card, done by whichever stream merges second, so no build lacks a planter source; (c) the pump-house bot leg (`PUMPHOUSE_RUN` passes the island's centre) and the pump house floor are rechecked against the new shelf; (d) the rack stays within decoder range of the pump house; (e) a courtesy item: the capped intake pipe crosses the island's north shelf. | LS-1 stage 1 owns none of OP-1's files. |
| **COL-1 stage B** | The unified collider for every built set (compromise verdict: "lost sites… geometry waits for COL-1 B"). | Stage 3 waits for it. |
| **WK-1** | Stage 3 sets bake offline, never built at runtime. | Stage 3's brief names the accepted bake pipeline on root when it starts: WK-1's bake v2 if landed, else the current accepted bake. In either case there's **no synchronous runtime fallback and no second mesh builder**. The brief quotes DIRECTION's performance conventions: indexed spatial queries, allocation and slice limits, bounded and registered caches. |
| **BIO-1** (rootways), **BIO-2/3/4** (Isles, Basin vaults, seam) | Each places LS-1's in-biome row (tide store, root store, vault door and archive, seam panel) inside its biome, builds the set, and flips the row from deferred to placed. LS-1 owns the records, rewards and reveals. **Each row and reveal has exactly one placement authority:** the biome stream's placement table, which LS-1's row references rather than copies. | Rows ship deferred with `blockedBy`; the test keeps them out of `WORLD_LOST_SITES`. |
| **Chart and beacons** (SYS-2, `navigation.ts`) | Reveals gain a typed `target` (lost site, cave, stop, landmark, hint); `knownSites()` returns site IDs. Categories are unchanged. | Stage 1. |
| **SIG-1** (merged) | The range tagger marks without capturing (`signatures.ts`). The listening array points at sites with a sound tell (`fittings.ts`, after CW-1). | Stage 1 and stage 2 respectively. |
| **Save schema** | **Schema 7 → 8 with `bridge7`:** `systems.opened` and the recorded legacy cultivation grant (F1), both below. New decodable and seed IDs are additive. Caches are fixed cache containers, added full by the new-content rule. Read notes go in `knowledge.journals`, and grow beds and locker extensions in `moduleUpgrades`. | Proposed here; the coordinator composes `src/save/*`. |

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
5. **Not in this field:** caches persist as containers and items, read notes through `knowledge.journals`, and grow beds and locker extensions through `moduleUpgrades`.

**Earned cultivation knowledge at integration (R1 F1).** Moving `bp_cultivation` off the workshop sheet changes saved meaning. Strict validation derives the exact plan set from scans, story discoveries and decodes (`validation.ts:780`). A save that read the sheet before the move would hold a plan the new rules don't derive, so it would fail to load. The fix lives in the same `bridge7`, and it is narrow, not a global loosening.
1. **Shape** (coordinator, 2026-10-24): `knowledge.legacyGrants: { blueprint, source: { kind: "scan" | "discovery", id } }[]`.
   - **One table, one validator.** `LEGACY_GRANTS` lists each legal row with its reason.
   - **LS-1's row:** `{ blueprint: "bp_cultivation", source: { kind: "scan", id: "workshop_outpost_sheet" } }`.
   - **PACE-1's row** (`bp_pod_buffer`, `source: { kind: "discovery", id: "C07" }`) lands atomically with a schema step:
     - in this `bridge7`, if PACE-1's stage 2 is ready before 1b merges (coordinated through the coordinator);
     - otherwise in an 8 → 9 bridge using the same table and validator. **It is a permanent, narrow saved fact (R2 N1):** dropping schema 7 support retires the converter, not the knowledge it converted. A later bridge carries the field and the table unchanged, and they are never removed.
2. **Bridge:** `bridge7` writes a row's entry only when the schema 7 save holds both the row's blueprint and its old provenance: the `workshop_outpost_sheet` scan for LS-1's row. Otherwise it writes `[]`. A schema 7 save that already holds the field is refused. New Game writes `[]`.
3. **Validation:**
   - each entry must be a `LEGACY_GRANTS` row whose source is held: a `scan` source in `knowledge.scans`, a `discovery` source in `storyView(s).discoveries`;
   - its blueprint joins the expected plan set, and nothing else does;
   - no duplicates.

   A fresh schema 8 game that reads the workshop sheet gains no planter plan; only the racks' card grants it.
4. **Tests** (Sol's three, plus a refusal):
   - a post-workshop schema 7 save **with an installed planter and a growing crop** bridges, validates, keeps the crop and can build another planter;
   - a post-workshop save **without a planter** bridges with the grant and can build one;
   - a **fresh game** whose only cultivation grant is the racks' card validates, and reading the workshop sheet adds no `bp_cultivation`;
   - a schema 8 save with a legacy entry whose source isn't held is refused, tested for both source kinds (a `discovery` fixture row stands in until PACE-1's row lands).

   - **lifecycle:** convert 7 → 8, save again without visiting the racks, then run the next supported transition (a test bridge 8 → 9 stand-in in the fixture suite). The plan, the entry and the growing crop all survive.

   The library's post-`systems` milestone saves convert through the same path, and the re-export after merge proves it.

**Stages** (each a reviewable outcome; file sets are disjoint from CW-1's until it lands):

| Stage | Outcome | Files it owns | Needs |
| --- | --- | --- | --- |
| **1a: records and decode-free routes** | Notes readable in the journal. Decoded maps lead to sites. Each decoded code shows in the journal with its door. Demo rows are gone. Seeing is separated from capturing. **The main-path plan guarantee runs on real content:** `kitPlanRoute`/`kitPlanProblems` in `sim/storyCampaign.ts` generalise from the three kit plans to `MAIN_PATH_PLANS` (the decoder, the three kits and `bp_cultivation`) over the real `REAL_GRANTS`, with no second route table. **Genuinely decode-free runs of both strategies:** `PlayOptions` gains `decodes: boolean`. Off, `systems` starts no decode and `refits` doesn't require one; a driver guard fails the run on any `start-decode`; and the run ends with empty `decodes` and `decoded`. `no-optional` (Creel) runs with decodes off, and a new `no-optional-carrier` branches from `no-optional@refits`, a clean shared milestone. The normal Creel and carrier routes keep positive decode coverage. **Pacing acceptance** and its injected-failure fixtures. | `content/systems/lostSites.ts` (rewritten: plates, tells, path, reveal targets, door table, deferred rows), `content/systems/decodes.ts`, new `content/systems/notes.ts` (CB-2 notes lifted out of proposals), `sim/systems/decoder.ts`, `sim/systems/journal.ts`, `sim/systemsLink.ts`, `sim/signatures.ts`, `sim/storyCampaign.ts` (the generalised audit), new `sim/timeline/acceptance.ts` with `sim/timeline/report.ts` (`idle.byCause`, the dedupe rule) and `recorder.ts` (decode `yields`), **`scripts/playthrough/live.ts`, `scenarios.ts`, `run.ts` and `driver.ts`** (the default timeline observer, declared wait causes, branch-history resume), new `tests/lost-sites.test.ts`, `tests/systems-decoder.test.ts` with its fixtures in `tests/support/`. A proposed `src/save/*` delta goes to the coordinator. | Approval |
| **1b: rewards, keypad and the planter move** | The locker extension, ping lens (range half) and **heated grow bed** work (the reel is stage 2). **`bp_cultivation` moves to the racks' card**, and the bot's unconditional early planter build, planting and harvest (`systems` and `systemsPayoff` in `live.ts`, and `refits`' crop check) move with it to the hub leg. Kiln tuber grows in a grow bed or on a thermal host. **The keypad works:** one implementation for every coded door, with a typed-outcome `enter-code` command and a game panel on the existing `openPanel` and pause path (see *Keypad contract*). Each decoded code is listed in the journal with its door. OP-1's hatch and the vault door call it. The racks' card and cuttings, the bins and pump spares, and the allotments' harvest are all live. | Rows in the existing upgrade registry (`content/upgrades/hosts.ts`, `sim/upgrades/hosts.ts`), `sim/hostUpgrades.ts` (`moduleIn` widened to locker and planter), `sim/systems/survey.ts`, `sim/systems/hosts.ts` (`lockerModuleCapacity`), `content/systems/cultivation.ts` and `sim/systems/cultivation.ts` (rate, yield and the kiln rule), new `ui/keypad.ts` (registration by the coordinator), the keypad command in `sim/systemsLink.ts`, LS-1 source rows composed through the source table, and a new `scripts/playthrough/lostSites.ts` hooked by one line | 1a; the OP-1 handshake for `bp_cultivation` |
| **2: caves and the reel** | The three route slates, the ten caches live through the cache-container mechanism, ping-lens cave-mouth outlines, the listening array on sound tells (each with its visible equivalent cue), and **the air-line reel** (Route 3's plan, with its `airLineFor` hookup) | New `content/systems/caveFinds.ts` (references cave and room IDs; edits no cave file), `sim/power/airline.ts` (`basicRange`), `sim/fittings.ts` (listening array, `airLineFor`), and tests | CW-1 merged |
| **3: presence** | Every exterior site is a place: an authored set on the unified collider, plate, tell and lights; on-route sites join the far layer; the racks and chart room sit beside HUB-2's station. | New `content/lostSites/sets.ts`, new `render/lostSites/`, `render/farLayer.ts` entries, REC-1 views tagged `lost-sites`, and one-line registrations (coordinator, or LS-1 with approval) | COL-1 B; CW-1 merged |
| **4: in-biome rows** | The tide store, root store with the lamp filter, vault door and archive, and seam panel are placed | LS-1: the records, plus the lamp filter as a connected feature: the catalogue row, its recipe, and its consumer (the lamp's `light` read by wildlife), with an effect test. BIO streams: geometry and placement. | Each BIO stream; the story structure for the seam panel's target |

1a and 1b can run as one builder in sequence. Stage 3 is the largest and the one the player feels most. If the coordinator wants presence sooner, stage 3 can split by region (Reef and Isles first).

## 5. Tests and evidence per stage

Each stage hands off one short page: SHA, `npm run gate` (fast, build, the six economy scripts, the playthrough queued `--machine any`), at most 3 questions, one adverse case and known limits. Images follow DIRECTION's tiers.

| Stage | Questions (≤3) | Checks | Images | Adverse case |
| --- | --- | --- | --- | --- |
| 1a | 1. Does every reveal, door and gated note resolve to something real, or stay withheld until it exists? 2. Do both strategies finish decode-free (no `start-decode`, empty decode state), with the plan guarantee proved over `REAL_GRANTS`, while the normal routes still decode? 3. Does the pacing acceptance pass on all four runs, and fail its two injected cases? | `tests/lost-sites.test.ts`: reference resolution, chain reachability (every *off* site is reachable by exploration or by at least one reveal), floor within 4 m for placed sites, notes dated before the disaster, the player-text lint read from the appendix, and door order (`door-seen` before the code is readable on the main route; it fails if a code lands before its door is seen). The generalised `kitPlanProblems` on both strategies; the six pacing fixtures (§3) through the real analyzer, and the `run.ts` acceptance exit on all four runs; decoder tests on fixtures. Gate (playthrough with the two decode-free scenarios). | 0 | A save with a decode running at a host that becomes unpowered and then out of range: it shows paused, resumes, and nothing is lost on reload. |
| 1b | 1. Is every new plan, the grow bed included, payable at its tier from exterior sources (`upgrade-economy.mjs`), nothing cave-only, with the bed's heater billed by the host drain and power crops unchanged in a bed? 2. Do earned planter plans survive the move (F1's three saves), do the caches stay under the taste limit, and does the campaign ledger stay unchanged without them? 3. Does the keypad meet its contract under real keyboard and pointer events: focus, Tab containment, local Enter/Backspace/Escape, F5 consumed, no E/Q/J/K or digit leak, no stale input or recapture after close, blur or tab-hide? | Gate (pacing acceptance included); `check-progression-curve.mjs` with `bp_cultivation` moved; the reward-contract tests (the locker on a single item through pack and reload, the grow bed's rate, yield and power, kiln refusals); `bridge7` legacy-grant and `opened` tests; the ordinary-control browser run is the keypad's real-event acceptance (the research's shared case 2) | 1–3 (the keypad with the journal's code, the notebook, a grow bed's crop view) | Entering the keypad from held W during R cruise in captured look: no movement during entry or after close. A wrong code, then the right one, then a reload: the door stays open. The planter plan's move lands with OP-1 in either merge order, and no build lacks a planter source. |
| 2 | 1. Is every fragment and cache in its authored place and reachable, with real targeting and line of sight, on the cave's diver route? Most are in water; the **blowhole stash keeps its dry ledge above the waterline**, tested for access, not moved. 2. Does the slate chain read without markers? 3. Does the reel give 40 m on the basic line, leave the Mantle's 60 m untouched, and do ping outlines touch only real mouths? | Gate; cave tests in the heavy tier (one queued job); the taste limit on composed runtime cache contents | 2–4 (a slate under the lamp, the outline) | A cache taken, then the game reloaded inside the cave: it stays taken, with no duplicate. |
| 3 | 1. Is each on-route site's tell visible from its route at the stated range? 2. Does collision match the art (COL-1 B oracle) without blocking a route, tether or carrier lane? 3. Is the densest site within the frame budget? | Gate; REC-1 fixed views tagged `lost-sites` compared with the baseline; one ordinary-control browser run that visits two sites and decodes one; a 3090 `--class exclusive` frame check at the densest site and a 4070 check (this touches rendering) | 2–4 per region batch; ≤10 at the stage exit | A Dart at full speed past a site: no streaming hitch over 33 ms, and the tell is present in the far layer. |
| 4 | (In each BIO stream's handoff) Does the row resolve, the chain close and the gate open? | LS-1's resolution tests flip with placement | Per BIO stream | The biome isn't placed: the row stays withheld and its reveals stay hidden. |

## 6. Spoilers

The lore owner's rulings, dates, canon ties and the player-text lint list are in `docs/spoilers/LS-1-LORE.md`. This page stays at the owner-facing bible's level.

## 7. Owner decisions (answered 2026-10-24) and open questions

1. **Coded doors use a keypad:** click it and type the code; the journal keeps what each decoded record gives. **More puzzles** (later answer): most doors take a little deduction, the main path stays solvable from logs, and the first door (the hatch) is a straight code (design call 5, stage 1b).
3. **Pacing:** the 90 s empty-travel rule is a spacing guide, so long legs are reported for judgement. The 15–20 min new-content gap and zero decode-only waiting stay hard rules (§3).
2. **The first planter at 2.5–4 h is right,** plus a notably better cultivation upgrade past 4 h: the heated grow bed (§2, *Cultivation progression*).

No owner questions are open. The Sol review's findings will be settled with the coordinator before stage 1a.

## Known limits and compromises

- **Until stage 3, sites stay invisible points.** That's today's state, not a new compromise. The root fix is stage 3 on COL-1 B, at the cost of one large stage.
- **Four in-biome sites wait for their biomes,** and the seam panel also waits for the story structure's placement. Their rows ship deferred and withheld.
- **The current turbine** depends on GAME-DIRECTION's sandbox prototype. The mixing line's rewards stand without it.
- **The human windows are estimates** until the owner's playtest calibrates the bot-to-human factor.

## Review responses

**R1** (Sol, `review/ls-1-r1` `4a9a56a6`):

| Finding | Disposition | Where |
| --- | --- | --- |
| **F1 [P1]** earned cultivation knowledge | **Fixed.** A narrow recorded provenance in `bridge7` (`knowledge.legacyGrants`, one legal row, with its record required; made permanent in R2). It is not a global loosening, and it comes with Sol's three tests plus a refusal. | §4 *Earned cultivation knowledge* |
| **F2 [P2]** reward contracts | **Fixed.** A contract per reward covering scope, identity, payment through SYS-1's spending, the capacity or effect authority, and pack and reload. The locker extension is per locker, on `mod_locker` items, keyed by item ID. The reel's baseline is corrected to 27 m; its hookup goes through CW-1's `airLineFor` after CW-1 merges (stage 2), and the Mantle's 60 m is tested unchanged. Caches use one container mechanism. | §2 *Reward contracts*; stages 1b and 2 |
| **F3 [P2]** decode-free route proof | **Fixed.** Stage 1a owns the `live.ts`/`scenarios.ts` phase/options refactor (OP-1 inherits it). It gives decode-free Creel and carrier runs from a clean milestone, with a `start-decode` guard and empty decode state, while the normal routes keep decoding. The generalised `kitPlanRoute` runs over `REAL_GRANTS`. Stage 1b moves the bot's planter work with the grant. | Stage 1a and 1b rows; §5 |
| **F4 [P2]** pacing evidence | **Fixed.** A named `pacingAcceptance` on `analyseTimeline` (the longest gap, empty travel, decode-only idle) (grouping replaced by R2 N5's dedupe), run on four runs, with two injected cases that must fail. REC-2 reuses it. The decode range is stated honestly as about 3–15 min. The 10-hour floor stays open. | §3 *Pacing acceptance*; design call 3 |
| **F5 [P2]** vault as a real return | **Fixed.** The at-door unlock is removed. The door is seen on the Basin main path, its code comes from the Divide's mixing line two tiers later, and the return pays off with the Basin array chart, the archive and spares. The order is checked from route events. | §2 vault and mixing line; §3; §5 |
| Inventory correction | **Adopted:** the Basin decode's live materials-station beacon and chart area are kept. | §1 |
| Stage notes (the blowhole dry ledge, composed taste limits, naming the bake, one placement authority, the lamp filter's consumer coverage) | **Adopted.** | §4, §5 |

**R2** (Sol, `review/ls-1-r2` `0a7b0bf5`):

| Finding | Disposition | Where |
| --- | --- | --- |
| **N1** legacy provenance lifecycle | **Fixed.** `knowledge.legacyGrants` is a permanent narrow saved fact that later bridges carry unchanged. Sol's lifecycle case is added (7 → 8, re-save without the racks, next transition keeps the plan and crop). | §4 *Earned cultivation knowledge* |
| **N2** reserve cells in caches | **Fixed, coordinator's call:** caches hold no reserve cells. They carry bio-cells, materials, salves and lures instead, per cache story. A content test refuses any authored cell, so the crafted-pair invariant has no exception. | §2 caches, pump heads, vault, mixing line; *Reward contracts* |
| **N3** power crops and the grow bed | **Fixed.** No benefit to power crops. The heater is billed through a per-item `poweredModules`, so there's no acceleration without power. Plain lumen-bulb supply against carrier drain is noted as pre-existing and out of scope. | §2 *Cultivation progression*; *Reward contracts* |
| **N4** pacing data | **Fixed.** `run.ts` attaches and exports the recorder by default, resumes branch history from the parent milestone, and exits non-zero on failure. One analyzer, extended with `idle.byCause`. Wait causes are declared by `waitFor`, not inferred from presence. Three fixtures cover the wait cases. | §3 *Pacing acceptance* |
| **N5** grouping | **Fixed.** Dedupe by `(what, id)` first occurrence; a decode counts at its own time when its `yields` holds something new. A positive (delayed real payoff) and a negative (duplicate notice) fixture. | §3 *Pacing acceptance* |

## Stage 1a handoff (records and decode-free routes)

Code at **`4b89164b`** (branch `t3/ls-1-lost-sites`, from root `a38b951e` plus the docs-only root merge `c98517ae`); this section is the docs-only commit after it. No file CW-1 changed was touched. Spoiler-safe; canon notes stay in `docs/spoilers/LS-1-LORE.md`.

**What a player gets now:**
- The pump house, gauge line, basket, pump heads, borehole rig, mixing line and allotments, plus the **keeper's racks** on the spur's second step and the **beacon house** door on the crown (W2's lit lamp), are findable lost sites, each with a **plate** readable before any decode.
- Decoded maps now **lead to further lost sites**: the beacon house's archive reveals the borehole rig and the mixing line. A reveal whose target is not in the world yet (a cave before CW-1 lands) is withheld, and appears by itself in a later build.
- CB-2's **found notes** read in the journal (notebook → *Found notes*): the five board notes once you've been at their place, the ten site notes once decoded.
- **Seeing is not capturing:** the Dart's range tagger now marks a site on the chart (`tag:<site>`), and the journal lists it under *Marked, not captured* until you reach its logger.
- Coded doors carry their codes in decoded logs, and the journal's *Door codes* section shows a code once its door exists (neither door is placed yet: OP-1 and the Basin vault biome).

**Changed contracts:**
- `content/systems/lostSites.ts` is the one lost-site table:
  - plates, paths and tells (sound tells carry their caption text);
  - typed `RevealTarget`;
  - `CODED_DOORS`;
  - `DEFERRED_LOST_SITES`, never findable.
- `content/systems/decodes.ts`:
  - the `demo_*` rows, `DEMO_MAIN_PATH`, `decoderPlanProblems` and `mainPathPlanProblems(path)` are deleted;
  - `revealPlaced` and `placedReveals` are added;
  - `MAIN_PATH_PLANS` now also lists `bp_cultivation`.
- `sim/storyCampaign.ts`: `mainPathPlanRoute` / `mainPathPlanProblems(strategy)` generalise the kit audit over `REAL_GRANTS`; `kitPlanRoute` is now a view of it.
- **Decoder and chart:**
  - `knownSites` returns site IDs;
  - `DecodeCompletion` gains `fresh`, the plans not held before;
  - `markedSites`, `doorCodes` and `decodedReveals` are new;
  - beacons derive late-placed reveals.
- **Notes:** found-note text moved to `content/systems/notes.ts`. `proposals/fieldNotes.ts` keeps only hosts and hints by ID, so there's one copy of the text.
- **Timeline:**
  - `TimelineEvent` gains `cause` (idle) and `yields` (decode), validated in the existing validator;
  - `ChunkSummary.idle.byCause` survives rotation;
  - `analyseTimeline` gains `idle.byCause` and first-occurrence counting (`newContent`);
  - `ObserveContext.cause` opens a declared wait from its first tick;
  - `sim/timeline/acceptance.ts` holds `pacingAcceptance`.
- **Playthrough:**
  - `PlayOptions.decodes`;
  - `Driver.waitFor(…, cause)`, `decodesAllowed` (refuses `start-decode`) and `milestones`;
  - `scripts/playthrough/pacing.ts`: one recorder per driver through `driverHooks`, branches resumed from the parent's milestone export, `judgePacing`;
  - `run.ts` attaches it by default and takes `--timeline-dir`;
  - `no-optional` is decode-free and `no-optional-carrier` is new;
  - the Creel route sockets a signal relay beside the workshop decoder;
  - `pacing-debt.ts` (below).
- **Save:** no change. New decodable IDs are additive, and read notes and codes are derived from saved state.

**Checks** (all on the 4070 sandbox, `--machine any`):

| Check | Ticket and commit | Result |
| --- | --- | --- |
| Fast tier | `261024-184819-f703` at `4b89164b` | 167 files pass |
| Heavy tier | `261024-183857-f6db` at `3d09cdb9` (the later commits touch only playthrough scripts and one fast test) | All files pass, 0 failures |
| Six economy steps | `261024-183857-1533` at `3d09cdb9` | All pass |
| Playthrough | `261024-184819-d93f` at `4b89164b` | **9/9 complete, no blockers, every milestone reload matches.** Creel 203.7 min, carrier 372.5, no-optional 200.2, no-optional-carrier 362.3. |
| Production build | `261024-190232-5649` at `4b89164b` | Passes |

**Questions:**
1. *Does every reveal, door and gated note resolve to something real, or stay withheld?* Yes (`tests/lost-sites.test.ts`):
   - cave targets are authored caves, with their point at the footprint, and show exactly when the cave is in `CAVE_SOURCES`;
   - site, source and lost-site targets resolve;
   - deferred rows are never findable;
   - every note is dated before the disaster and gated by its own decode;
   - each door's code is in exactly one decoded log and shows only once the door is placed;
   - player text passes the lore owner's lint list, read from the appendix.
2. *Do both strategies finish decode-free, with the plan guarantee proved on real content, while the normal routes still decode?* Yes:
   - `no-optional` and `no-optional-carrier` end with nothing decoding or decoded, and the driver would block any `start-decode`;
   - `mainPathPlanProblems` is empty for both strategies, and every plan comes from a real record no decode gates;
   - Creel and carrier still decode the pump house, now in the background through the relay.
3. *Does the pacing acceptance pass on all four runs and fail its injected cases?*
   - **Decode waits:** 0 s on all four.
   - **Injected cases:** the six fixtures behave as specified (`tests/timeline-acceptance.test.ts`, `tests/playthrough-pacing.test.ts`).
   - **Gap and empty travel: all four runs fail them on root's existing late game.** They pass only against the recorded debt (compromise 1). **This is the finding to decide on.**

**Adverse case:** a decode at a host that loses power, then range. It pauses with the reason shown, resumes, and loses nothing through pack, redeploy and reload (`systems-decoder`, `systems-outposts`, `systems-recovery` tests, now on real sites). The decode-free guard throws on a `start-decode`.

**Compromises (each with its root fix):**
1. **Recorded pacing debt** (`scripts/playthrough/pacing-debt.ts`).
   - **What the first acceptance run found** on every judged route:
     - a 51 min gap (Creel) or 87–95 min gap (carrier) in the works phase, between the service air assembly and the pod buffer;
     - on the carrier, also a 51 min stretch from the Hearthline to the Divide;
     - 31 (Creel) or 55 (carrier) empty-travel stretches over 90 s, the longest a 3.5 km, 850 s Creel haul between the district and the island workshop.
   - **Why it's debt:** it's existing campaign structure that LS-1 did not cause, and a red gate on root would block every stream. The entry holds today's figures, so anything new or worse fails. Decode waits get no allowance, and an improvement prints "tighten the entry".
   - **Root fixes:**
     - late-game works logistics: a forward fabrication point or a shorter material path;
     - the measure: the recorder doesn't yet break travel at lit landmarks passed, so long deep legs read as empty where POI-1's measure finds them under 60 s.
   - **Cost:** the gate tolerates today's late-game slog until those land.
   - **Owner:** yours to assign (late-game content; REC-2 for the measure).
2. **The door-order check isn't live yet:** neither door is placed. It activates with OP-1's hatch and the vault biome. Until then, a test holds that an unplaced door shows no code.
3. **The scout drone still captures site data** at its 12 m scan range: the drone physically reaches the logger, which counts as reaching it. Only the range tagger changed.
4. **Sites are still invisible find points**, as before, until stage 3 on COL-1 B. No new compromise.

**Known limits:**
- The racks' planting card (`bp_cultivation`) and every new reward are stage 1b.
- The reef slates and the listening array's sound-tell filter are stage 2.
- The Creel route now spends 1 alloy, 1 crust and 1 resin on the relay; the economy scripts don't simulate the bot, and all six pass.

### Stage 1a R1 fixes (Sol, `review/ls-1-1a-r1` `9de5917e`)

Code at **`4593705d`**. Every finding is fixed as written, together with the two owner decisions that came during the fixes (deduction doors; empty travel as a spacing guide).

| Finding | Fix | Proof |
| --- | --- | --- |
| **F1 [P1]**: the records didn't reach the real journal | `journalPanel` now renders the shared model. The story notebook stays as it is, followed by the model's *Found notes* and *Door codes* sections. Decoded log prose is part of the model (`JournalEntry.logs`), so the panel no longer looks it up by the wrong entry identity (`decode:` against `decoded:`). | `tests/lost-sites-panel.test.ts`, on the real `PanelView` output: a board note appears once its place is visited; a decode note once decoded; a completed log's prose; a placed door's code. |
| **F4 [P2]**: unplaced-door codes showed in the readable-record path | **One authority, `readableLog`** (`sim/systems/decoder.ts`): nothing before the decode, and a code-bearing line (it names its door in `lostSites.ts`) only once `doorPlaced`. Site inspection, notices, the journal and `doorCodes` all read it. `DECODE_LOGS` is gone; `decodeLog` is raw data for the decoder and tests. | The same panel test, through the rendered journal and site inspection: before decoding, decoded but unplaced, then placed. Also `tests/lost-sites.test.ts`. |
| **F3 [P2]**: most waits had no cause | `Driver.waitFor(label, seconds, done, cause)` **requires** a cause (empty is refused), and `idle()` goes through it. All 15 call sites declare theirs: `action:sort` and `action:lift`, `action:tool-arms`, `vitals:air` and `vitals:low-air`, `docking:settle`, `docking:capture` and `docking:launch`, `works:equalize`, `recovery:bobbin` and `recovery:tow`, `craft:coast`, `growth:seed_staple_cup`, `decode:reef_pumphouse_log`. Every declared wait is idle from its first tick. The pump-house cause and the decode-free guard are unchanged. | `tests/playthrough-pacing.test.ts`, through the real driver and observer: short (1 s) and long (30 s) non-decode waits, a cause change, a timed-out wait clearing its cause, an undeclared cause refused, and causes surviving `summarizeChunk`. |
| **F2 [P2]**: the aggregate debt could hide regressions | **An identified ratchet** (`scripts/playthrough/pacing-debt.ts`, `judgePacing`). One row per identified figure, each holding its measured bounds (largest first) and an owner. Each identity's values are compared largest to largest, so nothing new hides under an old maximum. A decode-caused idle span fails **first**, counted by spans, so a one-tick wait counts.<br>**Gaps** (keyed by the beats either side, play minutes; owner PACE-1): new, more or larger fails, and fewer, smaller or gone **also fails**, printing the exact rows to write.<br>**Legs** (keyed by hull and region, seconds; owner REC-2 with PACE-1): **reported for judgement, never failed**, per the owner's ruling that 90 s is a spacing guide. Any difference from the record is listed with the figures now. | Fixtures through the real analyzer: a new gap shorter than the old maximum; a gap improvement, then a regression after lowering; a worsened secondary leg (reported, not failed); a one-tick and a zero-length decode wait; and an unrecorded route judged strictly. Also `timeline-acceptance`: a 120 s leg is reported, not failed. |

**Recomputed baseline, after every wait was declared** (playthrough ticket `261024-193214-8831`; the final run below reproduces it exactly). Minutes are active play. The gaps are hard and ratcheted; the legs are reported for judgement.

| Route | Longest gap | Empty legs over 90 s (reported) | Longest leg | Decode waits |
| --- | --- | --- | --- | --- |
| Creel | 50.6 min (works: service air assembly → pod buffer) | 31 | 849.9 s, Creel in the district | 0 |
| Carrier | 94.2 min (works), plus 50.8 (Hearthline → Divide), 29.8 (C12 → service air plans), 26.5 (controller → service power assembly) | 55 | 753.4 s, Hearthline | 0 |
| No-optional | 50.9 min (works) | 31 | 849.8 s | 0 |
| No-optional carrier | 87.1 min (works), plus 50.8, 29.8 and 24.1 | 55 | 753.4 s | 0 |

These rows are PACE-1's input. The per-leg bounds are in `pacing-debt.ts`, and the timelines are the playthrough artifacts.

**Checks at `4593705d`** (all `--machine any`):

| Check | Ticket | Machine | Result |
| --- | --- | --- | --- |
| Fast tier | `261024-195227-f530` | factory-worker | 168 files pass |
| Heavy tier | `261024-195618-824b` | 4070 | all files pass, 0 failures |
| Six economy steps and the production build | `261024-202436-d92c` | factory-worker | all pass |
| Playthrough | `261024-195617-cdf9` | factory-worker | **9/9 complete, no blockers, every milestone reload matches** |

Playthrough detail:
- **Decode-free runs:** both end with nothing decoding or decoded.
- **Four judged routes:** gaps exactly the recorded debt, 0 decode waits, and legs equal to their record.
- **Route lengths:** Creel 203.7 min, carrier 372.5 min of simulated play.

Shared-host runs are functional evidence only. The timelines are copied to `/work/tmp/ls1-1a-r1-evidence/`.

**Owner decisions folded in (2026-10-24):**
- **More puzzles:** most coded doors ask for a little deduction, and the hatch stays straight to teach the keypad.
  - The ridge vault is now a deduction door: `atDoor: "20··"` on the door, and the return slip gives "…9-3".
  - The journal keeps the record's part and says the rest is at the door. It never writes out the full code.
  - Tests check that the parts combine into the code and that the full code never appears in logs, the clue, the journal or site inspection.
  - Design call 5 and §7 are updated.
- **The 90 s rule is a spacing guide:**
  - empty travel is reported for judgement, both in `pacingAcceptance` (a new `reported` list) and in the debt record;
  - the new-content gap and zero decode waits stay hard.
  - **Tension** (an audible predator counts while its warning cue plays): the recorder doesn't tag threat cues, so this is noted for REC-2.

**For PACE-1:** the per-route gap and leg rows in `scripts/playthrough/pacing-debt.ts`, and the timelines in `/work/tmp/ls1-1a-r1-evidence/timelines/` (playthrough ticket `261024-195617-cdf9`).

## Stage 1b handoff (rewards, caches, keypad model, schema 8)

Code at **`CODE_SHA`** (branch `t3/ls-1-lost-sites`, on the accepted 1a). Everything here is outside CW-1's files. The keypad panel's registration in `App.openPanel` and the pause path, and its real-browser acceptance, wait for CW-1 to land, as the coordinator sequenced. Spoiler-safe; canon notes stay in `docs/spoilers/LS-1-LORE.md`.

**What a player gets now:**
- **The keeper's racks** (the spur's second step) are the planter plan's home. The *planting card* on the racks grants `bp_cultivation`, and the racks carry three seed patches: staple cups on the summit lip, ribbon fans at the riser's foot, salve fronds in its shade. The workshop's outpost sheet now grants only the outpost kit.
- **Three reward upgrades,** each through the existing host-upgrade offer and SYS-1's spending authority:
  - **Locker extension** (`locker_extension_1`, tier 1): one locker module's own locker goes from 32 to 48 CU, through packing and reload.
  - **Heated grow bed** (`grow_bed_1`, tier 2): on a powered host, food, medicine and material crops grow twice as fast and yield one more; power crops are unchanged; the heater bills the host's drain.
  - **Ping lens** (`ping_lens_1`, tier 1, knowledge): the handheld ping reaches 60 m instead of 35 m.
- **Kiln tubers** at the borehole hut: a warmth crop that a planter takes only with a grow bed or on a thermal outpost.
- **Lost-site caches** at the basket, the pump heads and the allotments. Each is found when the diver first comes within reach (a notice says so), holds its authored contents, is take-only, and never refills.
- **Coded doors** have their command (`enter-code`): a wrong code costs nothing, the right one opens the door for good, and dashes are accepted. The keypad's model, markup and key handling are built (`src/ui/keypad.ts`) behind a seam; the app wiring lands after CW-1. Neither door is placed yet (OP-1's hatch, the Basin vault biome).

**Changed contracts:**
- **Save schema 8** (content version unchanged), with the 7 → 8 bridge in `src/save/bridge7.ts` (`bridge6.ts` is deleted; schemas 1–6 are refused as older builds):
  - `systems.opened`: opened coded doors, known door IDs, each once. It starts empty, because no schema 7 build had a coded door.
  - `knowledge.legacyGrants`: one table and one validator (`src/save/legacyGrants.ts`), rows `{ blueprint, source: { kind: "scan" | "discovery", id } }`. The bridge writes a row only when the save holds both the plan and the old source. The one row today is the planter plan from the workshop's outpost sheet. PACE-1's pod-buffer row joins this table when the coordinator says so.
  - Named fixtures are converted once (`docs/build/streams/ls1/convert-fixtures-schema8.mjs`); the schema 7 originals are in `tests/fixtures/archive/*.schema7.json`.
- **Host upgrades:** `moduleIn` takes locker and planter modules as well as decoder and survey. One capacity authority (`lockerModuleCapacity`) is used by install, upgrade and validation. One effect authority for the bed (`growthRate`, `harvestQuantity`, `growBedFitted`); `poweredModules` counts a bed-fitted planter.
- **Site caches** (`src/sim/systems/siteCaches.ts`): found on first reach, from the systems step (`cache-found` event, notice and a `new` timeline event); validation lists each found cache at its authored capacity and bounds its contents; `containerAccepts` refuses deposits. This deviates from the plan's "fixed container from New Game" (reasoning below).
- **Seed patches' bed** is the support surface: `tests/c4-systems.test.ts` now measures against `supportHeight`, because the racks sit inside the glimmer crack's cave footprint, where the kit is the rock and `groundHeight` is the floor under the cave.
- **Proposals:** `bp_locker_extension` and `bp_ping_lens` move from the new-plan proposals to the built list.

**Design call during the build (Opus, from the evidence):** caches are **found on first reach**, not stocked in New Game. Stocking them broke an invariant much of the code relies on: every item in the inventory is the player's. The fast tier showed it in the opening rule, "elsewhere" counts, per-kind totals and dozens of tests reading the first item. Finding on reach keeps that invariant with no exception, needs no "opened" flag (the container's presence is the record) and no new-content rule for later caches. A found cache then behaves like a visited cargo cache.

**Compromises, with their root fixes:**
- **Keypad wiring:** the panel is built and tested against its seam; registration in `App.openPanel`, pause and the real-browser acceptance wait for CW-1 (`src/runtime/app.ts`). `enter-code` returns a typed outcome through the systems command; door events and sounds land with the app wiring.
- **The locker extension's plan has no source in the world yet** (the tide store is BIO's). The upgrade works and is tested with a stand-in source; players can't reach it until the store is placed.
- **The air-line reel** stays in stage 2, as sequenced.
- **A staged interact before any tick** at an unfound cache opens Cargo without the cache, because the find happens in the fixed step and `src/sim/step.ts` is CW-1's. In play the diver swims there, so the step always finds it first.
- **Grow-bed speed needs power; its extra yield doesn't.** The extra produce is per harvest, so an unpowered bed still yields one more once its crop ripens at the base rate. This is deliberate and tested.
