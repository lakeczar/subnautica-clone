# Game direction (owner-confirmed, 2026-10-20)

Agreed with the owner, Alek, through a structured design interview. Where it conflicts with older scope or design text, this file wins. That includes `prompts/BUILD_GAME_REVISED.md`, `docs/FLEET_AND_SURVIVAL.md`, `docs/WORLD_PROGRESSION.md` and `WORLD-EVOLUTION-PLAN.md`. Process rules stay in [DIRECTION](DIRECTION.md). Builders may propose better designs inside these decisions; changing a decision needs the owner.

## Target and feel
- **Length:** a **skilled player on a first, blind, non-stop playthrough takes about 10 hours or more.** That's a floor with no ceiling, reached organically through content. More good content is always welcome. Playtests remove slog; they never trim good content to fit a length.
- **Feel:** atmospheric, with something to do all the time and no padding.
- **Pacing:** progression keeps moving, and nothing is a chore just to fill time.
- **Freedom:** **soft gates only** (depth, power, tools, protection), never invisible walls. Bravery and creativity can push you ahead at real risk for real reward. Early pushes are possible but never required. The story makes sense in any order.
- **Routes:** both fleet routes stay fully playable to the ending and can be mixed. How far each reaches depends on what tools, upgrades and charging let you do.

## How we measure, and what done means
- **The bot** (`npm run playthrough`) proves both routes reach the ending. It catches **structural** slog only:
  - long gaps without anything new, even on the perfect route;
  - recipe quantity versus what a site yields per visit;
  - empty travel per craft.

  It gives **no verdict on feel**.
- **Feel comes from the owner's playtests.** The game records a **local-only play timeline** that can be exported: new things, gathering, travel, waiting and death recovery. A **feedback key** drops notes stamped with time and location. A first-timer's time is estimated as the bot's time times a factor calibrated from the owner's play.
- **Waiting:** idle-only waiting never counts toward play time or pacing.
- **Done means:**
  - both routes can be finished;
  - the bot's structural checks pass;
  - the owner's playtest says it's full, atmospheric and unpadded at 10+ hours;
  - a steady 60 fps on the 3090;
  - no progress-breaking bugs.
- **The bigger interleaved map** (Option B) is re-evaluated once the game is finished.

## Pacing rules for builders
- **Something new** (a tool, area, craft, discovery or story beat) every **15–20 minutes** of efficient play. Tune from playtests.
- **Empty travel** is no more than **about 90 seconds between points of interest, at the speed of the best craft you'd normally have on that leg.**
- **Gathering:** no single gathering trip for one recipe takes more than about 5 minutes. Tune from playtests.
- **Waiting** is only allowed when it's part of the gameplay: decoding, growing, cycles with alternatives. No idle charging bars.

## Resources and progression
- **Gathering pulls you outward.** You can collect and store **unfamiliar materials before you know their use**; the use shows up when you scan or unlock a recipe. Early areas hold small rare amounts, and the reliable supply is at the frontier.
- **Higher tiers** need **more of the common base materials plus a few rare new ones.** Each new craft or depth tier needs at least one material found at or beyond the previous tier's limit. It's in the spirit of Seaglide → Seamoth → Cyclops without copying it.
- **No separate currency per vessel.** Signature upgrades use the shared materials.
- **Storage** is generous but limited, and storage upgrades are light progression.

## Systems
- **Field journal:** one place that's easy to browse. Tabs: materials (site, region, stock, regrowth), creatures, tech and recipes, the story notebook, cycles with their timings, and decodes.
- **Survey station:** at a base, outpost or the carrier. It marks nearby sites, but only for materials you've already scanned. Range upgrades scale with the frontier, and it shows renewable stock that has grown back. The scanner gets a short-range **handheld ping**.
- **Beacons and a personal chart:**
  - Beacons are placed and named by the player.
  - Decoded landmarks and map hints become beacons you can switch on or off, individually or by category.
  - The chart only shows what you've explored, scanned or decoded.
  - Your live position on the chart is an upgrade.
  - Navigation stays landmark-led.
- **Decoder and lost sites:**
  - **Finding:** lost sites and landmarks **can be found without decoding**, but their logs, recipes and terminals stay unreadable until decoded. Decoded maps reveal more sites, which hold more recipes, resources and things to decode.
  - **Decoder:** a module for a base, outpost, craft or the carrier. Decodes take about 3–15 minutes of play time, run in the background and need power. The decoder can be upgraded, and the signal relay lets a remote one keep working.
  - **Main path:** decoder plans are guaranteed along it.
  - **Story:** lost sites fit the existing story canon, decided by the lore owner and never spoiled in owner-facing text.
- **Cultivation:** planters at a base or outpost or on the carrier grow **food, medicine, at least one recipe material and living power cells**. Growth takes several minutes: plant before an expedition, harvest after. Some seeds are regional.
- **Building:** semi-instant. A satisfying assembly finishes **within a couple of seconds**.
- **Natural cycles** (vent pulses, slackening currents, blooms, migrations):
  - **Keeping one:** only the ones that prove fun. **Prototype each in a sandbox; keep or cut it.**
  - **Logging:** seen cycles are logged in the journal.
  - **Waiting:** cycles are always optional, always with an alternative, and never force a wait of more than about a minute.
- **Currents:** authored flow volumes with direction and strength. No fluid simulation. They're **obstacles and route texture**: they push you, cost power to cross, and some slacken on a cycle. **The player does not ride or sail them.**

## Fleet, power and outposts
- **Power sources:**
  - restored service stops;
  - field outposts;
  - the carrier's charging dock;
  - crafted reserve cells;
  - **solar**, best on the Spindle;
  - a **thermal exchanger** that charges at vents. It's tiered: tier 1 gives longer heat tolerance; the late **thermal shroud** protects against **ambient** heat but never plume cores or active bursts;
  - **grown bio-cells**;
  - an optional **current turbine**, prototyped in the sandbox.

  No perpetual generator.
- **Upgrades in two layers:**
  - **Common pool,** wherever it physically fits: depth refits (not the Spindle), hull plating, heat and brine protection, bigger cells and efficiency, lights, **silent running**, **flare launcher**, **emergency ballast**.
  - **Signature upgrades,** 2–3 per craft, which give each craft a distinct use:

    | Craft | Signature upgrades |
    | --- | --- |
    | **Dart** (fast scout) | overdrive (a speed burst that costs noise and heat), wide-sweep sonar (shows cave mouths and passages at long range), range tagger (marks creatures and sites into the journal from a distance) |
    | **Creel** (work sub) | major mount (cargo rack, refuge cabin, service head), cutting arm (faster bulk harvesting), anchor-and-reel grapple (no rope physics), cargo drop pod |
    | **Hush** (quiet glider) | listening array (directs you to creatures and sound-making sites), specimen bay (gentle sampling of seeds, spores and living samples), extended glide |
    | **Spindle** (surface tender) | expanded solar array, shore ramp (more landable beaches), deck crane (lifts cargo from shallow water), radio mast (boosts relay and survey range) |
    | **Mantle** (deep service craft) | thermal shroud, heavy salvage clamp, hull air line for long work dives, drone bay launching the **scout drone** (an upgrade of the tethered service tool: maps caves, scans at range, reaches tight spaces) |
    | **Hearthline** (carrier) | berth extension, system sockets (planters, decoder, survey station, fabricator, storage, charging dock), mooring anchor (holds position in currents), depth upgrade from 400 to 550 m |

  Socket limits keep these as choices. The diver keeps the handheld ping and a basic **air line**: unlimited air within about 25–30 m of a parked craft.
- **Carrier berths:** two compact berths or one medium berth to start; the late **berth extension** allows one medium plus one compact. It stays a limited hangar.
- **Field outposts:**
  - **Kit:** a craftable kit you deploy at a suitable spot, such as a ledge, a cave or near a vent.
  - **Sockets:** charging, a locker, a planter, a decoder, a survey station and a small fabricator.
  - **Power** comes from the location: solar near the surface, thermal near vents, cells otherwise.
  - **Moving them:** they can be packed up and redeployed with a small material loss, so you **leapfrog toward the frontier**.
  - **Limit:** about **3 at once**, with an upgrade for more.
  - **Early access:** a basic kit with charging, a locker and one socket comes **early**, as the stopgap before the carrier.
  - **Restored service stops** stay **larger, fixed and story-rich**, each with a unique service outposts can't offer.
- **Route identity:**
  - **independent:** leapfrog with outposts, anchored by restored stops;
  - **carrier:** bring your base along, carrying the systems.

  Both routes reach every system.

## Caves
- **Everything is authored.** Generators may rough out shapes, but every cave is unique, dressed and deliberate.
- **Small caves:**
  - **Size:** 10–25 m, diver-only.
  - **Where:** common, and **more abundant in rocky and coral areas**.
  - **Networks:** often linked by crawlways into small networks. Some link to a medium cave or to a **back entrance of a cave biome**.
- **Medium caves:** 30–80 m, 2–5 chambers, a loop with two or more exits. The main hall takes small craft, and side passages are diver-only. About **2–4 per region**.
- **Four cave biomes**, each 150–300 m with 3–5 zones and its own light, life and resources:

  | Cave biome | Stage | Path |
  | --- | --- | --- |
  | Isles tidal caves | early | main path; shallow and gentle, teaches darkness, the lamp and exits |
  | Canopy root caves | mid | **optional**, exclusive rewards; **built first as the large-cave technology proof** |
  | Basin vault complex | mid | main path |
  | Rift–Divide seam | late | main path; hot lava tubes giving way to cold brine galleries |

  Meridian's deep interiors stay with the story structure and the lore owner.
- **Both routes use the main-path cave biomes.** The carrier parks at the mouth while a smaller craft goes in. Independent players set up outposts at the mouth or inside.
- **What's in caves:**
  - materials that grow better in caves;
  - cave-dwellers, mostly harmless or cue animals, with occasional dens that give clear warnings;
  - small finds: decodable fragments, seeds and spores, caches.

  **Cave-only items are always optional. Required materials always have a source outside too.**
- **Every region has its own cave style and at least one resident of its own:** Reef limestone arches, Isles tidal undercuts, Canopy root hollows, Basin silt-buried vaults, Rift lava tubes, Divide brine pockets, and a Meridian style from the lore owner.
- **Technology:** small and medium caves use the W1 cave kit, which builds the rock and the visible shell from one source, plus the lighting. Cave biomes need a **scalable large-cave collision and rendering method, proved in a sandbox first.**

## Central hub (owner, 2026-10-20)
- **Option A, the central pinnacle:** a reef-capped spur of pinnacles from the shallow south apron to a **crown near the map centre**, at (330, -48, -560), rising about 240 m from the Basin floor. It needs new terrain and a re-bake, and is built after C4 stage A. The fallback shelf is not used.
- **The crown station is deliberately better than the pod,** so players want to move there. It's restored in 2–3 stages with mid-game materials, starting around the Creel:
  1. power and air;
  2. the dock and the full fabricator;
  3. full sockets and the survey station.
- **What it has once restored:**
  - a fast-heal bunk;
  - a full fabricator plus a **refit and upgrade bench**;
  - a **dock** that charges and repairs moored craft;
  - large lockers;
  - about **6 module sockets**;
  - a built-in survey station covering the Basin, the Rift head and the Canopy edge;
  - a far-visible beacon.
- **Waking up:** after being incapacitated you **wake at the last restored base you rested at** (the pod or the crown).
- **The pod keeps its guaranteed role:** air, healing, storage and basic fabrication, and it's never stranded by crown power loss.
- **The carrier anchorage** is about 130 m from the crown.

## Streaming without pauses (owner, 2026-10-22)
- **Rule:** ordinary play never shows a loading pause or hitch. The cave "loading" hold, and its rescue, is a **safety net only**. It should only ever appear in pathological cases, such as a save reloaded inside a cave on a starved budget, and then during the save's own load screen.
- **How:**
  - **Predictive prefetch by proximity and heading:** start a cave biome, region or large asset well before arrival, around 300–400 m from a mouth, which is 20–50 s ahead even at Dart speed.
  - **Time-sliced or worker construction** within per-frame budgets.
  - **Pre-built (baked) cave collision and light data,** not built at runtime.
  - **Coarse versions always kept** as the floor.
  - **Eviction behind you and far away first.**
  - **Save loads finish admission during the existing load screen.**
- **Acceptance:** a fast Dart traversal of every region and cave mouth shows no frame over about 33 ms caused by streaming, and no hold state is ever reached.

## Creatures (owner, 2026-10-22)
- **No guide or helper animals.** There are no creatures that lead you to resources or guide you through passages.
- **Every threat has a non-combat way through** that comes from its natural behaviour: feeding, patrol rhythm, resting, being distracted by other animals, territory edges. Timing and observation, not only avoiding the bite.
- **Creatures as resources** (coordinator recommendation; the owner may adjust):
  - **Shed and byproducts (core):** collect, without harm, what animals leave: shed shells and membranes, weaver resin, mite mineral grit, and casts that fertilise planters. Each resident's home is worth visiting.
  - **Small common fish:** catch by hand or net and **cook** them. A **fish-trap outpost module** catches slowly in the background. **Threats, rare residents and story animals are never harvested.**
  - **Bait and lures** made from small catches steer threats through their natural behaviour.
  - **A few authored carcass falls:** static landmarks with scavengers and salvage, as environmental storytelling.
  - **Later or optional:** a breeding tank; seasonal roe as regrowth, not a timed wait; glowing creatures in a jar as a light. Bio-cells already exist.
- **Cooking stays one interaction with portions.** Food never decays, per FLEET_AND_SURVIVAL.

## Cave and interior loading (owner, 2026-10-22)
- **Natural caves:** loading is hidden by design. Mouths lead through a **twisting throat or bend** that blocks the view (an authored rule for cave biomes), plus prefetch on approach, darkness, fog and portal culling.
- **Built interiors** (district halls, vault buildings, stations, the carrier): **two-door seals and airlocks** with a short animation are welcome. They double as atmosphere and as a load buffer.
- **Seeing far stays intact:** an always-resident **far layer** of cheap landmark silhouettes plus their lights, so distant landmarks show while detail streams in.

## Atmosphere
All five matter, in this priority:
1. **light and depth:** water colour, darkness, the lamp, god rays;
2. **a living world:** ambient fish, schools, noticeable behaviour;
3. **sound:** regional ambience, distant calls, hull creaks, restrained music;
4. **big landmarks:** silhouettes looming in the murk;
5. **environmental storytelling.**

## Order of work
1. **Finish the rough complete game:** C3, then P1 both routes to the ending, then the experience audit.
2. **Core systems:** the field journal, survey station and ping, beacons and chart, decoder and lost-site framework, field outposts, cultivation, the play timeline and feedback key, and the upgrade framework (common pool plus signatures).
3. **Content:**
   - **caves:** the large-cave technology, then the Canopy cave biome proof, then the other three; small and medium caves throughout;
   - the central hub and loops;
   - landmarks, creatures and resources in every region;
   - lost sites;
   - currents;
   - cycles, through the sandbox.
4. **Atmosphere pass.**
5. **Playtests and iteration:** owner playtests with the timeline, then slog fixes and more content where it's thin, repeated.

Work in steps 2–4 overlaps across parallel builders where ownership doesn't conflict.
